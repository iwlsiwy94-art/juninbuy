import bcrypt from 'bcryptjs';
import { sb } from '@/lib/supabase';
import { requireUser, json, fail, serverError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// 관리자: 이름·권한·사용 여부 변경, 비밀번호 초기화
export async function PUT(req, { params }) {
  const { user, error } = await requireUser('admin');
  if (error) return error;
  try {
    const b = await req.json().catch(() => ({}));
    const patch = {};
    if (b.name !== undefined) {
      if (!String(b.name).trim()) return fail('이름을 입력해 주십시오.');
      patch.name = String(b.name).trim();
    }
    if (b.role !== undefined) {
      if (!['admin', 'editor', 'viewer'].includes(b.role)) return fail('권한 값이 올바르지 않습니다.');
      patch.role = b.role;
    }
    if (b.active !== undefined) patch.active = !!b.active;
    if (b.password !== undefined) {
      if (String(b.password).length < 8) return fail('비밀번호는 8자 이상이어야 합니다.');
      patch.password_hash = await bcrypt.hash(String(b.password), 10);
    }
    if (params.id === user.id && (patch.role && patch.role !== 'admin' || patch.active === false)) {
      return fail('본인의 관리자 권한이나 사용 여부는 바꿀 수 없습니다. 다른 관리자에게 요청해 주십시오.');
    }
    const { data, error: e } = await sb().from('users').update(patch).eq('id', params.id).select('id,username,name,role,active,created_at').single();
    if (e) throw e;
    return json({ user: data });
  } catch (e) {
    return serverError(e);
  }
}
