'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, downloadXlsx } from '@/components/api';
import { KindPill, Seg } from '@/components/bits';
import { won, ymd, itemSummary, totalsOf } from '@/lib/util';

function rangeOf(r) {
  const d = new Date(), y = d.getFullYear(), m = d.getMonth();
  if (r === 'thisMonth') return [ymd(new Date(y, m, 1)), ymd(new Date(y, m + 1, 0))];
  if (r === 'lastMonth') return [ymd(new Date(y, m - 1, 1)), ymd(new Date(y, m, 0))];
  if (r === 'thisYear') return [`${y}-01-01`, `${y}-12-31`];
  return ['', ''];
}

export default function SlipList() {
  const router = useRouter();
  const [from, setFrom] = useState(() => rangeOf('thisYear')[0]);
  const [to, setTo] = useState(() => rangeOf('thisYear')[1]);
  const [kind, setKind] = useState('all');
  const [vendorQ, setVendorQ] = useState('');
  const [itemQ, setItemQ] = useState('');
  const [slips, setSlips] = useState(null);
  const [err, setErr] = useState('');

  // 다른 화면에서 ?vendor=상호&from=&to= 로 넘어온 경우
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('vendor')) setVendorQ(p.get('vendor'));
    if (p.has('from')) setFrom(p.get('from'));
    if (p.has('to')) setTo(p.get('to'));
  }, []);

  useEffect(() => {
    let alive = true;
    setErr('');
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    if (kind !== 'all') q.set('kind', kind);
    api('/api/slips?' + q.toString())
      .then((d) => { if (alive) setSlips(d.slips); })
      .catch((e) => { if (alive) { setErr(e.message); setSlips([]); } });
    return () => { alive = false; };
  }, [from, to, kind]);

  const rows = useMemo(() => {
    const vq = vendorQ.trim().toLowerCase(), iq = itemQ.trim().toLowerCase();
    return (slips || []).filter((s) => {
      if (vq && !s.vendor_name.toLowerCase().includes(vq)) return false;
      if (iq) {
        const hay = [s.doc_no, s.memo, ...(s.items || []).flatMap((i) => [i.name, i.spec])].join(' ').toLowerCase();
        if (!hay.includes(iq)) return false;
      }
      return true;
    });
  }, [slips, vendorQ, itemQ]);

  const sum = useMemo(() => {
    const s = { 매입: { n: 0, t: 0, s: 0 }, 매출: { n: 0, t: 0, s: 0 } };
    rows.forEach((r) => { const k = r.kind; s[k].n++; s[k].t += Number(r.total); s[k].s += Number(r.supply); });
    return s;
  }, [rows]);
  const tt = totalsOf(rows.map((r) => ({ supply: r.supply, vat: r.vat })));

  function exportXlsx() {
    const span = from || to ? `${from || '처음'}~${to || '현재'}` : '전체';
    downloadXlsx((X) => {
      const s1 = [['일자', '구분', '거래처', '사업자번호', '전표번호', '품목', '공급가액', '세액', '합계금액', '비고', '원본 수', '등록자']];
      rows.forEach((r) => s1.push([r.date, r.kind, r.vendor_name, r.biz_no, r.doc_no, itemSummary(r.items), Number(r.supply), Number(r.vat), Number(r.total), r.memo, (r.attachments || []).length, r.created_by_name]));
      s1.push(['합계', '', '', '', '', `${rows.length}건`, tt.supply, tt.vat, tt.total]);
      const s2 = [['일자', '구분', '거래처', '전표번호', '품명', '규격', '수량', '단위', '단가', '공급가액', '세액']];
      rows.forEach((r) => (r.items || []).forEach((i) => s2.push([r.date, r.kind, r.vendor_name, r.doc_no, i.name, i.spec, i.qty ?? '', i.unit, i.price ?? '', i.supply, i.vat])));
      const wb = X.utils.book_new();
      const w1 = X.utils.aoa_to_sheet(s1); w1['!cols'] = [10, 6, 22, 14, 12, 26, 13, 12, 13, 20, 8, 10].map((wch) => ({ wch }));
      const w2 = X.utils.aoa_to_sheet(s2); w2['!cols'] = [10, 6, 22, 12, 24, 14, 8, 6, 12, 13, 12].map((wch) => ({ wch }));
      X.utils.book_append_sheet(wb, w1, '전표목록');
      X.utils.book_append_sheet(wb, w2, '품목상세');
      return wb;
    }, `거래명세서_${span}.xlsx`);
  }

  return (
    <>
      <div className="page-head">
        <h1>거래명세서</h1>
        <div className="right">
          <button className="btn" type="button" onClick={exportXlsx} disabled={!rows.length}>엑셀로 내보내기</button>
          <Link className="btn primary" href="/slips/new">새 명세서 등록</Link>
        </div>
      </div>

      <div className="stats">
        <div className="stat buy"><div className="k">매입 합계</div><div className="v">{won(sum.매입.t)}</div><div className="s">{sum.매입.n}건 · 공급가액 {won(sum.매입.s)}</div></div>
        <div className="stat sale"><div className="k">매출 합계</div><div className="v">{won(sum.매출.t)}</div><div className="s">{sum.매출.n}건 · 공급가액 {won(sum.매출.s)}</div></div>
        <div className="stat"><div className="k">차액 (매출 − 매입)</div><div className="v">{won(sum.매출.t - sum.매입.t)}</div><div className="s">조회 조건 기준</div></div>
      </div>

      <div className="panel">
        <div className="row">
          <div className="field"><label htmlFor="from">시작일</label><input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="field"><label htmlFor="to">종료일</label><input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="field">
            <span className="label">기간 빠른 선택</span>
            <div className="seg">
              {[['thisMonth', '이번 달'], ['lastMonth', '지난 달'], ['thisYear', '올해'], ['all', '전체']].map(([r, l]) => (
                <button key={r} type="button" onClick={() => { const [a, b] = rangeOf(r); setFrom(a); setTo(b); }}>{l}</button>
              ))}
            </div>
          </div>
          <div className="field"><span className="label">구분</span>
            <Seg value={kind} onChange={setKind} kindColors options={[['all', '전체'], ['매입', '매입'], ['매출', '매출']]} />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 160 }}><label htmlFor="vq">거래처</label><input id="vq" type="search" value={vendorQ} onChange={(e) => setVendorQ(e.target.value)} placeholder="거래처명 일부" /></div>
          <div className="field" style={{ flex: 1, minWidth: 160 }}><label htmlFor="iq">품목·전표번호·비고</label><input id="iq" type="search" value={itemQ} onChange={(e) => setItemQ(e.target.value)} placeholder="예: 볼트, M6" /></div>
        </div>
      </div>

      {err && <p className="note">{err}</p>}

      <div className="tablewrap">
        <table>
          <thead>
            <tr><th>일자</th><th>구분</th><th>거래처</th><th>전표번호</th><th>품목</th><th className="num">공급가액</th><th className="num">세액</th><th className="num">합계</th><th>원본</th><th>등록자</th></tr>
          </thead>
          <tbody>
            {slips === null && <tr><td colSpan={10} className="empty">불러오는 중…</td></tr>}
            {slips !== null && !rows.length && (
              <tr><td colSpan={10} className="empty">
                {slips.length ? '조건에 맞는 거래명세서가 없습니다. 기간이나 검색어를 바꿔 보십시오.' : <><strong>이 기간에 등록된 거래명세서가 없습니다.</strong><Link href="/slips/new">등록</Link> 화면에서 사진·PDF나 직접 입력으로, 또는 <Link href="/import">엑셀 가져오기</Link>로 넣어 주십시오.</>}
              </td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="click" tabIndex={0} onClick={() => router.push(`/slips/${r.id}`)} onKeyDown={(e) => e.key === 'Enter' && router.push(`/slips/${r.id}`)}>
                <td className={`num ${r.kind === '매출' ? 'k-sale' : 'k-buy'}`} style={{ textAlign: 'left' }}>{r.date}</td>
                <td><KindPill kind={r.kind} /></td>
                <td>{r.vendor_name}</td>
                <td className="muted">{r.doc_no}</td>
                <td>{itemSummary(r.items)}</td>
                <td className="num">{won(r.supply)}</td>
                <td className="num">{won(r.vat)}</td>
                <td className="num"><b>{won(r.total)}</b></td>
                <td className="muted">{(r.attachments || []).length ? `${r.attachments.length}개` : ''}</td>
                <td className="muted">{r.created_by_name}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot><tr><td colSpan={5}>{rows.length}건 합계</td><td className="num">{won(tt.supply)}</td><td className="num">{won(tt.vat)}</td><td className="num">{won(tt.total)}</td><td colSpan={2}></td></tr></tfoot>
          )}
        </table>
      </div>
    </>
  );
}
