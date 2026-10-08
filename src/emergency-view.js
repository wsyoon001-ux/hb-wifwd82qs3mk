import { FLIGHTS, LODGING, AURORA, CALLS } from '../data/emergency.js';
import { FIELDS, loadFields, saveFields, mergeFields, hasAny } from './emergency-store.js';

// 비상 정보 — 어느 탭에서든 헤더 버튼으로 연다. 카운터 직원에게 폰을 내미는 화면이라
// 흰 바탕·큰 글씨로 그린다. 폰에만 두는 칸은 localStorage에서 읽고 쓴다.

const el = (t, c, txt) => {
  const n = document.createElement(t);
  if (c) n.className = c;
  if (txt != null) n.textContent = txt;
  return n;
};

function storage() { try { return window.localStorage; } catch { return null; } }
const NO_STORE = { getItem: () => null, setItem: () => { throw new Error('no storage'); } };

function telBtn(label, value, href) {
  const a = el('a', 'em-tel');
  a.href = 'tel:' + href;
  a.append(el('span', 'em-tel-label', label), el('span', 'em-tel-num', value));
  return a;
}

// clipboard API는 https·사용자 동작 안에서만 된다. 안 되면 숨은 textarea + execCommand로.
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* 아래로 */ }
  const t = el('textarea');
  t.value = text;
  t.setAttribute('readonly', '');
  t.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
  document.body.append(t);
  t.select();
  t.setSelectionRange(0, text.length);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  t.remove();
  return ok;
}

function copyBtn(text) {
  const b = el('button', 'em-copy', '복사');
  b.type = 'button';
  b.setAttribute('aria-label', '복사: ' + text);
  let timer = null;
  b.addEventListener('click', async () => {
    const ok = await copyText(text);
    b.textContent = ok ? '복사됨' : '실패';
    b.classList.toggle('done', ok);
    clearTimeout(timer);
    timer = setTimeout(() => { b.textContent = '복사'; b.classList.remove('done'); }, 1500);
  });
  return b;
}

// 값 한 줄 + 오른쪽 복사 버튼. copy를 따로 주면 화면 글자와 다른 것을 복사한다.
function copyRow(cls, text, copy = text) {
  const r = el('div', 'em-copyrow');
  r.append(el('div', cls, text), copyBtn(copy));
  return r;
}

function section(title) {
  const s = el('section', 'em-sec');
  s.append(el('h2', null, title));
  return s;
}

export function initEmergency(openBtn) {
  const box = el('div', 'em hidden');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', '비상 정보');
  document.body.append(box);
  let editing = false, msg = '';

  function close() { box.classList.add('hidden'); document.body.style.overflow = ''; }
  function open() {
    editing = false; msg = '';
    paint();
    box.classList.remove('hidden');
    box.scrollTop = 0;
    document.body.style.overflow = 'hidden';
  }

  function mine() {
    const s = section('내 정보');
    s.append(el('div', 'em-note', '이 칸은 이 폰에만 저장됩니다. 서버로 보내지 않습니다.'));
    const fields = loadFields(storage() ?? NO_STORE);

    if (!editing) {
      for (const f of FIELDS) {
        const r = el('div', 'em-field');
        r.append(el('div', 'em-label', f.label));
        r.append(fields[f.key] ? copyRow('em-val', fields[f.key]) : el('div', 'em-val em-empty', '— 비어 있음'));
        s.append(r);
      }
      if (msg) s.append(el('div', 'em-msg', msg));
      const b = el('button', 'em-btn', hasAny(fields) ? '편집' : '입력하기');
      b.type = 'button';
      b.addEventListener('click', () => { editing = true; msg = ''; paint(); });
      s.append(b);
      return s;
    }

    const form = el('form', 'em-form');
    for (const f of FIELDS) {
      const id = 'em-' + f.key;
      const l = el('label', null, f.label);
      l.htmlFor = id;
      const i = el(f.multi ? 'textarea' : 'input');
      i.id = id; i.name = f.key; i.value = fields[f.key] ?? '';
      i.autocomplete = 'off';
      i.setAttribute('autocapitalize', f.multi ? 'words' : 'characters');
      i.spellcheck = false;
      form.append(l, i);
    }
    const row = el('div', 'em-row');
    const save = el('button', 'em-btn', '저장');
    save.type = 'submit';
    const cancel = el('button', 'em-btn em-btn-sub', '취소');
    cancel.type = 'button';
    cancel.addEventListener('click', () => { editing = false; paint(); });
    row.append(save, cancel);
    form.append(row);
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      const input = Object.fromEntries(FIELDS.map(f => [f.key, form.elements[f.key].value]));
      if (saveFields(storage() ?? NO_STORE, mergeFields(fields, input))) { editing = false; msg = '저장했습니다'; paint(); return; }
      // 실패하면 다시 그리지 않는다 — 입력한 글자가 날아간다.
      form.querySelector('.em-msg')?.remove();
      row.before(el('div', 'em-msg', '저장하지 못했습니다 — 사생활 보호 모드인지 확인하세요'));
    });
    s.append(form);
    return s;
  }

  function paint() {
    box.replaceChildren();
    const inner = el('div', 'em-box');
    const top = el('div', 'em-top');
    top.append(el('h1', null, '비상 정보'));
    const x = el('button', 'em-close', '닫기');
    x.type = 'button';
    x.addEventListener('click', close);
    top.append(x);
    inner.append(top);

    inner.append(mine());

    const fl = section('항공편');
    for (const f of FLIGHTS) {
      const r = el('div', 'em-field');
      r.append(el('div', 'em-label', `${f.date}  ${f.from} ${f.dep} → ${f.to} ${f.arr}`));
      // 편명만 복사한다 — "4N880 (에어노스)"면 4N880.
      r.append(copyRow('em-val', f.no, f.no.split(' ')[0]));
      fl.append(r);
    }
    inner.append(fl);

    const lo = section('숙소');
    for (const h of LODGING) {
      const r = el('div', 'em-field');
      r.append(el('div', 'em-label', h.when));
      r.append(copyRow('em-val', h.name));
      r.append(copyRow('em-addr', h.address));
      if (h.ref) r.append(el('div', 'em-label', h.ref.label), copyRow('em-val', h.ref.value));
      if (h.note) r.append(el('div', 'em-label', h.note));
      if (h.tel) r.append(telBtn('전화', h.tel.value, h.tel.href));
      lo.append(r);
    }
    inner.append(lo);

    const au = section('오로라 투어');
    au.append(el('div', 'em-val', AURORA.name));
    au.append(el('div', 'em-label', AURORA.ref.label), copyRow('em-val', AURORA.ref.value));
    au.append(el('div', 'em-label', AURORA.pickup.name), copyRow('em-addr', AURORA.pickup.address));
    au.append(telBtn(AURORA.tel.label, AURORA.tel.value, AURORA.tel.href));
    inner.append(au);

    const ca = section('전화');
    for (const c of CALLS) ca.append(telBtn(c.label, c.value, c.href));
    inner.append(ca);

    const x2 = el('button', 'em-btn em-btn-sub', '닫기');
    x2.type = 'button';
    x2.addEventListener('click', close);
    inner.append(x2);
    box.append(inner);
  }

  openBtn?.addEventListener('click', open);
  return { open, close };
}
