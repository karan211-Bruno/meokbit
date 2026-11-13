import React, { useState } from 'react';
import { ScheduleEvent, TodoTask } from '../types';
import { buildGoogleCalendarUrl, exportEventsToIcs, parseIcsToEvents } from '../lib/ics';
import { exportTextArtifact } from '../lib/native';

interface CalendarTodoPanelProps {
  events: ScheduleEvent[];
  todos: TodoTask[];
  onAddEvent: (ev: ScheduleEvent) => void;
  onDeleteEvent: (id: string) => void;
  onAddTodo: (todo: TodoTask) => void;
  onToggleTodo: (id: string) => void;
  onDeleteTodo: (id: string) => void;
}

export const CalendarTodoPanel: React.FC<CalendarTodoPanelProps> = ({
  events,
  todos,
  onAddEvent,
  onDeleteEvent,
  onAddTodo,
  onToggleTodo,
  onDeleteTodo,
}) => {
  const [evTitle, setEvTitle] = useState('');
  const [evDate, setEvDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [evTime, setEvTime] = useState('14:00');
  const [todoTitle, setTodoTitle] = useState('');

  const handleCreateEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!evTitle.trim()) return;
    onAddEvent({
      id: `ev_${Date.now()}`,
      title: evTitle.trim(),
      date: evDate,
      time: evTime,
    });
    setEvTitle('');
  };

  const handleCreateTodo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!todoTitle.trim()) return;
    onAddTodo({
      id: `td_${Date.now()}`,
      title: todoTitle.trim(),
      done: false,
      dueDate: evDate,
      createdAt: Date.now(),
    });
    setTodoTitle('');
  };

  const handleExportIcs = async () => {
    const ics = exportEventsToIcs(events);
    await exportTextArtifact('meokbit-schedule.ics', ics, 'text/calendar;charset=utf-8');
  };

  const handleImportIcs = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseIcsToEvents(text);
    for (const ev of parsed) {
      onAddEvent(ev);
    }
    e.target.value = '';
  };

  return (
    <div className="calendar-todo-grid">
      <section className="eink-card">
        <div className="card-header-row">
          <h2>일정 & Google 캘린더 (.ics)</h2>
          <div className="card-actions">
            <button type="button" className="btn-outline-sm" onClick={handleExportIcs}>
              .ics 내보내기
            </button>
            <label className="btn-outline-sm file-btn">
              .ics 가져오기
              <input type="file" accept=".ics,text/calendar" onChange={handleImportIcs} hidden />
            </label>
          </div>
        </div>

        <form className="inline-add-form" onSubmit={handleCreateEvent}>
          <input
            type="text"
            value={evTitle}
            onChange={(e) => setEvTitle(e.target.value)}
            placeholder="일정 제목 (예: 주간 프로젝트 점검)"
          />
          <input type="date" value={evDate} onChange={(e) => setEvDate(e.target.value)} />
          <input type="time" value={evTime} onChange={(e) => setEvTime(e.target.value)} />
          <button type="submit" className="btn-ink-sm">
            등록
          </button>
        </form>

        <ul className="eink-list">
          {events.map((ev) => (
            <li key={ev.id} className="eink-list-item">
              <div>
                <strong>{ev.title}</strong>
                <div className="meta-text">
                  {ev.date} {ev.time} {ev.notes ? `· ${ev.notes}` : ''}
                </div>
              </div>
              <div className="item-actions">
                <a
                  href={buildGoogleCalendarUrl(ev)}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-outline-sm"
                >
                  Google 캘린더 추가
                </a>
                <button
                  type="button"
                  className="btn-ghost-sm"
                  onClick={() => onDeleteEvent(ev.id)}
                >
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="eink-card">
        <div className="card-header-row">
          <h2>할 일 (To-Do)</h2>
          <span className="meta-text">
            완료 {todos.filter((t) => t.done).length} / {todos.length}
          </span>
        </div>

        <form className="inline-add-form" onSubmit={handleCreateTodo}>
          <input
            type="text"
            value={todoTitle}
            onChange={(e) => setTodoTitle(e.target.value)}
            placeholder="새 할 일을 입력하세요..."
          />
          <button type="submit" className="btn-ink-sm">
            추가
          </button>
        </form>

        <ul className="eink-list">
          {todos.map((todo) => (
            <li key={todo.id} className="eink-list-item">
              <label className={`todo-check-label ${todo.done ? 'is-done' : ''}`}>
                <input
                  type="checkbox"
                  checked={todo.done}
                  onChange={() => onToggleTodo(todo.id)}
                />
                <span>{todo.title}</span>
              </label>
              <button
                type="button"
                className="btn-ghost-sm"
                onClick={() => onDeleteTodo(todo.id)}
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};
