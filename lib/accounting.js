// 회계 전표·단가 공통 함수 (화면·서버 공용)

export const DEBIT_ACCOUNTS = ['원재료', '부재료', '상품', '저장품', '소모품비', '외주가공비', '수선비', '운반비', '지급수수료', '기타'];
export const CREDIT_ACCOUNTS = ['외상매입금', '미지급금'];
export const VAT_ACCOUNT = '부가세대급금';

// 1234000 → "일백이십삼만사천"
export function wonKorean(n) {
  n = Math.round(Math.abs(Number(n) || 0));
  if (!n) return '영';
  const d = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  const u = ['', '십', '백', '천'];
  const big = ['', '만', '억', '조'];
  let s = '', i = 0;
  while (n > 0) {
    let chunk = n % 10000, c = '', j = 0;
    while (chunk > 0) {
      const x = chunk % 10;
      if (x) c = d[x] + u[j] + c;
      chunk = Math.floor(chunk / 10);
      j++;
    }
    if (c) s = c + big[i] + s;
    n = Math.floor(n / 10000);
    i++;
  }
  return s;
}

const norm = (s) => String(s || '').replace(/\s/g, '').toLowerCase();
export const priceKey = (name, spec) => `${norm(name)}|${norm(spec)}`;

// 단가표에서 품목 단가 찾기: 같은 업체 > 공통, 같은 규격 > 규격 없음, 적용일이 거래일 이전 중 가장 최근
export function findPrice(prices, { kind = '매입', vendorId, vendorName, name, spec, date }) {
  const n = norm(name), sp = norm(spec), vn = norm(vendorName);
  if (!n) return null;
  let best = null, bestScore = -1;
  for (const p of prices || []) {
    if (p.kind !== kind || norm(p.item_name) !== n) continue;
    const ps = norm(p.spec);
    if (ps && ps !== sp) continue;
    const sameVendor = (vendorId && p.vendor_id === vendorId) || (!!vn && norm(p.vendor_name) === vn);
    if (p.vendor_id && !sameVendor) continue;
    if (date && p.valid_from && p.valid_from > date) continue;
    const score = (sameVendor ? 4 : 0) + (ps ? 2 : 0);
    if (score > bestScore || (score === bestScore && String(p.valid_from) > String(best.valid_from))) {
      best = p; bestScore = score;
    }
  }
  return best;
}
