'use client';
import { useEffect, useState } from 'react';

// 최초 1회: 관리자 계정 만들기 (계정이 하나라도 있으면 막힘)
export default function SetupPage() {
  const [needed, setNeeded] = useState(null);
  const [f, setF] = useState({ name: '', username: '', password: '', confirm: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/setup').then((r) => r.json()).then((d) => setNeeded(!!d.needed)).catch(() => setErr('서버에 연결하지 못했습니다. 환경값 설정을 확인해 주십시오.'));
  }, []);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (f.password !== f.confirm) { setErr('비밀번호 확인이 일치하지 않습니다.'); return; }
    setBusy(true);
    const res = await fetch('/api/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(d.error || '만들지 못했습니다.'); setBusy(false); return; }
    window.location.href = '/login';
  }

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="login-wrap">
      <form className="login" onSubmit={submit}>
        <p className="co">(주)준인산업</p>
        <p className="sys">처음 설정 · 관리자 계정 만들기</p>
        {needed === null && !err && <p className="muted">확인 중…</p>}
        {needed === false && (
          <p>이미 설정이 끝났습니다. <a href="/login">로그인 화면으로 가기</a></p>
        )}
        {needed && (
          <>
            <div className="field"><label htmlFor="n">이름</label><input id="n" type="text" value={f.name} onChange={set('name')} required /></div>
            <div className="field"><label htmlFor="u">아이디 (영문·숫자)</label><input id="u" type="text" value={f.username} onChange={set('username')} required /></div>
            <div className="field"><label htmlFor="p">비밀번호 (8자 이상)</label><input id="p" type="password" autoComplete="new-password" value={f.password} onChange={set('password')} required /></div>
            <div className="field"><label htmlFor="c">비밀번호 확인</label><input id="c" type="password" autoComplete="new-password" value={f.confirm} onChange={set('confirm')} required /></div>
            <button className="btn primary" type="submit" disabled={busy}>관리자 계정 만들기</button>
          </>
        )}
        {err && <p className="err" role="alert">{err}</p>}
      </form>
    </div>
  );
}
