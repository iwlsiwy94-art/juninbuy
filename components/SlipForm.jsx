'use client';
import { useEffect, useState } from 'react';
import { api, prepareFile, fileUrl, isAcceptable } from '@/components/api';
import { Seg } from '@/components/bits';
import { toNum, vatOf, won, today, formatBiz } from '@/lib/util';

const NUMS = ['qty', 'price', 'supply', 'vat'];
const s = (v) => (v === null || v === undefined ? '' : String(v));
const blankItem = () => ({ name: '', spec: '', qty: '', unit: '', price: '', supply: '', vat: '' });

function init(x) {
  const items = (x?.items || []).map((i) => ({ name: s(i.name), spec: s(i.spec), qty: s(i.qty), unit: s(i.unit), price: s(i.price), supply: s(i.supply), vat: s(i.vat) }));
  return {
    id: x?.id || null,
    kind: x?.kind === '매출' ? '매출' : '매입',
    date: x?.date ?? today(),
    vendor_name: x?.vendor_name || '',
    biz_no: x?.biz_no || '',
    doc_no: x?.doc_no || '',
    memo: x?.memo || '',
    source: x?.source || 'manual',
    items: items.length ? items : [blankItem()],
    attachments: x?.attachments || [],
    pending: x?.pending || [],
  };
}

