import React, { useState } from 'react';
import { jsPDF } from 'jspdf';
import type { ExportedAudioFile, NoteBook } from '../types';
import { convertAudioDataUrlForExport } from '../lib/audioExport';
import { exportDataUrlArtifact, exportTextArtifact } from '../lib/native';

interface ShareExportModalProps {
  open: boolean;
  onClose: () => void;
  note: NoteBook;
  onSaveExportedAudio: (file: ExportedAudioFile) => Promise<void>;
  onOpenFilesAudio: () => void;
  onNotify: (msg: string) => void;
}

export const ShareExportModal: React.FC<ShareExportModalProps> = ({
  open,
  onClose,
  note,
  onSaveExportedAudio,
  onOpenFilesAudio,
  onNotify,
}) => {
  const [audioFmt, setAudioFmt] = useState<'wav' | 'mp3' | 'webm'>('wav');
  const [selectedRecId, setSelectedRecId] = useState<string>(note.recordings[0]?.id || '');
  const [exporting, setExporting] = useState(false);
  const [exportedDone, setExportedDone] = useState<string>('');

  if (!open) return null;

  const targetRec = note.recordings.find((r) => r.id === selectedRecId) || note.recordings[0];

  const handleExportMd = async () => {
    const md = [
      `# ${note.title}`,
      ...(note.aiSummary ? ['', '## AI Summary', note.aiSummary] : []),
      ...note.pages.map((p, i) => `\n## Page ${i + 1}\n\n${p.textLayer}`),
    ].join('\n');
    await exportTextArtifact(`${note.title}.md`, md, 'text/markdown');
    onNotify('Web / Markdown 파일로 내보냈습니다.');
    onClose();
  };

  const handleExportTxt = async () => {
    const txt = [
      note.title,
      '='.repeat(24),
      ...note.pages.map((p, i) => `[Page ${i + 1}]\n${p.textLayer}`),
      ...(note.recordings[0]?.segments.map((s) => `[${s.speaker}] ${s.text}`) || []),
    ].join('\n\n');
    await exportTextArtifact(`${note.title}.txt`, txt, 'text/plain;charset=utf-8');
    onNotify('텍스트(.txt)로 내보냈습니다.');
    onClose();
  };

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
      pdf.setFontSize(16);
      pdf.text(note.title || 'Meokbit Note', 40, 52);
      pdf.setFontSize(11);
      const body = note.pages.map((p, i) => `Page ${i + 1}: ${p.textLayer || '(handwritten)'}`).join('\n\n');
      const lines = pdf.splitTextToSize(body, 510);
      pdf.text(lines.slice(0, 48), 40, 82);
      const dataUrl = pdf.output('datauristring');
      await exportDataUrlArtifact(`${note.title}.pdf`, dataUrl);
      onNotify('PDF 파일로 내보냈습니다.');
      onClose();
    } finally {
      setExporting(false);
    }
  };

  const handleExportRecording = async () => {
    if (!targetRec) return;
    setExporting(true);
    setExportedDone('');
    try {
      const converted = await convertAudioDataUrlForExport(
        targetRec.dataUrl,
        targetRec.durationMs,
        audioFmt,
      );
      const fileName = `${note.title}-${targetRec.title}.${audioFmt}`.replace(/[/\\:*?"<>|]/g, '_');
      const audioRecord: ExportedAudioFile = {
        id: `aud_${Date.now()}`,
        name: fileName,
        format: audioFmt,
        mimeType: converted.mimeType,
        durationMs: targetRec.durationMs,
        sizeBytes: converted.sizeBytes,
        dataUrl: converted.dataUrl,
        createdAt: Date.now(),
        sourceNoteTitle: note.title,
      };
      await onSaveExportedAudio(audioRecord);
      await exportDataUrlArtifact(fileName, converted.dataUrl);
      setExportedDone(fileName);
      onNotify('Export succeeded! Files > Audio 에 저장되었습니다.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="eink-modal-backdrop" role="dialog" aria-modal="true" data-testid="share-export-modal">
      <div className="eink-modal-card">
        <div className="eink-modal-head">
          <h3>Share · 내보내기 형식 선택</h3>
          <button type="button" className="btn-ghost-sm" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="share-format-grid">
          <button type="button" className="share-card-btn" onClick={handleExportMd}>
            <strong>Web (MD)</strong>
            <span>Markdown 문서 내보내기</span>
          </button>
          <button type="button" className="share-card-btn" onClick={handleExportPdf} disabled={exporting}>
            <strong>PDF</strong>
            <span>노트 페이지 · 텍스트 인쇄용</span>
          </button>
          <button type="button" className="share-card-btn" onClick={handleExportTxt}>
            <strong>Text (.txt)</strong>
            <span>원본 텍스트 &amp; 전사록</span>
          </button>
        </div>

        <div className="share-recording-box" data-testid="share-recording-section">
          <h4>Recording Files (음성만 별도 내보내기)</h4>
          {note.recordings.length === 0 ? (
            <p className="meta-text">현재 노트에 저장된 녹음이 없습니다.</p>
          ) : (
            <>
              <div className="share-rec-controls">
                <select
                  value={targetRec?.id || ''}
                  onChange={(e) => setSelectedRecId(e.target.value)}
                  aria-label="내보낼 녹음 트랙"
                >
                  {note.recordings.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </select>
                <select
                  value={audioFmt}
                  onChange={(e) => setAudioFmt(e.target.value as 'wav' | 'mp3' | 'webm')}
                  aria-label="오디오 포맷"
                >
                  <option value="wav">WAV (무손실 PCM)</option>
                  <option value="mp3">MP3 호환 오디오</option>
                  <option value="webm">WebM 원본 스트림</option>
                </select>
                <button
                  type="button"
                  className="btn-ink-sm"
                  data-testid="export-recording-btn"
                  disabled={exporting}
                  onClick={handleExportRecording}
                >
                  {exporting ? 'Exporting...' : 'Recording Files 내보내기'}
                </button>
              </div>
              {exportedDone && (
                <div className="export-success-banner" data-testid="export-succeeded-msg">
                  <span>✓ Export succeeded! ({exportedDone})</span>
                  <button
                    type="button"
                    className="btn-outline-sm"
                    onClick={() => {
                      onClose();
                      onOpenFilesAudio();
                    }}
                  >
                    Files &gt; Audio 열기
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
