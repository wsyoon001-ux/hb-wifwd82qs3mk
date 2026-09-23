import { fmtTime, fmtDateKo, fmtCad, fmtKrw } from './format.js';
import { localDateKey } from './schedule.js';
import { sumBy } from './sheet.js';
import { BEFORE_TRIP_LINE, GUIDE_BUILT } from '../data/guide.js';

const el = (t, c, txt) => {
  const n = document.createElement(t);
  if (c) n.className = c;
  if (txt != null) n.textContent = txt;
  return n;
};

const markClass = m => 'mark' + (m === '✓' ? ' ok' : m === '?' ? ' q' : '');

function lineRow(l) {
  const row = el('div', 'line');
  const body = el('div');
  body.append(el('div', null, l.text));
  if (l.sub) body.append(el('div', 'sub', l.sub));
  row.append(el('span', markClass(l.mark), l.mark || ''), body);
  return row;
}

// 안내문이 언제 만들어진 건지. 시트 갱신 시각과 다른 물건이라 카드 안에 따로 박는다.
function builtTag() {
  const [, m, d] = GUIDE_BUILT.split('-');
  return el('div', 'built', `안내문 ${m}/${d}판`);
}

// header=false는 날짜 탭 아코디언에서 쓴다 — 행 버튼에 이미 시각·제목이 있어서
// 카드 안에 또 찍으면 같은 줄이 두 번 보인다. 그 외 내용(마크·목적지·연락처)은 그대로다.
function card(e, { header = true } = {}) {
  const c = el('div', 'card');
  if (header) {
    const t = el('div', 'time');
    t.append(document.createTextNode(`${fmtDateKo(e.startUtc, e.tz)}  ${fmtTime(e.startUtc, e.tz)}`));
    if (e.timeMark === '?') t.append(el('span', 'time-q', ' ?'));
    c.append(t);
  }
  if (e.timeMark === '?') c.append(el('div', 'sub warn', '이 시각은 미확정 — 업체 확인 전까지 믿지 마세요'));
  if (header) c.append(el('div', 'title', e.title));

  for (const l of e.lines) c.append(lineRow(l));

  if (e.dest) {
    const d = el('div', 'dest');
    d.append(el('div', null, e.dest.name));
    d.append(el('div', 'sub', e.dest.address));
    const a = el('a', 'btn', '지도에서 열기');
    a.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(e.dest.mapQuery);
    a.target = '_blank'; a.rel = 'noopener';
    d.append(a);
    c.append(d);
  }

  for (const r of e.refs ?? []) {
    if (r.tel) {
      const a = el('a', 'btn', `${r.label}  ${r.value}`);
      a.href = 'tel:' + r.tel;
      c.append(a);
    } else {
      c.append(el('div', 'sub', `${r.label}  ${r.value}`));
    }
  }
  c.append(builtTag());
  return c;
}

export function renderNow(root, state) {
  root.replaceChildren();
  const { phase, current, next, todayRest } = state.now;

  if (phase === 'before') {
    const c = el('div', 'card');
    c.append(el('div', 'time', `D−${state.daysLeft}`));
    c.append(el('div', 'title', '출발까지'));
    c.append(lineRow(BEFORE_TRIP_LINE));
    c.append(builtTag());
    root.append(c);
    return;
  }
  if (phase === 'after') {
    const c = el('div', 'card');
    c.append(el('div', 'title', '여행 끝'));
    c.append(el('div', 'sub', '수고하셨습니다.'));
    root.append(c);
    return;
  }
  // 여행 중인데 띄울 일정이 없다. 여행이 끝난 것과는 다른 상태다 —
  // 안내문에 아직 안 들어간 날일 뿐이니 그렇게 말한다.
  if (!current && !next) {
    const c = el('div', 'card');
    c.append(el('div', 'title', '다음 일정 없음'));
    c.append(el('div', 'sub', '이 날짜는 안내문에 아직 안 들어갔습니다. 돈 화면과 시트를 보세요.'));
    c.append(builtTag());
    root.append(c);
    return;
  }

  if (current) root.append(card(current));
  if (next) {
    const sameDay = !current || fmtDateKo(next.startUtc, next.tz) === fmtDateKo(current.startUtc, current.tz);
    const when = sameDay
      ? fmtTime(next.startUtc, next.tz)
      : `${fmtDateKo(next.startUtc, next.tz)} ${fmtTime(next.startUtc, next.tz)}`;
    root.append(el('div', 'next', `다음  ${when}  ${next.title}`));
  }
  for (const e of todayRest) {
    // next와 current는 이미 위에 나왔다. 여기서 또 찍으면 같은 줄이 두 번 보인다.
    if (next && e.id === next.id) continue;
    if (current && e.id === current.id) continue;
    root.append(el('div', 'next', `${fmtTime(e.startUtc, e.tz)}  ${e.title}`));
  }
}

// 어느 일정이 펼쳐져 있는지. 모듈 전역에 두는 이유는 renderDays가
// paint()로 60초마다·화면 복귀할 때마다 다시 불리기 때문이다 — DOM만 믿으면
// 그때마다 root.replaceChildren()에 열린 패널이 다 접힌다. id 기준으로 여기 적어 두고
// 다시 그릴 때마다 이 목록을 보고 열림/닫힘을 복원한다.
const openDayIds = new Set();

