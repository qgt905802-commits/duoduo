/**
 * 统计服务
 *
 * 提供：
 * - 每日学习时长聚合
 * - 待办完成率
 * - 目标进度
 * - 调用禁飞区「日程优化」生成学习计划
 */

import db from '../db.js';
import { optimizeSchedule } from '../forbidden/schedule-optimizer.js';
import { listCourses, courseToSlot, dateOfWeek } from './schedule.js';
import { listTodos } from './todo.js';
import { listGoals } from './goal.js';
import type {
  ScheduleOptimizeInput,
  ScheduleOptimizeResult,
  OptimizableActivity,
} from '../forbidden/types.js';

export interface DailyStat {
  date: string;
  studyMinutes: number;
  todoCompleted: number;
}

export interface OverallStats {
  totalCourses: number;
  totalTodos: number;
  totalGoals: number;
  activeGoals: number;
  completedTodos: number;
  overdueTodos: number;
  weeklyStudyMinutes: number;     // 最近 7 天
  todayStudyMinutes: number;
}

/** 最近 N 天的日期数组（YYYY-MM-DD） */
function recentDates(days: number): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

export function dailyStudyMinutes(userId = 'default', days = 7): DailyStat[] {
  const dates = recentDates(days);
  const startDate = dates[0];

  const rows = db.prepare(`
    SELECT logged_date, SUM(duration_min) as total
    FROM study_logs
    WHERE user_id = ? AND logged_date >= ?
    GROUP BY logged_date
  `).all(userId, startDate) as Array<{ logged_date: string; total: number }>;

  const map = new Map(rows.map(r => [r.logged_date, r.total]));

  return dates.map(d => ({
    date: d,
    studyMinutes: map.get(d) || 0,
    todoCompleted: 0,
  }));
}

export function getOverallStats(userId = 'default'): OverallStats {
  const totalCourses = (db
    .prepare('SELECT COUNT(*) as cnt FROM courses WHERE user_id = ?')
    .get(userId) as { cnt: number }).cnt;

  const todoRows = db.prepare(`
    SELECT status, COUNT(*) as cnt FROM todos WHERE user_id = ? GROUP BY status
  `).all(userId) as Array<{ status: string; cnt: number }>;
  let totalTodos = 0;
  let completedTodos = 0;
  let overdueTodos = 0;
  for (const r of todoRows) {
    totalTodos += r.cnt;
    if (r.status === 'completed') completedTodos = r.cnt;
  }
  const overdueRow = db.prepare(`
    SELECT COUNT(*) as cnt FROM todos
    WHERE user_id = ? AND status != 'completed'
    AND due_date IS NOT NULL AND due_date < ?
  `).get(userId, new Date().toISOString()) as { cnt: number };
  overdueTodos = overdueRow.cnt;

  const goalRows = db.prepare(`
    SELECT status, COUNT(*) as cnt FROM goals WHERE user_id = ? GROUP BY status
  `).all(userId) as Array<{ status: string; cnt: number }>;
  let totalGoals = 0;
  let activeGoals = 0;
  for (const r of goalRows) {
    totalGoals += r.cnt;
    if (r.status === 'active') activeGoals = r.cnt;
  }

  const today = new Date().toISOString().slice(0, 10);
  const lastWeek = recentDates(7)[0];
  const studyRows = db.prepare(`
    SELECT
      SUM(CASE WHEN logged_date = ? THEN duration_min ELSE 0 END) as today,
      SUM(CASE WHEN logged_date >= ? THEN duration_min ELSE 0 END) as week
    FROM study_logs WHERE user_id = ?
  `).get(today, lastWeek, userId) as { today: number | null; week: number | null };

  return {
    totalCourses,
    totalTodos,
    totalGoals,
    activeGoals,
    completedTodos,
    overdueTodos,
    weeklyStudyMinutes: studyRows.week || 0,
    todayStudyMinutes: studyRows.today || 0,
  };
}

/**
 * 日程优化（业务封装）
 * ⚠️ 内部调用禁飞区 optimizeSchedule
 */
export async function generateStudyPlan(
  userId = 'default',
  horizon: { startDate: string; endDate: string }
): Promise<ScheduleOptimizeResult> {
  const courses = listCourses(userId);
  const todos = listTodos({ userId }).filter(t => t.status !== 'completed');
  const goals = listGoals({ userId, status: 'active' });

  // 构造 fixedSlots（用 horizon 起始日作为样本）
  const sampleDate = horizon.startDate;
  const fixedSlots = courses
    .filter(c => sampleDate >= c.start_date && sampleDate <= c.end_date)
    .map(c => courseToSlot(c, sampleDate));

  // 把 todos + goals 转换为 OptimizableActivity
  const activities: OptimizableActivity[] = [
    ...todos.map<OptimizableActivity>(t => ({
      id: t.id,
      title: t.title,
      durationMin: 60,
      category: 'study',
      priority: t.priority,
      dueDate: t.due_date,
      preferredTimeOfDay: 'any',
    })),
    ...goals
      .filter(g => g.target_value && g.target_value > g.current_value)
      .map<OptimizableActivity>(g => ({
        id: g.id,
        title: `${g.title}（${g.current_value}/${g.target_value}${g.unit || ''}）`,
        durationMin: 90,
        category: g.category === 'exam' ? 'review' : g.category === 'skill' ? 'skill' : 'study',
        priority: 6,
        dueDate: g.due_date,
        preferredTimeOfDay: 'any',
      })),
  ];

  const input: ScheduleOptimizeInput = {
    fixedSlots,
    activities,
    horizon,
    dailyMaxMinutes: 240,
    minRestGap: 30,
  };

  // ⚠️ 调用禁飞区算法
  return optimizeSchedule(input);
}

/**
 * 记录一次学习（供 Agent / 前端调用）
 */
export interface LogStudyInput {
  category?: string;
  durationMin: number;
  note?: string;
  loggedDate?: string;
  courseId?: string;
  todoId?: string;
}

export function logStudy(input: LogStudyInput, userId = 'default') {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO study_logs (id, user_id, course_id, todo_id, category, duration_min, note, logged_date, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, userId, input.courseId || null, input.todoId || null,
    input.category || 'study', input.durationMin, input.note || null,
    input.loggedDate || new Date().toISOString().slice(0, 10),
    new Date().toISOString()
  );
  return { id };
}