// 로그인 세션(쿠키) 서명·확인. 미들웨어(edge)와 서버 양쪽에서 사용합니다.
import { SignJWT, jwtVerify } from 'jose';

export const COOKIE = 'slip_session';
export const MAX_AGE = 60 * 60 * 24 * 7; // 7일

function secret() {
  return new TextEncoder().encode(process.env.SESSION_SECRET || '');
}

export async function signSession(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret());
}

export async function verifySession(token) {
  if (!token || !process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload;
  } catch {
    return null;
  }
}
