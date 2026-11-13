import type { NoteBook, NotePage } from '../types';

export async function importDocumentAsNote(file: File): Promise<NoteBook> {
  const low = file.name.toLowerCase();
  const title = file.name.replace(/\.[^.]+$/, '');
  const pages: NotePage[] = [];

  if (low.endsWith('.pdf')) {
    const pdfjs = await import('pdfjs-dist');
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data }).promise;
    const maxPages = Math.min(doc.numPages, 40);

    for (let i = 1; i <= maxPages; i++) {
      const pdfPage = await doc.getPage(i);
      const base = pdfPage.getViewport({ scale: 1 });
      const scale = Math.min(2, Math.max(1, 1000 / base.width));
      const vp = pdfPage.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await pdfPage.render({ canvasContext: ctx, canvas, viewport: vp }).promise;

      // Also extract searchable text for AI Aid Q&A
      const txtContent = await pdfPage.getTextContent();
      const extractedText = txtContent.items
        .map((it) => ('str' in it ? it.str : ''))
        .join(' ')
        .trim();

      pages.push({
        id: `pg-${Date.now()}-${i}`,
        index: i - 1,
        template: 'blank',
        backgroundImage: canvas.toDataURL('image/jpeg', 0.85),
        textLayer: extractedText,
        strokes: [],
      });
    }
  } else {
    const text = await file.text();
    const chunks = text.match(/[\s\S]{1,1800}/g) || [text];
    chunks.forEach((chunk, idx) => {
      pages.push({
        id: `pg-${Date.now()}-${idx}`,
        index: idx,
        template: 'lined',
        textLayer: chunk.trim(),
        strokes: [],
      });
    });
  }

  if (pages.length === 0) {
    pages.push({
      id: `pg-${Date.now()}-0`,
      index: 0,
      template: 'lined',
      textLayer: '',
      strokes: [],
    });
  }

  return {
    id: `doc-${Date.now().toString(36)}`,
    title,
    category: 'document',
    pages,
    currentPage: 0,
    recordings: [],
    updatedAt: Date.now(),
  };
}
