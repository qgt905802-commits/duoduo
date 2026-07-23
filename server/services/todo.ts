/**
 * 待办事项（Todo）业务服务
 *
 * 待办独立于课程，支持：
 * - 优先级（1-5）
 * - 截止日期
 * - 状态（pending / in_progress / completed）
 * - 可关联课程
 */

import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';

export interface Todo {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  course_id?: string;
  priority: number;
  due_date?: string;
  status: 'pending' | 'in_progress' | 'completed';
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface CreateTodoInput {
  title: string;
  description?: string;
  courseId?: string;
  priority?: number;
  dueDate?: string;
}

export interface UpdateTodoInput {
  title?: string;
  description?: string;
  priority?: number;
  dueDate?: string;
  status?: Todo['status'];
}

function rowToTodo(row: any): Todo {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    description: row.description,
    course_id: row.course_id,
    priority: row.priority,
    due_date: row.due_date,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
  };
}

export function listTodos(filter: {
  userId?: string;
  status?: Todo['status'];
} = {}): Todo[] {
  const userId = filter.userId || 'default';
  let rows: any[];
  if (filter.status) {
    rows = db
      .prepare('SELECT * FROM todos WHERE user_id = ? AND status = ? ORDER BY priority DESC, due_date ASC')
      .all(userId, filter.status);
  } else {
    rows = db
      .prepare('SELECT * FROM todos WHERE user_id = ? ORDER BY priority DESC, due_date ASC')
      .all(userId);
  }
  return rows.map(rowToTodo);
}

export function getTodo(id: string): Todo | undefined {
  const row = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
  return row ? rowToTodo(row) : undefined;
}

export function createTodo(input: CreateTodoInput, userId = 'default'): Todo {
  const now = new Date().toISOString();
  const todo: Todo = {
    id: uuidv4(),
    user_id: userId,
    title: input.title,
    description: input.description,
    course_id: input.courseId,
    priority: input.priority || 3,
    due_date: input.dueDate,
    status: 'pending',
    created_at: now,
    updated_at: now,
  };

  db.prepare(`
    INSERT INTO todos (id, user_id, title, description, course_id, priority,
      due_date, status, created_at, updated_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    todo.id, todo.user_id, todo.title, todo.description, todo.course_id,
    todo.priority, todo.due_date, todo.status, todo.created_at, todo.updated_at, null
  );

  return todo;
}

export function updateTodo(id: string, updates: UpdateTodoInput): Todo {
  const existing = getTodo(id);
  if (!existing) throw new Error('待办不存在');

  const merged: Todo = {
    ...existing,
    title: updates.title ?? existing.title,
    description: updates.description ?? existing.description,
    priority: updates.priority ?? existing.priority,
    due_date: updates.dueDate ?? existing.due_date,
    status: updates.status ?? existing.status,
    completed_at: updates.status === 'completed' && existing.status !== 'completed'
      ? new Date().toISOString()
      : updates.status && updates.status !== 'completed'
      ? undefined
      : existing.completed_at,
    updated_at: new Date().toISOString(),
  };

  db.prepare(`
    UPDATE todos SET title=?, description=?, priority=?, due_date=?,
      status=?, completed_at=?, updated_at=? WHERE id=?
  `).run(
    merged.title, merged.description, merged.priority, merged.due_date,
    merged.status, merged.completed_at, merged.updated_at, id
  );

  return merged;
}

export function deleteTodo(id: string): boolean {
  const result = db.prepare('DELETE FROM todos WHERE id = ?').run(id);
  return result.changes > 0;
}

export function todoStats(userId = 'default') {
  const rows = db.prepare(`
    SELECT status, COUNT(*) as cnt FROM todos WHERE user_id = ? GROUP BY status
  `).all(userId) as Array<{ status: string; cnt: number }>;

  const byStatus: Record<string, number> = { pending: 0, in_progress: 0, completed: 0 };
  let total = 0;
  for (const r of rows) {
    byStatus[r.status] = r.cnt;
    total += r.cnt;
  }

  const overdueRow = db.prepare(`
    SELECT COUNT(*) as cnt FROM todos
    WHERE user_id = ? AND status != 'completed'
    AND due_date IS NOT NULL AND due_date < ?
  `).get(userId, new Date().toISOString()) as { cnt: number };

  return {
    total,
    pending: byStatus.pending,
    in_progress: byStatus.in_progress,
    completed: byStatus.completed,
    overdue: overdueRow.cnt,
  };
}