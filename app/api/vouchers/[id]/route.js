import { sb } from '@/lib/supabase';
import { requireUser, json, serverError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// 반영 취소: 전표를 지우고 묶였던 명세서를 미반영으로 되돌립니다. (관리자만)
export async function DELETE(_req, { params }) {
  const { error } = await requireUser('admin');
  if (error) return error;
  try {
    const db = sb();
    const { error: e1 } = await db.from('slips').update({ posted: false, voucher_id: null }).eq('voucher_id', params.id);
    if (e1) throw e1;
    const { error: e2 } = await db.from('vouchers').delete().eq('id', params.id);
    if (e2) throw e2;
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
