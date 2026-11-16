'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ROLE_LABEL } from '@/lib/util';

export default function Nav({ user }) {
  const path = usePathname();
  const links = [
    ['/slips', '거래명세서'],
    ['/slips/new', '등록'],
    ['/import', '엑셀 가져오기'],
    ['/summary', '집계'],
    ['/vendors', '등록 업체'],
  ];
  if (user.role === 'admin') links.push(['/admin', '계정·회사 관리']);
  const isOn = (href) => (href === '/slips' ? path === '/slips' || (/^\/slips\/[^/]+$/.test(path) && path !== '/slips/new') : path.startsWith(href));

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/login';
  }

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/slips" className="brand">
          <b>(주)준인산업</b>
          <span>거래명세서 관리시스템</span>
        </Link>
        <nav className="nav" aria-label="메뉴">
          {links.map(([href, label]) => (
            <Link key={href} href={href} className={isOn(href) ? 'on' : ''}>{label}</Link>
          ))}
        </nav>
        <div className="who">
          <Link href="/account" className="muted" style={{ textDecoration: 'none' }}>
            {user.name} · {ROLE_LABEL[user.role]}
          </Link>
          <button className="btn small" type="button" onClick={logout}>로그아웃</button>
        </div>
      </div>
    </header>
  );
}
