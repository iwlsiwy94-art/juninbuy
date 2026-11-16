'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, downloadXlsx } from '@/components/api';
import { Seg } from '@/components/bits';
import { useUser, canEdit } from '@/components/UserContext';
import { won, ymd, itemSummary } from '@/lib/util';
import { DEBIT_ACCOUNTS, CREDIT_ACCOUNTS } from '@/lib/accounting';

function lastMonth() {
  const d = new Date();
  return [ymd(new Date(d.getFullYear(), d.getMonth() - 1, 1)), ymd(new Date(d.getFullYear(), d.getMonth(), 0))];
}
function thisMonth() {
  const d = new Date();
  return [ymd(new Date(d.getFullYear(), d.getMonth(), 1)), ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0))];
}

export default function PostingPage() {
  const user = useUser();
  const [tab, setTab] = useState('pending');
  const [highlight, setHighlight] = useState([]);
  return (
    <>
      <div className="page-head">
        <h1>구매 회계 반영</h1>
        <div className="right"><Seg value={tab} onChange={setTab} options={[['pending', '미반영 매입'], ['vouchers', '반영 전표']]} /></div>
      </div>
      {tab === 'pending'
        ? <Pending user={user} onDone={(ids) => { setHighlight(ids); setTab('vouchers'); }} />
        : <Vouchers user={user} highlight={highlight} />}
    </>
  );
}

/* ---------- 미반영 매입: 업체별로 묶어 일괄 반영 ---------- */
function Pending({ user, onDone }) {
  const [[from, to], setRange] = useState(lastMonth);
  const [vdate, setVdate] = useState(() => lastMonth()[1]);
  const [slips, setSlips] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [checked, setChecked] = useState({});
  const [acct, setAcct] = useState({});
  const [credit, setCredit] = useState('외상매입금');
  const [open, setOpen] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api('/api/vendors').then((d) => setVendors(d.vendors)).catch(() => {}); }, []);
  useEffect(() => {
    let alive = true;
    setSlips(null);
    const q = new URLSearchParams({ kind: '매입', posted: '0' });
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    api('/api/slips?' + q).then((d) => alive && setSlips(d.slips)).catch((e) => { if (alive) { setMsg(e.message); setSlips([]); } });
    return () => { alive = false; };
  }, [from, to]);

  const groups = useMemo(() => {
    const m = new Map();
    (slips || []).forEach((s) => {
      const k = s.vendor_id || `name:${s.vendor_name}`;
      if (!m.has(k)) m.set(k, { key: k, vendor_id: s.vendor_id, vendor_name: s.vendor_name, slips: [], supply: 0, vat: 0, total: 0 });
      const g = m.get(k);
      g.slips.push(s); g.supply += Number(s.supply); g.vat += Number(s.vat); g.total += Number(s.total);
    });
    return [...m.values()].sort((a, b) => a.vendor_name.localeCompare(b.vendor_name, 'ko'));
  }, [slips]);

  // 새로 불러오면 전부 선택, 계정은 업체 기본 계정
  useEffect(() => {
    const c = {}, a = {};
    groups.forEach((g) => {
      c[g.key] = true;
      a[g.key] = vendors.find((v) => v.id === g.vendor_id)?.account || '원재료';
    });
    setChecked(c); setAcct(a);
  }, [groups, vendors]);

  const sel = groups.filter((g) => checked[g.key]);
  const selSum = sel.reduce((x, g) => ({ n: x.n + g.slips.length, supply: x.supply + g.supply, vat: x.vat + g.vat, total: x.total + g.total }), { n: 0, supply: 0, vat: 0, total: 0 });
  const allOn = groups.length > 0 && sel.length === groups.length;

  async function post() {
    if (!sel.length) return;
    if (!window.confirm(`${sel.length}개 업체, 명세서 ${selSum.n}건(합계 ${won(selSum.total)}원)을 ${vdate} 일자 매입전표로 반영합니다.\n반영한 명세서는 전표를 취소하기 전까지 수정·삭제할 수 없습니다.`)) return;
    setBusy(true); setMsg('');
    try {
      const r = await api('/api/postings', {
        method: 'POST',
        body: {
          voucher_date: vdate, period_from: from, period_to: to,
          groups: sel.map((g) => ({ vendor_name: g.vendor_name, slip_ids: g.slips.map((s) => s.id), debit_account: acct[g.key], credit_account: credit })),
        },
      });
      onDone(r.vouchers.map((v) => v.id));
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="panel">
        <div className="row">
          <div className="field"><label htmlFor="pf">매입 기간 시작</label><input id="pf" type="date" value={from} onChange={(e) => setRange([e.target.value, to])} /></div>
          <div className="field"><label htmlFor="pt">매입 기간 끝</label><input id="pt" type="date" value={to} onChange={(e) => setRange([from, e.target.value])} /></div>
          <div className="field"><span className="label">빠른 선택</span>
            <div className="seg">
              <button type="button" onClick={() => { const r = lastMonth(); setRange(r); setVdate(r[1]); }}>지난 달</button>
              <button type="button" onClick={() => { const r = thisMonth(); setRange(r); setVdate(r[1]); }}>이번 달</button>
              <button type="button" onClick={() => setRange(['', ''])}>전체 미반영</button>
            </div>
          </div>
          <div className="field"><label htmlFor="vd">전표 일자</label><input id="vd" type="date" value={vdate} onChange={(e) => setVdate(e.target.value)} /></div>
          <div className="field"><label htmlFor="cr">대변 계정</label>
            <select id="cr" value={credit} onChange={(e) => setCredit(e.target.value)}>{CREDIT_ACCOUNTS.map((a) => <option key={a}>{a}</option>)}</select>
          </div>
        </div>
        <p className="status" style={{ marginBottom: 0 }}>업체마다 매입전표 한 장이 만들어집니다. 차변은 업체별 계정(공급가액)과 부가세대급금(세액), 대변은 {credit}(합계)입니다.</p>
      </div>

      {msg && <p className="note">{msg}</p>}

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th><input type="checkbox" aria-label="전체 선택" checked={allOn} onChange={(e) => setChecked(Object.fromEntries(groups.map((g) => [g.key, e.target.checked])))} /></th>
              <th>업체</th><th className="num">명세서</th><th className="num">공급가액</th><th className="num">세액</th><th className="num">합계</th><th>차변 계정</th><th></th>
            </tr>
          </thead>
          <tbody>
            {slips === null && <tr><td colSpan={8} className="empty">불러오는 중…</td></tr>}
            {slips !== null && !groups.length && <tr><td colSpan={8} className="empty"><strong>이 기간에 미반영 매입 명세서가 없습니다.</strong>기간을 바꾸거나 ‘전체 미반영’을 눌러 보십시오.</td></tr>}
            {groups.map((g) => (
              <FragmentRows key={g.key} g={g} checked={!!checked[g.key]} open={!!open[g.key]}
                onCheck={(v) => setChecked((c) => ({ ...c, [g.key]: v }))}
                onToggle={() => setOpen((o) => ({ ...o, [g.key]: !o[g.key] }))}
                acct={acct[g.key] || '원재료'} onAcct={(v) => setAcct((a) => ({ ...a, [g.key]: v }))} />
            ))}
          </tbody>
          {groups.length > 0 && (
            <tfoot><tr><td></td><td>선택 {sel.length}개 업체</td><td className="num">{selSum.n}건</td><td className="num">{won(selSum.supply)}</td><td className="num">{won(selSum.vat)}</td><td className="num">{won(selSum.total)}</td><td colSpan={2}></td></tr></tfoot>
          )}
        </table>
      </div>

      {canEdit(user) && groups.length > 0 && (
        <div className="actions">
          <button className="btn primary" type="button" disabled={busy || !sel.length} onClick={post}>
            {busy ? '반영 중…' : `선택한 ${sel.length}개 업체 일괄 회계 반영`}
          </button>
        </div>
      )}
    </>
  );
}

