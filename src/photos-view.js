import { PHOTOS_URL } from '../data/photos-config.js';
import { createPhotoApi, PhotoApiError } from './photos-api.js';
import { idbLocal, syncPhotos, sortNewest, b64ToBlob, removeMany, toFiles, dragRange, dragIntent } from './photos-store.js';
import { resizeToJpeg } from './photos-resize.js';

const PASS_KEY = 'photos-pass';
const URL_KEY = 'photos-url';   // 로컬 가짜 서버로 확인할 때만 쓴다

const MSG = {
  offline: '오프라인 · 저장된 사진만 표시',
  server: '사진 서버 응답이 이상합니다 · 저장된 사진만 표시',
  noconfig: '사진 서버가 아직 연결되지 않았습니다',
  nosetup: '사진 서버 설정이 덜 됐습니다 (setup 미실행)',
  toolarge: '사진이 너무 큽니다 (5MB 초과)',
  bad: '요청 형식이 잘못됐습니다',
  notfound: '이미 지워진 사진입니다',
  needNet: '인터넷 연결 후 다시 해 주세요',
};

const el = (t, c, txt) => {
  const n = document.createElement(t);
  if (c) n.className = c;
  if (txt != null) n.textContent = txt;
  return n;
};
const button = (c, txt, onClick) => {
  const b = el('button', c, txt);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
};

// 사생활 보호 모드 등에서 localStorage가 예외를 던져도 탭은 떠야 한다.
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* 이번 실행 동안만 기억 */ } }