// 거래명세서 입력·수정 양식
export default function SlipForm({ initial, notes, onSaved, onCancel }) {
  const [f, setF] = useState(() => init(initial));
  const [autoVat, setAutoVat] = useState(true);
  const [vendors, setVendors] = useState([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api('/api/vendors').then((d) => setVendors(d.vendors.filter((v) => !v.inactive))).catch(() => {});
  }, []);

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  function setVendor(name) {
    setF((p) => {
      const v = vendors.find((x) => x.name === name);
      return { ...p, vendor_name: name, biz_no: v && v.biz_no && !p.biz_no ? v.biz_no : p.biz_no };
    });
  }

  function setItem(i, k, val) {
    setF((p) => {
      const items = p.items.map((x) => ({ ...x }));
      const it = items[i];
      it[k] = val;
      if ((k === 'qty' || k === 'price') && toNum(it.qty) != null && toNum(it.price) != null) {
        it.supply = String(Math.round(toNum(it.qty) * toNum(it.price)));
      }
      if (['qty', 'price', 'supply'].includes(k) && autoVat) it.vat = String(vatOf(toNum(it.supply)));
      return { ...p, items };
    });
  }

  function toggleAutoVat(on) {
    setAutoVat(on);
    if (on) setF((p) => ({ ...p, items: p.items.map((it) => ({ ...it, vat: String(vatOf(toNum(it.supply))) })) }));
  }

  const totals = f.items.reduce((a, it) => ({ supply: a.supply + (toNum(it.supply) || 0), vat: a.vat + (toNum(it.vat) || 0) }), { supply: 0, vat: 0 });

  async function save() {
    setMsg('');
    if (!f.date) return setMsg('거래일자를 입력해 주십시오.');
    if (!f.vendor_name.trim()) return setMsg('거래처 상호를 입력해 주십시오.');
    const items = f.items.filter((it) => it.name || it.spec || toNum(it.supply) || toNum(it.qty));
    if (!items.length) return setMsg('품목을 한 줄 이상 입력해 주십시오.');
    setSaving(true);
    try {
      const uploaded = [];
      for (const file of f.pending) {
        setMsg(`원본 올리는 중… ${file.name}`);
        const pf = await prepareFile(file);
        if (pf.size > 4 * 1024 * 1024) throw new Error(`${file.name} 파일이 4MB를 넘습니다. 첨부에서 빼거나 더 작은 파일로 바꿔 주십시오.`);
        const fd = new FormData();
        fd.append('file', pf, pf.name);
        uploaded.push(await api('/api/files', { method: 'POST', form: fd }));
      }
      setMsg('저장 중…');
      const body = {
        kind: f.kind, date: f.date, vendor_name: f.vendor_name, biz_no: f.biz_no, doc_no: f.doc_no, memo: f.memo, source: f.source,
        items: items.map((it) => ({ name: it.name, spec: it.spec, unit: it.unit, qty: toNum(it.qty), price: toNum(it.price), supply: toNum(it.supply) || 0, vat: toNum(it.vat) || 0 })),
        attachments: [...f.attachments, ...uploaded],
      };
      const r = f.id ? await api(`/api/slips/${f.id}`, { method: 'PUT', body }) : await api('/api/slips', { method: 'POST', body });
      // 올린 파일은 이미 저장됐으니 다시 올리지 않도록 정리
      setF((p) => ({ ...p, attachments: body.attachments, pending: [] }));
      setMsg('');
      onSaved && onSaved(r.slip);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel">
      {notes && <p className="note" style={{ marginTop: 0 }}>{notes}</p>}
      <div className="grid-form">
        <div className="field"><span className="label">구분</span>
          <Seg value={f.kind} onChange={(v) => set('kind', v)} kindColors options={[['매입', '매입 (받은 명세서)'], ['매출', '매출 (보낸 명세서)']]} />
        </div>
        <div className="field"><label htmlFor="sf-date">거래일자</label><input id="sf-date" type="date" value={f.date} onChange={(e) => set('date', e.target.value)} /></div>
        <div className="field"><label htmlFor="sf-vendor">거래처 상호</label>
          <input id="sf-vendor" type="text" list="sf-vendors" autoComplete="off" value={f.vendor_name} onChange={(e) => setVendor(e.target.value)} />
          <datalist id="sf-vendors">{vendors.map((v) => <option key={v.id} value={v.name} />)}</datalist>
        </div>
        <div className="field"><label htmlFor="sf-biz">거래처 사업자번호</label><input id="sf-biz" type="text" placeholder="000-00-00000" value={f.biz_no} onChange={(e) => set('biz_no', e.target.value)} onBlur={(e) => set('biz_no', formatBiz(e.target.value))} /></div>
        <div className="field"><label htmlFor="sf-doc">전표(명세서) 번호</label><input id="sf-doc" type="text" value={f.doc_no} onChange={(e) => set('doc_no', e.target.value)} /></div>
      </div>
      <p className="status" style={{ margin: '6px 0 0' }}>등록 업체에 없는 거래처는 저장할 때 자동으로 업체 목록에 추가됩니다.</p>

      <div className="tablewrap items" style={{ marginTop: 14 }}>
        <table>
          <thead><tr><th>품명</th><th>규격</th><th className="num">수량</th><th>단위</th><th className="num">단가</th><th className="num">공급가액</th><th className="num">세액</th><th></th></tr></thead>
          <tbody>
            {f.items.map((it, i) => (
              <tr key={i}>
                <td className="w-name"><input type="text" aria-label={`품명 ${i + 1}`} value={it.name} onChange={(e) => setItem(i, 'name', e.target.value)} /></td>
                <td className="w-spec"><input type="text" aria-label={`규격 ${i + 1}`} value={it.spec} onChange={(e) => setItem(i, 'spec', e.target.value)} /></td>
                <td className="w-n"><input type="text" inputMode="decimal" className="numin" aria-label={`수량 ${i + 1}`} value={it.qty} onChange={(e) => setItem(i, 'qty', e.target.value)} /></td>
                <td className="w-u"><input type="text" aria-label={`단위 ${i + 1}`} value={it.unit} onChange={(e) => setItem(i, 'unit', e.target.value)} /></td>
                {NUMS.slice(1).map((k) => (
                  <td key={k} className="w-m"><input type="text" inputMode="decimal" className="numin" aria-label={`${{ price: '단가', supply: '공급가액', vat: '세액' }[k]} ${i + 1}`} value={it[k]} onChange={(e) => setItem(i, k, e.target.value)} /></td>
                ))}
                <td><button className="btn small" type="button" onClick={() => setF((p) => ({ ...p, items: p.items.length > 1 ? p.items.filter((_, j) => j !== i) : [blankItem()] }))}>삭제</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row" style={{ justifyContent: 'space-between', marginTop: 10, alignItems: 'center' }}>
        <div className="row" style={{ alignItems: 'center' }}>
          <button className="btn small" type="button" onClick={() => setF((p) => ({ ...p, items: [...p.items, blankItem()] }))}>품목 추가</button>
          <label className="check"><input type="checkbox" checked={autoVat} onChange={(e) => toggleAutoVat(e.target.checked)} /> 세액 10% 자동 계산</label>
        </div>
        <div className="totals">
          <div><span className="k">공급가액</span><span className="v">{won(totals.supply)}</span></div>
          <div><span className="k">세액</span><span className="v">{won(totals.vat)}</span></div>
          <div><span className="k">합계금액</span><span className="v">{won(totals.supply + totals.vat)}</span></div>
        </div>
      </div>

      <div className="field" style={{ marginTop: 12 }}><label htmlFor="sf-memo">비고</label><textarea id="sf-memo" value={f.memo} onChange={(e) => set('memo', e.target.value)} /></div>

      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="sf-files">원본 첨부 (사진·PDF)</label>
        <input id="sf-files" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple
          onChange={(e) => { const fs = Array.from(e.target.files || []).filter(isAcceptable); e.target.value = ''; setF((p) => ({ ...p, pending: [...p.pending, ...fs] })); }} />
        <div className="files">
          {f.attachments.map((a, i) => (
            <span className="file" key={a.path}>
              <a href={fileUrl(a.path)} target="_blank" rel="noopener noreferrer">{a.name}</a>
              <button className="btn small" type="button" onClick={() => setF((p) => ({ ...p, attachments: p.attachments.filter((_, j) => j !== i) }))}>빼기</button>
            </span>
          ))}
          {f.pending.map((p, i) => (
            <span className="file" key={`p${i}`}>
              {p.name} <span className="muted">(저장할 때 올림)</span>
              <button className="btn small" type="button" onClick={() => setF((x) => ({ ...x, pending: x.pending.filter((_, j) => j !== i) }))}>빼기</button>
            </span>
          ))}
        </div>
      </div>

      <div className="actions" style={{ marginTop: 14 }}>
        <span className="status" style={{ marginRight: 'auto' }} role="status">{msg}</span>
        {onCancel && <button className="btn" type="button" onClick={onCancel} disabled={saving}>취소</button>}
        <button className="btn primary" type="button" onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장'}</button>
      </div>
    </div>
  );
}
