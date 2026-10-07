// 일정 편집 화면. 전체 화면으로 덮는다 — 날짜 탭은 1분마다 다시 그려지므로
// 그 안에 폼을 두면 쓰던 글이 날아간다. 그래서 body에 따로 붙인다.
import { MAPS_KEY } from '../data/maps-config.js';
import { loadMaps } from './maps-loader.js';
import { tripDays } from './map-plan.js';
import { fmtDateKo } from './format.js';
import { formFromEvent, recordFromForm, deleteRecord, restoreRecord } from './plan-form.js';

const VIA_LABEL = [['walk', '도보'], ['transit', '대중교통'], ['drive', '차'], ['flight', '비행']];
const NO_SEARCH = '장소 검색을 못 합니다 — 장소 없이 저장할 수 있어요';

const el = (t, c, txt) => {
  const n = document.createElement(t);
  if (c) n.className = c;
  if (txt != null) n.textContent = txt;
  return n;
};
const button = (c, txt, onClick, type = 'button') => {
  const b = el('button', c, txt);
  b.type = type;
  if (onClick) b.addEventListener('click', onClick);
  return b;
};
const field = (label, input) => {
  const l = el('label', null, label);
  l.append(input);
  return l;
};

export function openEditor({ event, base, dayKey, events, onSave, key = MAPS_KEY }) {
  const form = event
    ? formFromEvent(event)
    : { date: dayKey, time: '12:00', title: '', linesText: '', dest: null, via: 'walk' };

  const host = el('div', 'editor');
  host.setAttribute('role', 'dialog');
  host.setAttribute('aria-modal', 'true');
  const box = el('form', 'editor-box');
  box.noValidate = true;
  box.append(el('div', 'title', event ? '일정 수정' : '일정 추가'));

  const date = el('select');
  for (const d of tripDays()) {
    const o = el('option', null, fmtDateKo(`${d}T12:00:00Z`, 'UTC'));
    o.value = d;
    date.append(o);
  }
  date.value = form.date;
  const time = el('input'); time.type = 'time'; time.value = form.time;
  const title = el('input'); title.type = 'text'; title.value = form.title; title.maxLength = 80;
  box.append(field('날짜', date), field('현지 시각', time), field('제목', title));

  // 장소
  const placeWrap = el('div', 'editor-place');
  const placeName = el('div');
  const placeMsg = el('div', 'sub');
  const acBox = el('div');
  const paintPlace = () => {
    placeName.textContent = form.dest ? `${form.dest.name}${form.dest.address ? ' · ' + form.dest.address : ''}` : '장소 없음 (지도에 안 나옴)';
  };
  paintPlace();
  const via = el('select');
  for (const [v, t] of VIA_LABEL) { const o = el('option', null, t); o.value = v; via.append(o); }
  via.value = form.via;

  let searching = false;
  async function pickPlace() {
    if (searching) return;
    searching = true;
    placeMsg.textContent = '검색창 불러오는 중…';
    try {
      await loadMaps(key);
      const { PlaceAutocompleteElement } = await google.maps.importLibrary('places');
      const ac = new PlaceAutocompleteElement({ includedRegionCodes: ['ca'] });
      ac.addEventListener('gmp-select', async ({ placePrediction }) => {
        try {
          const place = placePrediction.toPlace();
          await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] });
          const name = place.displayName ?? '', address = place.formattedAddress ?? '';
          form.dest = { name, address, mapQuery: `${name} ${address}`.trim(), lat: place.location.lat(), lng: place.location.lng() };
          acBox.replaceChildren();
          searching = false;
          placeMsg.textContent = '';
          paintPlace();
        } catch (err) {
          console.warn('장소 정보 못 받음', err);
          placeMsg.textContent = NO_SEARCH;
        }
      });
      acBox.replaceChildren(ac);
      // 검색 요청이 막히면(오프라인 등) 후보 목록이 말없이 안 뜬다. 구글이 오류를 페이지로
      // 알려주지 않아(2026-09-30 확인) 미리 한 줄 적어 둔다. 고르면 지운다.
      placeMsg.textContent = '후보가 안 나오면 인터넷 연결을 확인하세요 — 장소 없이 저장해도 됩니다';
    } catch (err) {
      // 인터넷 문제와 키·API 설정 문제가 똑같이 보이지 않게 남긴다.
      console.warn('장소 검색 불러오기 실패', err);
      placeMsg.textContent = NO_SEARCH;
      searching = false;
    }
  }
  const placeBtns = el('div', 'editor-row');
  placeBtns.append(
    button('photo-btn', '장소 바꾸기', pickPlace),
    button('photo-btn', '장소 없음', () => { form.dest = null; acBox.replaceChildren(); searching = false; paintPlace(); }),
  );
  placeWrap.append(el('label', null, '장소'), placeName, placeBtns, acBox, placeMsg, field('이동수단 (앞 장소에서 여기까지)', via));
  box.append(placeWrap);

  const lines = el('textarea');
  lines.value = form.linesText;
  box.append(field('안내 문구 (한 줄 = 카드의 한 줄)', lines));

  const err = el('div', 'editor-err');
  err.setAttribute('role', 'alert');
  box.append(err);

  const close = () => { host.remove(); document.removeEventListener('keydown', onKey); };
  const done = (record, info = {}) => { close(); onSave(record, info); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);

  const row1 = el('div', 'editor-row');
  row1.append(button('photo-btn', '저장', null, 'submit'), button('photo-btn', '취소', close));
  box.append(row1);
  if (event) {
    const row2 = el('div', 'editor-row');
    if (base && event.edited) row2.append(button('photo-btn', '원래대로', () => done(restoreRecord(event, true))));
    row2.append(button('photo-btn danger', '삭제', () => done(deleteRecord(event, !!base))));
    box.append(row2);
  }

  box.addEventListener('submit', e => {
    e.preventDefault();
    const r = recordFromForm(
      { ...form, date: date.value, time: time.value, title: title.value, linesText: lines.value, via: via.value },
      { base, current: event, events },
    );
    if (r.error) { err.textContent = r.error; return; }
    done(r.record, { timeChanged: r.timeChanged });
  });

  host.append(box);
  document.body.append(host);
  title.focus();
  return { close };
}
