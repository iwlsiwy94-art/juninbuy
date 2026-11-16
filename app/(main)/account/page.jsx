'use client';
import { useState } from 'react';
import { api } from '@/components/api';
import { useUser } from '@/components/UserContext';
import { ROLE_LABEL } from '@/lib/util';

export default function AccountPage() {
  const me = useUser();
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setOk(false);
    if (f.next !== f.confirm) { setMsg('새 비밀번호 확인이 일치하지 않습니다.'); return; }
    try {
      await api('/api/account/password', { method: 'POST', body: { current: f.current, next: f.next } });
      setF({ current: '', next: '', confirm: '' });
      setOk(true);
      setMsg('비밀번호를 바꿨습니다.');
    } catch (e2) { setMsg(e2.message); }
  }

  return (
    <>
      <div className="page-head"><h1>내 계정</h1></div>
      <div className="panel">
        <div className="meta">
          <div><span>이름</span>{me.name}</div>
          <div><span>아이디</span>{me.username}</div>
          <div><span>권한</span>{ROLE_LABEL[me.role]}</div>
        </div>
      </div>
      <form className="panel" onSubmit={submit} style={{ maxWidth: 420 }}>
        <h2>비밀번호 변경</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          <div className="field"><label htmlFor="a-c">현재 비밀번호</label><input id="a-c" type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} required /></div>
          <div className="field"><label htmlFor="a-n">새 비밀번호 (8자 이상)</label><input id="a-n" type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} required /></div>
          <div className="field"><label htmlFor="a-f">새 비밀번호 확인</label><input id="a-f" type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} required /></div>
          {msg && <p className={`note ${ok ? 'ok' : ''}`} style={{ margin: 0 }}>{msg}</p>}
          <div><button className="btn primary" type="submit">변경</button></div>
        </div>
      </form>
    </>
  );
}