export function initPhotos(root) {
  const url = lsGet(URL_KEY) || PHOTOS_URL;
  let pass = lsGet(PASS_KEY);
  const api = createPhotoApi({ url, getPass: () => pass });

  const urls = new Map();   // 사진 id → object URL (다시 그릴 때마다 새로 만들면 메모리가 샌다)
  let photos = [];          // 폰에 있는 사진, 최신순
  let pending = [];         // 올리는 중/실패: { file, preview, state: 'busy' | 'fail' }
  let status = '';
  let passWrong = false;
  let viewer = null;        // 전체 화면으로 연 사진 id
  let armed = false;        // 삭제 버튼을 한 번 눌렀나
  let syncing = false;
  let selecting = false;    // 여러 장 고르기 모드
  const selected = new Set();
  let bulkArmed = false;    // 여러 장 삭제 버튼을 한 번 눌렀나
  let busy = false;         // 여러 장 지우는 중
  let dragJustEnded = false; // 끌기 직후 따라오는 click 한 번은 무시한다

  // ＋ 버튼과 파일 칸은 한 번만 만든다. 사진첩에서 고르는 사이 동기화가 끝나 다시 그릴 때
  // 새로 만들면, 화면에서 떨어진 옛 칸으로 선택 결과가 가서 아무 일도 안 일어날 수 있다.
  const add = el('label', 'photo-add', '＋ 사진 넣기');
  const input = el('input', 'photo-input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.addEventListener('change', () => { const fs = [...input.files]; input.value = ''; addFiles(fs); });
  add.append(input);

  const setPass = v => { pass = v; lsSet(PASS_KEY, v); };
  const urlFor = p => {
    if (!urls.has(p.id)) urls.set(p.id, URL.createObjectURL(p.blob));
    return urls.get(p.id);
  };
  const codeOf = e => (e instanceof PhotoApiError ? e.code : 'server');

  async function reload() {
    try { photos = sortNewest(await idbLocal.all()); } catch { photos = []; }
    const alive = new Set(photos.map(p => p.id));
    for (const [id, u] of urls) if (!alive.has(id)) { URL.revokeObjectURL(u); urls.delete(id); }
    paint();
  }

  function onError(e, prefix = '') {
    const code = codeOf(e);
    if (code === 'auth') { setPass(null); passWrong = true; status = ''; paint(); return; }
    status = prefix + (MSG[code] ?? MSG.server);
    paint();
  }

  async function sync() {
    if (syncing || !pass || !url) return;
    syncing = true;
    try {
      await syncPhotos(api, idbLocal, reload);
      status = '';
    } catch (e) {
      onError(e);
    } finally {
      syncing = false;
      await reload();
    }
  }

  async function upload(t) {
    t.state = 'busy';
    paint();
    try {
      const r = await resizeToJpeg(t.file);
      const { id, createdAt } = await api.upload(r);
      await idbLocal.put({ id, name: r.name, createdAt, blob: b64ToBlob(r.data, r.mime) });
      pending = pending.filter(x => x !== t);
      URL.revokeObjectURL(t.preview);
      await reload();
    } catch (e) {
      t.state = 'fail';
      if (codeOf(e) === 'auth') { onError(e); return; }
      paint();
    }
  }

  async function addFiles(files) {
    if (!files.length) return;
    if (!navigator.onLine) { status = MSG.needNet; paint(); return; }
    const items = files.map(file => ({ file, preview: URL.createObjectURL(file), state: 'busy' }));
    pending = [...items, ...pending];
    paint();
    for (const t of items) await upload(t);   // 한 장씩 — 폰 메모리, Apps Script 동시 실행 한도
  }

  function dropPending(t) {
    pending = pending.filter(x => x !== t);
    URL.revokeObjectURL(t.preview);
    paint();
  }

  async function remove(p) {
    armed = false;
    if (!navigator.onLine) { status = MSG.needNet; paint(); return; }
    try {
      await api.remove(p.id);
    } catch (e) {
      if (codeOf(e) !== 'notfound') { onError(e, '삭제 못 했습니다 — '); return; }
    }
    await idbLocal.del(p.id).catch(() => {});
    viewer = null;
    await reload();
  }

  function endSelect() {
    selecting = false;
    selected.clear();
    bulkArmed = false;
    paint();
  }

  // 공유창을 띄운다. 아이폰은 여기서 "N개 이미지 저장"을 누르면 사진 앱에 들어간다.
  // 공유창이 없는 브라우저(PC 등)는 한 장씩 내려받는다.
  function saveSelected() {
    const picked = photos.filter(p => selected.has(p.id));
    if (!picked.length) return;
    const files = toFiles(picked);
    if (navigator.canShare?.({ files })) {
      navigator.share({ files }).then(endSelect).catch(e => {
        if (e?.name !== 'AbortError') { status = '저장 창을 못 열었습니다'; paint(); }
      });
      return;
    }
    for (const p of picked) {
      const a = el('a');
      a.href = urlFor(p);
      a.download = p.name;
      document.body.append(a);
      a.click();
      a.remove();
    }
    endSelect();
  }

  async function deleteSelected() {
    if (!navigator.onLine) { status = MSG.needNet; bulkArmed = false; paint(); return; }
    busy = true;
    paint();
    try {
      const { failed } = await removeMany(api, idbLocal, [...selected]);
      selected.clear();
      for (const id of failed) selected.add(id);
      status = failed.length ? `${failed.length}장은 못 지웠습니다 — 인터넷 확인 후 다시` : '';
      if (!failed.length) selecting = false;
    } catch (e) {
      onError(e, '삭제 못 했습니다 — ');
    } finally {
      busy = false;
      bulkArmed = false;
      await reload();
    }
  }

  function selectBar() {
    const n = selected.size;
    const bar = el('div', 'photo-selbar');
    if (busy) { bar.append(el('div', 'photo-selbar-msg', `${n}장 지우는 중…`)); return bar; }
    const save = button('photo-btn', `${n}장 저장`, saveSelected);
    const del = button('photo-btn danger', bulkArmed ? `한 번 더 누르면 ${n}장 삭제` : `${n}장 삭제`, () => {
      if (bulkArmed) deleteSelected(); else { bulkArmed = true; paint(); }
    });
    save.disabled = del.disabled = n === 0;
    bar.append(save, del, button('photo-btn', '취소', endSelect));
    return bar;
  }

  // 끄는 동안엔 paint()로 통째로 다시 그리면 안 된다 — 손가락 아래 칸이 바뀌어 끌기가 끊긴다.
  // 칸의 표시와 아래 막대만 제자리에서 고친다.
  function refreshSelection(grid) {
    for (const t of grid.querySelectorAll('.photo-tile[data-idx]')) {
      const on = selected.has(photos[+t.dataset.idx].id);
      t.classList.toggle('on', on);
      t.setAttribute('aria-pressed', String(on));
      t.querySelector('.photo-check').textContent = on ? '✓' : '';
    }
    root.querySelector('.photo-selbar')?.replaceWith(selectBar());
  }

  // 옆으로 끌면 지나간 칸을 한꺼번에 고른다(사진 앱과 같은 방식). 위아래로 시작하면 브라우저가 스크롤한다 —
  // CSS touch-action: pan-y 가 세로 스크롤만 브라우저에 맡기고 가로 움직임은 여기로 보낸다.
  function wireDrag(grid) {
    let g = null;
    const order = () => photos.map(p => p.id);
    grid.addEventListener('pointerdown', e => {
      const t = e.target.closest('.photo-tile[data-idx]');
      if (!t) return;
      const from = +t.dataset.idx;
      g = { id: e.pointerId, x: e.clientX, y: e.clientY, from, last: -1, intent: null,
        adding: !selected.has(photos[from].id), base: new Set(selected) };
    });
    grid.addEventListener('pointermove', e => {
      if (!g || e.pointerId !== g.id) return;
      if (!g.intent) {
        g.intent = dragIntent(e.clientX - g.x, e.clientY - g.y);
        if (g.intent === 'select') { try { grid.setPointerCapture(e.pointerId); } catch { /* 이미 끝난 포인터 */ } }
      }
      if (g.intent !== 'select') return;
      e.preventDefault();
      const t = document.elementFromPoint(e.clientX, e.clientY)?.closest('.photo-tile[data-idx]');
      if (!t || +t.dataset.idx === g.last) return;
      g.last = +t.dataset.idx;
      const next = dragRange(g.base, order(), g.from, g.last, g.adding);
      selected.clear();
      for (const id of next) selected.add(id);
      bulkArmed = false;
      refreshSelection(grid);
    });
    const end = () => {
      if (g?.intent === 'select') { dragJustEnded = true; setTimeout(() => { dragJustEnded = false; }, 0); }
      g = null;
    };
    grid.addEventListener('pointerup', end);
    grid.addEventListener('pointercancel', () => { g = null; });
  }

  function passForm() {
    const f = el('form', 'card');
    f.append(el('div', 'title', '사진 암호'));
    f.append(el('div', passWrong ? 'sub warn' : 'sub',
      passWrong ? '암호가 틀렸습니다. 다시 넣어 주세요.' : '둘이 정한 공용 암호를 넣으세요. 이 폰에 기억됩니다.'));
    const i = el('input', 'photo-pass');
    i.type = 'password';
    i.autocomplete = 'current-password';
    i.setAttribute('aria-label', '사진 암호');
    const b = el('button', 'photo-btn', '확인');
    b.type = 'submit';
    f.append(i, b);
    f.addEventListener('submit', ev => {
      ev.preventDefault();
      const v = i.value.trim();
      if (!v) return;
      setPass(v);
      passWrong = false;
      paint();
      sync();
    });
    return f;
  }

  function photoTile(p, idx) {
    const on = selected.has(p.id);
    const b = button(on ? 'photo-tile on' : 'photo-tile', null, () => {
      if (selecting) {
        if (dragJustEnded) return;
        selected.has(p.id) ? selected.delete(p.id) : selected.add(p.id);
        bulkArmed = false; paint(); return;
      }
      viewer = p.id; armed = false; paint();
    });
    b.setAttribute('aria-label', p.name);
    if (selecting) b.setAttribute('aria-pressed', String(on));
    b.dataset.idx = idx;
    const img = el('img');
    img.src = urlFor(p);
    img.alt = '';
    img.decoding = 'async';
    b.append(img);
    if (selecting) b.append(el('span', 'photo-check', on ? '✓' : ''));
    return b;
  }

  function pendingTile(t) {
    const d = el('div', 'photo-tile pending');
    const img = el('img');
    img.src = t.preview;
    img.alt = '';
    d.append(img);
    const tags = el('div', 'photo-tags');
    if (t.state === 'busy') tags.append(el('span', 'photo-tag', '올리는 중'));
    else tags.append(button('photo-tag', '실패 · 다시', () => upload(t)), button('photo-tag', '빼기', () => dropPending(t)));
    d.append(tags);
    return d;
  }

  function viewerEl(p) {
    const v = el('div', 'photo-viewer');
    const img = el('img');
    img.src = urlFor(p);
    img.alt = p.name;
    const bar = el('div', 'photo-viewer-bar');
    bar.append(
      button('photo-btn', '닫기', () => { viewer = null; armed = false; paint(); }),
      button('photo-btn danger', armed ? '한 번 더 누르면 삭제' : '삭제', () => {
        if (armed) remove(p); else { armed = true; paint(); }
      }),
    );
    v.append(img, bar);
    return v;
  }

  function paint() {
    root.replaceChildren();
    if (!url) { root.append(el('div', 'card', MSG.noconfig)); return; }
    if (!pass) { root.append(passForm()); return; }
    if (status) root.append(el('div', 'photo-status', status));

    // 동기화로 사라진 사진은 선택에서도 뺀다
    const alive = new Set(photos.map(p => p.id));
    for (const id of selected) if (!alive.has(id)) selected.delete(id);

    const top = el('div', 'photo-top');
    top.append(add);
    if (photos.length && !selecting) top.append(button('photo-btn photo-select', '선택', () => { selecting = true; viewer = null; paint(); }));
    root.append(top);
    if (selecting) root.append(el('div', 'sub', '사진을 눌러 고르세요'));

    if (!pending.length && !photos.length) root.append(el('div', 'sub', syncing ? '불러오는 중…' : '아직 사진이 없습니다'));
    const grid = el('div', 'photo-grid');
    for (const t of pending) grid.append(pendingTile(t));
    photos.forEach((p, i) => grid.append(photoTile(p, i)));
    root.append(grid);
    if (selecting) { grid.classList.add('selecting'); root.append(selectBar()); wireDrag(grid); }

    const open = viewer && photos.find(p => p.id === viewer);
    if (open) root.append(viewerEl(open));
    else viewer = null;
  }

  // 부팅 때 한 번 맞춘다 — 탭을 안 열어도 상대가 올린 사진이 미리 폰에 들어와 오프라인에서 보인다.
  reload().then(sync);

  return {
    show() { paint(); sync(); },
  };
}