function FragmentRows({ g, checked, open, onCheck, onToggle, acct, onAcct }) {
  return (
    <>
      <tr>
        <td><input type="checkbox" aria-label={`${g.vendor_name} 선택`} checked={checked} onChange={(e) => onCheck(e.target.checked)} /></td>
        <td><b>{g.vendor_name}</b></td>
        <td className="num">{g.slips.length}건</td>
        <td className="num">{won(g.supply)}</td>
        <td className="num">{won(g.vat)}</td>
        <td className="num"><b>{won(g.total)}</b></td>
        <td>
          <select aria-label={`${g.vendor_name} 차변 계정`} value={acct} onChange={(e) => onAcct(e.target.value)} style={{ width: 'auto' }}>
            {DEBIT_ACCOUNTS.map((a) => <option key={a}>{a}</option>)}
          </select>
        </td>
        <td><button className="btn small" type="button" onClick={onToggle}>{open ? '접기' : '명세서 보기'}</button></td>
      </tr>
      {open && g.slips.map((s) => (
        <tr key={s.id} style={{ background: 'var(--soft)' }}>
          <td></td>
          <td className="muted" style={{ paddingLeft: 24 }}><Link href={`/slips/${s.id}`}>{s.date}</Link> {s.doc_no && `· ${s.doc_no}`}</td>
          <td className="muted" colSpan={1}>{itemSummary(s.items)}</td>
          <td className="num muted">{won(s.supply)}</td><td className="num muted">{won(s.vat)}</td><td className="num muted">{won(s.total)}</td>
          <td colSpan={2}></td>
        </tr>
      ))}
    </>
  );
}

