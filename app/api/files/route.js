import { randomUUID } from 'crypto';
import { sb, BUCKET } from '@/lib/supabase';
import { requireUser, json, fail, serverError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const MAX = 4 * 1024 * 1024; // Vercel 요청 크기 제한(4.5MB) 안쪽
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' };

// 원본 사진·PDF 한 개 올리기
export async function POST(req) {
  const { error } = await requireUser('editor');
  if (error) return error;
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') return fail('파일이 없습니다.');
    const type = file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : '');
    const ext = EXT[type];
    if (!ext) return fail('사진(JPG·PNG·WEBP)이나 PDF만 올릴 수 있습니다.');
    if (file.size > MAX) return fail('파일이 4MB를 넘습니다. 더 작은 파일로 올려 주십시오.');
    const d = new Date();
    const path = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${randomUUID()}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const { error: e } = await sb().storage.from(BUCKET).upload(path, buf, { contentType: type, upsert: false });
    if (e) throw e;
    return json({ path, name: file.name || `원본.${ext}`, type, size: file.size });
  } catch (e) {
    return serverError(e);
  }
}
