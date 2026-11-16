import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { sb } from './supabase';
import { COOKIE, verifySession } from './session';

const RANK = { viewer: 1, editor: 2, admin: 3 };

export const json = (data, status = 200) => NextResponse.json(data, { status });
export const fail = (message, status = 400) => NextResponse.json({ error: message }, { status });

// 쿠키의 세션을 확인하고, 계정이 아직 사용 중인지 DB에서 다시 확인합니다.
export async function currentUser() {
  const token = cookies().get(COOKIE)?.value;
  const p = await verifySession(token);
  if (!p?.uid) return null;
  const { data } = await sb().from('users').select('id,username,name,role,active').eq('id', p.uid).maybeSingle();
  if (!data || !data.active) return null;
  return { id: data.id, username: data.username, name: data.name, role: data.role };
}

export async function requireUser(minRole = 'viewer') {
  const user = await currentUser();
  if (!user) return { error: fail('로그인이 필요합니다.', 401) };
  if ((RANK[user.role] || 0) < RANK[minRole]) return { error: fail('이 작업을 할 권한이 없습니다.', 403) };
  return { user };
}

export function serverError(e) {
  console.error(e);
  return fail('서버에서 처리하지 못했습니다. 잠시 후 다시 시도해 주십시오.', 500);
}
