import { sb } from '@/lib/supabase';
import { requireUser, json, fail, serverError } from '@/lib/auth';
import { normalizeSlip, ensureVendor, InputError } from '@/lib/slips';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 엑셀에서 묶은 명세서 여러 건을 한꺼번에 등록합니다.
// body: { slips: [...], skipDuplicates: true }
export async function POST(req) {
  const { user, error } = await requireUser('editor');
  if (error) return error;
  try {
    const body = await req.json().catch(() => null);
    const list = Array.isArray(body?.slips) ? body.slips : [];
    if (!list.length) return fail('가져올 명세서가 없습니다.');
    if (list.length > 500) return fail('한 번에 500건까지 보낼 수 있습니다.');
    const rows = [];
    const bad = [];
    list.forEach((raw, i) => {
      try { rows.push({ ...normalizeSlip({ ...raw, attachments: [] }), source: 'excel' }); }
      catch (e) { bad.push(`${i + 1}번째: ${e instanceof InputError ? e.message : '형식 오류'}`); }
    });
    const db = sb();
    let dupKeys = new Set();
    if (body.skipDuplicates && rows.length) {
      const dates = rows.map((r) => r.date).sort();
      const { data } = await db.from('slips').select('kind,date,vendor_name,total').gte('date', dates[0]).lte('date', dates[dates.length - 1]);
      dupKeys = new Set((data || []).map((s) => `${s.kind}|${s.date}|${s.vendor_name}|${s.total}`));
    }
    const cache = new Map();
    const toInsert = [];
    let skipped = 0;
    for (const r of rows) {
      const v = await ensureVendor(db, { name: r.vendor_name, bizNo: r.biz_no, kind: r.kind }, cache);
      const key = `${r.kind}|${r.date}|${v.name}|${r.total}`;
      if (dupKeys.has(key)) { skipped++; continue; }
      dupKeys.add(key);
      toInsert.push({ ...r, vendor_id: v.id, vendor_name: v.name, created_by: user.id });
    }
    for (let i = 0; i < toInsert.length; i += 200) {
      const { error: e } = await db.from('slips').insert(toInsert.slice(i, i + 200));
      if (e) throw e;
    }
    return json({ inserted: toInsert.length, skipped, invalid: bad });
  } catch (e) {
    return serverError(e);
  }
}
