'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SlipForm from '@/components/SlipForm';
import { api, fileUrl } from '@/components/api';
import { KindPill } from '@/components/bits';
import { useUser, canEdit } from '@/components/UserContext';
import { won } from '@/lib/util';

export default function SlipDetail({ params }) {
  const router = useRouter();
  const user = useUser();
  const [slip, setSlip] = useState(null);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    api(`/api/slips/${params.id}`).then((d) => setSlip(d.slip)).catch((e) => setErr(e.message));
  }, [params.id]);

  async function remove() {
    if (!window.confirm(`${slip.date} ${slip.vendor_name} (${won(slip.total)}원) 명세서를 삭제합니다. 첨부한 원본도 함께 지워지며 되돌릴 수 없습니다.`)) return;
    try {
      await api(`/api/slips/${slip.id}`, { method: 'DELETE' });
      router.push('/slips');
    } catch (e) {
      window.alert(e.message);
    }
  }

  if (err) return <p className="note">{err} <Link href="/slips">목록으로</Link></p>;
  if (!slip) return <p className="muted">불러오는 중…</p>;

  if (editing) {
    return (
      <>
        <div className="page-head"><h1>거래명세서 수정</h1></div>
        <SlipForm initial={slip} onCancel={() => setEditing(false)} onSaved={(s) => { setSlip({ ...slip, ...s, updated_by_name: user.name }); setEditing(false); }} />
      </>
    );
  }

  const atts = slip.attachments || [];
  return (
    <>
      <div className="page-head">
        <h1 style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <KindPill kind={slip.kind} /> {slip.vendor_name}
          <span className="muted" style={{ fontSize: 15, fontWeight: 400 }}>{slip.date}</span>
        </h1>
        <div className="right">
          <Link className="btn" href="/slips">목록</Link>
          {canEdit(user) && !slip.posted && <button className="btn danger" type="button" onClick={remove}>삭제</button>}
          {canEdit(user) && !slip.posted && <button className="btn primary" type="button" onClick={() => setEditing(true)}>수정</button>}
          {slip.posted && <span className="pill done" title="회계 반영된 명세서는 전표를 반영 취소해야 고칠 수 있습니다.">회계 반영됨</span>}
        </div>
      </div>

      <div className="panel">
        <div className="meta">
          <div><span>전표번호</span>{slip.doc_no || '—'}</div>
          <div><span>거래처 사업자번호</span>{slip.biz_no || '—'}</div>
          <div><span>거래처</span>{slip.vendor_id ? <Link href={`/vendors/${slip.vendor_id}`}>{slip.vendor_name} 업체 정보</Link> : slip.vendor_name}</div>
          <div><span>등록</span>{slip.created_by_name || '—'} · {String(slip.created_at || '').slice(0, 10)}{slip.source === 'scan' ? ' · 사진 판독' : slip.source === 'excel' ? ' · 엑셀' : ''}</div>
          <div><span>최근 수정</span>{slip.updated_at ? `${slip.updated_by_name || '—'} · ${String(slip.updated_at).slice(0, 10)}` : '—'}</div>
        </div>
      </div>

      <div className="tablewrap">
        <table>
          <thead><tr><th>품명</th><th>규격</th><th className="num">수량</th><th>단위</th><th className="num">단가</th><th className="num">공급가액</th><th className="num">세액</th></tr></thead>
          <tbody>
            {(slip.items || []).map((i, n) => (
              <tr key={n}>
                <td>{i.name}</td><td>{i.spec}</td>
                <td className="num">{i.qty == null ? '' : Number(i.qty).toLocaleString('ko-KR')}</td>
                <td>{i.unit}</td>
                <td className="num">{i.price == null ? '' : won(i.price)}</td>
                <td className="num">{won(i.supply)}</td>
                <td className="num">{won(i.vat)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={5}>합계금액 {won(slip.total)}원</td><td className="num">{won(slip.supply)}</td><td className="num">{won(slip.vat)}</td></tr></tfoot>
        </table>
      </div>

      {slip.memo && <div className="panel"><h2>비고</h2><div style={{ whiteSpace: 'pre-wrap' }}>{slip.memo}</div></div>}

      <div className="panel">
        <h2>원본</h2>
        {atts.length ? (
          <div className="thumbs">
            {atts.map((a) => (
              <a key={a.path} href={fileUrl(a.path)} target="_blank" rel="noopener noreferrer">
                {/^image\//.test(a.type) ? <img src={fileUrl(a.path)} alt={a.name} /> : <div className="cap" style={{ padding: '18px 10px' }}>PDF 열기</div>}
                <div className="cap">{a.name}</div>
              </a>
            ))}
          </div>
        ) : <p className="muted" style={{ margin: 0 }}>첨부된 원본이 없습니다.</p>}
      </div>
    </>
  );
}
