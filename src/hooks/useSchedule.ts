/**
 * 课表数据 Hook
 *
 * 提供：
 * - 课程列表、增删改
 * - 周/月视图切换
 * - 冲突错误捕获与提示
 * - 教室列表
 */

import { useCallback, useEffect, useState } from 'react';
import { coursesApi, classroomsApi, ApiError } from '../api/client';
import type { Course, Classroom, ConflictReport } from '../types';

export type ScheduleViewMode = 'week' | 'month';

export interface UseScheduleResult {
  courses: Course[];
  classrooms: Classroom[];
  loading: boolean;
  error: string | null;
  viewMode: ScheduleViewMode;
  setViewMode: (mode: ScheduleViewMode) => void;
  currentWeekStart: Date;
  currentMonth: Date;
  goPrev: () => void;
  goNext: () => void;
  goToday: () => void;
  addCourse: (data: Partial<Course>) => Promise<Course>;
  updateCourse: (id: string, data: Partial<Course>) => Promise<Course>;
  deleteCourse: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  lastConflict: ConflictReport | null;
  clearConflict: () => void;
}

const DEFAULT_COLOR_PALETTE = [
  '#0052d9', '#2ba471', '#ed7b2f', '#e34d59', '#8b5cf6',
  '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#6366f1',
];

export function useSchedule(): UseScheduleResult {
  const [courses, setCourses] = useState<Course[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ScheduleViewMode>('week');
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => getMondayOf(new Date()));
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date());
  const [lastConflict, setLastConflict] = useState<ConflictReport | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, cls] = await Promise.all([
        coursesApi.list(),
        classroomsApi.list(),
      ]);
      setCourses(c);
      setClassrooms(cls);
    } catch (e: any) {
      setError(e.message || '加载课表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addCourse = useCallback(async (data: Partial<Course>) => {
    try {
      const created = await coursesApi.create(data);
      setCourses(prev => [...prev, created]);
      setLastConflict(null);
      return created;
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 409 && e.body?.report) {
        setLastConflict(e.body.report);
        throw e;
      }
      throw e;
    }
  }, []);

  const updateCourse = useCallback(async (id: string, data: Partial<Course>) => {
    try {
      const updated = await coursesApi.update(id, data);
      setCourses(prev => prev.map(c => (c.id === id ? updated : c)));
      setLastConflict(null);
      return updated;
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 409 && e.body?.report) {
        setLastConflict(e.body.report);
        throw e;
      }
      throw e;
    }
  }, []);

  const deleteCourse = useCallback(async (id: string) => {
    await coursesApi.remove(id);
    setCourses(prev => prev.filter(c => c.id !== id));
  }, []);

  const goPrev = useCallback(() => {
    if (viewMode === 'week') {
      setCurrentWeekStart(d => addDays(d, -7));
    } else {
      setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    }
  }, [viewMode]);

  const goNext = useCallback(() => {
    if (viewMode === 'week') {
      setCurrentWeekStart(d => addDays(d, 7));
    } else {
      setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
    }
  }, [viewMode]);

  const goToday = useCallback(() => {
    if (viewMode === 'week') {
      setCurrentWeekStart(getMondayOf(new Date()));
    } else {
      setCurrentMonth(new Date());
    }
  }, [viewMode]);

  const clearConflict = useCallback(() => setLastConflict(null), []);

  return {
    courses,
    classrooms,
    loading,
    error,
    viewMode,
    setViewMode,
    currentWeekStart,
    currentMonth,
    goPrev,
    goNext,
    goToday,
    addCourse,
    updateCourse,
    deleteCourse,
    refresh,
    lastConflict,
    clearConflict,
  };
}

export function getMondayOf(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const result = new Date(d);
  result.setDate(d.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(d.getDate() + days);
  return result;
}

export function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

export function formatTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function dayName(date: Date): string {
  const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return names[date.getDay()];
}

export function pickColor(index: number): string {
  return DEFAULT_COLOR_PALETTE[index % DEFAULT_COLOR_PALETTE.length];
}