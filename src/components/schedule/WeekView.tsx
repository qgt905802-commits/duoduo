import { useMemo } from 'react';
import type { Course } from '../../types';
import {
  weekDays, dayName, formatTime, sameDay,
} from '../../hooks/useSchedule';

interface WeekViewProps {
  weekStart: Date;
  courses: Course[];
  onCourseClick?: (course: Course) => void;
  onEmptyCellClick?: (date: Date, hourStart: number) => void;
}

/** 一天的展示时段：7:00 ~ 22:00 */
const DAY_START_HOUR = 7;
const DAY_END_HOUR = 22;
const HOUR_HEIGHT = 56; // px

export function WeekView({
  weekStart,
  courses,
  onCourseClick,
  onEmptyCellClick,
}: WeekViewProps) {
  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  const today = new Date();

  // 当前周内的课程
  const weekCourses = useMemo(() => {
    return courses.filter(c => {
      const start = new Date(c.start_date);
      const end = new Date(c.end_date);
      return days.some(d => d >= start && d <= end);
    });
  }, [courses, days]);

  return (
    <div className="flex-1 overflow-auto bg-[var(--td-bg-color-container)] rounded-xl border" style={{ borderColor: 'var(--td-component-border)' }}>
      {/* 周导航 */}
      <div className="grid grid-cols-8 sticky top-0 z-10 bg-[var(--td-bg-color-container)]" style={{ borderBottom: '1px solid var(--td-component-border)' }}>
        <div className="text-xs p-2 text-center font-medium" style={{ color: 'var(--td-text-color-secondary)' }}>
          时间
        </div>
        {days.map(d => (
          <div
            key={d.toISOString()}
            className={`text-center py-2 text-sm font-medium ${
              sameDay(d, today) ? 'text-[var(--td-brand-color)]' : ''
            }`}
            style={{ color: sameDay(d, today) ? 'var(--td-brand-color)' : 'var(--td-text-color-primary)' }}
          >
            <div>{dayName(d)}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--td-text-color-placeholder)' }}>
              {d.getMonth() + 1}/{d.getDate()}
            </div>
          </div>
        ))}
      </div>

      {/* 时段网格 */}
      <div className="grid grid-cols-8 relative">
        {/* 时间列 */}
        <div className="text-xs">
          {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => (
            <div
              key={i}
              className="text-right pr-2 pt-1"
              style={{
                height: HOUR_HEIGHT,
                color: 'var(--td-text-color-placeholder)',
                borderRight: '1px solid var(--td-component-border)',
              }}
            >
              {`${String(DAY_START_HOUR + i).padStart(2, '0')}:00`}
            </div>
          ))}
        </div>

        {/* 7 天列 */}
        {days.map(d => {
          const dayCourses = weekCourses.filter(c => {
            const courseWeekday = c.weekday === 0 ? 0 : c.weekday;
            return d.getDay() === courseWeekday;
          });
          return (
            <DayColumn
              key={d.toISOString()}
              date={d}
              courses={dayCourses}
              onCourseClick={onCourseClick}
              onEmptyCellClick={onEmptyCellClick}
            />
          );
        })}
      </div>
    </div>
  );
}

interface DayColumnProps {
  date: Date;
  courses: Course[];
  onCourseClick?: (course: Course) => void;
  onEmptyCellClick?: (date: Date, hourStart: number) => void;
}

function DayColumn({ date, courses, onCourseClick, onEmptyCellClick }: DayColumnProps) {
  const totalHeight = (DAY_END_HOUR - DAY_START_HOUR) * HOUR_HEIGHT;

  return (
    <div
      className="relative text-xs"
      style={{
        height: totalHeight,
        borderRight: '1px solid var(--td-component-border)',
      }}
      onDoubleClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const offsetY = e.clientY - rect.top;
        const hour = Math.floor(offsetY / HOUR_HEIGHT) + DAY_START_HOUR;
        onEmptyCellClick?.(date, hour * 60);
      }}
    >
      {/* 背景时间刻度 */}
      {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: i * HOUR_HEIGHT,
            height: HOUR_HEIGHT,
            left: 0, right: 0,
            borderTop: '1px dashed var(--td-component-stroke)',
            pointerEvents: 'none',
          }}
        />
      ))}

      {/* 课程块 */}
      {courses.map(c => {
        const startMin = c.start_min;
        const endMin = c.end_min;
        const top = ((startMin - DAY_START_HOUR * 60) / 60) * HOUR_HEIGHT;
        const height = ((endMin - startMin) / 60) * HOUR_HEIGHT;
        return (
          <div
            key={c.id}
            className="absolute left-1 right-1 rounded-md px-2 py-1.5 cursor-pointer overflow-hidden hover:shadow-md transition-shadow"
            style={{
              top,
              height,
              backgroundColor: c.color || '#0052d9',
              color: '#fff',
              fontSize: 11,
            }}
            onClick={(e) => { e.stopPropagation(); onCourseClick?.(c); }}
            title={`${c.title} · ${formatTime(startMin)}-${formatTime(endMin)} · ${c.teacher || ''}`}
          >
            <div className="font-medium truncate">{c.title}</div>
            <div className="opacity-90 truncate text-[10px]">
              {formatTime(startMin)}-{formatTime(endMin)}
            </div>
            {c.location && (
              <div className="opacity-80 truncate text-[10px]">📍 {c.location}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}