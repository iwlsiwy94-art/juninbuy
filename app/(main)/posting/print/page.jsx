'use client';
import { useEffect, useState } from 'react';
import { api } from '@/components/api';
import { useUser } from '@/components/UserContext';
import { won, itemSummary, today } from '@/lib/util';
import { wonKorean } from '@/lib/accounting';

// 업체별 매입전표 출력 (A4 한 장에 전표 한 장)
export default function VoucherPrint() {
  const user = useUser();
  const [vouchers, setVouchers] = useState(null);
  const [company, setCompany] = useState({ company_name: '(주)준인산업', biz_no: '' });
  const [err, setErr] = useState('');

  useEffect(() => {
    const ids = new URLSearchParams(window.location.search).get('ids') || '';
    if (!ids) { setErr('출력할 전표를 고르지 않았습니다.'); return; }
    api(`/api/vouchers?ids=${encodeURIComponent(ids)}`).then((d) => setVouchers(d.vouchers)).catch((e) => setErr(e.message));
    api('/api/settings').then((d) => setCompany(d.settings)).catch(() => {});
  }, []);

  if (err) return <p className="note">{err}</p>;
  if (!vouchers) return <p className="muted">불러오는 중…</p>;

  return (
    <>
      <div className="page-head no-print">
        <h1>매입전표 출력 · {vouchers.length}장</h1>
        <div className="right">
          <button className="btn primary" type="button" onClick={() => window.print()}>인쇄 / PDF 저장</button>
        </div>
      </div>
      <p className="status no-print" style={{ margin: 0 }}>인쇄 창에서 ‘대상’을 ‘PDF로 저장’으로 바꾸면 파일로 저장됩니다. 용지는 A4 세로입니다.</p>
      {vouchers.map((v) => <Voucher key={v.id} v={v} company={company} printedBy={user.name} />)}
    </>
  );
}

function Voucher({ v, company, printedBy }) {
  const rows = [
    { dr: v.debit_account, drAmt: v.supply, cr: v.credit_account, crAmt: v.total, memo: v.summary },
    ...(Number(v.vat) ? [{ dr: v.vat_account, drAmt: v.vat, cr: '', crAmt: null, memo: '매입 부가가치세' }] : []),
  ];
  return (
    <section className="voucher">
      <div className="v-head">
        <div>
          <div className="v-co">{company.company_name}</div>
          <h2 className="v-title">매 입 전 표</h2>
        </div>
        <table className="v-sign">
          <tbody>
            <tr><th rowSpan={2} className="v-sign-k">결<br />재</th><th>담당</th><th>검토</th><th>승인</th></tr>
            <tr><td></td><td></td><td></td></tr>
          </tbody>
        </table>
      </div>

      <table className="v-info">
        <tbody>
          <tr><th>전표번호</th><td>{v.voucher_no}</td><th>전표일자</th><td>{v.voucher_date}</td></tr>
          <tr><th>거래처</th><td>{v.vendor_name}</td><th>사업자번호</th><td>{v.biz_no || '—'}</td></tr>
          <tr><th>대상 기간</th><td>{v.period_from || '—'} ~ {v.period_to || '—'}</td><th>작성자</th><td>{v.created_by_name || '—'}</td></tr>
          <tr><th>금액</th><td colSpan={3}><b>일금 {wonKorean(v.total)}원정</b> (₩{won(v.total)})</td></tr>
        </tbody>
      </table>

      <table className="v-journal">
        <thead><tr><th>차변 계정</th><th className="num">차변 금액</th><th>대변 계정</th><th className="num">대변 금액</th><th>적요</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}><td>{r.dr}</td><td className="num">{won(r.drAmt)}</td><td>{r.cr}</td><td className="num">{r.crAmt == null ? '' : won(r.crAmt)}</td><td>{r.memo}</td></tr>
          ))}
        </tbody>
        <tfoot><tr><td>합계</td><td className="num">{won(Number(v.supply) + Number(v.vat))}</td><td></td><td className="num">{won(v.total)}</td><td></td></tr></tfoot>
      </table>

      <h3 className="v-sub">증빙 내역 · 거래명세서 {v.slips.length}건</h3>
      <table className="v-detail">
        <thead><tr><th>일자</th><th>명세서 번호</th><th>품목</th><th className="num">공급가액</th><th className="num">세액</th><th className="num">합계</th></tr></thead>
        <tbody>
          {v.slips.map((s) => (
            <tr key={s.id}><td>{s.date}</td><td>{s.doc_no}</td><td>{itemSummary(s.items)}</td><td className="num">{won(s.supply)}</td><td className="num">{won(s.vat)}</td><td className="num">{won(s.total)}</td></tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan={3}>계</td><td className="num">{won(v.supply)}</td><td className="num">{won(v.vat)}</td><td className="num">{won(v.total)}</td></tr></tfoot>
      </table>

      <div className="v-foot">출력 {today()} · {printedBy} · {company.company_name} 거래명세서 관리시스템</div>
    </section>
  );
}
