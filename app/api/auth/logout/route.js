import { json } from '@/lib/auth';
import { COOKIE } from '@/lib/session';

export async function POST() {
  const res = json({ ok: true });
  res.cookies.set(COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
