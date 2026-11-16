'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, downloadXlsx } from '@/components/api';
import { VendorKindPill, Seg } from '@/components/bits';
import { useUser, canEdit } from '@/components/UserContext';
import { won } from '@/lib/util';

export default function VendorList() {
  const router = useRouter();
  const user = useUser();
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('all');
  const [showOff, setShowOff] = useState(false);

  useEffect(() => {
    api('/api/vendors').then((d) => setList(d.vendors)).catch((e) => { setErr(e.message); setList([]); });
  }, []);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (list || []).filter((v) => {
      if (!showOff && v.inactive) return false;
      if (kind !== 'all' && v.kind !== kind && !(v.kind === '공통' && kind !== '공통')) return false;
      if (s && ![v.name, v.biz_no, v.contact_name, v.ceo].join(' ').toLowerCase().includes(s)) return false;
      return true;
    });
  }, [list, q, kind, showOff]);

  function exportXlsx() {
    downloadXlsx((X) => {
      const a = [['상호', '구분', '사업자번호', '대표자', '업태', '종목', '주소', '담당자', '전화', '이메일', '결제 조건', '계좌 메모', '메모', '거래 중지', '거래 건수', '누적 합계', '최근 거래일']];
      rows.forEach((v) => a.push([v.name, v.kind, v.biz_no, v.ceo, v.biz_type, v.biz_item, v.address, v.contact_name, v.contact_phone, v.contact_email, v.payment_terms, v.bank_memo, v.memo, v.inactive ? '예' : '', v.slip_count, v.total_sum, v.last_date || '']));
      const wb = X.utils.book_new();
      const ws = X.utils.aoa_to_sheet(a);
      ws['!cols'] = [22, 7, 14, 10, 10, 12, 30, 10, 14, 20, 20, 22, 20, 8, 8, 14, 11].map((wch) => ({ wch }));
      X.utils.book_append_sheet(wb, ws, '등록업체');
      return wb;
    }, '등록업체.xlsx');
  }

  return (
    <>
      <div className="page-head">
        <h1>등록 업체</h1>
        <div className="right">
          <button className="btn" type="button" onClick={exportXlsx} disabled={!rows.length}>엑셀로 내보내기</button>
          {canEdit(user) && <Link className="btn primary" href="/vendors/new">업체 등록</Link>}
        </div>
      </div>
      <div className="panel">
        <div className="row" style={{ alignItems: 'center' }}>
          <div className="field" style={{ flex: 1, minWidth: 200 }}><label htmlFor="vq">검색</label><input id="vq" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="상호, 사업자번호, 담당자, 대표자" /></div>
          <div className="field"><span className="label">구분</span>
            <Seg value={kind} onChange={setKind} options={[['all', '전체'], ['매입처', '매입처'], ['매출처', '매출처'], ['공통', '공통']]} />
          </div>
          <label className="check" style={{ alignSelf: 'flex-end', paddingBottom: 8 }}><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> 거래 중지 업체도 보기</label>
        </div>
      </div>
      {err && <p className="note">{err}</p>}
      <div className="tablewrap">
        <table>
          <thead><tr><th>상호</th><th>구분</th><th>사업자번호</th><th>담당자</th><th>연락처</th><th>결제 조건</th><th className="num">거래 건수</th><th className="num">누적 합계</th><th>최근 거래</th></tr></thead>
          <tbody>
            {list === null && <tr><td colSpan={9} className="empty">불러오는 중…</td></tr>}
            {list !== null && !rows.length && <tr><td colSpan={9} className="empty">{list.length ? '조건에 맞는 업체가 없습니다.' : <><strong>등록된 업체가 없습니다.</strong>거래명세서를 저장하면 거래처가 자동으로 추가되며, ‘업체 등록’으로 직접 넣을 수도 있습니다.</>}</td></tr>}
            {rows.map((v) => (
              <tr key={v.id} className="click" tabIndex={0} onClick={() => router.push(`/vendors/${v.id}`)} onKeyDown={(e) => e.key === 'Enter' && router.push(`/vendors/${v.id}`)}>
                <td><b>{v.name}</b> {v.inactive && <span className="pill off">거래 중지</span>}</td>
                <td><VendorKindPill kind={v.kind} /></td>
                <td className="muted">{v.biz_no}</td>
                <td>{v.contact_name}</td>
                <td className="muted">{v.contact_phone}</td>
                <td className="muted">{v.payment_terms}</td>
                <td className="num">{v.slip_count}</td>
                <td className="num">{won(v.total_sum)}</td>
                <td className="muted">{v.last_date || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