/* ---------- 반영 전표: 조회·출력·분개 엑셀·반영 취소 ---------- */
function Vouchers({ user, highlight }) {
  const [[from, to], setRange] = useState(() => { const d = new Date(); return [ymd(new Date(d.getFullYear(), d.getMonth() - 2, 1)), ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0))]; });
  const [list, setList] = useState(null);
  const [sel, setSel] = useState(() => Object.fromEntries(highlight.map((id) => [id, true])));
  const [msg, setMsg] = useState(highlight.length ? `전표 ${highlight.length}장을 만들었습니다. 아래에서 선택된 전표를 출력할 수 있습니다.` : '');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    setList(null);
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    api('/api/vouchers?' + q).then((d) => alive && setList(d.vouchers)).catch((e) => { if (alive) { setMsg(e.message); setList([]); } });
    return () => { alive = false; };
  }, [from, to, reload]);

  const ids = (list || []).filter((v) => sel[v.id]).map((v) => v.id);
  const allOn = list && list.length > 0 && ids.length === list.length;

  async function cancel(v) {
    if (!window.confirm(`전표 ${v.voucher_no} (${v.vendor_name}, ${won(v.total)}원)를 반영 취소합니다.\n묶였던 명세서 ${v.slip_count}건은 미반영으로 돌아갑니다.`)) return;
    try { await api(`/api/vouchers/${v.id}`, { method: 'DELETE' }); setMsg(`${v.voucher_no} 전표를 반영 취소했습니다.`); setReload((r) => r + 1); }
    catch (e) { window.alert(e.message); }
  }

  function exportJournal() {
    const rows = (list || []).filter((v) => sel[v.id]);
    downloadXlsx((X) => {
      const a = [['전표번호', '전표일자', '차대', '계정과목', '거래처', '사업자번호', '금액', '적요']];
      rows.slice().sort((x, y) => x.voucher_no.localeCompare(y.voucher_no)).forEach((v) => {
        a.push([v.voucher_no, v.voucher_date, '차변', v.debit_account, v.vendor_name, v.biz_no, Number(v.supply), v.summary]);
        if (Number(v.vat)) a.push([v.voucher_no, v.voucher_date, '차변', v.vat_account, v.vendor_name, v.biz_no, Number(v.vat), v.summary]);
        a.push([v.voucher_no, v.voucher_date, '대변', v.credit_account, v.vendor_name, v.biz_no, Number(v.total), v.summary]);
      });
      const wb = X.utils.book_new();
      const ws = X.utils.aoa_to_sheet(a);
      ws['!cols'] = [12, 11, 6, 14, 22, 14, 14, 36].map((wch) => ({ wch }));
      X.utils.book_append_sheet(wb, ws, '분개');
      return wb;
    }, `매입전표_분개_${from || '전체'}~${to || ''}.xlsx`);
  }

  return (
    <>
      <div className="panel">
        <div className="row">
          <div className="field"><label htmlFor="vf">전표 일자 시작</label><input id="vf" type="date" value={from} onChange={(e) => setRange([e.target.value, to])} /></div>
          <div className="field"><label htmlFor="vt">전표 일자 끝</label><input id="vt" type="date" value={to} onChange={(e) => setRange([from, e.target.value])} /></div>
          <div className="right" style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" type="button" disabled={!ids.length} onClick={exportJournal}>분개 엑셀 ({ids.length})</button>
            <a className={`btn primary ${ids.length ? '' : 'disabled'}`} aria-disabled={!ids.length}
              href={ids.length ? `/posting/print?ids=${ids.join(',')}` : undefined} target="_blank" rel="noopener noreferrer"
              onClick={(e) => { if (!ids.length) e.preventDefault(); }}>
              선택 전표 출력 ({ids.length})
            </a>
          </div>
        </div>
      </div>
      {msg && <p className="note ok">{msg}</p>}
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th><input type="checkbox" aria-label="전체 선택" checked={!!allOn} onChange={(e) => setSel(Object.fromEntries((list || []).map((v) => [v.id, e.target.checked])))} /></th>
              <th>전표번호</th><th>전표일자</th><th>업체</th><th>차변 계정</th><th className="num">명세서</th><th className="num">공급가액</th><th className="num">세액</th><th className="num">합계</th><th>작성자</th><th></th>
            </tr>
          </thead>
          <tbody>
            {list === null && <tr><td colSpan={11} className="empty">불러오는 중…</td></tr>}
            {list && !list.length && <tr><td colSpan={11} className="empty">이 기간에 반영된 전표가 없습니다.</td></tr>}
            {(list || []).map((v) => (
              <tr key={v.id}>
                <td><input type="checkbox" aria-label={`${v.voucher_no} 선택`} checked={!!sel[v.id]} onChange={(e) => setSel((s) => ({ ...s, [v.id]: e.target.checked }))} /></td>
                <td className="num" style={{ textAlign: 'left' }}><a href={`/posting/print?ids=${v.id}`} target="_blank" rel="noopener noreferrer">{v.voucher_no}</a></td>
                <td>{v.voucher_date}</td>
                <td>{v.vendor_id ? <Link href={`/vendors/${v.vendor_id}`}>{v.vendor_name}</Link> : v.vendor_name}</td>
                <td>{v.debit_account}</td>
                <td className="num">{v.slip_count}건</td>
                <td className="num">{won(v.supply)}</td><td className="num">{won(v.vat)}</td><td className="num"><b>{won(v.total)}</b></td>
                <td className="muted">{v.created_by_name}</td>
                <td>{user.role === 'admin' && <button className="btn small danger" type="button" onClick={() => cancel(v)}>반영 취소</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
