// 일정 변경 기록 서버 호출. 사진과 같은 Apps Script 주소·암호를 쓴다.
import { ApiError, createGasCall } from './gas-api.js';

export function createPlanApi(opts) {
  const call = createGasCall(opts);
  const records = b => {
    if (!Array.isArray(b.records)) throw new ApiError('server');
    return b.records;
  };
  return {
    get: async () => records(await call('plan-get')),
    put: async list => records(await call('plan-put', { records: list })),
  };
}
