import { useMemo } from 'react';
import type { Course } from '../../types';

interface MonthViewProps {
  month: Date;
  courses: Course[];
  onCourseClick?: (course: Course) => void;
}

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

export function MonthView({ month, courses, onCourseClick }: MonthViewProps) {
  const { weeks, monthLabel } = useMemo(() => buildMonthGrid(month), [month]);

  return (
    <div className="flex-1 overflow-auto bg-[var(--td-bg-color-container)] rounded-xl border" style={{ borderColor: 'var(--td-component-border)' }}>
      <div className="px-4 py-3 text-sm font-medium" style={{ borderBottom: '1px solid var(--td-component-border)' }}>
        {monthLabel}
      </div>
      {/* 星期表头 */}
      <div className="grid grid-cols-7" style={{ borderBottom: '1px solid var(--td-component-border)' }}>
        {WEEKDAY_LABELS.map(w => (
          <div
            key={w}
            className="text-center py-2 text-xs font-medium"
            style={{ color: 'var(--td-text-color-secondary)' }}
          >
            周{w}
          </div>
        ))}
      </div>
      {/* 日期格子 */}
      <div className="grid grid-cols-7">
        {weeks.flat().map((cell, idx) => {
          if (!cell) {
            return <div key={idx} className="h-24" style={{ borderRight: '1px solid var(--td-component-stroke)', borderBottom: '1px solid var(--td-component-stroke)' }} />;
          }
          const dayCourses = courses.filter(c => {
            const start = new Date(c.start_date);
            const end = new Date(c.end_date);
            if (cell.date < start || cell.date > end) return false;
            return c.weekday === cell.date.getDay();
          });

          return (
            <div
              key={idx}
              className="h-24 p-1.5 overflow-hidden"
              style={{
                borderRight: '1px solid var(--td-component-stroke)',
                borderBottom: '1px solid var(--td-component-stroke)',
                opacity: cell.inMonth ? 1 : 0.4,
              }}
            >
              <div
                className={`text-xs mb-1 ${
                  cell.isToday ? 'w-5 h-5 rounded-full flex items-center justify-center' : ''
                }`}
                style={{
                  color: cell.isToday ? '#fff' : 'var(--td-text-color-secondary)',
                  backgroundColor: cell.isToday ? 'var(--td-brand-color)' : 'transparent',
                  display: 'inline-block',
                  padding: cell.isToday ? '0 4px' : 0,
                }}
              >
                {cell.date.getDate()}
              </div>
              <div className="space-y-1">
                {dayCourses.slice(0, 3).map(c => (
                  <div
                    key={c.id}
                    className="text-[10px] px-1.5 py-0.5 rounded truncate cursor-pointer hover:opacity-80"
                    style={{
                      backgroundColor: c.color || 'var(--td-brand-color)',
                      color: '#fff',
                    }}
                    onClick={(e) => { e.stopPropagation(); onCourseClick?.(c); }}
                    title={c.title}
                  >
                    {c.title}
                  </div>
                ))}
                {dayCourses.length > 3 && (
                  <div className="text-[10px]" style={{ color: 'var(--td-text-color-placeholder)' }}>
                    +{dayCourses.length - 3} 更多
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface MonthCell {
  date: Date;
  inMonth: boolean;
  isToday: boolean;
}

function buildMonthGrid(month: Date): { weeks: (MonthCell | null)[][]; monthLabel: string } {
  const year = month.getFullYear();
  const m = month.getMonth();
  const firstDay = new Date(year, m, 1);
  // 找到当月 1 号所在周一
  const startDay = new Date(firstDay);
  const dayOfWeek = firstDay.getDay();
  const offset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  startDay.setDate(firstDay.getDate() + offset);

  const weeks: (MonthCell | null)[][] = [];
  const today = new Date();

  for (let w = 0; w < 6; w++) {
    const row: (MonthCell | null)[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(startDay);
      date.setDate(startDay.getDate() + w * 7 + d);
      const inMonth = date.getMonth() === m;
      const isToday = date.toDateString() === today.toDateString();
      row.push({ date, inMonth, isToday });
    }
    weeks.push(row);
  }

  return {
    weeks,
    monthLabel: `${year} 年 ${m + 1} 月`,
  };
}