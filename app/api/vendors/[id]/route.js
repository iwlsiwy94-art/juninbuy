import { sb } from '@/lib/supabase';
import { requireUser, json, fail, serverError } from '@/lib/auth';
import { cleanVendor } from '@/lib/vendors';

export const dynamic = 'force-dynamic';

export async function GET(_req, { params }) {
  const { error } = await requireUser('viewer');
  if (error) return error;
  try {
    const db = sb();
    const { data: v } = await db.from('vendors').select('*').eq('id', params.id).maybeSingle();
    if (!v) return fail('업체를 찾을 수 없습니다.', 404);
    const { data: slips, error: e } = await db
      .from('slips')
      .select('id,kind,date,doc_no,items,supply,vat,total,attachments')
      .eq('vendor_id', params.id)
      .order('date', { ascending: false })
      .limit(5000);
    if (e) throw e;
    return json({ vendor: v, slips: slips || [] });
  } catch (e) {
    return serverError(e);
  }
}

export async function PUT(req, { params }) {
  const { error } = await requireUser('editor');
  if (error) return error;
  try {
    const v = cleanVendor(await req.json().catch(() => null));
    if (!v.name) return fail('상호를 입력해 주십시오.');
    const db = sb();
    const { data, error: e } = await db
      .from('vendors')
      .update({ ...v, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select('*')
      .single();
    if (e) {
      if (e.code === '23505') return fail('같은 사업자번호로 등록된 업체가 이미 있습니다.');
      throw e;
    }
    // 상호를 바꾸면 그 업체의 명세서 목록에도 새 상호가 보이게 합니다.
    await db.from('slips').update({ vendor_name: data.name }).eq('vendor_id', params.id);
    return json({ vendor: data });
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(_req, { params }) {
  const { error } = await requireUser('editor');
  if (error) return error;
  try {
    const db = sb();
    const { count } = await db.from('slips').select('id', { count: 'exact', head: true }).eq('vendor_id', params.id);
    if (count) return fail(`이 업체의 거래명세서가 ${count}건 있어 삭제할 수 없습니다. 대신 '거래 중지'로 표시해 주십시오.`);
    const { error: e } = await db.from('vendors').delete().eq('id', params.id);
    if (e) throw e;
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
