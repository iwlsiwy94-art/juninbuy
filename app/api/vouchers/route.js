import { sb } from '@/lib/supabase';
import { requireUser, json, serverError } from '@/lib/auth';
import { userNames } from '@/lib/slips';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f-]{36}$/i;

// 전표 목록: ?from=&to=  /  출력용: ?ids=a,b,c (명세서 내역 포함)
export async function GET(req) {
  const { error } = await requireUser('viewer');
  if (error) return error;
  try {
    const p = new URL(req.url).searchParams;
    const db = sb();
    const ids = (p.get('ids') || '').split(',').filter((x) => UUID_RE.test(x)).slice(0, 200);
    let q = db.from('vouchers').select('*').order('voucher_no', { ascending: false }).limit(2000);
    if (ids.length) q = q.in('id', ids);
    else {
      if (DATE_RE.test(p.get('from') || '')) q = q.gte('voucher_date', p.get('from'));
      if (DATE_RE.test(p.get('to') || '')) q = q.lte('voucher_date', p.get('to'));
    }
    const { data, error: e } = await q;
    if (e) throw e;
    const names = await userNames(db);
    let vouchers = (data || []).map((v) => ({ ...v, created_by_name: names[v.created_by] || '' }));
    if (ids.length) {
      const { data: slips, error: e2 } = await db
        .from('slips')
        .select('id,voucher_id,date,doc_no,items,supply,vat,total')
        .in('voucher_id', vouchers.map((v) => v.id))
        .order('date');
      if (e2) throw e2;
      vouchers = vouchers
        .map((v) => ({ ...v, slips: (slips || []).filter((s) => s.voucher_id === v.id) }))
        .sort((a, b) => a.voucher_no.localeCompare(b.voucher_no));
    }
    return json({ vouchers });
  } catch (e) {
    return serverError(e);
  }
}
