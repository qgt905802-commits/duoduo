/**
 * ============================================================================
 * AI 禁飞区 - 类型定义
 * ============================================================================
 *
 * 本目录下的模块由用户（开发者）自行实现其核心算法逻辑。
 * 这里仅提供：
 *   1. 类型契约（输入 / 输出结构）
 *   2. 占位实现（返回安全的降级结果，确保系统可运行）
 *   3. 详细注释说明实现要点
 *
 * 项目背景：本应用对应「HarmonyOS / 鸿蒙课表管家」H2 项目的 AI 禁飞区
 *   ① 课表冲突检测算法
 *   ② 空闲教室查询的缓存策略
 *   ③ 日程优化的多约束求解
 *
 * ============================================================================
 */

import type { Course, Classroom } from '../services/schedule.js';

/**
 * 时间区间（半开区间，分钟精度）
 */
export interface TimeRange {
  /** ISO 日期 YYYY-MM-DD */
  date: string;
  /** 开始分钟数（00:00 = 0） */
  startMin: number;
  /** 结束分钟数（00:00 = 0），不包含 */
  endMin: number;
}

/**
 * 课程占用区间 - 用于冲突检测
 */
export interface CourseSlot {
  courseId: string;
  title: string;
  teacher?: string;
  location?: string;
  range: TimeRange;
  /** 关联的固定教室 ID（若绑定则冲突时一并校验教室占用） */
  classroomId?: string;
}

/**
 * 冲突检测结果
 */
export interface ConflictReport {
  hasConflict: boolean;
  conflicts: ConflictDetail[];
  /** 整体诊断信息（可向用户展示） */
  summary: string;
}

export interface ConflictDetail {
  type: 'time_overlap' | 'classroom_busy' | 'teacher_busy' | 'capacity_exceeded';
  severity: 'error' | 'warning';
  message: string;
  /** 涉及的具体课程 ID（2 个或以上） */
  involvedCourseIds: string[];
  /** 涉及的时段，便于 UI 高亮 */
  range: TimeRange;
}

/**
 * 教室缓存条目
 */
export interface ClassroomCacheEntry {
  classroom: Classroom;
  /** 该教室的空闲时段（用于「空闲教室查询」） */
  freeSlots: TimeRange[];
  /** 缓存生成时间（毫秒时间戳） */
  cachedAt: number;
  /** 缓存有效期（毫秒） */
  ttl: number;
}

/**
 * 空闲教室查询 - 入参
 */
export interface FreeClassroomQuery {
  date: string;
  startMin: number;
  endMin: number;
  /** 最小容纳人数 */
  minCapacity?: number;
  /** 必须具备的设备，例如「投影」「机房」 */
  requiredFacilities?: string[];
}

/**
 * 空闲教室查询 - 出参
 */
export interface FreeClassroomResult {
  classroom: Classroom;
  /** 命中缓存的字段标识，便于调试 */
  cacheHit: boolean;
}

/**
 * 日程优化求解 - 入参
 *
 * 多约束规划任务：根据用户目标（如「保研 GPA 优先」「技能拓展优先」）
 * 自动排布课程、自习、休息、任务复习等日程。
 */
export interface ScheduleOptimizeInput {
  /** 当前已存在的课程（不可移动） */
  fixedSlots: CourseSlot[];
  /** 待排入的活动，每项带估值/优先级 */
  activities: OptimizableActivity[];
  /** 时间窗 */
  horizon: {
    /** ISO 日期 */
    startDate: string;
    /** ISO 日期，包含 */
    endDate: string;
  };
  /** 每日学习上限（分钟） */
  dailyMaxMinutes?: number;
  /** 每日最少休息间隔（分钟） */
  minRestGap?: number;
  /** 用户偏好权重 */
  weights?: OptimizeWeights;
}

export interface OptimizableActivity {
  id: string;
  title: string;
  /** 估时（分钟） */
  durationMin: number;
  /** 类别，便于约束分组 */
  category: 'study' | 'review' | 'rest' | 'exercise' | 'skill';
  /** 优先级 1-10 */
  priority: number;
  /** 截止日期（可选） */
  dueDate?: string;
  /** 是否要求必须在指定时段完成（如「英语听力 20:00 后」） */
  preferredTimeOfDay?: 'morning' | 'afternoon' | 'evening' | 'any';
}

export interface OptimizeWeights {
  /** 优先级权重（默认 1.0） */
  priority?: number;
  /** 截止日期紧迫度权重（默认 1.0） */
  deadline?: number;
  /** 同类活动聚合权重（避免课程碎片化，默认 0.5） */
  clustering?: number;
  /** 休息均衡权重（默认 0.8） */
  restBalance?: number;
}

/**
 * 单项活动排程结果
 */
export interface OptimizedSlot extends TimeRange {
  activityId: string;
  /** 排程原因说明，便于解释性输出 */
  reason: string;
}

/**
 * 优化器输出
 */
export interface ScheduleOptimizeResult {
  slots: OptimizedSlot[];
  /** 未排入的活动（容量不足等） */
  unassigned: Array<{ activityId: string; reason: string }>;
  /** 整体健康度评分 0-100 */
  healthScore: number;
  /** 优化器产生的诊断信息 */
  diagnostics: string[];
}