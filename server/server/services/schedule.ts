/**
 * 课表业务服务
 *
 * - 数据 CRUD：courses、classrooms
 * - 写入前调用禁飞区算法校验冲突
 * - 调用禁飞区缓存层查询空闲教室
 * - 缓存失效：课程写入时调用 invalidate
 */

import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';
import {
  detectConflicts,
} from '../forbidden/conflict-detector.js';
import {
  queryFreeClassrooms,
  invalidate,
} from '../forbidden/classroom-cache.js';
import type {
  FreeClassroomQuery,
  FreeClassroomResult,
} from '../forbidden/classroom-cache.js';
import type { ConflictReport } from '../forbidden/types.js';

// ============= 类型 =============

export interface Classroom {
  id: string;
  name: string;
  building?: string;
  capacity: number;
  facilities: string[];
  enrolled: number;
  created_at: string;
}

export interface Course {
  id: string;
  user_id: string;
  title: string;
  teacher?: string;
  location?: string;
  classroom_id?: string;
  color?: string;
  weekday: number;
  start_min: number;
  end_min: number;
  start_date: string;
  end_date: string;
  weeks?: number[];
  note?: string;
  source: 'manual' | 'ai_generated';
  created_at: string;
  updated_at: string;
}

export interface CreateCourseInput {
  title: string;
  teacher?: string;
  location?: string;
  classroomId?: string;
  color?: string;
  weekday: number;
  startMin: number;
  endMin: number;
  startDate: string;
  endDate: string;
  weeks?: number[];
  note?: string;
  source?: 'manual' | 'ai_generated';
  /** 是否跳过冲突检测（用于 AI 批量导入时的二次确认场景） */
  skipConflictCheck?: boolean;
}

export class ConflictError extends Error {
  constructor(public report: ConflictReport) {
    super(report.summary);
    this.name = 'ConflictError';
  }
}

// ============= Classroom CRUD =============

function rowToClassroom(row: any): Classroom {
  return {
    id: row.id,
    name: row.name,
    building: row.building,
    capacity: row.capacity,
    facilities: row.facilities ? JSON.parse(row.facilities) : [],
    enrolled: row.enrolled,
    created_at: row.created_at,
  };
}

export function listClassrooms(): Classroom[] {
  const rows = db.prepare('SELECT * FROM classrooms ORDER BY building, name').all();
  return rows.map(rowToClassroom);
}

export function getClassroom(id: string): Classroom | undefined {
  const row = db.prepare('SELECT * FROM classrooms WHERE id = ?').get(id);
  return row ? rowToClassroom(row) : undefined;
}

