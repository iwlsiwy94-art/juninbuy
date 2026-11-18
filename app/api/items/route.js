import { sb } from '@/lib/supabase';
import { requireUser, json, fail, serverError } from '@/lib/auth';
import { cleanItem } from '@/lib/prices';

export const dynamic = 'force-dynamic';

// 품목 목록 + 거래명세서 기준 사용 횟수·최근 단가 (?stats=1 일 때)
export async function GET(req) {
  const { error } = await requireUser('viewer');
  if (error) return error;
  try {
    const db = sb();
    const withStats = new URL(req.url).searchParams.get('stats') === '1';
    const { data, error: e } = await db.from('items').select('*').order('name').order('spec').limit(10000);
    if (e) throw e;
    let items = data || [];
    if (withStats) {
      const { data: slips, error: e2 } = await db.from('slips').select('kind,date,vendor_name,items').order('date', { ascending: true }).limit(20000);
      if (e2) throw e2;
      const st = new Map();
      (slips || []).forEach((s) => (s.items || []).forEach((i) => {
        const k = `${String(i?.name || '').trim()}|${String(i?.spec || '').trim()}`;
        const cur = st.get(k) || { use_count: 0 };
        cur.use_count++;
        if (i.price != null && Number(i.price) > 0) {
          cur.last_price = Number(i.price); cur.last_date = s.date; cur.last_vendor = s.vendor_name; cur.last_kind = s.kind;
        }
        st.set(k, cur);
      }));
      items = items.map((it) => ({ ...it, use_count: 0, ...(st.get(`${it.name}|${it.spec}`) || {}) }));
    }
    return json({ items });
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(req) {
  const { error } = await requireUser('editor');
  if (error) return error;
  try {
    const it = cleanItem(await req.json().catch(() => null));
    if (!it.name) return fail('품명을 입력해 주십시오.');
    if (Number.isNaN(it.price)) return fail('기준 단가를 숫자로 입력해 주십시오.');
    const { data, error: e } = await sb().from('items').insert(it).select('*').single();
    if (e) {
      if (e.code === '23505') return fail('같은 품명·규격의 품목이 이미 있습니다.');
      throw e;
    }
    return json({ item: data });
  } catch (e) {
    return serverError(e);
  }
}
