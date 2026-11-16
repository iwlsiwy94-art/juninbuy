import { sb } from '@/lib/supabase';
import { requireUser, json, fail, serverError } from '@/lib/auth';
import { toNum, vatOf, normName, digits, totalsOf, won } from '@/lib/util';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const IMG = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function prompt(year) {
  return `첨부한 파일은 한국의 거래명세서(전표) 한 건입니다. 여러 장이면 같은 명세서의 연속 페이지입니다.
명세서에 적힌 내용만 읽어서 아래 형식의 JSON 하나로만 답하십시오. 설명 문장은 쓰지 마십시오.
{
 "supplier": {"name": "공급자 상호", "bizNo": "공급자 등록번호"},
 "buyer": {"name": "공급받는자 상호", "bizNo": "공급받는자 등록번호"},
 "date": "YYYY-MM-DD",
 "docNo": "명세서/전표 번호",
 "items": [{"name": "품명", "spec": "규격", "qty": 0, "unit": "단위", "price": 0, "supply": 0, "vat": 0}],
 "supplyTotal": 0, "vatTotal": 0, "total": 0,
 "memo": "비고"
}
규칙:
- 숫자는 쉼표 없는 숫자로 씁니다. 반품 등 음수는 음수로 씁니다.
- 읽을 수 없거나 칸이 비어 있으면 문자열은 "", 숫자는 null로 둡니다. 추측해서 채우지 마십시오.
- 품목 표의 모든 행을 빠짐없이 순서대로 넣고, 빈 행과 합계 행은 넣지 않습니다.
- 품목별 세액 칸이 없으면 각 품목 vat는 null로 두고 vatTotal에만 적습니다.
- 날짜가 '26.11.3' 같은 형식이면 2026-11-03처럼 바꿉니다. 연도가 없으면 ${year}년으로 봅니다.`;
}

function parseJson(text) {
  const t = String(text || '').trim();
  try { return JSON.parse(t); } catch {}
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch {} }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  return null;
}

// Claude가 읽은 내용을 등록 양식 값으로 바꿉니다. 우리 회사가 공급자면 매출, 공급받는자면 매입.
function toForm(r, settings) {
  r = r && typeof r === 'object' ? r : {};
  const sup = r.supplier || {}, buy = r.buyer || {};
  const myName = normName(settings.company_name), myBiz = digits(settings.biz_no);
  const isMe = (p) => {
    const n = normName(p.name), d = digits(p.bizNo);
    if (myBiz && d && d === myBiz) return true;
    return !!(myName && n && (n === myName || n.includes(myName) || myName.includes(n)));
  };
  const notes = [];
  let kind, party;
  if (isMe(sup)) { kind = '매출'; party = buy; }
  else if (isMe(buy)) { kind = '매입'; party = sup; }
  else { kind = '매입'; party = sup; notes.push('공급자·공급받는자 중 우리 회사를 찾지 못해 매입으로 두었습니다. 구분을 확인해 주십시오.'); }

  let items = (Array.isArray(r.items) ? r.items : []).map((i) => {
    const it = { name: String(i?.name || ''), spec: String(i?.spec || ''), qty: toNum(i?.qty), unit: String(i?.unit || ''), price: toNum(i?.price), supply: toNum(i?.supply), vat: toNum(i?.vat) };
    if (it.supply == null && it.qty != null && it.price != null) it.supply = Math.round(it.qty * it.price);
    if (it.supply == null) it.supply = 0;
    return it;
  }).filter((i) => i.name || i.supply);
  const vatMissing = items.length > 0 && items.every((i) => i.vat == null);
  items.forEach((i) => { if (i.vat == null) i.vat = vatOf(i.supply); });
  const vatTotal = toNum(r.vatTotal);
  if (vatMissing && vatTotal != null) {
    const diff = vatTotal - items.reduce((a, i) => a + i.vat, 0);
    if (diff) { items[items.length - 1].vat += diff; notes.push('세액 합계를 명세서와 맞추려고 마지막 품목 세액을 조정했습니다.'); }
  }
  if (!items.length) notes.push('품목을 읽지 못했습니다. 직접 입력해 주십시오.');
  const t = totalsOf(items), total = toNum(r.total);
  if (items.length && total != null && Math.round(total) !== Math.round(t.total)) {
    notes.push(`명세서의 합계금액(${won(total)}원)과 품목 합계(${won(t.total)}원)가 다릅니다. 확인해 주십시오.`);
  }
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(r.date || '');
  if (!dateOk) notes.push('거래일자를 읽지 못했습니다. 입력해 주십시오.');
  return {
    form: {
      kind,
      date: dateOk ? r.date : '',
      vendor_name: String(party.name || ''),
      biz_no: String(party.bizNo || ''),
      doc_no: String(r.docNo || ''),
      memo: String(r.memo || ''),
      items,
      source: 'scan',
    },
    notes,
  };
}

export async function POST(req) {
  const { error } = await requireUser('editor');
  if (error) return error;
  if (!process.env.ANTHROPIC_API_KEY) return fail('자동 판독용 ANTHROPIC_API_KEY 환경값이 설정되지 않았습니다.', 503);
  try {
    const form = await req.formData();
    const files = form.getAll('files').filter((f) => f && typeof f !== 'string');
    if (!files.length) return fail('파일이 없습니다.');
    if (files.length > 10) return fail('한 번에 10장까지 읽을 수 있습니다.');
    const content = [];
    for (const f of files) {
      const type = f.type || (/\.pdf$/i.test(f.name) ? 'application/pdf' : '');
      const data = Buffer.from(await f.arrayBuffer()).toString('base64');
      if (type === 'application/pdf') content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } });
      else if (IMG.includes(type)) content.push({ type: 'image', source: { type: 'base64', media_type: type, data } });
      else return fail(`${f.name}: 사진(JPG·PNG·WEBP)이나 PDF만 읽을 수 있습니다.`);
    }
    content.push({ type: 'text', text: prompt(new Date().getFullYear()) });

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
        max_tokens: 8000,
        messages: [{ role: 'user', content }],
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('Anthropic API error', res.status, body);
      const msg = body?.error?.message || '';
      if (res.status === 401) return fail('API 키가 올바르지 않습니다. ANTHROPIC_API_KEY를 확인해 주십시오.', 502);
      if (res.status === 429) return fail('판독 요청이 많습니다. 잠시 후 다시 시도해 주십시오.', 429);
      if (/credit|billing/i.test(msg)) return fail('Anthropic 계정의 크레딧이 부족합니다. 결제 정보를 확인해 주십시오.', 502);
      return fail('명세서를 읽지 못했습니다. 다시 시도하거나 직접 입력해 주십시오.', 502);
    }
    const text = (body.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
    const parsed = parseJson(text);
    if (!parsed) return fail('명세서 내용을 정리하지 못했습니다. 더 선명한 파일로 다시 시도해 주십시오.', 422);
    const { data: settings } = await sb().from('settings').select('company_name,biz_no').eq('id', 1).maybeSingle();
    return json(toForm(parsed, settings || { company_name: '(주)준인산업', biz_no: '' }));
  } catch (e) {
    return serverError(e);
  }
}
