'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/components/api';
import { KindPill } from '@/components/bits';
import { useUser, canEdit } from '@/components/UserContext';
import { toNum, vatOf, won, pad, itemSummary, totalsOf } from '@/lib/util';
import { findPrice } from '@/lib/accounting';

// 엑셀 제목 줄을 보고 열을 자동으로 맞추는 규칙 (위에서부터 먼저 맞춤)
const FIELDS = [
  ['kind', '구분(매입/매출)', /구분|매입.?매출|유형/],
  ['date', '일자', /일자|날짜|거래일|date/i],
  ['vendor', '거래처', /거래처|상호|업체|공급자|고객|매입처|매출처/],
  ['bizNo', '사업자번호', /사업자|등록번호/],
  ['docNo', '전표번호', /전표|명세서.?번호|문서.?번호|^번호$|no\.?$/i],
  ['name', '품명', /품명|품목|제품|상품|item/i],
  ['spec', '규격', /규격|사양|spec/i],
  ['qty', '수량', /수량|qty/i],
  ['unit', '단위', /단위/],
  ['price', '단가', /단가|price/i],
  ['total', '합계금액', /합계|총액|총금액/],
  ['vat', '세액', /세액|부가세|vat/i],
  ['supply', '공급가액', /공급가|금액|amount/i],
  ['memo', '비고', /비고|메모|적요/],
];

