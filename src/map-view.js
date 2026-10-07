import { EVENTS, LODGINGS } from '../data/guide.js';
import { MAPS_KEY } from '../data/maps-config.js';
import { tripDays, defaultDay, dayPins, withLodging, daySegments, dayRouteLinks } from './map-plan.js';
import { resolveRoute, idbRoutes } from './map-routes.js';
import { fmtDateKo, fmtTime } from './format.js';
import { loadMaps } from './maps-loader.js';

const TRAVEL = { walk: 'WALKING', transit: 'TRANSIT', drive: 'DRIVING' };

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

async function fetchRoute(from, to, via) {
  const { Route } = await google.maps.importLibrary('routes');
  const { routes } = await Route.computeRoutes({
    origin: { lat: from.lat, lng: from.lng },
    destination: { lat: to.lat, lng: to.lng },
    travelMode: TRAVEL[via],
    fields: ['path'],
  });
  return (routes?.[0]?.path ?? []).map(p => [p.lat, p.lng]);
}

function directionsUrl(pin) {
  return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(pin.mapQuery);
}

// 핀 말풍선과 오프라인 목록이 같은 내용을 쓴다.
function pinBody(pin) {
  const box = el('div', 'map-pin');
  box.append(el('div', 'map-pin-name', pin.lodging ? `${pin.n} ${pin.name} · 숙소` : `${pin.n}. ${pin.name}`));
  if (pin.note) box.append(el('div', 'sub', pin.note));
  for (const ev of pin.events) box.append(el('div', 'sub', `${fmtTime(ev.startUtc, ev.tz)}  ${ev.title}`));
  const a = el('a', 'btn', '구글 지도로 길찾기');
  a.href = directionsUrl(pin); a.target = '_blank'; a.rel = 'noopener';
  box.append(a);
  return box;
}

