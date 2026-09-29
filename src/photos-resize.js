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
