'use client';
import { useEffect, useState } from 'react';
import { api } from '@/components/api';
import { useUser } from '@/components/UserContext';
import { ROLE_LABEL, formatBiz } from '@/lib/util';

const ROLE_HELP = '관리자: 모든 기능과 계정 관리 · 입력자: 명세서·업체 등록/수정/삭제 · 조회자: 보기와 엑셀 내보내기만';

export default function AdminPage() {
  const me = useUser();
  const [users, setUsers] = useState([]);
  const [co, setCo] = useState({ company_name: '', biz_no: '' });
  const [nu, setNu] = useState({ name: '', username: '', password: '', role: 'editor' });
  const [msg, setMsg] = useState('');
  const [coMsg, setCoMsg] = useState('');

  useEffect(() => {
    if (me.role !== 'admin') return;
    api('/api/users').then((d) => setUsers(d.users)).catch((e) => setMsg(e.message));
    api('/api/settings').then((d) => setCo(d.settings)).catch(() => {});
  }, [me.role]);

  if (me.role !== 'admin') return <p className="note">관리자만 볼 수 있는 화면입니다.</p>;

  async function saveCo() {
    try { const d = await api('/api/settings', { method: 'PUT', body: co }); setCo(d.settings); setCoMsg('저장했습니다.'); }
    catch (e) { setCoMsg(e.message); }
  }

  async function addUser(e) {
    e.preventDefault();
    setMsg('');
    try {
      const d = await api('/api/users', { method: 'POST', body: nu });
      setUsers((u) => [...u, d.user]);
      setNu({ name: '', username: '', password: '', role: 'editor' });
      setMsg(`${d.user.name} 계정을 만들었습니다. 아이디와 비밀번호를 본인에게 전달해 주십시오.`);
    } catch (e2) { setMsg(e2.message); }
  }

  async function update(u, patch) {
    try {
      const d = await api(`/api/users/${u.id}`, { method: 'PUT', body: patch });
      setUsers((list) => list.map((x) => (x.id === u.id ? d.user : x)));
      return true;
    } catch (e) { window.alert(e.message); return false; }
  }

  async function resetPw(u) {
    const pw = window.prompt(`${u.name}(${u.username})의 새 비밀번호를 입력해 주십시오. (8자 이상)`);
    if (!pw) return;
    if (await update(u, { password: pw })) window.alert('비밀번호를 바꿨습니다. 본인에게 전달해 주십시오.');
  }

  return (
    <>
      <div className="page-head"><h1>계정·회사 관리</h1></div>

      <div className="panel">
        <h2>우리 회사 정보</h2>
        <p className="status" style={{ marginTop: 0 }}>사진·PDF 판독 때 공급자와 공급받는자 중 어느 쪽이 우리 회사인지 보고 매입·매출을 정합니다. 사업자번호를 넣어 두면 더 정확합니다.</p>
        <div className="row">
          <div className="field" style={{ minWidth: 220 }}><label htmlFor="co-n">상호</label><input id="co-n" type="text" value={co.company_name} onChange={(e) => setCo({ ...co, company_name: e.target.value })} /></div>
          <div className="field" style={{ minWidth: 180 }}><label htmlFor="co-b">사업자등록번호</label><input id="co-b" type="text" value={co.biz_no} placeholder="000-00-00000" onChange={(e) => setCo({ ...co, biz_no: e.target.value })} onBlur={() => setCo((c) => ({ ...c, biz_no: formatBiz(c.biz_no) }))} /></div>
          <button className="btn primary" type="button" onClick={saveCo}>저장</button>
          <span className="status">{coMsg}</span>
        </div>
      </div>

      <form className="panel" onSubmit={addUser}>
        <h2>직원 계정 만들기</h2>
        <div className="row">
          <div className="field"><label htmlFor="nu-n">이름</label><input id="nu-n" type="text" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} required /></div>
          <div className="field"><label htmlFor="nu-u">아이디 (영문·숫자)</label><input id="nu-u" type="text" value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value })} required /></div>
          <div className="field"><label htmlFor="nu-p">초기 비밀번호 (8자 이상)</label><input id="nu-p" type="text" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} required /></div>
          <div className="field"><label htmlFor="nu-r">권한</label>
            <select id="nu-r" value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}>
              {Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <button className="btn primary" type="submit">계정 만들기</button>
        </div>
        <p className="status" style={{ marginBottom: 0 }}>{msg || ROLE_HELP}</p>
      </form>

      <div className="tablewrap">
        <table>
          <thead><tr><th>이름</th><th>아이디</th><th>권한</th><th>상태</th><th>만든 날</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}{u.id === me.id && <span className="muted"> (나)</span>}</td>
                <td className="muted">{u.username}</td>
                <td>
                  <select aria-label={`${u.name} 권한`} value={u.role} disabled={u.id === me.id} onChange={(e) => update(u, { role: e.target.value })} style={{ width: 'auto' }}>
                    {Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </td>
                <td>{u.active ? <span className="pill buy">사용 중</span> : <span className="pill off">사용 중지</span>}</td>
                <td className="muted">{String(u.created_at).slice(0, 10)}</td>
                <td className="actions" style={{ justifyContent: 'flex-start' }}>
                  <button className="btn small" type="button" onClick={() => resetPw(u)}>비밀번호 변경</button>
                  {u.id !== me.id && (
                    <button className="btn small" type="button" onClick={() => update(u, { active: !u.active })}>{u.active ? '사용 중지' : '다시 사용'}</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="status">퇴사자는 계정을 지우지 않고 ‘사용 중지’로 바꿉니다. 그 사람이 등록한 명세서 기록은 그대로 남습니다.</p>
    </>
  );
}