function dayRow(e) {
  const wrap = el('div', 'day-item');
  const panelId = `day-panel-${e.id}`;
  const isOpen = openDayIds.has(e.id);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'line day-row';
  btn.setAttribute('aria-expanded', String(isOpen));
  btn.setAttribute('aria-controls', panelId);

  const chevron = el('span', 'chevron', isOpen ? '▾' : '▸');
  chevron.setAttribute('aria-hidden', 'true');
  btn.append(
    chevron,
    el('span', 'time-mark', fmtTime(e.startUtc, e.tz) + (e.timeMark === '?' ? ' ?' : '')),
    el('span', 'day-row-title', e.title),
  );

  const panel = el('div', 'day-panel');
  panel.id = panelId;
  panel.hidden = !isOpen;
  if (isOpen) panel.append(card(e, { header: false }));

  btn.addEventListener('click', () => {
    const willOpen = !openDayIds.has(e.id);
    if (willOpen) {
      openDayIds.add(e.id);
      panel.hidden = false;
      panel.replaceChildren(card(e, { header: false }));
      // 펼칠 때만 살짝 보여준다. prefers-reduced-motion이면 CSS에서 이 클래스 효과를 꺼 둔다.
      panel.classList.add('day-panel-enter');
      requestAnimationFrame(() => panel.classList.add('day-panel-enter-active'));
      panel.addEventListener('transitionend', () => {
        panel.classList.remove('day-panel-enter', 'day-panel-enter-active');
      }, { once: true });
    } else {
      openDayIds.delete(e.id);
      panel.hidden = true;
      panel.replaceChildren();
      panel.classList.remove('day-panel-enter', 'day-panel-enter-active');
    }
    btn.setAttribute('aria-expanded', String(willOpen));
    chevron.textContent = willOpen ? '▾' : '▸';
  });

  wrap.append(btn, panel);
  return wrap;
}

export function renderDays(root, state) {
  root.replaceChildren();
  const byDay = new Map();
  for (const e of state.events) {
    const k = localDateKey(e.startUtc, e.tz);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(e);
  }
  for (const [, list] of [...byDay].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
    const c = el('div', 'card');
    const head = list[0];
    c.append(el('div', 'title', `${fmtDateKo(head.startUtc, head.tz)} · ${head.place}`));
    for (const e of list) c.append(dayRow(e));
    root.append(c);
  }
}

function moneyRow(label, value, cls) {
  const row = el('div', 'line');
  row.append(el('div', null, label), el('div', cls ?? null, value));
  return row;
}

function groupSum(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const k = r[key] || '(없음)';
    if (!m.has(k)) m.set(k, { cad: 0, krw: 0, cash: 0 });
    const v = m.get(k);
    v.cad += r.cadTotal ?? 0; v.krw += r.krw ?? 0; v.cash += r.cashCad ?? 0;
  }
  return m;
}

const amounts = v =>
  `${v.cad ? fmtCad(v.cad) : ''}${v.cad && v.krw ? ' · ' : ''}${v.krw ? fmtKrw(v.krw) : ''}` || '—';

export function renderMoney(root, state) {
  root.replaceChildren();
  const rows = state.rows;

  // 현금은 따로, 크게. 옐로나이프에는 Uber가 없고 가이드 팁은 현금이다 —
  // 이 숫자를 못 보고 출발하면 현장에서 방법이 없다.
  const cash = el('div', 'card');
  cash.append(el('div', 'title', '현금 잔여'));
  cash.append(el('div', 'time', fmtCad(sumBy(rows, 'cashCad'))));
  cash.append(el('div', 'sub', '앞으로 현금으로 내야 할 돈 (시트 「현금 필요」 합계)'));
  root.append(cash);

  const total = el('div', 'card');
  total.append(el('div', 'title', '합계'));
  total.append(moneyRow('현지 결제', fmtCad(sumBy(rows, 'cadTotal'))));
  total.append(moneyRow('원화 결제', fmtKrw(sumBy(rows, 'krw'))));
  total.append(moneyRow('현금 필요', fmtCad(sumBy(rows, 'cashCad'))));
  root.append(total);

  const cat = el('div', 'card');
  cat.append(el('div', 'title', '항목별'));
  // 정렬용 어림 환산(1 CAD ≈ 1,000원)이다. 표시되는 금액은 환산하지 않는다.
  for (const [k, v] of [...groupSum(rows, 'category')].sort((a, b) => (b[1].krw + b[1].cad * 1000) - (a[1].krw + a[1].cad * 1000))) {
    cat.append(moneyRow(k, amounts(v), 'sub'));
  }
  root.append(cat);

  const day = el('div', 'card');
  day.append(el('div', 'title', '날짜별'));
  for (const [k, v] of groupSum(rows, 'date')) {
    day.append(moneyRow(k, amounts(v), 'sub'));
  }
  root.append(day);
}
