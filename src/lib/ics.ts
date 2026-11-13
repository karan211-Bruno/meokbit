import type { ScheduleEvent } from '../types';

export function buildGoogleCalendarUrl(ev: ScheduleEvent): string {
  const cleanDate = ev.date.replace(/-/g, '');
  const cleanTime = ev.time.replace(/:/g, '') + '00';
  const startHour = Number(ev.time.split(':')[0] || '10');
  const endHour = String((startHour + 1) % 24).padStart(2, '0');
  const endTime = endHour + (ev.time.split(':')[1] || '00') + '00';
  const dates = `${cleanDate}T${cleanTime}/${cleanDate}T${endTime}`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title,
    dates,
    details: ev.notes || '먹빛 E-Ink AI 전자노트에서 추가된 일정',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function exportEventsToIcs(events: ScheduleEvent[]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Meokbit//E-Ink AI Note//KO',
  ];
  for (const ev of events) {
    const d = ev.date.replace(/-/g, '');
    const t = ev.time.replace(/:/g, '') + '00';
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.id}@meokbit.app`);
    lines.push(`DTSTART:${d}T${t}`);
    lines.push(`SUMMARY:${ev.title.replace(/\n/g, ' ')}`);
    if (ev.notes) lines.push(`DESCRIPTION:${ev.notes.replace(/\n/g, '\\n')}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function parseIcsToEvents(raw: string): ScheduleEvent[] {
  const blocks = raw.split('BEGIN:VEVENT').slice(1);
  const out: ScheduleEvent[] = [];
  for (const b of blocks) {
    const summary = b.match(/SUMMARY:(.*)/)?.[1]?.trim();
    const dt = b.match(/DTSTART[^:]*:(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);
    if (!summary || !dt) continue;
    const date = `${dt[1]}-${dt[2]}-${dt[3]}`;
    const time = dt[4] && dt[5] ? `${dt[4]}:${dt[5]}` : '09:00';
    out.push({
      id: `ics-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      title: summary,
      date,
      time,
      notes: '.ics 파일에서 가져옴',
    });
  }
  return out;
}
