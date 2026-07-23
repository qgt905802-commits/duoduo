/**
 * 学习目标（Goal）业务服务
 *
 * 支持：
 * - 类别（study / skill / exam / other）
 * - 量化目标（current_value / target_value + unit）
 * - 时间窗口（start_date / due_date）
 * - 自动进度（外部 updateProgress）
 */

import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';

export interface Goal {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  category: 'study' | 'skill' | 'exam' | 'other';
  target_value?: number;
  current_value: number;
  unit?: string;
  start_date: string;
  due_date: string;
  status: 'active' | 'completed' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface CreateGoalInput {
  title: string;
  description?: string;
  category?: Goal['category'];
  targetValue?: number;
  unit?: string;
  startDate: string;
  dueDate: string;
}

export interface UpdateGoalInput {
  title?: string;
  description?: string;
  category?: Goal['category'];
  targetValue?: number;
  currentValue?: number;
  unit?: string;
  dueDate?: string;
  status?: Goal['status'];
}

function rowToGoal(row: any): Goal {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    description: row.description,
    category: row.category,
    target_value: row.target_value,
    current_value: row.current_value,
    unit: row.unit,
    start_date: row.start_date,
    due_date: row.due_date,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function listGoals(filter: { userId?: string; status?: Goal['status'] } = {}): Goal[] {
  const userId = filter.userId || 'default';
  let rows: any[];
  if (filter.status) {
    rows = db
      .prepare('SELECT * FROM goals WHERE user_id = ? AND status = ? ORDER BY due_date ASC')
      .all(userId, filter.status);
  } else {
    rows = db
      .prepare('SELECT * FROM goals WHERE user_id = ? ORDER BY due_date ASC')
      .all(userId);
  }
  return rows.map(rowToGoal);
}

export function getGoal(id: string): Goal | undefined {
  const row = db.prepare('SELECT * FROM goals WHERE id = ?').get(id);
  return row ? rowToGoal(row) : undefined;
}

export function createGoal(input: CreateGoalInput, userId = 'default'): Goal {
  const now = new Date().toISOString();
  const goal: Goal = {
    id: uuidv4(),
    user_id: userId,
    title: input.title,
    description: input.description,
    category: input.category || 'study',
    target_value: input.targetValue,
    current_value: 0,
    unit: input.unit,
    start_date: input.startDate,
    due_date: input.dueDate,
    status: 'active',
    created_at: now,
    updated_at: now,
  };

  db.prepare(`
    INSERT INTO goals (id, user_id, title, description, category, target_value,
      current_value, unit, start_date, due_date, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    goal.id, goal.user_id, goal.title, goal.description, goal.category,
    goal.target_value, goal.current_value, goal.unit, goal.start_date,
    goal.due_date, goal.status, goal.created_at, goal.updated_at
  );

  return goal;
}

export function updateGoal(id: string, updates: UpdateGoalInput): Goal {
  const existing = getGoal(id);
  if (!existing) throw new Error('目标不存在');

  const merged: Goal = {
    ...existing,
    title: updates.title ?? existing.title,
    description: updates.description ?? existing.description,
    category: updates.category ?? existing.category,
    target_value: updates.targetValue ?? existing.target_value,
    current_value: updates.currentValue ?? existing.current_value,
    unit: updates.unit ?? existing.unit,
    due_date: updates.dueDate ?? existing.due_date,
    status: updates.status ?? existing.status,
    updated_at: new Date().toISOString(),
  };

  // 自动转 completed
  if (
    merged.target_value &&
    merged.current_value >= merged.target_value &&
    merged.status === 'active'
  ) {
    merged.status = 'completed';
  }

  db.prepare(`
    UPDATE goals SET title=?, description=?, category=?, target_value=?,
      current_value=?, unit=?, due_date=?, status=?, updated_at=? WHERE id=?
  `).run(
    merged.title, merged.description, merged.category, merged.target_value,
    merged.current_value, merged.unit, merged.due_date, merged.status,
    merged.updated_at, id
  );

  return merged;
}

export function deleteGoal(id: string): boolean {
  const result = db.prepare('DELETE FROM goals WHERE id = ?').run(id);
  return result.changes > 0;
}