const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function cleanPrice(b) {
  const price = Number(String(b?.price ?? '').replace(/,/g, ''));
  return {
    kind: b?.kind === '매출' ? '매출' : '매입',
    vendor_id: b?.vendor_id ? String(b.vendor_id) : null,
    item_name: String(b?.item_name || '').trim().slice(0, 200),
    spec: String(b?.spec || '').trim().slice(0, 200),
    unit: String(b?.unit || '').trim().slice(0, 20),
    price: String(b?.price ?? '').trim() === '' ? NaN : price,
    valid_from: DATE_RE.test(b?.valid_from || '') ? b.valid_from : new Date().toISOString().slice(0, 10),
    memo: String(b?.memo || '').trim().slice(0, 500),
  };
}

// 품목(품명·규격·단위·기준 단가). 기준 단가가 비어 있으면 null
export function cleanItem(b) {
  const raw = String(b?.price ?? '').replace(/,/g, '').trim();
  const price = raw === '' ? null : Number(raw);
  return {
    name: String(b?.name || '').trim().slice(0, 200),
    spec: String(b?.spec || '').trim().slice(0, 200),
    unit: String(b?.unit || '').trim().slice(0, 20),
    price: price === null ? null : Number.isFinite(price) && price >= 0 ? price : NaN,
    memo: String(b?.memo || '').trim().slice(0, 500),
    inactive: !!b?.inactive,
  };
}
