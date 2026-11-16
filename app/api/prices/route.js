import { sb } from '@/lib/supabase';
import { requireUser, json, fail, serverError } from '@/lib/auth';
import { userNames } from '@/lib/slips';
import { cleanPrice } from '@/lib/prices';

export const dynamic = 'force-dynamic';


export async function GET() {
  const { error } = await requireUser('viewer');
  if (error) return error;
  try {
    const db = sb();
    const [{ data, error: e }, { data: vs }] = await Promise.all([
      db.from('prices').select('*').order('item_name').order('valid_from', { ascending: false }).limit(10000),
      db.from('vendors').select('id,name'),
    ]);
    if (e) throw e;
    const vn = {};
    (vs || []).forEach((v) => { vn[v.id] = v.name; });
    const names = await userNames(db);
    return json({ prices: (data || []).map((p) => ({ ...p, vendor_name: p.vendor_id ? vn[p.vendor_id] || '' : '', updated_by_name: names[p.updated_by] || '' })) });
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(req) {
  const { user, error } = await requireUser('editor');
  if (error) return error;
  try {
    const p = cleanPrice(await req.json().catch(() => null));
    if (!p.item_name) return fail('품명을 입력해 주십시오.');
    if (!Number.isFinite(p.price) || p.price < 0) return fail('단가를 숫자로 입력해 주십시오.');
    const { data, error: e } = await sb().from('prices').insert({ ...p, updated_by: user.id }).select('*').single();
    if (e) throw e;
    return json({ price: data });
  } catch (e) {
    return serverError(e);
  }
}