export function initMap(root, { events = EVENTS, key = MAPS_KEY, now = () => new Date(), lodgings = LODGINGS } = {}) {
  const pinsOf = day => withLodging(dayPins(events, day), day, lodgings);
  const select = el('select', 'map-day');
  for (const d of tripDays()) {
    const o = el('option', null, fmtDateKo(`${d}T12:00:00Z`, 'UTC'));
    o.value = d;
    select.append(o);
  }
  select.value = defaultDay(now());
  // 그날 경로 링크. 지도가 안 떠도(키 없음·오프라인 목록) 쓸 수 있게 지도와 따로 그린다.
  const routeBox = el('div', 'map-route');
  const box = el('div', 'map-box');
  const fallback = el('div', 'hidden');
  root.append(select, routeBox, box, fallback);

  function paintRoute() {
    routeBox.replaceChildren(...dayRouteLinks(pinsOf(select.value)).map(l => {
      const a = el('a', 'btn', l.label);
      a.href = l.url; a.target = '_blank'; a.rel = 'noopener';
      return a;
    }));
  }
  paintRoute();

  let map = null, info = null, libs = null, me = null, watchId = null;
  let failed = false, authFailed = false, started = false, drawn = [], token = 0;

  function showFallback() {
    failed = true;
    box.classList.add('hidden');
    fallback.classList.remove('hidden');
    fallback.replaceChildren(el('div', 'sub', '지도를 불러오지 못했습니다'));
    for (const pin of pinsOf(select.value)) {
      const c = el('div', 'card');
      c.append(pinBody(pin));
      fallback.append(c);
    }
  }

  function clear() {
    for (const o of drawn) {
      if (typeof o.setMap === 'function') o.setMap(null); // Polyline
      else o.map = null;                                   // AdvancedMarkerElement
    }
    drawn = [];
  }

  function line(r) {
    const path = r.path.map(([lat, lng]) => ({ lat, lng }));
    if (r.exact) {
      return new google.maps.Polyline({ map, path, strokeColor: '#4b8bf5', strokeOpacity: 0.9, strokeWeight: 5 });
    }
    // 점선 = 실제 길이 아니다(비행기, 경로 못 받음). 실선과 헷갈리지 않게 회색.
    return new google.maps.Polyline({
      map, path, geodesic: true, strokeOpacity: 0,
      icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.8, strokeColor: '#93a3b5', scale: 3 }, offset: '0', repeat: '14px' }],
    });
  }

  function draw() {
    if (failed) { showFallback(); return; }
    if (!map) return;
    // 날짜를 빨리 바꾸면 앞 날짜의 경로가 늦게 도착한다. 번호가 다르면 버린다.
    const my = ++token;
    clear();
    info.close();
    const pins = pinsOf(select.value);
    const bounds = new google.maps.LatLngBounds();
    for (const pin of pins) {
      // 숙소는 파란 큰 핀으로 일정 핀(노란 번호)과 구별한다.
      const glyph = pin.lodging
        ? new libs.PinElement({ glyphText: String(pin.n), background: '#4b8bf5', borderColor: '#ffffff', scale: 1.3 })
        : new libs.PinElement({ glyphText: String(pin.n), background: '#e8b84b', borderColor: '#0f1720', glyphColor: '#0f1720' });
      const m = new libs.AdvancedMarkerElement({
        map, position: { lat: pin.lat, lng: pin.lng }, content: glyph,
        title: pin.lodging ? `숙소 · ${pin.name}` : pin.name, zIndex: pin.lodging ? 500 : undefined,
      });
      m.addEventListener('gmp-click', () => { info.setContent(pinBody(pin)); info.open({ map, anchor: m }); });
      drawn.push(m);
      bounds.extend({ lat: pin.lat, lng: pin.lng });
    }
    if (pins.length === 1) { map.setCenter({ lat: pins[0].lat, lng: pins[0].lng }); map.setZoom(15); }
    else if (pins.length > 1) map.fitBounds(bounds, 40);
    for (const seg of daySegments(pins)) {
      resolveRoute(seg, { cache: idbRoutes, fetchRoute }).then(r => {
        if (my === token) drawn.push(line(r));
      });
    }
  }

  // 권한을 거부하거나 위치를 못 잡으면 점만 안 뜬다. 지도는 그대로 쓸 수 있다.
  // 고정밀 GPS는 배터리를 먹으므로 지도 탭을 보는 동안만 켠다 (hide에서 끈다).
  function watchMe() {
    if (!map || watchId != null || !('geolocation' in navigator)) return;
    watchId = navigator.geolocation.watchPosition(p => {
      const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
      if (me) { me.position = pos; return; }
      me = new libs.AdvancedMarkerElement({ map, position: pos, content: el('div', 'me-dot'), title: '내 위치', zIndex: 999 });
    }, () => {}, { enableHighAccuracy: true, maximumAge: 30000 });
  }

  async function start() {
    try {
      await loadMaps(key);
      const [{ Map: GMap, InfoWindow }, { AdvancedMarkerElement, PinElement }] = await Promise.all([
        google.maps.importLibrary('maps'), google.maps.importLibrary('marker'),
      ]);
      libs = { AdvancedMarkerElement, PinElement };
      map = new GMap(box, {
        center: { lat: 49.28, lng: -123.12 }, zoom: 12, mapId: 'DEMO_MAP_ID',
        gestureHandling: 'greedy', clickableIcons: false,
        fullscreenControl: false, streetViewControl: false, mapTypeControl: false,
      });
      info = new InfoWindow();
      watchMe();
      draw();
    } catch (err) {
      // 이름이 틀린 API 같은 실수가 "인터넷 문제"와 똑같이 보이지 않게 남긴다.
      console.warn('지도 불러오기 실패', err);
      showFallback();
      // 인터넷이 약해서 실패했으면 다음에 탭을 열 때 다시 시도한다. 키 문제는 다시 해도 똑같다.
      if (!authFailed) started = false;
    }
  }

  // 키가 틀렸거나 사이트 제한에 걸리면 구글이 이 전역 함수를 부른다. 회색 오류 지도 대신 목록.
  window.gm_authFailure = () => { authFailed = true; showFallback(); };
  select.addEventListener('change', () => { paintRoute(); draw(); });

  return {
    show() {
      if (started) { watchMe(); return; }
      started = true;
      if (!key) { showFallback(); return; }
      failed = false;
      box.classList.remove('hidden');
      fallback.classList.add('hidden');
      start();
    },
    // 일정이 바뀌면(수정·동기화) 지금 날짜를 다시 그린다. 같은 목록이면 경로를 또 요청하지 않는다.
    setEvents(next) {
      if (next === events) return;
      events = next;
      paintRoute();
      if (started) draw();
    },
    hide() {
      if (watchId == null) return;
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    },
  };
}
