// 폰 사진(4000px, 3~5MB)을 그대로 보내면 Apps Script가 느리고 5MB 한도에 걸린다.
// 바우처·캡처는 긴 변 1600px이면 글씨까지 충분히 읽힌다.
export function fitSize(w, h, max = 1600) {
  const long = Math.max(w, h);
  if (long <= max) return { w, h };
  const k = max / long;
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

export function jpegName(name) {
  const base = String(name ?? '').replace(/\.[^.]*$/, '');
  return (base || 'photo') + '.jpg';
}

// 브라우저 전용. <img>로 푸는 이유: 사진의 회전 정보(EXIF)를 브라우저가 알아서 반영해 준다.
export async function resizeToJpeg(file, { max = 1600, quality = 0.85 } = {}) {
  const src = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('이미지를 열 수 없습니다'));
      i.src = src;
    });
    const { w, h } = fitSize(img.naturalWidth, img.naturalHeight, max);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    // JPEG엔 투명이 없다. 안 칠하면 투명 부분이 검게 나온다.
    g.fillStyle = '#fff';
    g.fillRect(0, 0, w, h);
    g.drawImage(img, 0, 0, w, h);
    const url = c.toDataURL('image/jpeg', quality);
    return { name: jpegName(file.name), mime: 'image/jpeg', data: url.slice(url.indexOf(',') + 1) };
  } finally {
    URL.revokeObjectURL(src);
  }
}

// 사진 원본(JPEG)의 EXIF에서 찍은 시각을 읽는다. 줄인 사본은 캔버스를 거쳐 EXIF가 사라지므로
// 줄이기 전에 읽어야 한다. 시간대 정보(OffsetTimeOriginal)가 없으면 이 폰의 시간대로 본다.
// 못 읽으면 null.
export function exifTakenAt(buf) {
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return null;
  let off = 2;
  while (off + 4 <= v.byteLength) {
    const marker = v.getUint16(off);
    const len = v.getUint16(off + 2);
    if ((marker & 0xFF00) !== 0xFF00 || len < 2) return null;
    if (marker === 0xFFE1 && off + 10 <= v.byteLength && v.getUint32(off + 4) === 0x45786966) return readTiff(v, off + 10, off + 2 + len);
    if (marker === 0xFFDA) return null;   // 그림 데이터 시작 — EXIF는 그 앞에만 있다
    off += 2 + len;
  }
  return null;
}

function readTiff(v, t, end) {
  if (t + 8 > end || end > v.byteLength) return null;
  const le = v.getUint16(t) === 0x4949;
  const u16 = o => v.getUint16(t + o, le);
  const u32 = o => v.getUint32(t + o, le);
  const ascii = (o, n) => {
    let s = '';
    for (let i = 0; i < n && t + o + i < end; i++) { const c = v.getUint8(t + o + i); if (!c) break; s += String.fromCharCode(c); }
    return s;
  };
  const tags = ifd => {
    const out = {};
    if (t + ifd + 2 > end) return out;
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (t + e + 12 > end) break;
      const tag = u16(e), cnt = u32(e + 4);
      out[tag] = { cnt, val: cnt <= 4 ? e + 8 : u32(e + 8), raw: u32(e + 8) };
    }
    return out;
  };
  const ifd0 = tags(u32(4));
  if (!ifd0[0x8769]) return null;
  const sub = tags(ifd0[0x8769].raw);
  const dt = sub[0x9003] ?? ifd0[0x0132];
  if (!dt) return null;
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(ascii(dt.val, dt.cnt));
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  const tz = sub[0x9011] && /^([+-])(\d{2}):(\d{2})$/.exec(ascii(sub[0x9011].val, sub[0x9011].cnt));
  const at = tz
    ? new Date(Date.UTC(y, mo - 1, d, h, mi, s) - (tz[1] === '-' ? -1 : 1) * (Number(tz[2]) * 60 + Number(tz[3])) * 60000)
    : new Date(y, mo - 1, d, h, mi, s);
  return isNaN(at) || y < 2000 ? null : at;
}
