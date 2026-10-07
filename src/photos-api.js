// 사진 서버(Apps Script) 호출. 호출·오류 처리는 gas-api.js가 한다.
import { ApiError, createGasCall } from './gas-api.js';

export { ApiError as PhotoApiError };

export function createPhotoApi(opts) {
  const call = createGasCall(opts);
  return {
    list: async () => (await call('list')).photos,
    get: async id => { const b = await call('get', { id }); return { mime: b.mime, data: b.data }; },
    upload: async ({ name, mime, data }) => { const b = await call('upload', { name, mime, data }); return { id: b.id, createdAt: b.createdAt }; },
    remove: async id => { await call('delete', { id }); },
  };
}
