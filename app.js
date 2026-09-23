import { EVENTS, GUIDE_BUILT } from './data/guide.js';
import { pickNow, daysUntil } from './src/schedule.js';
import { loadRows, refreshRows } from './src/store.js';
import { renderNow, renderDays, renderMoney } from './src/render.js';
import { fmtDateKo, fmtTime } from './src/format.js';

const state = { rows: [], updatedAt: null, now: null, daysLeft: 0, events: EVENTS };
const views = {
  now: document.getElementById('view-now'),
  days: document.getElementById('view-days'),
  money: document.getElementById('view-money'),
};

// 개발·확인용 구멍. 콘솔에서 window.__NOW__ = new Date('2026-10-09T18:35:00Z') 처럼 넣으면
// 그 시각으로 화면을 그린다. URL로는 넣을 수 없어 영향 범위가 콘솔에 한정된다.
function nowUtc() {
  return window.__NOW__ instanceof Date ? window.__NOW__ : new Date();
}

function banner(msg) {
  const b = document.getElementById('banner');
  if (!b) return;
  b.textContent = msg ?? '';
  b.classList.toggle('hidden', !msg);
}

function recompute() {
  const t = nowUtc();
  state.now = pickNow(EVENTS, t);
  state.daysLeft = EVENTS.length ? daysUntil(t, EVENTS[0].startUtc) : 0;
}

function paintStamp() {
  const s = document.getElementById('stamp');
  // '시트'라고 못 박는다. 이 시각은 시트에서 읽은 금액·날짜에만 해당하고,
  // 카드의 요금·전화번호·픽업 장소는 안내문(빌드 시점 고정)에서 온다.
  if (!state.updatedAt) { s.textContent = ''; return; }
  s.textContent = `시트 갱신 ${fmtDateKo(state.updatedAt, 'America/Vancouver')} ${fmtTime(state.updatedAt, 'America/Vancouver')}`;
}

function paint() {
  recompute();
  renderNow(views.now, state);
  renderDays(views.days, state);
  renderMoney(views.money, state);
  paintStamp();
}
window.__repaint = paint;

// 안내문이 깨져 부팅이 실패해도 빈 화면은 안 된다. 뭐가 어긋났는지 말하고
// 시트를 보라고 한다 — 낯선 땅에서 까만 화면만큼 쓸모없는 게 없다.
function fatal(err) {
  const main = document.querySelector('main') ?? document.body;
  main.replaceChildren();
  const c = document.createElement('div');
  c.className = 'card';
  const h = document.createElement('div');
  h.className = 'title';
  h.textContent = '앱을 못 열었습니다';
  const p = document.createElement('div');
  p.className = 'sub';
  p.textContent = '일정 데이터를 읽다 멈췄습니다. 구글 시트를 직접 여세요. 예약번호는 시트 비고란에 있습니다.';
  const d = document.createElement('div');
  d.className = 'sub';
  d.textContent = String(err && err.message ? err.message : err);
  c.append(h, p, d);
  main.append(c);
  banner('앱 오류 — 아래 내용을 확인하세요');
}

try {
  // 새 안내문 알림 배너(#update-bar)는 index.html의 일반 스크립트에서 처리한다.
  // sw.js의 백그라운드 갱신 비교는 이 모듈이 data/guide.js를 import하는 순간부터
  // 이미 시작되고, 그 fetch는 이 파일의 본문이 실행되기도 전에 끝나 postMessage를
  // 쏠 수 있다 — 이 모듈 안에서 아무리 일찍 리스너를 붙여도 이미 늦을 수 있어서,
  // 모듈 스크립트보다 먼저 파싱·실행되는 일반 <script>로 옮겼다.

  document.querySelectorAll('nav button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('nav button').forEach(x => x.setAttribute('aria-current', String(x === b)));
      for (const [k, v] of Object.entries(views)) v.classList.toggle('hidden', k !== b.dataset.view);
    });
  });

  // .ics 링크에도 몇 판인지 붙인다. 캘린더는 한 번 넣으면 그 뒤로 손이 안 가기 때문이다.
  const icsLink = document.getElementById('icslink');
  if (icsLink) {
    const [, m, d] = GUIDE_BUILT.split('-');
    icsLink.textContent = `캘린더에 알람 넣기 (.ics · 안내문 ${m}/${d}판)`;
  }

  // 1) 캐시/스냅샷으로 즉시 그린다
  const first = await loadRows();
  state.rows = first.rows; state.updatedAt = first.updatedAt;
  paint();
  window.__booted = true;   // index.html의 감시 타이머에게 "떴다"고 알린다

  // 2) 그 다음에 조용히 갱신한다. 조용히 실패하면 안 되는 경우가 하나 있다:
  //    시트를 읽었는데 모양이 이상해서 거부한 경우. 화면 숫자가 옛날 것이라는 걸 말해야 한다.
  refreshRows().then(r => {
    if (!r.ok) { banner(`시트를 못 읽었습니다 — 마지막 저장본으로 보는 중 (${r.reason})`); return; }
    banner('');
    state.rows = r.rows; state.updatedAt = r.updatedAt;
    paint();
  });

  // 3) 1분마다 '지금'을 다시 계산
  setInterval(paint, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) paint(); });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .then(reg => { reg.update().catch(() => {}); })
      .catch(() => {});
  }
} catch (err) {
  fatal(err);
}
