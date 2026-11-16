import bcrypt from 'bcryptjs';
import { sb } from '@/lib/supabase';
import { json, fail, serverError } from '@/lib/auth';
import { COOKIE, MAX_AGE, signSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const { username, password } = await req.json().catch(() => ({}));
    if (!username || !password) return fail('아이디와 비밀번호를 입력해 주십시오.');
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
      return fail('SESSION_SECRET 환경값이 없거나 32자보다 짧습니다.', 500);
    }
    const { data: u } = await sb().from('users').select('id,password_hash,active').eq('username', String(username).trim()).maybeSingle();
    const ok = u && u.active && (await bcrypt.compare(String(password), u.password_hash));
    if (!ok) {
      await new Promise((r) => setTimeout(r, 600)); // 무차별 대입 속도 늦추기
      return fail('아이디 또는 비밀번호가 맞지 않습니다.', 401);
    }
    const token = await signSession({ uid: u.id });
    const res = json({ ok: true });
    res.cookies.set(COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: MAX_AGE,
    });
    return res;
  } catch (e) {
    return serverError(e);
  }
}
