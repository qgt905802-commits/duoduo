/**
 * 种子数据
 *
 * 用于应用首次启动时插入示例数据，便于演示和 AI 工具调用测试。
 * 真实部署中可禁用。
 */

import db from '../db.js';
import { createClassroom, listClassrooms, createCourse, listCourses } from '../services/schedule.js';

const SEED_FLAG_KEY = 'seed_data_initialized';

function isSeeded(): boolean {
  const row = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name='meta'
  `).get();
  if (!row) {
    db.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`);
  }
  const r = db.prepare('SELECT value FROM meta WHERE key = ?').get(SEED_FLAG_KEY) as
    | { value: string }
    | undefined;
  return r?.value === 'true';
}

function markSeeded(): void {
  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(SEED_FLAG_KEY, 'true');
}

export function seedIfNeeded(force = false): void {
  if (!force && isSeeded()) return;

  // 教室
  const classrooms = [
    { name: '教学楼 A101', building: '主楼', capacity: 80, facilities: ['投影', '空调', '麦克风'] },
    { name: '教学楼 A202', building: '主楼', capacity: 60, facilities: ['投影'] },
    { name: '教学楼 B301', building: '主楼', capacity: 120, facilities: ['投影', '空调'] },
    { name: '理工楼 201', building: '理工楼', capacity: 50, facilities: ['机房'] },
    { name: '理工楼 305', building: '理工楼', capacity: 45, facilities: ['机房', '实验台'] },
    { name: '文科楼 401', building: '文科楼', capacity: 90, facilities: ['投影'] },
    { name: '文科楼 508', building: '文科楼', capacity: 70, facilities: ['空调'] },
    { name: '图书馆研讨室 1', building: '图书馆', capacity: 12, facilities: ['白板'] },
    { name: '图书馆研讨室 2', building: '图书馆', capacity: 12, facilities: ['白板'] },
    { name: '体育馆', building: '体育中心', capacity: 200, facilities: ['运动器械'] },
  ];

  const existingClassrooms = listClassrooms();
  const classroomIdMap = new Map<string, string>();
  for (const c of classrooms) {
    if (existingClassrooms.find(e => e.name === c.name)) {
      const found = existingClassrooms.find(e => e.name === c.name)!;
      classroomIdMap.set(c.name, found.id);
    } else {
      const created = createClassroom({
        name: c.name,
        building: c.building,
        capacity: c.capacity,
        facilities: c.facilities,
        enrolled: 0,
      });
      classroomIdMap.set(c.name, created.id);
    }
  }

  // 课程（学期：本学期周一 ~ 第 18 周）
  const semesterStart = computeSemesterStart();
  const semesterEnd = computeSemesterEnd(semesterStart);

  const sampleCourses = [
    {
      title: '高等数学',
      teacher: '王老师',
      classroomName: '教学楼 A101',
      color: '#0052d9',
      weekday: 1,
      startMin: 8 * 60,
      endMin: 9 * 60 + 40,
    },
    {
      title: '大学英语',
      teacher: '李老师',
      classroomName: '教学楼 A202',
      color: '#2ba471',
      weekday: 1,
      startMin: 10 * 60,
      endMin: 11 * 60 + 40,
    },
    {
      title: '数据结构',
      teacher: '张老师',
      classroomName: '理工楼 201',
      color: '#ed7b2f',
      weekday: 2,
      startMin: 14 * 60,
      endMin: 15 * 60 + 40,
    },
    {
      title: '计算机网络',
      teacher: '陈老师',
      classroomName: '理工楼 305',
      color: '#e34d59',
      weekday: 3,
      startMin: 8 * 60,
      endMin: 9 * 60 + 40,
    },
    {
      title: '操作系统',
      teacher: '刘老师',
      classroomName: '理工楼 201',
      color: '#8b5cf6',
      weekday: 3,
      startMin: 10 * 60,
      endMin: 11 * 60 + 40,
    },
    {
      title: '马克思主义原理',
      teacher: '赵老师',
      classroomName: '文科楼 401',
      color: '#0ea5e9',
      weekday: 4,
      startMin: 14 * 60,
      endMin: 15 * 60 + 40,
    },
    {
      title: '体育',
      teacher: '孙老师',
      classroomName: '体育馆',
      color: '#10b981',
      weekday: 5,
      startMin: 14 * 60,
      endMin: 15 * 60 + 40,
    },
  ];

  const existingCourses = listCourses();
  if (existingCourses.length === 0) {
    for (const c of sampleCourses) {
      try {
        createCourse(
          {
            title: c.title,
            teacher: c.teacher,
            classroomId: classroomIdMap.get(c.classroomName),
            location: c.classroomName,
            color: c.color,
            weekday: c.weekday,
            startMin: c.startMin,
            endMin: c.endMin,
            startDate: semesterStart,
            endDate: semesterEnd,
            weeks: range(1, 18),
            source: 'manual',
          },
          'default'
        );
      } catch (e: any) {
        console.warn('[seed] 跳过冲突课程:', c.title, e.message);
      }
    }
  }

  markSeeded();
  console.log('[seed] ✓ 种子数据已写入');
}

function range(start: number, end: number): number[] {
  const result: number[] = [];
  for (let i = start; i <= end; i++) result.push(i);
  return result;
}

function computeSemesterStart(): string {
  // 找最近的周一作为学期开始
  const today = new Date();
  const day = today.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  today.setDate(today.getDate() + diff);
  return today.toISOString().slice(0, 10);
}

function computeSemesterEnd(startDate: string): string {
  const start = new Date(startDate);
  start.setDate(start.getDate() + 18 * 7 - 1);
  return start.toISOString().slice(0, 10);
}