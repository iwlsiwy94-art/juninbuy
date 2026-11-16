'use client';
import { useState } from 'react';
import { api } from '@/components/api';
import { VENDOR_KINDS, formatBiz } from '@/lib/util';
import { DEBIT_ACCOUNTS } from '@/lib/accounting';

const EMPTY = { account: '', name: '', kind: '매입처', biz_no: '', ceo: '', address: '', biz_type: '', biz_item: '', contact_name: '', contact_phone: '', contact_email: '', payment_terms: '', bank_memo: '', memo: '', inactive: false };

export default function VendorForm({ vendor, onSaved, onCancel }) {
  const [v, setV] = useState({ ...EMPTY, ...(vendor || {}) });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function save() {
    if (!v.name.trim()) { setMsg('상호를 입력해 주십시오.'); return; }
    setBusy(true); setMsg('');
    try {
      const r = vendor?.id ? await api(`/api/vendors/${vendor.id}`, { method: 'PUT', body: v }) : await api('/api/vendors', { method: 'POST', body: v });
      onSaved && onSaved(r.vendor);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  const F = (k, label, props = {}) => (
    <div className={`field ${props.wide ? 'wide' : ''}`}>
      <label htmlFor={`vf-${k}`}>{label}</label>
      <input id={`vf-${k}`} type={props.type || 'text'} value={v[k]} onChange={set(k)} placeholder={props.placeholder} onBlur={props.onBlur} />
    </div>
  );

  return (
    <div className="panel">
      <h2>기본 정보</h2>
      <div className="grid-form">
        {F('name', '상호 *')}
        <div className="field"><label htmlFor="vf-kind">구분</label>
          <select id="vf-kind" value={v.kind} onChange={set('kind')}>{VENDOR_KINDS.map((k) => <option key={k}>{k}</option>)}</select>
        </div>
        {F('biz_no', '사업자등록번호', { placeholder: '000-00-00000', onBlur: () => setV((x) => ({ ...x, biz_no: formatBiz(x.biz_no) })) })}
        {F('ceo', '대표자')}
        {F('biz_type', '업태')}
        {F('biz_item', '종목')}
        {F('address', '주소', { wide: true })}
      </div>
      <h2 style={{ marginTop: 18 }}>담당자 연락처</h2>
      <div className="grid-form">
        {F('contact_name', '담당자명')}
        {F('contact_phone', '전화번호', { type: 'tel' })}
        {F('contact_email', '이메일', { type: 'email' })}
      </div>
      <h2 style={{ marginTop: 18 }}>거래 조건</h2>
      <div className="grid-form">
        {F('payment_terms', '결제 조건', { placeholder: '예: 월말 마감 익월 25일 현금' })}
        {F('bank_memo', '계좌 메모', { placeholder: '예: 국민 000-00-0000 (예금주)' })}
        <div className="field"><label htmlFor="vf-acct">회계 반영 기본 계정 (매입)</label>
          <select id="vf-acct" value={v.account || ''} onChange={set('account')}>
            <option value="">원재료 (기본)</option>
            {DEBIT_ACCOUNTS.filter((a) => a !== '원재료').map((a) => <option key={a}>{a}</option>)}
          </select>
        </div>
        <div className="field wide"><label htmlFor="vf-memo">메모</label><textarea id="vf-memo" value={v.memo} onChange={set('memo')} /></div>
        <label className="check"><input type="checkbox" checked={v.inactive} onChange={set('inactive')} /> 거래 중지 (등록 화면의 거래처 목록에서 숨김)</label>
      </div>
      <div className="actions" style={{ marginTop: 14 }}>
        <span className="status" style={{ marginRight: 'auto' }} role="status">{msg}</span>
        {onCancel && <button className="btn" type="button" onClick={onCancel} disabled={busy}>취소</button>}
        <button className="btn primary" type="button" onClick={save} disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
      </div>
    </div>
  );
}
