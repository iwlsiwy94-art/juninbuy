import { sb } from '@/lib/supabase';
import { requireUser, json, serverError } from '@/lib/auth';
import { priceKey } from '@/lib/accounting';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 지금까지 등록된 거래명세서에서 업체·품목별 최근 단가를 모아 단가표에 추가합니다.
// 단가표에 없는 품목은 새로 넣고, 이미 있으면 명세서 단가가 다르고 더 최근일 때만 새 적용일로 추가(이력 유지).
export async function POST() {
  const { user, error } = await requireUser('editor');
  if (error) return error;
  try {
    const db = sb();
    const [{ data: slips, error: e1 }, { data: prices, error: e2 }] = await Promise.all([
      db.from('slips').select('kind,vendor_id,date,items').not('vendor_id', 'is', null).order('date', { ascending: true }).limit(20000),
      db.from('prices').select('kind,vendor_id,item_name,spec,price,valid_from'),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    const latestSlip = new Map();
    (slips || []).forEach((s) => (s.items || []).forEach((i) => {
      if (!i?.name || i.price == null || !Number.isFinite(Number(i.price))) return;
      const k = `${s.kind}|${s.vendor_id}|${priceKey(i.name, i.spec)}`;
      latestSlip.set(k, { kind: s.kind, vendor_id: s.vendor_id, item_name: String(i.name).trim(), spec: String(i.spec || '').trim(), unit: String(i.unit || '').trim(), price: Number(i.price), valid_from: s.date });
    }));
    const latestPrice = new Map();
    (prices || []).forEach((p) => {
      const k = `${p.kind}|${p.vendor_id}|${priceKey(p.item_name, p.spec)}`;
      const cur = latestPrice.get(k);
      if (!cur || String(p.valid_from) > String(cur.valid_from)) latestPrice.set(k, p);
    });
    const rows = [];
    let added = 0, changed = 0;
    latestSlip.forEach((v, k) => {
      const cur = latestPrice.get(k);
      if (!cur) { rows.push(v); added++; }
      else if (Number(cur.price) !== v.price && v.valid_from > String(cur.valid_from)) { rows.push(v); changed++; }
    });
    for (let i = 0; i < rows.length; i += 500) {
      const { error: e3 } = await db.from('prices').insert(rows.slice(i, i + 500).map((r) => ({ ...r, memo: '거래명세서에서 불러옴', updated_by: user.id })));
      if (e3) throw e3;
    }
    return json({ added, changed });
  } catch (e) {
    return serverError(e);
  }
}
