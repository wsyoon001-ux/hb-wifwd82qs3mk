// Apps Script 서버 호출. 사진·일정이 같이 쓴다. 모든 실패를 ApiError(code)로 바꾼다 —
// 화면은 code만 보고 무엇을 띄울지 정한다.
//   서버가 준 code: auth · notfound · toolarge · bad · nosetup · busy
//   여기서 붙이는 code: offline(연결 안 됨·응답 없음) · server(이상한 응답) · noconfig(주소 없음)
export class ApiError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
  }
}

export function createGasCall({ url, getPass, fetchImpl = (...a) => fetch(...a), timeoutMs = 30000 }) {
  return async function call(action, extra = {}) {
    if (!url) throw new ApiError('noconfig');
    // Apps Script는 가끔 한참 멈춘다(콜드 스타트). 끝없이 기다리면 화면이 "올리는 중"에 갇힌다.
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      let res;
      try {
        res = await fetchImpl(url, {
          method: 'POST',
          // text/plain이어야 브라우저가 사전 확인(OPTIONS) 요청을 안 보낸다 — Apps Script는 그걸 못 받는다.
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ ...extra, action, pass: getPass() ?? '' }),
          signal: ac.signal,
        });
      } catch {
        throw new ApiError('offline');
      }
      if (!res.ok) throw new ApiError('server');
      let body;
      try { body = await res.json(); } catch { throw new ApiError('server'); }
      if (!body || body.ok !== true) throw new ApiError(typeof body?.error === 'string' ? body.error : 'server');
      return body;
    } finally {
      clearTimeout(timer);
    }
  };
}
