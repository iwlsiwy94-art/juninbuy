'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import SlipForm from '@/components/SlipForm';
import { api, prepareFile, isAcceptable } from '@/components/api';
import { useUser, canEdit } from '@/components/UserContext';

export default function NewSlip() {
  const router = useRouter();
  const user = useUser();
  const [mode, setMode] = useState('scan');
  const [initial, setInitial] = useState(null);
  const [notes, setNotes] = useState('');
  const [formKey, setFormKey] = useState(0);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);

  if (!canEdit(user)) return <p className="note">조회자 계정은 거래명세서를 등록할 수 없습니다. 관리자에게 권한 변경을 요청해 주십시오.</p>;

  async function scan(list) {
    const files = list.filter(isAcceptable);
    if (!files.length) { setStatus('사진(JPG·PNG·WEBP)이나 PDF 파일을 골라 주십시오.'); return; }
    setBusy(true);
    setStatus('파일 준비 중…');
    try {
      const prepared = [];
      for (const f of files) prepared.push(await prepareFile(f));
      const size = prepared.reduce((a, f) => a + f.size, 0);
      if (size > 4 * 1024 * 1024) throw new Error('파일 크기 합계가 4MB를 넘습니다. 장수를 줄이거나 더 작은 파일로 올려 주십시오.');
      const fd = new FormData();
      prepared.forEach((f) => fd.append('files', f, f.name));
      setStatus('Claude가 명세서를 읽는 중입니다… (보통 20초~1분)');
      const r = await api('/api/scan', { method: 'POST', form: fd });
      setInitial({ ...r.form, pending: prepared });
      setNotes((r.notes || []).join(' '));
      setFormKey((k) => k + 1);
      setStatus('읽기를 마쳤습니다. 아래 양식에서 내용을 확인한 뒤 저장해 주십시오.');
    } catch (e) {
      setStatus(e.message);
    } finally {
      setBusy(false);
    }
  }

  function startManual() {
    setMode('manual');
    setInitial(null);
    setNotes('');
    setFormKey((k) => k + 1);
    setStatus('');
  }

  return (
    <>
      <div className="page-head">
        <h1>거래명세서 등록</h1>
        <div className="right"><Link className="btn" href="/import">엑셀로 여러 건 가져오기</Link></div>
      </div>

      <div className="row">
        <button type="button" className={`btn ${mode === 'scan' ? 'primary' : ''}`} onClick={() => setMode('scan')}>사진·PDF로 등록</button>
        <button type="button" className={`btn ${mode === 'manual' ? 'primary' : ''}`} onClick={startManual}>직접 입력</button>
      </div>

      {mode === 'scan' && (
        <div className="panel">
          <h2>사진·PDF로 등록</h2>
          <div
            className={`drop ${over ? 'over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); if (!busy) scan(Array.from(e.dataTransfer.files || [])); }}
          >
            <p style={{ margin: '0 0 10px' }}>거래명세서 한 건의 사진이나 PDF를 끌어다 놓거나 아래 버튼으로 골라 주십시오. 여러 장이면 같은 명세서의 페이지로 읽습니다.</p>
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple disabled={busy}
              onChange={(e) => { const fs = Array.from(e.target.files || []); e.target.value = ''; scan(fs); }} />
          </div>
          {status && <p className="status" role="status" style={{ marginBottom: 0 }}>{status}</p>}
        </div>
      )}

      {(mode === 'manual' || initial) && (
        <SlipForm key={formKey} initial={initial} notes={notes} onSaved={(s) => router.push(`/slips/${s.id}`)} />
      )}
    </>
  );
}
