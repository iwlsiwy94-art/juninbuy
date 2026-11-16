'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import VendorForm from '@/components/VendorForm';
import { api } from '@/components/api';
import { KindPill, VendorKindPill } from '@/components/bits';
import { useUser, canEdit } from '@/components/UserContext';
import { won, itemSummary } from '@/lib/util';

export default function VendorDetail({ params }) {
  const router = useRouter();
  const user = useUser();
  const isNew = params.id === 'new';
  const [vendor, setVendor] = useState(null);
  const [slips, setSlips] = useState([]);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(isNew);
  const [year, setYear] = useState('all');

  useEffect(() => {
    if (isNew) return;
    api(`/api/vendors/${params.id}`).then((d) => { setVendor(d.vendor); setSlips(d.slips); }).catch((e) => setErr(e.message));
  }, [params.id, isNew]);

  const years = useMemo(() => [...new Set(slips.map((s) => s.date.slice(0, 4)))].sort().reverse(), [slips]);
  const shown = year === 'all' ? slips : slips.filter((s) => s.date.startsWith(year));
  const sum = useMemo(() => {
    const r = { 매입: { n: 0, t: 0 }, 매출: { n: 0, t: 0 } };
    shown.forEach((s) => { r[s.kind].n++; r[s.kind].t += Number(s.total); });
    return r;
  }, [shown]);

  async function remove() {
    if (!window.confirm(`${vendor.name} 업체를 삭제합니다.`)) return;
    try { await api(`/api/vendors/${vendor.id}`, { method: 'DELETE' }); router.push('/vendors'); }
    catch (e) { window.alert(e.message); }
  }

  if (isNew) {
    if (!canEdit(user)) return <p className="note">조회자 계정은 업체를 등록할 수 없습니다.</p>;
    return (
      <>
        <div className="page-head"><h1>업체 등록</h1></div>
        <VendorForm onCancel={() => router.push('/vendors')} onSaved={(v) => router.push(`/vendors/${v.id}`)} />
      </>
    );
  }
  if (err) return <p className="note">{err} <Link href="/vendors">업체 목록으로</Link></p>;
  if (!vendor) return <p className="muted">불러오는 중…</p>;

  return (
    <>
      <div className="page-head">
        <h1 style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {vendor.name} <VendorKindPill kind={vendor.kind} /> {vendor.inactive && <span className="pill off">거래 중지</span>}
        </h1>
        <div className="right">
          <Link className="btn" href="/vendors">업체 목록</Link>
          {canEdit(user) && !editing && <button className="btn danger" type="button" onClick={remove}>삭제</button>}
          {canEdit(user) && !editing && <button className="btn primary" type="button" onClick={() => setEditing(true)}>정보 수정</button>}
        </div>
      </div>

      {editing ? (
        <VendorForm vendor={vendor} onCancel={() => setEditing(false)} onSaved={(v) => { setVendor(v); setEditing(false); }} />
      ) : (
        <div className="panel">
          <div className="meta">
            <div><span>사업자등록번호</span>{vendor.biz_no || '—'}</div>
            <div><span>대표자</span>{vendor.ceo || '—'}</div>
            <div><span>업태 / 종목</span>{[vendor.biz_type, vendor.biz_item].filter(Boolean).join(' / ') || '—'}</div>
            <div><span>주소</span>{vendor.address || '—'}</div>
            <div><span>담당자</span>{vendor.contact_name || '—'}</div>
            <div><span>전화</span>{vendor.contact_phone ? <a href={`tel:${vendor.contact_phone}`}>{vendor.contact_phone}</a> : '—'}</div>
            <div><span>이메일</span>{vendor.contact_email ? <a href={`mailto:${vendor.contact_email}`}>{vendor.contact_email}</a> : '—'}</div>
            <div><span>결제 조건</span>{vendor.payment_terms || '—'}</div>
            <div><span>계좌 메모</span>{vendor.bank_memo || '—'}</div>
          </div>
          {vendor.memo && <p style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}><span className="muted" style={{ fontSize: 12, display: 'block' }}>메모</span>{vendor.memo}</p>}
        </div>
      )}

      <div className="page-head">
        <h2 style={{ fontSize: 16, margin: 0 }}>거래 내역</h2>
        <div className="right">
          <select aria-label="연도" value={year} onChange={(e) => setYear(e.target.value)} style={{ width: 'auto' }}>
            <option value="all">전체 기간</option>
            {years.map((y) => <option key={y} value={y}>{y}년</option>)}
          </select>
          <Link className="btn" href={`/slips?vendor=${encodeURIComponent(vendor.name)}&from=&to=`}>명세서 목록에서 보기</Link>
        </div>
      </div>
      <div className="stats">
        <div className="stat buy"><div className="k">매입</div><div className="v">{won(sum.매입.t)}</div><div className="s">{sum.매입.n}건</div></div>
        <div className="stat sale"><div className="k">매출</div><div className="v">{won(sum.매출.t)}</div><div className="s">{sum.매출.n}건</div></div>
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>일자</th><th>구분</th><th>전표번호</th><th>품목</th><th className="num">공급가액</th><th className="num">세액</th><th className="num">합계</th></tr></thead>
          <tbody>
            {!shown.length && <tr><td colSpan={7} className="empty">거래 내역이 없습니다.</td></tr>}
            {shown.map((s) => (
              <tr key={s.id} className="click" tabIndex={0} onClick={() => router.push(`/slips/${s.id}`)} onKeyDown={(e) => e.key === 'Enter' && router.push(`/slips/${s.id}`)}>
                <td className={s.kind === '매출' ? 'k-sale' : 'k-buy'}>{s.date}</td><td><KindPill kind={s.kind} /></td><td className="muted">{s.doc_no}</td>
                <td>{itemSummary(s.items)}</td><td className="num">{won(s.supply)}</td><td className="num">{won(s.vat)}</td><td className="num"><b>{won(s.total)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
