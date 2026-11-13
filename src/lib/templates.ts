import type { PaperTemplateId } from '../types';

export interface TemplateMeta {
  id: PaperTemplateId;
  name: string;
  desc: string;
}

export const PAPER_TEMPLATES: TemplateMeta[] = [
  { id: 'lined', name: '줄노트', desc: '기본 필기 가로줄' },
  { id: 'meeting', name: '회의록', desc: '일시·안건·결정·업무 구획' },
  { id: 'cornell', name: '코넬 노트', desc: '키워드·본문·하단 요약' },
  { id: 'grid', name: '모눈 (5mm)', desc: '도표·설계·정렬용 격자' },
  { id: 'dot', name: '점 격자', desc: '불릿 저널용 도트 패턴' },
  { id: 'manuscript200', name: '200자 원고지', desc: '칼럼·설교·글쓰기 원고' },
  { id: 'weekly', name: '주간 플래너', desc: '월~일 7일 일정 블록' },
  { id: 'todo', name: '할 일 체크', desc: '체크박스와 우선순위' },
  { id: 'interview', name: '인터뷰 정리', desc: '질문/응답/메모 2단' },
  { id: 'music', name: '오선지', desc: '작곡·악보 스케치' },
  { id: 'mindmap', name: '마인드맵 그리드', desc: '중앙 아이디어 확산 프레임' },
  { id: 'blank', name: '백지 (무지)', desc: '자유 드로잉용' },
];

export function drawPaperTemplate(
  ctx: CanvasRenderingContext2D,
  template: PaperTemplateId,
  width = 1000,
  height = 1400,
): void {
  ctx.fillStyle = '#f6f5f0';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#d3d0c7';
  ctx.fillStyle = '#8b8880';
  ctx.lineWidth = 1.4;

  if (template === 'blank') return;

  if (template === 'lined') {
    for (let y = 130; y <= height - 70; y += 44) {
      ctx.beginPath();
      ctx.moveTo(64, y);
      ctx.lineTo(width - 64, y);
      ctx.stroke();
    }
    ctx.strokeStyle = '#b9b4a8';
    ctx.beginPath();
    ctx.moveTo(132, 80);
    ctx.lineTo(132, height - 60);
    ctx.stroke();
    return;
  }

  if (template === 'meeting') {
    ctx.strokeStyle = '#4c4a45';
    ctx.lineWidth = 2;
    ctx.strokeRect(56, 64, width - 112, 130);
    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = '#33312d';
    ctx.fillText('MEETING DATE :', 78, 106);
    ctx.fillText('PARTICIPANTS :', 500, 106);
    ctx.fillText('AGENDA / TOPIC :', 78, 162);
    ctx.strokeStyle = '#d2cfc5';
    ctx.lineWidth = 1.3;
    for (let y = 240; y <= height - 240; y += 44) {
      ctx.beginPath();
      ctx.moveTo(56, y);
      ctx.lineTo(width - 56, y);
      ctx.stroke();
    }
    ctx.strokeStyle = '#4c4a45';
    ctx.lineWidth = 2;
    ctx.strokeRect(56, height - 210, width - 112, 150);
    ctx.fillText('ACTION ITEMS / AI SUMMARY', 78, height - 178);
    return;
  }

  if (template === 'cornell') {
    ctx.strokeStyle = '#5a5750';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(56, 130);
    ctx.lineTo(width - 56, 130);
    ctx.moveTo(290, 130);
    ctx.lineTo(290, height - 240);
    ctx.moveTo(56, height - 240);
    ctx.lineTo(width - 56, height - 240);
    ctx.stroke();
    ctx.strokeStyle = '#d3d0c7';
    ctx.lineWidth = 1.2;
    for (let y = 178; y < height - 245; y += 44) {
      ctx.beginPath();
      ctx.moveTo(56, y);
      ctx.lineTo(width - 56, y);
      ctx.stroke();
    }
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('CUES', 74, 114);
    ctx.fillText('NOTES', 310, 114);
    ctx.fillText('SUMMARY', 74, height - 210);
    return;
  }

  if (template === 'grid') {
    for (let x = 50; x <= width - 50; x += 36) {
      ctx.beginPath();
      ctx.moveTo(x, 60);
      ctx.lineTo(x, height - 60);
      ctx.stroke();
    }
    for (let y = 60; y <= height - 60; y += 36) {
      ctx.beginPath();
      ctx.moveTo(50, y);
      ctx.lineTo(width - 50, y);
      ctx.stroke();
    }
    return;
  }

  if (template === 'dot') {
    ctx.fillStyle = '#a7a49b';
    for (let x = 60; x <= width - 60; x += 34) {
      for (let y = 70; y <= height - 70; y += 34) {
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return;
  }

  if (template === 'manuscript200') {
    const cols = 10;
    const rows = 20;
    const cellW = 76;
    const cellH = 54;
    const startX = (width - cols * cellW) / 2;
    const startY = 120;
    for (let r = 0; r < rows; r++) {
      const y = startY + r * (cellH + 8);
      ctx.strokeStyle = '#9a968c';
      ctx.strokeRect(startX, y, cols * cellW, cellH);
      for (let c = 1; c < cols; c++) {
        ctx.beginPath();
        ctx.moveTo(startX + c * cellW, y);
        ctx.lineTo(startX + c * cellW, y + cellH);
        ctx.stroke();
      }
    }
    return;
  }

  if (template === 'weekly') {
    const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    const rowH = 165;
    days.forEach((d, i) => {
      const y = 90 + i * (rowH + 12);
      ctx.strokeStyle = '#5c5952';
      ctx.strokeRect(64, y, width - 128, rowH);
      ctx.font = 'bold 20px sans-serif';
      ctx.fillStyle = '#312f2b';
      ctx.fillText(d, 84, y + 34);
    });
    return;
  }

  if (template === 'todo') {
    for (let y = 130; y <= height - 80; y += 56) {
      ctx.strokeStyle = '#55534d';
      ctx.strokeRect(72, y - 24, 24, 24);
      ctx.strokeStyle = '#d3d0c7';
      ctx.beginPath();
      ctx.moveTo(116, y);
      ctx.lineTo(width - 64, y);
      ctx.stroke();
    }
    return;
  }

  if (template === 'interview') {
    ctx.strokeStyle = '#5a5750';
    ctx.beginPath();
    ctx.moveTo(320, 80);
    ctx.lineTo(320, height - 70);
    ctx.stroke();
    ctx.strokeStyle = '#d3d0c7';
    for (let y = 130; y <= height - 70; y += 46) {
      ctx.beginPath();
      ctx.moveTo(64, y);
      ctx.lineTo(width - 64, y);
      ctx.stroke();
    }
    return;
  }

  if (template === 'music') {
    for (let block = 0; block < 9; block++) {
      const top = 120 + block * 136;
      ctx.strokeStyle = '#58554e';
      for (let line = 0; line < 5; line++) {
        ctx.beginPath();
        ctx.moveTo(72, top + line * 14);
        ctx.lineTo(width - 72, top + line * 14);
        ctx.stroke();
      }
    }
    return;
  }

  if (template === 'mindmap') {
    ctx.strokeStyle = '#8b8880';
    ctx.beginPath();
    ctx.ellipse(width / 2, height / 2, 130, 68, 0, 0, Math.PI * 2);
    ctx.stroke();
    const branches = [
      [220, 300],
      [780, 300],
      [220, 1100],
      [780, 1100],
    ];
    for (const [bx, by] of branches) {
      ctx.beginPath();
      ctx.moveTo(width / 2, height / 2);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(bx, by, 100, 48, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
