import { sb, BUCKET } from '@/lib/supabase';
import { requireUser, json, fail, serverError } from '@/lib/auth';
import { normalizeSlip, ensureVendor, userNames, InputError } from '@/lib/slips';

export const dynamic = 'force-dynamic';

async function load(db, id) {
  const { data } = await db.from('slips').select('*').eq('id', id).maybeSingle();
  return data;
}

export async function GET(_req, { params }) {
  const { error } = await requireUser('viewer');
  if (error) return error;
  try {
    const db = sb();
    const s = await load(db, params.id);
    if (!s) return fail('거래명세서를 찾을 수 없습니다.', 404);
    const names = await userNames(db);
    return json({ slip: { ...s, created_by_name: names[s.created_by] || '', updated_by_name: names[s.updated_by] || '' } });
  } catch (e) {
    return serverError(e);
  }
}

export async function PUT(req, { params }) {
  const { user, error } = await requireUser('editor');
  if (error) return error;
  try {
    const db = sb();
    const old = await load(db, params.id);
    if (!old) return fail('거래명세서를 찾을 수 없습니다.', 404);
    const s = normalizeSlip(await req.json().catch(() => null));
    const v = await ensureVendor(db, { name: s.vendor_name, bizNo: s.biz_no, kind: s.kind });
    const { data, error: e } = await db
      .from('slips')
      .update({ ...s, source: old.source, vendor_id: v.id, vendor_name: v.name, updated_by: user.id, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select('*')
      .single();
    if (e) throw e;
    // 수정하면서 뺀 원본 파일은 보관함에서도 지웁니다.
    const keep = new Set(s.attachments.map((a) => a.path));
    const removed = (old.attachments || []).map((a) => a.path).filter((p) => p && !keep.has(p));
    if (removed.length) await db.storage.from(BUCKET).remove(removed);
    return json({ slip: data });
  } catch (e) {
    if (e instanceof InputError) return fail(e.message);
    return serverError(e);
  }
}

export async function DELETE(_req, { params }) {
  const { error } = await requireUser('editor');
  if (error) return error;
  try {
    const db = sb();
    const old = await load(db, params.id);
    if (!old) return json({ ok: true });
    const { error: e } = await db.from('slips').delete().eq('id', params.id);
    if (e) throw e;
    const paths = (old.attachments || []).map((a) => a.path).filter(Boolean);
    if (paths.length) await db.storage.from(BUCKET).remove(paths);
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