function xlDate(v) {
  if (v === '' || v == null) return '';
  if (v instanceof Date) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  if (typeof v === 'number') {
    if (v > 19000101 && v < 21001231) { const s = String(Math.trunc(v)); return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`; }
    if (v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 86400000)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
    return '';
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})/); if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{2})\D+(\d{1,2})\D+(\d{1,2})/); if (m) return `20${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return '';
}

function guessMap(headers) {
  const map = {}, used = new Set();
  FIELDS.forEach(([key, , re]) => {
    const idx = headers.findIndex((h, i) => !used.has(i) && h && re.test(h)
      && !(key === 'docNo' && /사업자/.test(h)) && !(key === 'supply' && /합계|총/.test(h)));
    if (idx >= 0) { map[key] = idx; used.add(idx); }
  });
  return map;
}

function group(rows, headerRow, map, defKind, autoVat, prices) {
  let priced = 0;
  const get = (row, k) => (map[k] == null ? '' : row[map[k]]);
  const groups = new Map();
  let last = { date: '', vendor: '', kind: '', docNo: '', bizNo: '' }, skipped = 0;
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((c) => c === '' || c == null)) continue;
    const name = String(get(row, 'name') ?? '').trim();
    if (/^(합\s*계|소\s*계|총\s*계|누\s*계)$/.test(name) || /^(합\s*계|소\s*계|총\s*계)$/.test(String(get(row, 'vendor') ?? '').trim())) continue;
    const date = xlDate(get(row, 'date')) || last.date;
    const vendor = String(get(row, 'vendor') ?? '').trim() || last.vendor;
    const kv = String(get(row, 'kind') ?? '');
    const kind = /매출|판매|출고/.test(kv) ? '매출' : /매입|구매|입고/.test(kv) ? '매입' : (last.kind || defKind);
    const docNo = String(get(row, 'docNo') ?? '').trim() || (get(row, 'date') === '' ? last.docNo : '');
    const bizNo = String(get(row, 'bizNo') ?? '').trim() || (vendor === last.vendor ? last.bizNo : '');
    const qty = toNum(get(row, 'qty')), total = toNum(get(row, 'total'));
    let price = toNum(get(row, 'price'));
    let supply = toNum(get(row, 'supply')), vat = toNum(get(row, 'vat'));
    // 단가·금액이 모두 비어 있으면 단가표에서 찾아 채움
    if (price == null && supply == null && total == null && name) {
      const hit = findPrice(prices, { kind, vendorName: vendor, name, spec: String(get(row, 'spec') ?? '').trim(), date });
      if (hit) { price = Number(hit.price); priced++; }
    }
    if (supply == null && qty != null && price != null) supply = Math.round(qty * price);
    if (supply == null && total != null && vat != null) supply = total - vat;
    if (supply == null && total != null) supply = autoVat ? Math.round(total / 1.1) : total;
    if (vat == null) vat = total != null && supply != null && total !== supply ? total - supply : (autoVat ? vatOf(supply) : 0);
    if (!date || !vendor || (supply == null && !name)) { skipped++; continue; }
    last = { date, vendor, kind, docNo, bizNo };
    const key = docNo ? `${kind}|${docNo}|${vendor}` : `${kind}|${date}|${vendor}`;
    if (!groups.has(key)) groups.set(key, { kind, date, vendor_name: vendor, biz_no: bizNo, doc_no: docNo, items: [], memo: '' });
    const g = groups.get(key);
    g.items.push({ name, spec: String(get(row, 'spec') ?? '').trim(), qty, unit: String(get(row, 'unit') ?? '').trim(), price, supply: Math.round(supply || 0), vat: Math.round(vat || 0) });
    const memo = String(get(row, 'memo') ?? '').trim();
    if (memo && !g.memo.includes(memo)) g.memo = g.memo ? `${g.memo} / ${memo}` : memo;
    if (!g.biz_no && bizNo) g.biz_no = bizNo;
  }
  return { groups: [...groups.values()].map((g) => ({ ...g, ...totalsOf(g.items) })), skipped, priced };
}

export default function ImportPage() {
  const router = useRouter();
  const user = useUser();
  const [wb, setWb] = useState(null);
  const [sheet, setSheet] = useState('');
  const [rows, setRows] = useState([]);
  const [headerRow, setHeaderRow] = useState(0);
  const [map, setMap] = useState({});
  const [defKind, setDefKind] = useState('매입');
  const [autoVat, setAutoVat] = useState(true);
  const [skipDup, setSkipDup] = useState(true);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const [prices, setPrices] = useState([]);
  useEffect(() => { api('/api/prices').then((d) => setPrices(d.prices || [])).catch(() => {}); }, []);

  const headers = (rows[headerRow] || []).map((h) => String(h ?? '').trim());
  const result = useMemo(() => (rows.length ? group(rows, headerRow, map, defKind, autoVat, prices) : { groups: [], skipped: 0, priced: 0 }), [rows, headerRow, map, defKind, autoVat, prices]);

  if (!canEdit(user)) return <p className="note">조회자 계정은 가져오기를 할 수 없습니다.</p>;

  async function openFile(file) {
    setMsg('');
    try {
      const XLSX = await import('xlsx');
      const book = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: false });
      setWb({ book, XLSX });
      loadSheet(book, XLSX, book.SheetNames[0]);
    } catch {
      setMsg('파일을 열지 못했습니다. .xlsx, .xls, .csv 형식인지 확인해 주십시오.');
    }
  }

  function loadSheet(book, XLSX, name) {
    setSheet(name);
    const data = XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, raw: true, defval: '' });
    let best = 0, bestScore = -1;
    for (let r = 0; r < Math.min(15, data.length); r++) {
      const score = (data[r] || []).filter((c) => typeof c === 'string' && FIELDS.some((f) => f[2].test(c.trim()))).length;
      if (score > bestScore) { best = r; bestScore = score; }
    }
    setRows(data);
    setHeaderRow(best);
    setMap(guessMap((data[best] || []).map((h) => String(h ?? '').trim())));
  }

  async function doImport() {
    const list = result.groups;
    if (!window.confirm(`거래명세서 ${list.length}건을 등록합니다.`)) return;
    setBusy(true);
    let inserted = 0, skipped = 0, invalid = [];
    try {
      for (let i = 0; i < list.length; i += 300) {
        setMsg(`등록 중… ${Math.min(i + 300, list.length)} / ${list.length}`);
        const r = await api('/api/slips/import', { method: 'POST', body: { slips: list.slice(i, i + 300), skipDuplicates: skipDup } });
        inserted += r.inserted; skipped += r.skipped; invalid = invalid.concat(r.invalid || []);
      }
      window.alert(`${inserted}건을 등록했습니다.${skipped ? ` 이미 있는 것과 같아 건너뛴 건 ${skipped}건.` : ''}${invalid.length ? ` 형식 오류 ${invalid.length}건.` : ''}`);
      router.push('/slips');
    } catch (e) {
      setMsg(`${inserted}건 등록 후 멈췄습니다: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  const ready = map.date != null && map.vendor != null;

  return (
    <>
      <div className="page-head"><h1>엑셀 가져오기</h1></div>
      <div className="panel">
        <div className="row">
          <div className="field"><label htmlFor="xf">엑셀 파일 (.xlsx, .xls, .csv)</label>
            <input id="xf" type="file" accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files?.[0] && openFile(e.target.files[0])} />
          </div>
          {wb && (
            <>
              <div className="field"><label htmlFor="xs">시트</label>
                <select id="xs" value={sheet} onChange={(e) => loadSheet(wb.book, wb.XLSX, e.target.value)}>
                  {wb.book.SheetNames.map((n) => <option key={n}>{n}</option>)}
                </select>
              </div>
              <div className="field"><label htmlFor="xh">제목 줄</label>
                <select id="xh" value={headerRow} onChange={(e) => { const r = +e.target.value; setHeaderRow(r); setMap(guessMap((rows[r] || []).map((h) => String(h ?? '').trim()))); }}>
                  {rows.slice(0, 15).map((_, i) => <option key={i} value={i}>{i + 1}번째 줄</option>)}
                </select>
              </div>
              <div className="field"><label htmlFor="xk">구분 열이 없을 때</label>
                <select id="xk" value={defKind} onChange={(e) => setDefKind(e.target.value)}><option>매입</option><option>매출</option></select>
              </div>
              <label className="check"><input type="checkbox" checked={autoVat} onChange={(e) => setAutoVat(e.target.checked)} /> 세액이 비어 있으면 10%로 계산</label>
            </>
          )}
        </div>
        {msg && <p className="status" role="status">{msg}</p>}
      </div>

      {wb && (
        <div className="panel">
          <h2>열 맞추기</h2>
          <p className="status" style={{ marginTop: 0 }}>제목 줄을 보고 자동으로 맞췄습니다. 틀린 곳만 고쳐 주십시오. 일자·거래처가 빈 줄은 위 줄의 값을 이어받습니다(병합 셀 대비).</p>
          <div className="grid-form">
            {FIELDS.map(([k, label]) => (
              <div className="field" key={k}><label htmlFor={`m-${k}`}>{label}</label>
                <select id={`m-${k}`} value={map[k] ?? ''} onChange={(e) => { const v = e.target.value; setMap((m) => { const n = { ...m }; if (v === '') delete n[k]; else n[k] = +v; return n; }); }}>
                  <option value="">(없음)</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h || `열 ${i + 1}`}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {wb && !ready && <p className="note">일자와 거래처 열은 꼭 지정해야 합니다.</p>}

      {wb && ready && (
        <>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="status">명세서 <b>{result.groups.length}건</b>(품목 {result.groups.reduce((a, g) => a + g.items.length, 0)}줄)으로 묶었습니다.{result.skipped ? ` 일자·거래처가 없어 건너뛴 줄 ${result.skipped}개.` : ''}{result.priced ? ` 단가가 비어 단가표로 채운 품목 ${result.priced}개.` : ''}</span>
            <div className="row" style={{ alignItems: 'center' }}>
              <label className="check"><input type="checkbox" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} /> 이미 등록된 것과 같은 건(구분·일자·거래처·합계 일치)은 건너뛰기</label>
              <button className="btn primary" type="button" disabled={busy || !result.groups.length} onClick={doImport}>{busy ? '등록 중…' : '가져오기'}</button>
            </div>
          </div>
          <div className="tablewrap" style={{ maxHeight: 420, overflow: 'auto' }}>
            <table>
              <thead><tr><th>일자</th><th>구분</th><th>거래처</th><th>전표번호</th><th>품목</th><th className="num">공급가액</th><th className="num">세액</th><th className="num">합계</th></tr></thead>
              <tbody>
                {result.groups.slice(0, 200).map((g, i) => (
                  <tr key={i}><td>{g.date}</td><td><KindPill kind={g.kind} /></td><td>{g.vendor_name}</td><td className="muted">{g.doc_no}</td><td>{itemSummary(g.items)}</td><td className="num">{won(g.supply)}</td><td className="num">{won(g.vat)}</td><td className="num">{won(g.total)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.groups.length > 200 && <p className="status">미리보기는 200건까지만 보입니다. 가져오기는 전체 {result.groups.length}건을 처리합니다.</p>}
        </>
      )}
    </>
  );
}
