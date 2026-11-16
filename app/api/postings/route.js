import { sb } from '@/lib/supabase';
import { requireUser, json, fail, serverError } from '@/lib/auth';
import { DEBIT_ACCOUNTS, CREDIT_ACCOUNTS, VAT_ACCOUNT } from '@/lib/accounting';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function nextVoucherNo(db, date) {
  const prefix = date.slice(0, 7).replace('-', '') + '-'; // 202611-
  const { data } = await db.from('vouchers').select('voucher_no').like('voucher_no', `${prefix}%`).order('voucher_no', { ascending: false }).limit(1);
  const last = data && data[0] ? parseInt(data[0].voucher_no.slice(prefix.length), 10) || 0 : 0;
  return prefix + String(last + 1).padStart(3, '0');
}

function summaryOf(name, from, to, n) {
  if (from && to && from.slice(0, 7) === to.slice(0, 7) && from.endsWith('-01')) {
    return `${name} ${Number(from.slice(5, 7))}월 매입분 (명세서 ${n}건)`;
  }
  return `${name} ${from || ''}~${to || ''} 매입분 (명세서 ${n}건)`;
}

// 구매 일괄 회계 반영: 업체별로 매입전표 1장씩 만들고 해당 명세서를 '반영'으로 표시
// body: { voucher_date, period_from, period_to, groups: [{ slip_ids:[], debit_account, credit_account }] }
export async function POST(req) {
  const { user, error } = await requireUser('editor');
  if (error) return error;
  try {
    const b = await req.json().catch(() => null);
    const vdate = String(b?.voucher_date || '');
    if (!DATE_RE.test(vdate)) return fail('전표 일자를 확인해 주십시오.');
    const from = DATE_RE.test(b?.period_from || '') ? b.period_from : null;
    const to = DATE_RE.test(b?.period_to || '') ? b.period_to : null;
    const groups = Array.isArray(b?.groups) ? b.groups : [];
    if (!groups.length) return fail('반영할 업체를 골라 주십시오.');
    const db = sb();
    const created = [];
    const skipped = [];
    for (const g of groups) {
      const ids = (Array.isArray(g.slip_ids) ? g.slip_ids : []).map(String).slice(0, 1000);
      if (!ids.length) continue;
      const { data: slips, error: e1 } = await db
        .from('slips')
        .select('id,vendor_id,vendor_name,biz_no,supply,vat,total,date')
        .in('id', ids)
        .eq('kind', '매입')
        .eq('posted', false);
      if (e1) throw e1;
      if (!slips || !slips.length) { skipped.push(String(g.vendor_name || '')); continue; }
      const first = slips[0];
      const sum = slips.reduce((a, s) => ({ supply: a.supply + Number(s.supply), vat: a.vat + Number(s.vat), total: a.total + Number(s.total) }), { supply: 0, vat: 0, total: 0 });
      const row = {
        voucher_date: vdate,
        vendor_id: first.vendor_id,
        vendor_name: first.vendor_name,
        biz_no: slips.find((s) => s.biz_no)?.biz_no || '',
        debit_account: DEBIT_ACCOUNTS.includes(g.debit_account) ? g.debit_account : '원재료',
        vat_account: VAT_ACCOUNT,
        credit_account: CREDIT_ACCOUNTS.includes(g.credit_account) ? g.credit_account : '외상매입금',
        summary: summaryOf(first.vendor_name, from, to, slips.length),
        period_from: from,
        period_to: to,
        slip_count: slips.length,
        ...sum,
        created_by: user.id,
      };
      let voucher = null;
      for (let attempt = 0; attempt < 3 && !voucher; attempt++) {
        const voucher_no = await nextVoucherNo(db, vdate);
        const { data, error: e2 } = await db.from('vouchers').insert({ ...row, voucher_no }).select('*').single();
        if (!e2) voucher = data;
        else if (e2.code !== '23505') throw e2; // 번호가 겹치면 다시 시도
      }
      if (!voucher) throw new Error('전표 번호를 만들지 못했습니다.');
      const { error: e3 } = await db.from('slips').update({ posted: true, voucher_id: voucher.id }).in('id', slips.map((s) => s.id));
      if (e3) throw e3;
      created.push(voucher);
    }
    return json({ vouchers: created, skipped });
  } catch (e) {
    return serverError(e);
  }
}
