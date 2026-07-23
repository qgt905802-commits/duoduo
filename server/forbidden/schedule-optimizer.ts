/**
 * ============================================================================
 * ⚠️ AI 禁飞区 #3：日程优化多约束求解
 * ============================================================================
 *
 * 业务背景：
 *   给定学生已有的固定课程 + 待完成的待办事项/学习目标，
 *   在时间窗内自动排布学习计划，尽可能完成所有活动，
 *   约束每日学习上限、休息间隙等。
 *
 * 算法：贪心调度
 *   1. 生成 timeGrid：每天拆为 30 分钟时隙
 *   2. 标记 fixedSlots 占用的时隙为不可用
 *   3. 活动按 priority DESC + deadline ASC + duration ASC 排序
 *   4. 贪心匹配：对每个活动，扫描 timeGrid 找到最早可用连续空闲时段
 *   5. 如活动指定 preferedTimeOfDay，优先该时段
 *   6. 评分：排入率 + 每日均衡度
 *
 * 触发时机：
 *   server/services/stats.ts → generateStudyPlan
 *
 * ============================================================================
 */

import type {
  CourseSlot,
  OptimizableActivity,
  OptimizedSlot,
  ScheduleOptimizeInput,
  ScheduleOptimizeResult,
  TimeRange,
} from './types.js';

/** 时隙粒度（分钟） */
const SLOT_GRANULARITY = 30;

/** 每天开始 / 结束分钟数 */
const DAY_START_MIN = 8 * 60;    // 08:00
const DAY_END_MIN = 22 * 60;     // 22:00

/** 时段划分 */
function timeOfDay(min: number): 'morning' | 'afternoon' | 'evening' {
  if (min < 12 * 60) return 'morning';
  if (min < 18 * 60) return 'afternoon';
  return 'evening';
}

