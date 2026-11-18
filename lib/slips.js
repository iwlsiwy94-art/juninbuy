import { cleanItems, totalsOf, formatBiz, digits } from './util';

export class InputError extends Error {}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PATH_RE = /^\d{4}\/\d{2}\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|gif|pdf)$/i;

export function cleanAttachments(list) {
  return (Array.isArray(list) ? list : [])
    .filter((a) => a && PATH_RE.test(String(a.path || '')))
    .map((a) => ({ path: a.path, name: String(a.name || '원본').slice(0, 200), type: String(a.type || ''), size: Number(a.size) || 0 }));
}

// 화면에서 받은 명세서를 저장 가능한 형태로 정리합니다.
export function normalizeSlip(b) {
  const kind = b?.kind === '매출' ? '매출' : '매입';
  const date = String(b?.date || '');
  if (!DATE_RE.test(date)) throw new InputError('거래일자를 확인해 주십시오.');
  const vendor_name = String(b?.vendor_name || '').trim();
  if (!vendor_name) throw new InputError('거래처 상호를 입력해 주십시오.');
  const items = cleanItems(b?.items);
  if (!items.length) throw new InputError('품목을 한 줄 이상 입력해 주십시오.');
  const t = totalsOf(items);
  return {
    kind,
    date,
    vendor_name,
    biz_no: formatBiz(b?.biz_no),
    doc_no: String(b?.doc_no || '').trim(),
    items,
    supply: t.supply,
    vat: t.vat,
    total: t.total,
    memo: String(b?.memo || ''),
    attachments: cleanAttachments(b?.attachments),
    source: ['manual', 'scan', 'excel'].includes(b?.source) ? b.source : 'manual',
  };
}

// 거래처를 찾고, 없으면 등록 업체로 새로 만듭니다. (사업자번호 우선, 다음 상호)
export async function ensureVendor(db, { name, bizNo, kind }, cache) {
  const vk = kind === '매출' ? '매출처' : '매입처';
  const key = (digits(bizNo) || '') + '|' + name;
  if (cache && cache.has(key)) return cache.get(key);
  let v = null;
  if (digits(bizNo).length === 10) {
    const { data } = await db.from('vendors').select('id,name,kind,biz_no').eq('biz_no', formatBiz(bizNo)).maybeSingle();
    v = data || null;
  }
  if (!v) {
    const { data } = await db.from('vendors').select('id,name,kind,biz_no').eq('name', name).limit(1);
    v = (data && data[0]) || null;
  }
  if (!v) {
    const { data, error } = await db
      .from('vendors')
      .insert({ name, biz_no: digits(bizNo).length === 10 ? formatBiz(bizNo) : '', kind: vk })
      .select('id,name,kind,biz_no')
      .single();
    if (error) throw error;
    v = data;
  } else {
    const patch = {};
    if (v.kind !== vk && v.kind !== '공통') patch.kind = '공통';
    if (!v.biz_no && digits(bizNo).length === 10) patch.biz_no = formatBiz(bizNo);
    if (Object.keys(patch).length) {
      await db.from('vendors').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', v.id);
      v = { ...v, ...patch };
    }
  }
  if (cache) cache.set(key, v);
  return v;
}

// 계정 id → 이름
export async function userNames(db) {
  const { data } = await db.from('users').select('id,name');
  const m = {};
  (data || []).forEach((u) => { m[u.id] = u.name; });
  return m;
}

// 명세서에 처음 나온 품명·규격을 품목 관리에 자동 등록합니다. (실패해도 명세서 저장은 계속)
export async function ensureItems(db, items) {
  try {
    const seen = new Set();
    const rows = [];
    (items || []).forEach((i) => {
      const name = String(i?.name || '').trim();
      if (!name) return;
      const spec = String(i?.spec || '').trim();
      const k = name + '|' + spec;
      if (seen.has(k)) return;
      seen.add(k);
      rows.push({ name, spec, unit: String(i?.unit || '').trim() });
    });
    for (let n = 0; n < rows.length; n += 500) {
      const { error } = await db.from('items').upsert(rows.slice(n, n + 500), { onConflict: 'name,spec', ignoreDuplicates: true });
      if (error) { console.error('ensureItems', error.message); return; }
    }
  } catch (e) {
    console.error('ensureItems', e);
  }
}
