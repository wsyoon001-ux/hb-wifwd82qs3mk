// 일정 변경 기록을 폰에 두고 서버와 맞춘다.
//   plan         : 서버에서 받은 마지막 기록 전체
//   plan-pending : 아직 못 올린 기록 (저장 순서대로 뒤에 붙기만 한다)
// 실패는 정상 경로다 — 대기분은 다음 기회(앱 복귀·online·1분 타이머)에 다시 올린다.
export function createPlanSync({ api, kv, onChange = () => {} }) {
  let synced = [], pending = [], error = null;
  let running = null, again = false;

  const put = async (k, v) => { try { await kv.set(k, v); } catch { /* 이번 실행 동안만 기억 */ } };
  const get = async k => { try { const v = await kv.get(k); return Array.isArray(v) ? v : []; } catch { return []; } };

  async function load() {
    synced = await get('plan');
    pending = await get('plan-pending');
  }

  // 같은 일정은 마지막 기록만 보낸다. 오프라인에서 한 일정을 여러 번 고쳐도
  // 서버 한도(200건)에 걸려 대기열이 영영 막히지 않게.
  const latestOnly = list => [...new Map(list.map(r => [r.id, r])).values()];

  async function once() {
    const count = pending.length;
    const all = count ? await api.put(latestOnly(pending)) : await api.get();
    synced = all;
    // 보내는 사이 저장된 것은 뒤에 붙어 있다. 보낸 만큼만 앞에서 뗀다.
    pending = pending.slice(count);
    await put('plan', synced);
    await put('plan-pending', pending);
  }

  async function run() {
    do {
      again = false;
      try {
        await once();
        error = null;
        onChange();
      } catch (e) {
        const code = e?.code ?? 'server';
        // auth는 매번 알린다 — 다시 넣은 암호도 틀렸다는 걸 화면이 보여줘야 한다.
        const changed = code !== error || code === 'auth';
        error = code;
        if (changed) onChange();
        return;
      }
    } while (again && pending.length);
  }

  function sync() {
    // 이미 돌고 있으면 끝난 뒤 한 번 더 돌게만 표시한다 — 동시에 두 번 보내면 같은 기록이 두 번 간다.
    if (running) { again = true; return running; }
    running = run().finally(() => { running = null; });
    return running;
  }

  async function save(record) {
    pending = [...pending, record];
    await put('plan-pending', pending);
    onChange();
    return sync();
  }

  return {
    load, save, sync,
    records: () => [...synced, ...pending],
    pendingCount: () => pending.length,
    lastError: () => error,
  };
}