/** 格式化分钟 → HH:MM */
function fmtMin(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** 生成日期范围 YYYY-MM-DD */
function dateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cur = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

export async function optimizeSchedule(
  input: ScheduleOptimizeInput
): Promise<ScheduleOptimizeResult> {
  const t0 = Date.now();
  const {
    fixedSlots = [],
    activities = [],
    horizon,
    dailyMaxMinutes = 240,
    minRestGap = 30,
  } = input;

  console.log(
    `[ScheduleOptimizer] 开始优化：fixedSlots=${fixedSlots.length}, activities=${activities.length}, ${horizon.startDate} ~ ${horizon.endDate}, dailyMax=${dailyMaxMinutes}min, restGap=${minRestGap}min`
  );

  const diagnostics: string[] = [];
  const dates = dateRange(horizon.startDate, horizon.endDate);
  const slots: OptimizedSlot[] = [];
  const unassigned: Array<{ activityId: string; reason: string }> = [];

  // ── 1. 构建 timeGrid ──
  // timeGrid[date][slotIndex] = { startMin, endMin, occupied: boolean }
  const slotsPerDay = Math.floor((DAY_END_MIN - DAY_START_MIN) / SLOT_GRANULARITY);
  const timeGrid = new Map<string, Array<{ startMin: number; endMin: number; occupied: boolean }>>();

  for (const date of dates) {
    const daySlots: Array<{ startMin: number; endMin: number; occupied: boolean }> = [];
    for (let i = 0; i < slotsPerDay; i++) {
      const startMin = DAY_START_MIN + i * SLOT_GRANULARITY;
      const endMin = Math.min(startMin + SLOT_GRANULARITY, DAY_END_MIN);
      daySlots.push({ startMin, endMin, occupied: false });
    }
    timeGrid.set(date, daySlots);
  }

  // ── 2. 标记固定课程占用 ──
  for (const fixed of fixedSlots) {
    const dayGrid = timeGrid.get(fixed.range.date);
    if (!dayGrid) continue;
    for (let i = 0; i < dayGrid.length; i++) {
      const slot = dayGrid[i];
      if (slot.startMin < fixed.range.endMin && slot.endMin > fixed.range.startMin) {
        // 时隙与课程有交集 → 标记占用
        slot.occupied = true;
      }
    }
    // 加上前后休息间隙
    const gapSlots = Math.ceil(minRestGap / SLOT_GRANULARITY);
    const restStart = -Math.floor((DAY_START_MIN - (fixed.range.startMin - minRestGap)) / SLOT_GRANULARITY);
    for (let j = -gapSlots; j <= 0; j++) {
      const idx = dayGrid.findIndex(s => s.startMin >= fixed.range.startMin) - 1 + j;
      if (idx >= 0 && idx < dayGrid.length) dayGrid[idx].occupied = true;
    }
    for (let j = 1; j <= gapSlots; j++) {
      const idx = dayGrid.findIndex(s => s.startMin >= fixed.range.endMin) + j - 1;
      if (idx >= 0 && idx < dayGrid.length) dayGrid[idx].occupied = true;
    }
  }

  // ── 3. 每日已用时统计 ──
  const dailyMinutes = new Map<string, number>();
  for (const date of dates) dailyMinutes.set(date, 0);

  // ── 4. 活动排序 ──
  // priority DESC → deadline ASC → duration ASC
  const sorted = [...activities].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return a.durationMin - b.durationMin;
  });

  // ── 5. 贪心匹配 ──
  for (const activity of sorted) {
    let bestSlot: OptimizedSlot | null = null;

    // 如果活动有时段偏好，生成优先顺序
    const dateOrder = [...dates];
    if (activity.dueDate) {
      // 截止日期前的日期优先
      dateOrder.sort((a, b) => {
        const aBefore = a <= activity.dueDate! ? 0 : 1;
        const bBefore = b <= activity.dueDate! ? 0 : 1;
        if (aBefore !== bBefore) return aBefore - bBefore;
        return a.localeCompare(b);
      });
    }

    for (const date of dateOrder) {
      const dayGrid = timeGrid.get(date);
      if (!dayGrid) continue;

      const remaining = dailyMaxMinutes - (dailyMinutes.get(date) || 0);
      if (remaining < activity.durationMin) continue; // 这天已超上限

      // 需要的连续时隙数
      const needed = Math.ceil(activity.durationMin / SLOT_GRANULARITY);

      for (let i = 0; i <= dayGrid.length - needed; i++) {
        // 如果偏好 morning/afternoon/evening，只扫描对应区域
        const slotTimeOfDay = timeOfDay(dayGrid[i].startMin);
        if (
          activity.preferredTimeOfDay &&
          activity.preferredTimeOfDay !== 'any' &&
          slotTimeOfDay !== activity.preferredTimeOfDay
        ) {
          continue;
        }

        // 检查连续 needed 个时隙是否都空闲
        let allFree = true;
        for (let j = 0; j < needed; j++) {
          if (dayGrid[i + j].occupied) {
            allFree = false;
            break;
          }
        }

        if (allFree) {
          const startMin = dayGrid[i].startMin;
          const endMin = Math.min(
            dayGrid[i + needed - 1].endMin,
            startMin + activity.durationMin
          );

          bestSlot = {
            date,
            startMin,
            endMin,
            activityId: activity.id,
            reason: `优先级 ${activity.priority}/10，合适`,
          };
          break;
        }
      }

      if (bestSlot) {
        // 标记时隙为占用
        const resultIdx = dayGrid.findIndex(s => s.startMin >= bestSlot!.startMin);
        const neededSlots = Math.ceil(
          (bestSlot.endMin - bestSlot.startMin) / SLOT_GRANULARITY
        );
        for (let j = 0; j < neededSlots; j++) {
          const idx = resultIdx + j;
          if (idx >= 0 && idx < dayGrid.length) {
            dayGrid[idx].occupied = true;
          }
        }

        // 更新每日用时
        dailyMinutes.set(date, (dailyMinutes.get(date) || 0) + activity.durationMin);
        break;
      }
    }

    if (bestSlot) {
      slots.push(bestSlot);
      console.log(
        `[ScheduleOptimizer] ✓ ${activity.title} → ${bestSlot.date} ${fmtMin(bestSlot.startMin)}-${fmtMin(bestSlot.endMin)}`
      );
    } else {
      // 找原因
      let reason = '无可用时段';
      // 检查是否因为偏好限制
      if (activity.preferredTimeOfDay && activity.preferredTimeOfDay !== 'any') {
        reason = `时段偏好限制（${activity.preferredTimeOfDay}），剩余时段超出每日上限`;
      }
      // 检查是否因为 deadline 已过
      if (activity.dueDate && dates.every(d => d > activity.dueDate!)) {
        reason = '截止日期已过';
      }
      // 检查是否超出每日上限
      const totalAvail = dates.length * dailyMaxMinutes;
      const totalBusy = Array.from(dailyMinutes.values()).reduce((a, b) => a + b, 0);
      if (totalAvail - totalBusy < activity.durationMin) {
        reason = `时间窗总容量不足（可用 ${totalAvail - totalBusy}min，需 ${activity.durationMin}min）`;
      }

      unassigned.push({ activityId: activity.id, reason });
      console.log(
        `[ScheduleOptimizer] ✗ ${activity.title}: ${reason}`
      );
    }
  }

  // ── 6. 健康度评分 ──
  const score = computeHealthScore(activities.length, slots.length, dates, dailyMinutes, dailyMaxMinutes);

  const elapsed = Date.now() - t0;
  console.log(
    `[ScheduleOptimizer] 完成：${slots.length}/${activities.length} 排入, healthScore=${score}, 耗时 ${elapsed}ms`
  );

  if (unassigned.length > 0) {
    diagnostics.push(
      `${unassigned.length} 项未排入：${unassigned.map(u => u.reason).join('；')}`
    );
  }
  diagnostics.push(
    `总时窗 ${dates.length} 天 × 每日 ${dailyMaxMinutes}min = ${dates.length * dailyMaxMinutes / 60}h`
  );

  return {
    slots,
    unassigned,
    healthScore: score,
    diagnostics,
  };
}

