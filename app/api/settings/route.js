import { sb } from '@/lib/supabase';
import { requireUser, json, fail, serverError } from '@/lib/auth';
import { formatBiz } from '@/lib/util';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { error } = await requireUser('viewer');
  if (error) return error;
  try {
    const { data } = await sb().from('settings').select('company_name,biz_no').eq('id', 1).maybeSingle();
    return json({ settings: data || { company_name: '(주)준인산업', biz_no: '' } });
  } catch (e) {
    return serverError(e);
  }
}

export async function PUT(req) {
  const { error } = await requireUser('admin');
  if (error) return error;
  try {
    const b = await req.json().catch(() => ({}));
    const company_name = String(b.company_name || '').trim();
    if (!company_name) return fail('상호를 입력해 주십시오.');
    const row = { id: 1, company_name, biz_no: formatBiz(b.biz_no), updated_at: new Date().toISOString() };
    const { data, error: e } = await sb().from('settings').upsert(row).select('company_name,biz_no').single();
    if (e) throw e;
    return json({ settings: data });
  } catch (e) {
    return serverError(e);
  }
}
