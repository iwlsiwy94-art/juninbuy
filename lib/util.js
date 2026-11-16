// 화면과 서버에서 함께 쓰는 계산 함수
export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
export const won = (n) => Math.round(Number(n) || 0).toLocaleString('ko-KR');

export function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[,\s₩원]/g, '');
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s === '' || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

// 부가세 10%, 원 단위 절사
export const vatOf = (supply) => Math.trunc((Number(supply) || 0) * 0.1);

export const normName = (s) => String(s || '').replace(/\(주\)|㈜|주식회사|\(유\)|유한회사|\(합\)|\s|\./g, '').toLowerCase();
export const digits = (s) => String(s || '').replace(/\D/g, '');

export function formatBiz(s) {
  const d = digits(s);
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
  return String(s || '').trim();
}

export function itemSummary(items) {
  const named = (items || []).filter((i) => i && i.name);
  if (!named.length) return '';
  return named.length > 1 ? `${named[0].name} 외 ${named.length - 1}건` : named[0].name;
}

export function totalsOf(items) {
  let supply = 0, vat = 0;
  (items || []).forEach((i) => { supply += toNum(i.supply) || 0; vat += toNum(i.vat) || 0; });
  return { supply, vat, total: supply + vat };
}

export function cleanItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((i) => ({
      name: String(i?.name ?? '').trim(),
      spec: String(i?.spec ?? '').trim(),
      qty: toNum(i?.qty),
      unit: String(i?.unit ?? '').trim(),
      price: toNum(i?.price),
      supply: Math.round(toNum(i?.supply) || 0),
      vat: Math.round(toNum(i?.vat) || 0),
    }))
    .filter((i) => i.name || i.spec || i.supply || i.qty);
}

export const ROLE_LABEL = { admin: '관리자', editor: '입력자', viewer: '조회자' };
export const VENDOR_KINDS = ['매입처', '매출처', '공통'];
