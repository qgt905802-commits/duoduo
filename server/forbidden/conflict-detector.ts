/**
 * ============================================================================
 * ⚠️ AI 禁飞区 #1：课表冲突检测算法
 * ============================================================================
 *
 * 业务背景：
 *   用户新增 / 编辑课程时，需要校验是否会与现有课程发生时间冲突、
 *   同一教室是否被双重占用、同一教师是否被双重排课。
 *
 * 触发时机：
 *   server/services/schedule.ts → createCourse / updateCourse 持久化前调用
 *
 * 实现思路：
 *   逐对 O(N²) 比较（N 为学生课程数量，通常 < 50 门，可接受）。
 *   如需优化为 O(N log N)，可改为扫描线算法。
 *
 * ============================================================================
 */

import type {
  CourseSlot,
  ConflictReport,
  ConflictDetail,
  TimeRange,
} from './types.js';

export function detectConflicts(
  candidate: CourseSlot,
  existing: CourseSlot[],
  classroomCapacity?: number,
  enrolled?: number
): ConflictReport {
  const conflicts: ConflictDetail[] = [];

  const logPrefix = `[ConflictDetector] course=${candidate.courseId}`;
  console.log(`${logPrefix} 开始检测... 现有 ${existing.length} 门课`);

  // ── 1. 时间重叠检测 ──
  for (const e of existing) {
    if (e.courseId === candidate.courseId) continue;
    if (!rangesOverlap(candidate.range, e.range)) continue;

    // 仅报告同一日期的重叠（跨日期不报）
    conflicts.push({
      type: 'time_overlap',
      severity: 'error',
      message: `与「${e.title}」（${formatRange(e.range)}）时间重叠`,
      involvedCourseIds: [candidate.courseId, e.courseId],
      range: {
        date: candidate.range.date,
        startMin: Math.min(candidate.range.startMin, e.range.startMin),
        endMin: Math.max(candidate.range.endMin, e.range.endMin),
      },
    });
  }

  // ── 2. 教室占用检测 ──
  if (candidate.classroomId) {
    const sameRoom = existing.filter(
      e => e.classroomId === candidate.classroomId && e.courseId !== candidate.courseId
    );
    for (const e of sameRoom) {
      if (rangesOverlap(candidate.range, e.range)) {
        conflicts.push({
          type: 'classroom_busy',
          severity: 'error',
          message: `教室已被「${e.title}」占用（${formatRange(e.range)}）`,
          involvedCourseIds: [candidate.courseId, e.courseId],
          range: {
            date: candidate.range.date,
            startMin: Math.min(candidate.range.startMin, e.range.startMin),
            endMin: Math.max(candidate.range.endMin, e.range.endMin),
          },
        });
      }
    }
  }

  // ── 3. 教师冲突检测 ──
  if (candidate.teacher) {
    const sameTeacher = existing.filter(
      e => e.teacher === candidate.teacher && e.courseId !== candidate.courseId
    );
    for (const e of sameTeacher) {
      if (rangesOverlap(candidate.range, e.range)) {
        conflicts.push({
          type: 'teacher_busy',
          severity: 'error',
          message: `教师「${candidate.teacher}」已有「${e.title}」课程（${formatRange(e.range)}）`,
          involvedCourseIds: [candidate.courseId, e.courseId],
          range: {
            date: candidate.range.date,
            startMin: Math.min(candidate.range.startMin, e.range.startMin),
            endMin: Math.max(candidate.range.endMin, e.range.endMin),
          },
        });
      }
    }
  }

  // ── 4. 容量检测 ──
  if (typeof classroomCapacity === 'number' && typeof enrolled === 'number') {
    if (enrolled > classroomCapacity) {
      conflicts.push({
        type: 'capacity_exceeded',
        severity: 'warning',
        message: `教室容量 ${classroomCapacity} 人，已选 ${enrolled} 人（超出 ${enrolled - classroomCapacity} 人）`,
        involvedCourseIds: [candidate.courseId],
        range: candidate.range,
      });
    }
  }

  // ── 构建报告 ──
  const hasConflict = conflicts.length > 0;
  const summary = hasConflict
    ? `${conflicts.length} 项冲突：${conflicts.map(c => `[${c.type}] ${c.message}`).join('；')}`
    : '无冲突';

  console.log(
    `${logPrefix} 检测完成：hasConflict=${hasConflict}, conflicts=${conflicts.length}`
  );

  return { hasConflict, conflicts, summary };
}

/**
 * 判断两个时间区间是否重叠（半开区间，同一天）
 *
 * 规则：startMin === endMin 不算重叠；
 *       上一节结束 === 下一节开始不算重叠（如 09:35-09:50 两节课间隔 15 分钟）。
 */
export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  if (a.date !== b.date) return false;
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

/**
 * 扫描线算法：在合并后的区间列表中找出所有时间重叠对。
 *
 * 时间复杂度 O(N log N)，可用于批量检测。
 * 步骤：
 *   1. 按 date 分组
 *   2. 组内按 startMin 升序排序
 *   3. 维护当前最大的 endMin，遍历每个区间：
 *      - 若 startMin < maxEnd，与持有 maxEnd 的区间重叠
 *      - 否则更新 maxEnd 为当前 endMin
 *
 * 返回所有成对冲突。
 */
export function findTimeOverlaps(slots: CourseSlot[]): ConflictDetail[] {
  const result: ConflictDetail[] = [];

  // 按日期分组
  const byDate = new Map<string, CourseSlot[]>();
  for (const s of slots) {
    const arr = byDate.get(s.range.date) || [];
    arr.push(s);
    byDate.set(s.range.date, arr);
  }

  for (const group of Array.from(byDate.values())) {
    // 按 startMin 升序
    group.sort((a: CourseSlot, b: CourseSlot) => a.range.startMin - b.range.startMin);

    // 扫描线
    let maxHolder: CourseSlot | null = null;
    let maxEnd = 0;

    for (const curr of group) {
      if (maxHolder && curr.range.startMin < maxEnd) {
        // 重叠！
        result.push({
          type: 'time_overlap',
          severity: 'error',
          message: `「${curr.title}」与「${maxHolder.title}」时间重叠（${formatRange(curr.range)} ↔ ${formatRange(maxHolder.range)}）`,
          involvedCourseIds: [curr.courseId, maxHolder.courseId],
          range: {
            date: curr.range.date,
            startMin: Math.min(curr.range.startMin, maxHolder.range.startMin),
            endMin: Math.max(curr.range.endMin, maxEnd),
          },
        });
        // 继续更新最大 end（可能有多个重叠）
      }

      if (curr.range.endMin > maxEnd) {
        maxEnd = curr.range.endMin;
        maxHolder = curr;
      }
    }
  }

  return result;
}

/** 格式化时间区间为 HH:MM-HH:MM */
function formatRange(r: TimeRange): string {
  const s = `${pad2(Math.floor(r.startMin / 60))}:${pad2(r.startMin % 60)}`;
  const e = `${pad2(Math.floor(r.endMin / 60))}:${pad2(r.endMin % 60)}`;
  return `${s}-${e}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}