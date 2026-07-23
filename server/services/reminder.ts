/**
 * 提醒服务
 *
 * 提供基础 CRUD；前端轮询触发列表用于弹窗提醒
 */

import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';

export interface Reminder {
  id: string;
  user_id: string;
  title: string;
  trigger_at: string;
  type: 'once' | 'daily' | 'weekly';
  ref_id?: string;
  ref_type?: 'todo' | 'goal' | 'course';
  status: 'pending' | 'fired' | 'cancelled';
  created_at: string;
}

export interface CreateReminderInput {
  title: string;
  triggerAt: string;
  type?: Reminder['type'];
  refId?: string;
  refType?: Reminder['ref_type'];
}

function rowToReminder(row: any): Reminder {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    trigger_at: row.trigger_at,
    type: row.type,
    ref_id: row.ref_id,
    ref_type: row.ref_type,
    status: row.status,
    created_at: row.created_at,
  };
}

export function listReminders(userId = 'default'): Reminder[] {
  const rows = db
    .prepare('SELECT * FROM reminders WHERE user_id = ? ORDER BY trigger_at ASC')
    .all(userId);
  return rows.map(rowToReminder);
}

export function listPendingReminders(userId = 'default'): Reminder[] {
  const now = new Date().toISOString();
  const rows = db
    .prepare(`
      SELECT * FROM reminders
      WHERE user_id = ? AND status = 'pending' AND trigger_at <= ?
      ORDER BY trigger_at ASC
    `)
    .all(userId, now);
  return rows.map(rowToReminder);
}

export function createReminder(input: CreateReminderInput, userId = 'default'): Reminder {
  const r: Reminder = {
    id: uuidv4(),
    user_id: userId,
    title: input.title,
    trigger_at: input.triggerAt,
    type: input.type || 'once',
    ref_id: input.refId,
    ref_type: input.refType,
    status: 'pending',
    created_at: new Date().toISOString(),
  };
  db.prepare(`
    INSERT INTO reminders (id, user_id, title, trigger_at, type, ref_id, ref_type, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(r.id, r.user_id, r.title, r.trigger_at, r.type, r.ref_id, r.ref_type, r.status, r.created_at);
  return r;
}

export function markFired(id: string): boolean {
  const result = db
    .prepare(`UPDATE reminders SET status = 'fired' WHERE id = ?`)
    .run(id);
  return result.changes > 0;
}

export function cancelReminder(id: string): boolean {
  const result = db
    .prepare(`UPDATE reminders SET status = 'cancelled' WHERE id = ?`)
    .run(id);
  return result.changes > 0;
}