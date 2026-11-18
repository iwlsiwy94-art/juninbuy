'use client';
import { useEffect, useMemo, useState } from 'react';
import { api, downloadXlsx } from '@/components/api';
import { KindPill, Seg } from '@/components/bits';
import { useUser, canEdit } from '@/components/UserContext';
import { won, today, toNum } from '@/lib/util';
import { priceKey } from '@/lib/accounting';

const blank = () => ({ id: null, kind: '매입', vendor_name: '', item_name: '', spec: '', unit: '', price: '', valid_from: today(), memo: '' });

// 업체별·공통 단가표 (품목 관리 화면의 '업체별 단가' 탭)
export default function PricesPanel() {
  const user = useUser();
  const editable = canEdit(user);
  const [prices, setPrices] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('all');
  const [history, setHistory] = useState(false);
  const [f, setF] = useState(blank);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    api('/api/prices').then((d) => setPrices(d.prices)).catch((e) => { setMsg(e.message); setPrices([]); });
  }, [reload]);
  useEffect(() => { api('/api/vendors').then((d) => setVendors(d.vendors)).catch(() => {}); }, []);

  // 업체+품목+규격마다 가장 최근 적용일이 '현재 단가'
  const currentIds = useMemo(() => {
    const m = new Map();
    (prices || []).forEach((p) => {
      const k = `${p.kind}|${p.vendor_id || ''}|${priceKey(p.item_name, p.spec)}`;
      const cur = m.get(k);
      if (!cur || String(p.valid_from) > String(cur.valid_from)) m.set(k, p);
    });
    return new Set([...m.values()].map((p) => p.id));
  }, [prices]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (prices || []).filter((p) => {
      if (!history && !currentIds.has(p.id)) return false;
      if (kind !== 'all' && p.kind !== kind) return false;
      if (s && ![p.item_name, p.spec, p.vendor_name || '공통', p.memo].join(' ').toLowerCase().includes(s)) return false;
      return true;
    });
  }, [prices, q, kind, history, currentIds]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    setMsg('');
    const vname = f.vendor_name.trim();
    const vendor = vname ? vendors.find((v) => v.name === vname) : null;
    if (vname && !vendor) { setMsg(`'${vname}'은(는) 등록 업체에 없습니다. 목록에서 고르거나, 모든 업체에 쓰려면 비워 두십시오.`); return; }
    if (toNum(f.price) == null) { setMsg('단가를 숫자로 입력해 주십시오.'); return; }
    setBusy(true);
    try {
      const body = { kind: f.kind, vendor_id: vendor ? vendor.id : null, item_name: f.item_name, spec: f.spec, unit: f.unit, price: toNum(f.price), valid_from: f.valid_from, memo: f.memo };
      if (f.id) await api(`/api/prices/${f.id}`, { method: 'PUT', body });
      else await api('/api/prices', { method: 'POST', body });
      setMsg(f.id ? '단가를 고쳤습니다.' : '단가를 등록했습니다.');
      setF(blank());
      setReload((r) => r + 1);
    } catch (e2) {
      setMsg(e2.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(p) {
    if (!window.confirm(`${p.vendor_name || '공통'} · ${p.item_name} ${p.spec} (${won(p.price)}원, ${p.valid_from}) 단가를 삭제합니다.`)) return;
    try { await api(`/api/prices/${p.id}`, { method: 'DELETE' }); setReload((r) => r + 1); }
    catch (e) { window.alert(e.message); }
  }

  async function fromSlips() {
    if (!window.confirm('등록된 거래명세서에서 업체·품목별 최근 단가를 모아 단가표에 추가합니다. 이미 있는 단가는 명세서 단가가 더 최근이고 금액이 다를 때만 새 적용일로 추가됩니다.')) return;
    setBusy(true); setMsg('');
    try {
      const r = await api('/api/prices/from-slips', { method: 'POST' });
      setMsg(`새 품목 ${r.added}개, 단가 변경 ${r.changed}개를 추가했습니다.`);
      setReload((x) => x + 1);
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  function newPriceFrom(p) {
    setF({ id: null, kind: p.kind, vendor_name: p.vendor_name || '', item_name: p.item_name, spec: p.spec, unit: p.unit, price: '', valid_from: today(), memo: '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function exportXlsx() {
    downloadXlsx((X) => {
      const a = [['구분', '업체', '품명', '규격', '단위', '단가', '적용일', '현재 단가', '메모']];
      rows.forEach((p) => a.push([p.kind, p.vendor_name || '공통', p.item_name, p.spec, p.unit, Number(p.price), p.valid_from, currentIds.has(p.id) ? '현재' : '이전', p.memo]));
      const wb = X.utils.book_new();
      const ws = X.utils.aoa_to_sheet(a);
      ws['!cols'] = [6, 22, 24, 14, 6, 12, 11, 8, 24].map((wch) => ({ wch }));
      X.utils.book_append_sheet(wb, ws, '단가표');
      return wb;
    }, `단가표_${today()}.xlsx`);
  }

  return (
    <>
      <div className="page-head">
        <h2 style={{ fontSize: 16, margin: 0 }}>업체별 단가표</h2>
        <div className="right">
          <button className="btn" type="button" onClick={exportXlsx} disabled={!rows.length}>엑셀로 내보내기</button>
          {editable && <button className="btn" type="button" onClick={fromSlips} disabled={busy}>거래명세서에서 단가 불러오기</button>}
        </div>
      </div>
      <p className="status" style={{ margin: 0 }}>
        업체마다 단가가 다를 때 씁니다. 거래명세서에 단가가 비어 있으면 ① 이 표의 같은 업체 단가 ② 품목 관리의 기준 단가 ③ 이 표의 공통 단가 순서로 채우며, 거래일 기준 가장 최근 적용일의 단가를 씁니다.
      </p>

      {editable && (
        <form className="panel" onSubmit={save}>
          <h2>{f.id ? '단가 수정' : '단가 등록'}</h2>
          <div className="grid-form">
            <div className="field"><span className="label">구분</span>
              <Seg value={f.kind} onChange={(v) => setF({ ...f, kind: v })} kindColors options={[['매입', '매입'], ['매출', '매출']]} />
            </div>
            <div className="field"><label htmlFor="p-v">업체 (비우면 공통)</label>
              <input id="p-v" type="text" list="p-vendors" autoComplete="off" value={f.vendor_name} onChange={set('vendor_name')} placeholder="공통" />
              <datalist id="p-vendors">{vendors.map((v) => <option key={v.id} value={v.name} />)}</datalist>
            </div>
            <div className="field"><label htmlFor="p-n">품명 *</label><input id="p-n" type="text" value={f.item_name} onChange={set('item_name')} required /></div>
            <div className="field"><label htmlFor="p-s">규격</label><input id="p-s" type="text" value={f.spec} onChange={set('spec')} /></div>
            <div className="field"><label htmlFor="p-u">단위</label><input id="p-u" type="text" value={f.unit} onChange={set('unit')} placeholder="EA, M, KG" /></div>
            <div className="field"><label htmlFor="p-p">단가 (원) *</label><input id="p-p" type="text" inputMode="decimal" className="num" value={f.price} onChange={set('price')} required /></div>
            <div className="field"><label htmlFor="p-d">적용 시작일</label><input id="p-d" type="date" value={f.valid_from} onChange={set('valid_from')} /></div>
            <div className="field"><label htmlFor="p-m">메모</label><input id="p-m" type="text" value={f.memo} onChange={set('memo')} placeholder="예: 2026년 단가 계약" /></div>
          </div>
          <div className="actions" style={{ marginTop: 12 }}>
            <span className="status" style={{ marginRight: 'auto' }} role="status">{msg || '단가가 바뀌면 기존 줄을 고치지 말고 ‘새 단가’로 적용 시작일을 넣어 추가하면 이력이 남습니다.'}</span>
            {f.id && <button className="btn" type="button" onClick={() => setF(blank())}>취소</button>}
            <button className="btn primary" type="submit" disabled={busy}>{f.id ? '수정 저장' : '등록'}</button>
          </div>
        </form>
      )}

      <div className="panel">
        <div className="row" style={{ alignItems: 'center' }}>
          <div className="field" style={{ flex: 1, minWidth: 200 }}><label htmlFor="pq">검색</label><input id="pq" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="품명, 규격, 업체" /></div>
          <div className="field"><span className="label">구분</span>
            <Seg value={kind} onChange={setKind} kindColors options={[['all', '전체'], ['매입', '매입'], ['매출', '매출']]} />
          </div>
          <label className="check" style={{ alignSelf: 'flex-end', paddingBottom: 8 }}><input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} /> 이전 단가 이력도 보기</label>
        </div>
      </div>

      <div className="tablewrap">
        <table>
          <thead><tr><th>구분</th><th>업체</th><th>품명</th><th>규격</th><th>단위</th><th className="num">단가</th><th>적용일</th><th>메모</th><th></th></tr></thead>
          <tbody>
            {prices === null && <tr><td colSpan={9} className="empty">불러오는 중…</td></tr>}
            {prices && !rows.length && (
              <tr><td colSpan={9} className="empty">
                {prices.length ? '조건에 맞는 단가가 없습니다.' : <><strong>등록된 단가가 없습니다.</strong>위 양식으로 넣거나 ‘거래명세서에서 단가 불러오기’로 지금까지의 단가를 한 번에 가져올 수 있습니다.</>}
              </td></tr>
            )}
            {rows.map((p) => (
              <tr key={p.id} style={currentIds.has(p.id) ? undefined : { color: 'var(--muted)' }}>
                <td><KindPill kind={p.kind} /></td>
                <td>{p.vendor_name || <span className="muted">공통</span>}</td>
                <td><b>{p.item_name}</b></td>
                <td>{p.spec}</td>
                <td>{p.unit}</td>
                <td className="num"><b>{won(p.price)}</b></td>
                <td>{p.valid_from} {!currentIds.has(p.id) && <span className="pill off">이전</span>}</td>
                <td className="muted">{p.memo}</td>
                <td className="actions" style={{ justifyContent: 'flex-start', flexWrap: 'nowrap' }}>
                  {editable && <button className="btn small" type="button" onClick={() => newPriceFrom(p)}>새 단가</button>}
                  {editable && <button className="btn small" type="button" onClick={() => { setF({ ...p, vendor_name: p.vendor_name || '', price: String(p.price) }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>수정</button>}
                  {editable && <button className="btn small danger" type="button" onClick={() => remove(p)}>삭제</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
