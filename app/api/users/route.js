import bcrypt from 'bcryptjs';
import { sb } from '@/lib/supabase';
import { requireUser, json, fail, serverError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { error } = await requireUser('admin');
  if (error) return error;
  try {
    const { data, error: e } = await sb().from('users').select('id,username,name,role,active,created_at').order('created_at');
    if (e) throw e;
    return json({ users: data || [] });
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(req) {
  const { error } = await requireUser('admin');
  if (error) return error;
  try {
    const { username, name, password, role } = await req.json().catch(() => ({}));
    const uname = String(username || '').trim();
    if (!/^[A-Za-z0-9._-]{3,30}$/.test(uname)) return fail('아이디는 영문·숫자 3~30자로 정해 주십시오.');
    if (!String(name || '').trim()) return fail('이름을 입력해 주십시오.');
    if (String(password || '').length < 8) return fail('비밀번호는 8자 이상이어야 합니다.');
    const r = ['admin', 'editor', 'viewer'].includes(role) ? role : 'editor';
    const password_hash = await bcrypt.hash(String(password), 10);
    const { data, error: e } = await sb()
      .from('users')
      .insert({ username: uname, name: String(name).trim(), password_hash, role: r })
      .select('id,username,name,role,active,created_at')
      .single();
    if (e) {
      if (e.code === '23505') return fail('이미 쓰고 있는 아이디입니다.');
      throw e;
    }
    return json({ user: data });
  } catch (e) {
    return serverError(e);
  }
}
