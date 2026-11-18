'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, prepareFile, fileUrl, isAcceptable } from '@/components/api';
import { Seg } from '@/components/bits';
import { toNum, vatOf, won, today, formatBiz } from '@/lib/util';
import { lookupPrice } from '@/lib/accounting';

const s = (v) => (v === null || v === undefined ? '' : String(v));
const blankItem = () => ({ name: '', spec: '', qty: '', unit: '', price: '', supply: '', vat: '' });
const norm = (v) => String(v || '').replace(/\s/g, '').toLowerCase();

// 엔터로 이동하는 순서: 위쪽 칸 → 품목 행(품명→규격→수량→단위→단가→공급가액) → 다음 행 품명
const HEAD = ['date', 'vendor', 'biz', 'doc'];
const COLS = ['name', 'spec', 'qty', 'unit', 'price', 'supply'];

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

// 단가가 비어 있다고 볼 조건 (판독 결과 단가·공급가액이 0으로 들어온 경우 포함)
const priceEmpty = (it) => String(it.price).trim() === '' || (toNum(it.price) === 0 && !toNum(it.supply));

// 거래명세서 입력·수정 양식
export default function SlipForm({ initial, notes, onSaved, onCancel }) {
  const [f, setF] = useState(() => init(initial));
  const [autoVat, setAutoVat] = useState(true);
  const [vendors, setVendors] = useState([]);
  const [prices, setPrices] = useState([]);
  const [master, setMaster] = useState([]);
  const [loaded, setLoaded] = useState(0);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [autoNote, setAutoNote] = useState('');
  const box = useRef(null);

  useEffect(() => {
    const done = () => setLoaded((n) => n + 1);
    api('/api/vendors').then((d) => setVendors(d.vendors.filter((v) => !v.inactive))).catch(() => {}).finally(done);
    api('/api/prices').then((d) => setPrices(d.prices || [])).catch(() => {}).finally(done);
    api('/api/items').then((d) => setMaster((d.items || []).filter((x) => !x.inactive))).catch(() => {}).finally(done);
  }, []);

  // 품명 검색용 목록 (같은 품명은 한 번만)
  const itemNames = useMemo(() => {
    const m = new Map();
    master.forEach((it) => {
      const cur = m.get(it.name) || [];
      cur.push(it);
      m.set(it.name, cur);
    });
    return m;
  }, [master]);

  function priceFor(it, p = f) {
    const vendor = vendors.find((v) => v.name === p.vendor_name);
    return lookupPrice(prices, master, { kind: p.kind, vendorId: vendor?.id, vendorName: p.vendor_name, name: it.name, spec: it.spec, date: p.date });
  }

  // 한 품목의 빈 단가 채우기: 공급가액·수량이 있으면 나눠서, 아니면 업체 단가 → 품목 단가 → 공통 단가 순
  function fillOne(x, p) {
    if (!x.name || !priceEmpty(x)) return null;
    const it = { ...x };
    const qty = toNum(it.qty), sup = toNum(it.supply);
    if (sup && qty) {
      it.price = String(Math.round((sup / qty) * 100) / 100);
      it._auto = '공급가액÷수량';
      return it;
    }
    const hit = priceFor(it, p);
    if (!hit) return null;
    it.price = String(hit.price);
    it._auto = hit.source;
    if (!it.unit && hit.unit) it.unit = hit.unit;
    if (qty != null) {
      it.supply = String(Math.round(qty * hit.price));
      if (autoVat) it.vat = String(vatOf(toNum(it.supply)));
    }
    return it;
  }

  function fillPrices(silent = false) {
    let filled = 0;
    const items = f.items.map((x) => {
      const r = fillOne(x, f);
      if (r) { filled++; return r; }
      return x;
    });
    if (filled) {
      setF({ ...f, items });
      setAutoNote(`빈 단가 ${filled}개를 채웠습니다. 초록색 칸을 확인해 주십시오.`);
    } else if (!silent) setAutoNote('품목 관리·단가표에서 찾은 빈 단가가 없습니다.');
  }

  // 업체·단가표·품목을 다 불러오면 처음 한 번 자동으로 채움 (사진 판독 결과처럼 단가가 빠진 경우)
  const autoDone = useRef(false);
  useEffect(() => {
    if (autoDone.current || loaded < 3) return;
    autoDone.current = true;
    fillPrices(true);
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

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
      let it = items[i];
      it[k] = val;
      if (k === 'price') delete it._auto;
      // 검색 목록에서 품명을 고르면 규격·단위·단가를 품목 관리에서 가져옴
      if (k === 'name' && itemNames.has(val)) {
        const list = itemNames.get(val);
        if (!it.spec && list.length === 1) it.spec = list[0].spec;
        const one = list.find((x) => norm(x.spec) === norm(it.spec)) || (list.length === 1 ? list[0] : null);
        if (!it.unit && one?.unit) it.unit = one.unit;
        const r = fillOne(it, p);
        if (r) it = items[i] = r;
      }
      if (k === 'spec') {
        const r = fillOne(it, p);
        if (r) it = items[i] = r;
      }
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

  // ---- 엔터 이동 ----
  function focusNav(key) {
    const el = box.current?.querySelector(`[data-nav="${key}"]`);
    if (el) { el.focus(); if (el.select && el.type !== 'date') el.select(); }
  }
  function onEnter(e) {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) return;
    const key = e.target.getAttribute('data-nav');
    if (!key) return;
    // 검색 목록에서 엔터로 고른 값이 먼저 들어가도록 한 박자 뒤에 이동
    const go = (k) => setTimeout(() => focusNav(k), 0);
    if (HEAD.includes(key)) {
      const n = HEAD.indexOf(key);
      go(n < HEAD.length - 1 ? HEAD[n + 1] : 'i0-name');
      return;
    }
    const m = key.match(/^i(\d+)-(\w+)$/);
    if (!m) return;
    const row = +m[1], col = m[2];
    const ci = COLS.indexOf(col);
    if (ci >= 0 && ci < COLS.length - 1) { go(`i${row}-${COLS[ci + 1]}`); return; }
    // 공급가액(또는 세액)에서 엔터 → 다음 행 품명, 마지막 행이면 행을 하나 추가
    if (row + 1 >= f.items.length) setF((p) => ({ ...p, items: [...p.items, blankItem()] }));
    go(`i${row + 1}-name`);
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
      setF((p) => ({ ...p, attachments: body.attachments, pending: [] }));
      setMsg('');
      onSaved && onSaved(r.slip);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setSaving(false);
    }
  }

  const NumInput = ({ it, i, k, label }) => (
    <input type="text" inputMode="decimal" className="numin" aria-label={`${label} ${i + 1}`} data-nav={`i${i}-${k}`}
      value={it[k]} onChange={(e) => setItem(i, k, e.target.value)}
      style={k === 'price' && it._auto ? { borderColor: 'var(--ok)', background: 'var(--ok-bg)' } : undefined} />
  );

  return (
    <div className="panel" ref={box} onKeyDown={onEnter}>
      {notes && <p className="note" style={{ marginTop: 0 }}>{notes}</p>}
      <div className="grid-form">
        <div className="field"><span className="label">구분</span>
          <Seg value={f.kind} onChange={(v) => set('kind', v)} kindColors options={[['매입', '매입 (받은 명세서)'], ['매출', '매출 (보낸 명세서)']]} />
        </div>
        <div className="field"><label htmlFor="sf-date">거래일자</label><input id="sf-date" data-nav="date" type="date" value={f.date} onChange={(e) => set('date', e.target.value)} /></div>
        <div className="field"><label htmlFor="sf-vendor">거래처 상호</label>
          <input id="sf-vendor" data-nav="vendor" type="text" list="sf-vendors" autoComplete="off" value={f.vendor_name} onChange={(e) => setVendor(e.target.value)} onBlur={() => fillPrices(true)} />
          <datalist id="sf-vendors">{vendors.map((v) => <option key={v.id} value={v.name} />)}</datalist>
        </div>
        <div className="field"><label htmlFor="sf-biz">거래처 사업자번호</label><input id="sf-biz" data-nav="biz" type="text" placeholder="000-00-00000" value={f.biz_no} onChange={(e) => set('biz_no', e.target.value)} onBlur={(e) => set('biz_no', formatBiz(e.target.value))} /></div>
        <div className="field"><label htmlFor="sf-doc">전표(명세서) 번호</label><input id="sf-doc" data-nav="doc" type="text" value={f.doc_no} onChange={(e) => set('doc_no', e.target.value)} /></div>
      </div>
      <p className="status" style={{ margin: '6px 0 0' }}>
        엔터로 다음 칸으로 이동합니다. 품명 칸에 글자를 넣으면 품목 관리에 있는 품명이 검색되고, 고르면 규격·단위·단가가 채워집니다. 처음 쓰는 품명과 거래처는 저장할 때 자동으로 등록됩니다.
      </p>

      <datalist id="sf-items">
        {[...itemNames.entries()].map(([name, list]) => (
          <option key={name} value={name}>{list.map((x) => [x.spec, x.unit, x.price != null ? `${won(x.price)}원` : ''].filter(Boolean).join(' · ')).filter(Boolean).join(' / ')}</option>
        ))}
      </datalist>

      <div className="tablewrap items" style={{ marginTop: 14 }}>
        <table>
          <thead><tr><th>품명</th><th>규격</th><th className="num">수량</th><th>단위</th><th className="num">단가</th><th className="num">공급가액</th><th className="num">세액</th><th></th></tr></thead>
          <tbody>
            {f.items.map((it, i) => {
              const specs = (itemNames.get(it.name) || []).map((x) => x.spec).filter(Boolean);
              return (
                <tr key={i}>
                  <td className="w-name">
                    <input type="text" list="sf-items" autoComplete="off" aria-label={`품명 ${i + 1}`} data-nav={`i${i}-name`} value={it.name}
                      onChange={(e) => setItem(i, 'name', e.target.value)} onBlur={() => fillPrices(true)} placeholder="품명 검색" />
                  </td>
                  <td className="w-spec">
                    <input type="text" list={specs.length ? `sf-spec-${i}` : undefined} autoComplete="off" aria-label={`규격 ${i + 1}`} data-nav={`i${i}-spec`} value={it.spec}
                      onChange={(e) => setItem(i, 'spec', e.target.value)} onBlur={() => fillPrices(true)} />
                    {specs.length > 0 && <datalist id={`sf-spec-${i}`}>{specs.map((sp) => <option key={sp} value={sp} />)}</datalist>}
                  </td>
                  <td className="w-n">{NumInput({ it, i, k: 'qty', label: '수량' })}</td>
                  <td className="w-u"><input type="text" aria-label={`단위 ${i + 1}`} data-nav={`i${i}-unit`} value={it.unit} onChange={(e) => setItem(i, 'unit', e.target.value)} /></td>
                  <td className="w-m">
                    {NumInput({ it, i, k: 'price', label: '단가' })}
                    {it._auto && <span className="auto-mark">{it._auto}</span>}
                  </td>
                  <td className="w-m">{NumInput({ it, i, k: 'supply', label: '공급가액' })}</td>
                  <td className="w-m">{NumInput({ it, i, k: 'vat', label: '세액' })}</td>
                  <td><button className="btn small" type="button" tabIndex={-1} onClick={() => setF((p) => ({ ...p, items: p.items.length > 1 ? p.items.filter((_, j) => j !== i) : [blankItem()] }))}>삭제</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="row" style={{ justifyContent: 'space-between', marginTop: 10, alignItems: 'center' }}>
        <div className="row" style={{ alignItems: 'center' }}>
          <button className="btn small" type="button" onClick={() => setF((p) => ({ ...p, items: [...p.items, blankItem()] }))}>품목 추가</button>
          <label className="check"><input type="checkbox" checked={autoVat} onChange={(e) => toggleAutoVat(e.target.checked)} /> 세액 10% 자동 계산</label>
          <button className="btn small" type="button" onClick={() => fillPrices(false)}>빈 단가 채우기</button>
          {autoNote && <span className="status">{autoNote}</span>}
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
