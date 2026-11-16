import { sb } from '@/lib/supabase';
import { requireUser, json, fail, serverError } from '@/lib/auth';
import { cleanVendor } from '@/lib/vendors';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { error } = await requireUser('viewer');
  if (error) return error;
  try {
    const db = sb();
    const [{ data: vs, error: e1 }, { data: st, error: e2 }] = await Promise.all([
      db.from('vendors').select('*').order('name'),
      db.from('vendor_stats').select('*'),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    const m = {};
    (st || []).forEach((s) => { m[s.vendor_id] = s; });
    return json({
      vendors: (vs || []).map((v) => ({
        ...v,
        slip_count: m[v.id]?.slip_count || 0,
        total_sum: Number(m[v.id]?.total_sum || 0),
        last_date: m[v.id]?.last_date || null,
      })),
    });
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(req) {
  const { error } = await requireUser('editor');
  if (error) return error;
  try {
    const v = cleanVendor(await req.json().catch(() => null));
    if (!v.name) return fail('상호를 입력해 주십시오.');
    const { data, error: e } = await sb().from('vendors').insert(v).select('*').single();
    if (e) {
      if (e.code === '23505') return fail('같은 사업자번호로 등록된 업체가 이미 있습니다.');
      throw e;
    }
    return json({ vendor: data });
  } catch (e) {
    return serverError(e);
  }
}