/**
 * 健康度评分
 *
 * 100 分制：
 *   - 排入率占 60 分（全部排入 = 60）
 *   - 每日均衡度占 25 分（每天用时标准差低 = 25）
 *   - 紧急性覆盖占 15 分（高优先级全部排入 = 15）
 */
function computeHealthScore(
  total: number,
  assigned: number,
  dates: string[],
  dailyMinutes: Map<string, number>,
  dailyMaxMinutes: number
): number {
  if (total === 0) return 100;

  // 排入率（满分 60）
  const rate = Math.min(1, assigned / total);
  const rateScore = Math.round(rate * 60);

  // 每日均衡度（满分 25）
  let balanceScore = 25;
  if (dates.length >= 2 && assigned > 0) {
    const avg = Array.from(dailyMinutes.values()).reduce((a, b) => a + b, 0) / dates.length;
    const variance =
      Array.from(dailyMinutes.values())
        .map(v => (v - avg) ** 2)
        .reduce((a, b) => a + b, 0) / dates.length;
    const stdDev = Math.sqrt(variance);
    // 标准差 <= avg * 0.3 → 满分；stdDev >= avg * 0.8 → 0 分
    if (avg > 0) {
      const ratio = stdDev / avg;
      balanceScore = Math.round(Math.max(0, 25 - (ratio - 0.3) / 0.5 * 25));
    }
  }

  // 紧急性覆盖（满分 15）
  // 简化为：只要至少排入了 80% → 满分
  const urgencyScore = rate >= 0.8 ? 15 : Math.round(rate * 15);

  return Math.min(100, rateScore + balanceScore + urgencyScore);
}