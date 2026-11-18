import { sb } from '@/lib/supabase';
import { requireUser, json, fail, serverError } from '@/lib/auth';
import { cleanItem } from '@/lib/prices';

export const dynamic = 'force-dynamic';

export async function PUT(req, { params }) {
  const { error } = await requireUser('editor');
  if (error) return error;
  try {
    const it = cleanItem(await req.json().catch(() => null));
    if (!it.name) return fail('품명을 입력해 주십시오.');
    if (Number.isNaN(it.price)) return fail('기준 단가를 숫자로 입력해 주십시오.');
    const { data, error: e } = await sb()
      .from('items')
      .update({ ...it, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select('*')
      .single();
    if (e) {
      if (e.code === '23505') return fail('같은 품명·규격의 품목이 이미 있습니다.');
      throw e;
    }
    return json({ item: data });
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(_req, { params }) {
  const { error } = await requireUser('editor');
  if (error) return error;
  try {
    const { error: e } = await sb().from('items').delete().eq('id', params.id);
    if (e) throw e;
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
