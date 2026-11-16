import bcrypt from 'bcryptjs';
import { sb } from '@/lib/supabase';
import { requireUser, json, fail, serverError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const { user, error } = await requireUser('viewer');
  if (error) return error;
  try {
    const { current, next } = await req.json().catch(() => ({}));
    if (String(next || '').length < 8) return fail('새 비밀번호는 8자 이상이어야 합니다.');
    const db = sb();
    const { data: u } = await db.from('users').select('password_hash').eq('id', user.id).single();
    if (!u || !(await bcrypt.compare(String(current || ''), u.password_hash))) return fail('현재 비밀번호가 맞지 않습니다.');
    const { error: e } = await db.from('users').update({ password_hash: await bcrypt.hash(String(next), 10) }).eq('id', user.id);
    if (e) throw e;
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
