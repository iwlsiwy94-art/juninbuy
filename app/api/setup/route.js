import bcrypt from 'bcryptjs';
import { sb } from '@/lib/supabase';
import { json, fail, serverError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function userCount() {
  const { count, error } = await sb().from('users').select('id', { count: 'exact', head: true });
  if (error) throw error;
  return count || 0;
}

export async function GET() {
  try {
    return json({ needed: (await userCount()) === 0 });
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(req) {
  try {
    if ((await userCount()) > 0) return fail('이미 관리자 계정이 있습니다.', 403);
    const { name, username, password } = await req.json().catch(() => ({}));
    const uname = String(username || '').trim();
    if (!name || !uname) return fail('이름과 아이디를 입력해 주십시오.');
    if (!/^[A-Za-z0-9._-]{3,30}$/.test(uname)) return fail('아이디는 영문·숫자 3~30자로 정해 주십시오.');
    if (String(password || '').length < 8) return fail('비밀번호는 8자 이상이어야 합니다.');
    const password_hash = await bcrypt.hash(String(password), 10);
    const { error } = await sb().from('users').insert({ name: String(name).trim(), username: uname, password_hash, role: 'admin' });
    if (error) throw error;
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
