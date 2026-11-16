'use client';

// 화면 → 서버 요청 공통 처리
export async function api(path, { method = 'GET', body, form } = {}) {
  const opts = { method, headers: {} };
  if (form) opts.body = form;
  else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, opts);
  } catch {
    throw new Error('서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주십시오.');
  }
  const data = await res.json().catch(() => null);
  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('로그인이 필요합니다.');
  }
  if (!res.ok) throw new Error(data?.error || '요청을 처리하지 못했습니다.');
  return data;
}

// 사진은 긴 변 2000px JPEG로 줄여서 올립니다(4MB 제한 대비). PDF는 그대로.
export async function prepareFile(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export const fileUrl = (path) => `/api/files/view?path=${encodeURIComponent(path)}`;

export function isAcceptable(f) {
  return /^image\/(jpeg|png|webp|gif)$/.test(f.type) || f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
}

export async function downloadXlsx(build, filename) {
  const XLSX = await import('xlsx');
  const wb = build(XLSX);
  XLSX.writeFile(wb, filename);
}
