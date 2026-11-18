import { sb } from '@/lib/supabase';
import { requireUser, json, fail, serverError } from '@/lib/auth';
import { normalizeSlip, ensureVendor, ensureItems, userNames, InputError } from '@/lib/slips';

export const dynamic = 'force-dynamic';

// 목록: ?from=YYYY-MM-DD&to=YYYY-MM-DD&kind=매입|매출&vendor_id=
export async function GET(req) {
  const { error } = await requireUser('viewer');
  if (error) return error;
  try {
    const p = new URL(req.url).searchParams;
    const db = sb();
    let q = db.from('slips').select('*').order('date', { ascending: false }).order('created_at', { ascending: false }).limit(5000);
    if (/^\d{4}-\d{2}-\d{2}$/.test(p.get('from') || '')) q = q.gte('date', p.get('from'));
    if (/^\d{4}-\d{2}-\d{2}$/.test(p.get('to') || '')) q = q.lte('date', p.get('to'));
    if (['매입', '매출'].includes(p.get('kind'))) q = q.eq('kind', p.get('kind'));
    if (p.get('vendor_id')) q = q.eq('vendor_id', p.get('vendor_id'));
    if (p.get('posted') === '0') q = q.eq('posted', false);
    if (p.get('posted') === '1') q = q.eq('posted', true);
    const { data, error: e } = await q;
    if (e) throw e;
    const names = await userNames(db);
    return json({ slips: (data || []).map((s) => ({ ...s, created_by_name: names[s.created_by] || '', updated_by_name: names[s.updated_by] || '' })) });
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(req) {
  const { user, error } = await requireUser('editor');
  if (error) return error;
  try {
    const body = await req.json().catch(() => null);
    const s = normalizeSlip(body);
    const db = sb();
    const v = await ensureVendor(db, { name: s.vendor_name, bizNo: s.biz_no, kind: s.kind });
    const { data, error: e } = await db
      .from('slips')
      .insert({ ...s, vendor_id: v.id, vendor_name: v.name, created_by: user.id })
      .select('*')
      .single();
    if (e) throw e;
    await ensureItems(db, s.items);
    return json({ slip: data });
  } catch (e) {
    if (e instanceof InputError) return fail(e.message);
    return serverError(e);
  }
}
