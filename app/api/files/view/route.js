import { NextResponse } from 'next/server';
import { sb, BUCKET } from '@/lib/supabase';
import { requireUser, fail, serverError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const PATH_RE = /^\d{4}\/\d{2}\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|gif|pdf)$/i;

// 로그인한 직원에게만 5분짜리 임시 주소를 만들어 원본을 보여 줍니다.
export async function GET(req) {
  const { error } = await requireUser('viewer');
  if (error) return error;
  try {
    const path = new URL(req.url).searchParams.get('path') || '';
    if (!PATH_RE.test(path)) return fail('잘못된 파일 경로입니다.', 404);
    const { data, error: e } = await sb().storage.from(BUCKET).createSignedUrl(path, 300);
    if (e || !data?.signedUrl) return fail('파일을 찾을 수 없습니다.', 404);
    return NextResponse.redirect(data.signedUrl);
  } catch (e) {
    return serverError(e);
  }
}
