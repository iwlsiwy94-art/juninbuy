'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, downloadXlsx } from '@/components/api';
import { KindPill, Seg } from '@/components/bits';
import { won, pad, ymd } from '@/lib/util';

export default function SummaryPage() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [basis, setBasis] = useState('total');
  const [month, setMonth] = useState(0);
  const [slips, setSlips] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    setSlips(null);
    api(`/api/slips?from=${year}-01-01&to=${year}-12-31`)
      .then((d) => alive && setSlips(d.slips))
      .catch((e) => { if (alive) { setErr(e.message); setSlips([]); } });
    return () => { alive = false; };
  }, [year]);

  const val = (s) => Number(basis === 'supply' ? s.supply : s.total) || 0;
  const months = useMemo(() => {
    const m = Array.from({ length: 12 }, () => ({ 매입: 0, 매출: 0 }));
    (slips || []).forEach((s) => { const i = +s.date.slice(5, 7) - 1; if (m[i]) m[i][s.kind] += val(s); });
    return m;
  }, [slips, basis]); // eslint-disable-line react-hooks/exhaustive-deps
  const tot = months.reduce((a, m) => ({ 매입: a.매입 + m.매입, 매출: a.매출 + m.매출 }), { 매입: 0, 매출: 0 });
  const max = Math.max(1, ...months.flatMap((m) => [m.매입, m.매출]));

  const vendors = useMemo(() => {
    const rows = month ? (slips || []).filter((s) => +s.date.slice(5, 7) === month) : slips || [];
    const m = new Map();
    rows.forEach((s) => {
      const k = `${s.kind}|${s.vendor_id || s.vendor_name}`;
      if (!m.has(k)) m.set(k, { vendor_id: s.vendor_id, vendor: s.vendor_name, kind: s.kind, n: 0, supply: 0, vat: 0, total: 0, last: '' });
      const v = m.get(k);
      v.n++; v.supply += Number(s.supply); v.vat += Number(s.vat); v.total += Number(s.total);
      if (s.date > v.last) v.last = s.date;
    });
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [slips, month]);

  const basisLabel = basis === 'supply' ? '공급가액' : '합계(세액 포함)';
  const years = [];
  for (let y = thisYear; y >= thisYear - 6; y--) years.push(y);

  function exportXlsx() {
    downloadXlsx((X) => {
      const mm = Array.from({ length: 12 }, () => ({ b: [0, 0, 0], s: [0, 0, 0] }));
      (slips || []).forEach((s) => { const m = mm[+s.date.slice(5, 7) - 1]; if (!m) return; const a = s.kind === '매출' ? m.s : m.b; a[0] += Number(s.supply); a[1] += Number(s.vat); a[2] += Number(s.total); });
      const s1 = [['월', '매입 공급가액', '매입 세액', '매입 합계', '매출 공급가액', '매출 세액', '매출 합계', '차액(매출−매입 합계)']];
      mm.forEach((m, i) => s1.push([`${i + 1}월`, ...m.b, ...m.s, m.s[2] - m.b[2]]));
      const col = (i) => mm.reduce((a, m) => a + (i < 3 ? m.b[i] : m.s[i - 3]), 0);
      s1.push(['합계', ...[0, 1, 2, 3, 4, 5].map(col), col(5) - col(2)]);
      const s2 = [['거래처', '구분', '건수', '공급가액', '세액', '합계', '최근 거래일']];
      vendors.forEach((v) => s2.push([v.vendor, v.kind, v.n, v.supply, v.vat, v.total, v.last]));
      const wb = X.utils.book_new();
      const w1 = X.utils.aoa_to_sheet(s1); w1['!cols'] = [6, 14, 12, 14, 14, 12, 14, 18].map((wch) => ({ wch }));
      const w2 = X.utils.aoa_to_sheet(s2); w2['!cols'] = [22, 6, 6, 14, 12, 14, 12].map((wch) => ({ wch }));
      X.utils.book_append_sheet(wb, w1, '월별집계');
      X.utils.book_append_sheet(wb, w2, month ? `거래처별_${month}월` : '거래처별_연간');
      return wb;
    }, `거래명세서_집계_${year}년${month ? `_${month}월` : ''}.xlsx`);
  }

  return (
    <>
      <div className="page-head">
        <h1>집계</h1>
        <div className="right"><button className="btn" type="button" onClick={exportXlsx} disabled={!slips || !slips.length}>집계 엑셀로 내보내기</button></div>
      </div>
      <div className="panel">
        <div className="row">
          <div className="field"><label htmlFor="sy">연도</label>
            <select id="sy" value={year} onChange={(e) => setYear(+e.target.value)}>{years.map((y) => <option key={y} value={y}>{y}년</option>)}</select>
          </div>
          <div className="field"><span className="label">금액 기준</span>
            <Seg value={basis} onChange={setBasis} options={[['total', '합계(세액 포함)'], ['supply', '공급가액']]} />
          </div>
          <div className="field"><label htmlFor="sm">거래처별 집계 기간</label>
            <select id="sm" value={month} onChange={(e) => setMonth(+e.target.value)}>
              <option value={0}>연간 전체</option>
              {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{i + 1}월</option>)}
            </select>
          </div>
        </div>
      </div>
      {err && <p className="note">{err}</p>}
      {slips === null ? <p className="muted">불러오는 중…</p> : (
        <>
          <div className="stats">
            <div className="stat buy"><div className="k">{year}년 매입</div><div className="v">{won(tot.매입)}</div><div className="s">{slips.filter((s) => s.kind === '매입').length}건 · {basisLabel}</div></div>
            <div className="stat sale"><div className="k">{year}년 매출</div><div className="v">{won(tot.매출)}</div><div className="s">{slips.filter((s) => s.kind === '매출').length}건 · {basisLabel}</div></div>
            <div className="stat"><div className="k">차액 (매출 − 매입)</div><div className="v">{won(tot.매출 - tot.매입)}</div><div className="s">{basisLabel}</div></div>
          </div>
          <div className="two">
            <div>
              <h2 style={{ fontSize: 15, margin: '0 0 8px' }}>월별 매입·매출</h2>
              <div className="tablewrap"><table>
                <thead><tr><th>월</th><th className="num">매입</th><th className="num">매출</th><th className="num">차액</th><th aria-label="막대"></th></tr></thead>
                <tbody>
                  {months.map((m, i) => (
                    <tr key={i}>
                      <td><Link href={`/slips?from=${year}-${pad(i + 1)}-01&to=${ymd(new Date(year, i + 1, 0))}`}>{i + 1}월</Link></td>
                      <td className="num">{won(m.매입)}</td><td className="num">{won(m.매출)}</td><td className="num">{won(m.매출 - m.매입)}</td>
                      <td><div className="bars" aria-hidden="true"><div className="bar buy" style={{ width: `${(m.매입 / max) * 100}%` }} /><div className="bar sale" style={{ width: `${(m.매출 / max) * 100}%` }} /></div></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td>합계</td><td className="num">{won(tot.매입)}</td><td className="num">{won(tot.매출)}</td><td className="num">{won(tot.매출 - tot.매입)}</td><td></td></tr></tfoot>
              </table></div>
            </div>
            <div>
              <h2 style={{ fontSize: 15, margin: '0 0 8px' }}>거래처별 합계 · {year}년 {month ? `${month}월` : '전체'}</h2>
              <div className="tablewrap"><table>
                <thead><tr><th>거래처</th><th>구분</th><th className="num">건수</th><th className="num">공급가액</th><th className="num">세액</th><th className="num">합계</th><th>최근 거래</th></tr></thead>
                <tbody>
                  {!vendors.length && <tr><td colSpan={7} className="empty">이 기간에는 거래가 없습니다.</td></tr>}
                  {vendors.map((v) => (
                    <tr key={`${v.kind}${v.vendor_id || v.vendor}`}>
                      <td>{v.vendor_id ? <Link href={`/vendors/${v.vendor_id}`}>{v.vendor}</Link> : v.vendor}</td>
                      <td><KindPill kind={v.kind} /></td><td className="num">{v.n}</td><td className="num">{won(v.supply)}</td><td className="num">{won(v.vat)}</td><td className="num"><b>{won(v.total)}</b></td><td className="muted">{v.last}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
