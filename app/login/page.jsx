'use client';
import { useState } from 'react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '로그인하지 못했습니다.');
      window.location.href = '/slips';
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login" onSubmit={submit}>
        <p className="co">(주)준인산업</p>
        <p className="sys">거래명세서 관리시스템 · 직원 계정으로 로그인하십시오.</p>
        <div className="field">
          <label htmlFor="u">아이디</label>
          <input id="u" type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="p">비밀번호</label>
          <input id="p" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn primary" type="submit" disabled={busy}>{busy ? '확인 중…' : '로그인'}</button>
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>계정이 없으면 관리자에게 발급을 요청하십시오.</p>
      </form>
    </div>
  );
}
