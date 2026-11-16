import { sb } from '@/lib/supabase';
import { requireUser, json, fail, serverError } from '@/lib/auth';
import { cleanPrice } from '@/lib/prices';

export const dynamic = 'force-dynamic';

export async function PUT(req, { params }) {
  const { user, error } = await requireUser('editor');
  if (error) return error;
  try {
    const p = cleanPrice(await req.json().catch(() => null));
    if (!p.item_name) return fail('품명을 입력해 주십시오.');
    if (!Number.isFinite(p.price) || p.price < 0) return fail('단가를 숫자로 입력해 주십시오.');
    const { data, error: e } = await sb()
      .from('prices')
      .update({ ...p, updated_by: user.id, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select('*')
      .single();
    if (e) throw e;
    return json({ price: data });
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(_req, { params }) {
  const { error } = await requireUser('editor');
  if (error) return error;
  try {
    const { error: e } = await sb().from('prices').delete().eq('id', params.id);
    if (e) throw e;
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
