'use client';
import { useEffect, useMemo, useState } from 'react';
import { api, downloadXlsx } from '@/components/api';
import { Seg } from '@/components/bits';
import PricesPanel from '@/components/PricesPanel';
import { useUser, canEdit } from '@/components/UserContext';
import { won, today, toNum } from '@/lib/util';

const blank = () => ({ id: null, name: '', spec: '', unit: '', price: '', memo: '', inactive: false });

export default function ItemsPage() {
  const [tab, setTab] = useState('items');
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('tab') === 'prices') setTab('prices');
  }, []);
  return (
    <>
      <div className="page-head">
        <h1>품목 관리</h1>
        <div className="right"><Seg value={tab} onChange={setTab} options={[['items', '품목'], ['prices', '업체별 단가']]} /></div>
      </div>
      {tab === 'items' ? <ItemsPanel /> : <PricesPanel />}
    </>
  );
}

function ItemsPanel() {
  const user = useUser();
  const editable = canEdit(user);
  const [items, setItems] = useState(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [showOff, setShowOff] = useState(false);
  const [f, setF] = useState(blank);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [edits, setEdits] = useState({}); // 목록에서 바로 고치는 기준 단가

  useEffect(() => {
    api('/api/items?stats=1').then((d) => setItems(d.items)).catch((e) => { setMsg(e.message); setItems([]); });
  }, [reload]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (items || []).filter((it) => {
      if (!showOff && it.inactive) return false;
      if (filter === 'noprice' && it.price != null) return false;
      if (filter === 'priced' && it.price == null) return false;
      if (s && ![it.name, it.spec, it.memo, it.last_vendor].join(' ').toLowerCase().includes(s)) return false;
      return true;
    });
  }, [items, q, filter, showOff]);

  const noPrice = (items || []).filter((it) => !it.inactive && it.price == null).length;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function save(e) {
    e.preventDefault();
    setMsg('');
    if (String(f.price).trim() !== '' && toNum(f.price) == null) { setMsg('기준 단가를 숫자로 입력해 주십시오.'); return; }
    setBusy(true);
    try {
      const body = { ...f, price: String(f.price).trim() === '' ? '' : toNum(f.price) };
      if (f.id) await api(`/api/items/${f.id}`, { method: 'PUT', body });
      else await api('/api/items', { method: 'POST', body });
      setMsg(f.id ? `${f.name} 품목을 고쳤습니다.` : `${f.name} 품목을 등록했습니다.`);
      setF(blank());
      setReload((r) => r + 1);
    } catch (e2) { setMsg(e2.message); }
    finally { setBusy(false); }
  }

  // 목록의 기준 단가 칸에서 바로 저장 (엔터 또는 칸을 벗어날 때)
  async function savePrice(it, override) {
    const raw = override !== undefined ? override : edits[it.id];
    if (raw === undefined) return;
    const val = String(raw).trim() === '' ? null : toNum(raw);
    if (String(raw).trim() !== '' && val == null) { window.alert('기준 단가를 숫자로 입력해 주십시오.'); return; }
    if (val === (it.price ?? null)) { setEdits((x) => { const n = { ...x }; delete n[it.id]; return n; }); return; }
    try {
      const r = await api(`/api/items/${it.id}`, { method: 'PUT', body: { ...it, price: val == null ? '' : val } });
      setItems((list) => list.map((x) => (x.id === it.id ? { ...x, ...r.item } : x)));
      setEdits((x) => { const n = { ...x }; delete n[it.id]; return n; });
    } catch (e) { window.alert(e.message); }
  }

  async function remove(it) {
    if (!window.confirm(`${it.name} ${it.spec} 품목을 삭제합니다. 이미 등록된 거래명세서는 바뀌지 않습니다.\n같은 품명이 다시 등록되면 품목이 자동으로 다시 생깁니다. 숨기기만 하려면 ‘사용 안 함’을 쓰십시오.`)) return;
    try { await api(`/api/items/${it.id}`, { method: 'DELETE' }); setReload((r) => r + 1); }
    catch (e) { window.alert(e.message); }
  }

  function exportXlsx() {
    downloadXlsx((X) => {
      const a = [['품명', '규격', '단위', '기준 단가', '최근 거래 단가', '최근 거래일', '최근 거래처', '사용 횟수', '메모', '사용 안 함']];
      rows.forEach((it) => a.push([it.name, it.spec, it.unit, it.price ?? '', it.last_price ?? '', it.last_date || '', it.last_vendor || '', it.use_count || 0, it.memo, it.inactive ? '예' : '']));
      const wb = X.utils.book_new();
      const ws = X.utils.aoa_to_sheet(a);
      ws['!cols'] = [24, 14, 6, 12, 12, 11, 20, 8, 24, 8].map((wch) => ({ wch }));
      X.utils.book_append_sheet(wb, ws, '품목');
      return wb;
    }, `품목_${today()}.xlsx`);
  }

  return (
    <>
      <p className="status" style={{ margin: 0 }}>
        거래명세서에 한 번이라도 등록한 품명은 여기에 자동으로 추가됩니다. <b>기준 단가</b>를 넣어 두면 등록 화면에서 같은 품명이 나올 때 단가가 비어 있으면 자동으로 채워집니다.
      </p>

      {editable && (
        <form className="panel" onSubmit={save}>
          <h2>{f.id ? '품목 수정' : '품목 직접 등록'}</h2>
          <div className="grid-form">
            <div className="field"><label htmlFor="it-n">품명 *</label><input id="it-n" type="text" value={f.name} onChange={set('name')} required /></div>
            <div className="field"><label htmlFor="it-s">규격</label><input id="it-s" type="text" value={f.spec} onChange={set('spec')} /></div>
            <div className="field"><label htmlFor="it-u">단위</label><input id="it-u" type="text" value={f.unit} onChange={set('unit')} placeholder="EA, B/T, KG" /></div>
            <div className="field"><label htmlFor="it-p">기준 단가 (원)</label><input id="it-p" type="text" inputMode="decimal" className="num" value={f.price} onChange={set('price')} /></div>
            <div className="field"><label htmlFor="it-m">메모</label><input id="it-m" type="text" value={f.memo} onChange={set('memo')} /></div>
            {f.id && <label className="check" style={{ alignSelf: 'end', paddingBottom: 8 }}><input type="checkbox" checked={f.inactive} onChange={set('inactive')} /> 사용 안 함 (검색에서 숨김)</label>}
          </div>
          <div className="actions" style={{ marginTop: 12 }}>
            <span className="status" style={{ marginRight: 'auto' }} role="status">{msg}</span>
            {f.id && <button className="btn" type="button" onClick={() => setF(blank())}>취소</button>}
            <button className="btn primary" type="submit" disabled={busy}>{f.id ? '수정 저장' : '등록'}</button>
          </div>
        </form>
      )}

      <div className="panel">
        <div className="row" style={{ alignItems: 'center' }}>
          <div className="field" style={{ flex: 1, minWidth: 200 }}><label htmlFor="iq">품명 검색</label><input id="iq" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="품명, 규격, 최근 거래처" /></div>
          <div className="field"><span className="label">기준 단가</span>
            <Seg value={filter} onChange={setFilter} options={[['all', '전체'], ['noprice', `미등록 (${noPrice})`], ['priced', '등록됨']]} />
          </div>
          <label className="check" style={{ alignSelf: 'flex-end', paddingBottom: 8 }}><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> 사용 안 함 품목도 보기</label>
          <button className="btn" type="button" style={{ alignSelf: 'flex-end' }} onClick={exportXlsx} disabled={!rows.length}>엑셀로 내보내기</button>
        </div>
      </div>

      <div className="tablewrap">
        <table>
          <thead><tr><th>품명</th><th>규격</th><th>단위</th><th className="num">기준 단가</th><th className="num">최근 거래 단가</th><th>최근 거래</th><th className="num">사용</th><th>메모</th><th></th></tr></thead>
          <tbody>
            {items === null && <tr><td colSpan={9} className="empty">불러오는 중…</td></tr>}
            {items && !rows.length && (
              <tr><td colSpan={9} className="empty">
                {items.length ? '조건에 맞는 품목이 없습니다.' : <><strong>등록된 품목이 없습니다.</strong>거래명세서를 저장하면 품명이 자동으로 추가됩니다. 위 양식으로 직접 넣을 수도 있습니다.</>}
              </td></tr>
            )}
            {rows.map((it) => (
              <tr key={it.id} style={it.inactive ? { color: 'var(--muted)' } : undefined}>
                <td><b>{it.name}</b> {it.inactive && <span className="pill off">사용 안 함</span>}</td>
                <td>{it.spec}</td>
                <td>{it.unit}</td>
                <td className="num" style={{ minWidth: 120 }}>
                  {editable ? (
                    <input type="text" inputMode="decimal" className="num" aria-label={`${it.name} 기준 단가`}
                      value={edits[it.id] ?? (it.price ?? '')} placeholder="미등록"
                      onChange={(e) => setEdits((x) => ({ ...x, [it.id]: e.target.value }))}
                      onBlur={() => savePrice(it)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur(); }}
                      style={{ textAlign: 'right', ...(it.price == null ? {} : { fontWeight: 600 }) }} />
                  ) : it.price != null ? won(it.price) : <span className="muted">미등록</span>}
                </td>
                <td className="num">
                  {it.last_price != null ? won(it.last_price) : ''}
                  {editable && it.price == null && it.last_price != null && (
                    <> <button className="btn small" type="button" title="최근 거래 단가를 기준 단가로" onClick={() => savePrice(it, String(it.last_price))}>적용</button></>
                  )}
                </td>
                <td className="muted">{it.last_date ? `${it.last_date} · ${it.last_vendor}` : ''}</td>
                <td className="num">{it.use_count || 0}</td>
                <td className="muted">{it.memo}</td>
                <td>{editable && (
                  <span className="actions" style={{ justifyContent: 'flex-start', flexWrap: 'nowrap' }}>
                    <button className="btn small" type="button" onClick={() => { setF({ id: it.id, name: it.name, spec: it.spec, unit: it.unit, price: it.price ?? '', memo: it.memo, inactive: it.inactive }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>수정</button>
                    <button className="btn small danger" type="button" onClick={() => remove(it)}>삭제</button>
                  </span>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
