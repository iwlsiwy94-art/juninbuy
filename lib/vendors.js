import { formatBiz, VENDOR_KINDS } from './util';
import { DEBIT_ACCOUNTS } from './accounting';

const TEXT = ['name', 'ceo', 'address', 'biz_type', 'biz_item', 'contact_name', 'contact_phone', 'contact_email', 'payment_terms', 'bank_memo', 'memo'];

export function cleanVendor(b) {
  const v = {};
  TEXT.forEach((k) => { v[k] = String(b?.[k] ?? '').trim().slice(0, 2000); });
  v.biz_no = formatBiz(b?.biz_no);
  v.kind = VENDOR_KINDS.includes(b?.kind) ? b.kind : '매입처';
  v.inactive = !!b?.inactive;
  v.account = DEBIT_ACCOUNTS.includes(b?.account) ? b.account : '';
  return v;
}