export function createClassroom(input: Omit<Classroom, 'id' | 'created_at'>): Classroom {
  const classroom: Classroom = {
    ...input,
    id: uuidv4(),
    created_at: new Date().toISOString(),
  };
  db.prepare(`
    INSERT INTO classrooms (id, name, building, capacity, facilities, enrolled, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    classroom.id,
    classroom.name,
    classroom.building,
    classroom.capacity,
    JSON.stringify(classroom.facilities),
    classroom.enrolled,
    classroom.created_at
  );
  return classroom;
}

// ============= Course CRUD =============

function rowToCourse(row: any): Course {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    teacher: row.teacher,
    location: row.location,
    classroom_id: row.classroom_id,
    color: row.color,
    weekday: row.weekday,
    start_min: row.start_min,
    end_min: row.end_min,
    start_date: row.start_date,
    end_date: row.end_date,
    weeks: row.weeks ? JSON.parse(row.weeks) : undefined,
    note: row.note,
    source: row.source,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function courseToSlot(course: Course, date: string) {
  return {
    courseId: course.id,
    title: course.title,
    teacher: course.teacher,
    location: course.location,
    classroomId: course.classroom_id,
    range: {
      date,
      startMin: course.start_min,
      endMin: course.end_min,
    },
  };
}

/**
 * 周次计算：根据课程 start_date + 当前周数，反推本周日期
 * 用于冲突检测时构造「具体日期」
 */
export function dateOfWeek(course: Course, year: number, week: number): string {
  // 简化：根据课程首日所在周的周次计算
  const start = new Date(course.start_date);
  const dayOffset = (week - 1) * 7 + (course.weekday === 0 ? 6 : course.weekday - 1);
  const target = new Date(start);
  target.setDate(start.getDate() + dayOffset);
  return target.toISOString().slice(0, 10);
}

export function listCourses(userId = 'default'): Course[] {
  const rows = db
    .prepare('SELECT * FROM courses WHERE user_id = ? ORDER BY weekday, start_min')
    .all(userId);
  return rows.map(rowToCourse);
}

export function getCourse(id: string): Course | undefined {
  const row = db.prepare('SELECT * FROM courses WHERE id = ?').get(id);
  return row ? rowToCourse(row) : undefined;
}

export function createCourse(input: CreateCourseInput, userId = 'default'): Course {
  const now = new Date().toISOString();
  const course: Course = {
    id: uuidv4(),
    user_id: userId,
    title: input.title,
    teacher: input.teacher,
    location: input.location,
    classroom_id: input.classroomId,
    color: input.color,
    weekday: input.weekday,
    start_min: input.startMin,
    end_min: input.endMin,
    start_date: input.startDate,
    end_date: input.endDate,
    weeks: input.weeks,
    note: input.note,
    source: input.source || 'manual',
    created_at: now,
    updated_at: now,
  };

  // ⚠️ 调用禁飞区：冲突检测
  if (!input.skipConflictCheck) {
    const existing = listCourses(userId);
    // 取第一周作为冲突检测基准
    const sampleDate = dateOfWeek(course, 0, 1);
    const existingSlots = existing.flatMap(c =>
      c.weekday === course.weekday ? [courseToSlot(c, sampleDate)] : []
    );
    const candidateSlot = courseToSlot(course, sampleDate);

    const report = detectConflicts(candidateSlot, existingSlots);
    if (report.hasConflict) {
      throw new ConflictError(report);
    }
  }

  db.prepare(`
    INSERT INTO courses (id, user_id, title, teacher, location, classroom_id, color,
      weekday, start_min, end_min, start_date, end_date, weeks, note, source,
      created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    course.id, course.user_id, course.title, course.teacher, course.location,
    course.classroom_id, course.color, course.weekday, course.start_min, course.end_min,
    course.start_date, course.end_date,
    course.weeks ? JSON.stringify(course.weeks) : null,
    course.note, course.source, course.created_at, course.updated_at
  );

  // ⚠️ 失效相关缓存
  if (course.classroom_id) {
    invalidate(course.classroom_id);
  }

  return course;
}

export function updateCourse(
  id: string,
  updates: Partial<CreateCourseInput>,
  userId = 'default'
): Course {
  const existing = getCourse(id);
  if (!existing) throw new Error('课程不存在');

  const merged: Course = {
    ...existing,
    ...updates,
    classroom_id: updates.classroomId ?? existing.classroom_id,
    start_min: updates.startMin ?? existing.start_min,
    end_min: updates.endMin ?? existing.end_min,
    weekday: updates.weekday ?? existing.weekday,
    updated_at: new Date().toISOString(),
  };

  // ⚠️ 调用禁飞区：冲突检测（排除自身）
  if (!updates.skipConflictCheck) {
    const others = listCourses(userId).filter(c => c.id !== id);
    const sampleDate = dateOfWeek(merged, 0, 1);
    const existingSlots = others.flatMap(c =>
      c.weekday === merged.weekday ? [courseToSlot(c, sampleDate)] : []
    );
    const candidateSlot = courseToSlot(merged, sampleDate);
    const report = detectConflicts(candidateSlot, existingSlots);
    if (report.hasConflict) {
      throw new ConflictError(report);
    }
  }

  db.prepare(`
    UPDATE courses SET title=?, teacher=?, location=?, classroom_id=?, color=?,
      weekday=?, start_min=?, end_min=?, start_date=?, end_date=?, weeks=?,
      note=?, updated_at=? WHERE id=?
  `).run(
    merged.title, merged.teacher, merged.location, merged.classroom_id, merged.color,
    merged.weekday, merged.start_min, merged.end_min, merged.start_date, merged.end_date,
    merged.weeks ? JSON.stringify(merged.weeks) : null, merged.note, merged.updated_at, id
  );

  // 失效缓存
  if (existing.classroom_id) invalidate(existing.classroom_id);
  if (merged.classroom_id && merged.classroom_id !== existing.classroom_id) {
    invalidate(merged.classroom_id);
  }

  return merged;
}

export function deleteCourse(id: string): boolean {
  const course = getCourse(id);
  if (!course) return false;
  const result = db.prepare('DELETE FROM courses WHERE id = ?').run(id);
  if (course.classroom_id) invalidate(course.classroom_id);
  return result.changes > 0;
}

// ============= 空闲教室查询（业务封装） =============

export async function findFreeClassrooms(
  query: FreeClassroomQuery
): Promise<FreeClassroomResult[]> {
  const all = listClassrooms();
  // ⚠️ 调用禁飞区：空闲教室缓存
  return queryFreeClassrooms(query, all);
}

// ============= 批量 AI 生成 =============

export interface BulkInsertResult {
  inserted: Course[];
  failed: Array<{ input: CreateCourseInput; reason: string }>;
}

export function bulkCreateCourses(
  inputs: CreateCourseInput[],
  userId = 'default'
): BulkInsertResult {
  const inserted: Course[] = [];
  const failed: BulkInsertResult['failed'] = [];

  // 关闭冲突检测进行批量插入，规避「后一个的冲突由前一个引发」的级联失败
  const existing = listCourses(userId);

  for (const input of inputs) {
    try {
      // 临时合并已有 + 已插入 作为冲突检测上下文
      const merged = [...existing, ...inserted];
      const candidate = {
        id: uuidv4(),
        user_id: userId,
        title: input.title,
        teacher: input.teacher,
        location: input.location,
        classroom_id: input.classroomId,
        weekday: input.weekday,
        start_min: input.startMin,
        end_min: input.endMin,
        start_date: input.startDate,
        end_date: input.endDate,
        weeks: input.weeks,
        source: input.source || 'ai_generated',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as Course;
      const sampleDate = dateOfWeek(merged[0] || candidate, 0, 1);
      const existingSlots = merged.flatMap(c =>
        c.weekday === candidate.weekday ? [courseToSlot(c, sampleDate)] : []
      );
      const candidateSlot = courseToSlot(candidate, sampleDate);
      const report = detectConflicts(candidateSlot, existingSlots);
      if (report.hasConflict) {
        failed.push({ input, reason: report.summary });
        continue;
      }

      // 通过检测后真正插入
      const course = createCourse(input, userId);
      inserted.push(course);
    } catch (e: any) {
      failed.push({ input, reason: e.message || '未知错误' });
    }
  }

  return { inserted, failed };
}