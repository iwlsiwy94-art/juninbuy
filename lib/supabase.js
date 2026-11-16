import { createClient } from '@supabase/supabase-js';

export const BUCKET = 'originals';
let client = null;

// 서버 전용 Supabase 연결 (비밀 키 사용, 브라우저로 보내지 않음)
export function sb() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 환경값이 없습니다.');
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}
