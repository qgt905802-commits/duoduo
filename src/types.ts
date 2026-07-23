/**
 * 类型定义
 */

import type { ReactNode } from 'react';

export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';

export interface Model {
  modelId: string;
  name: string;
  description?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input?: Record<string, unknown>;
  status: 'running' | 'completed' | 'error';
  result?: string;
  isError?: boolean;
}

/**
 * 内容块类型 - 支持文字和工具调用按顺序排列
 */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; toolCall: ToolCall };

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;  // 保留用于兼容，存储纯文本摘要
  model?: string;
  timestamp: Date;
  isStreaming?: boolean;
  toolCalls?: ToolCall[];  // 保留用于兼容
  contentBlocks?: ContentBlock[];  // 新增：按顺序排列的内容块
}

export interface Session {
  id: string;
  title: string;
  model: string;
  agentId?: string;
  cwd?: string;
  permissionMode?: PermissionMode;
  createdAt: Date;
  messages: Message[];
}

export interface CustomAgent {
  id: string;
  name: string;
  description?: string;
  systemPrompt: string;
  icon?: string;
  color?: string;
  permissionMode?: PermissionMode;
  createdAt: Date;
  updatedAt: Date;
}

// Agent 是 CustomAgent 的别名
export type Agent = CustomAgent;

export type Theme = 'light' | 'dark';

/**
 * 权限请求 - 用于工具调用确认
 */
export interface PermissionRequest {
  requestId: string;
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
  sessionId: string;
  timestamp: number;
}

/**
 * 权限响应
 */
export interface PermissionResponse {
  requestId: string;
  behavior: 'allow' | 'deny';
  message?: string;
}

// ============================================================================
// 业务类型：AI 课表与学习管家
// ============================================================================

/**
 * 课程
 */
export interface Course {
  id: string;
  user_id: string;
  title: string;
  teacher?: string;
  location?: string;
  classroom_id?: string;
  color?: string;
  /** 0=周日 1=周一 ... 6=周六 */
  weekday: number;
  /** 分钟数 0-1439 */
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

/**
 * 教室
 */
export interface Classroom {
  id: string;
  name: string;
  building?: string;
  capacity: number;
  facilities: string[];
  enrolled: number;
  created_at: string;
}

/**
 * 待办
 */
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

/**
 * 学习目标
 */
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

/**
 * 提醒
 */
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

/**
 * 学习日志（用于统计）
 */
export interface StudyLog {
  id: string;
  user_id: string;
  course_id?: string;
  todo_id?: string;
  category: string;
  duration_min: number;
  note?: string;
  logged_date: string;
  created_at: string;
}

/**
 * 冲突报告（来自禁飞区算法）
 */
export interface ConflictReport {
  hasConflict: boolean;
  conflicts: ConflictDetail[];
  summary: string;
}

export interface ConflictDetail {
  type: 'time_overlap' | 'classroom_busy' | 'teacher_busy' | 'capacity_exceeded';
  severity: 'error' | 'warning';
  message: string;
  involvedCourseIds: string[];
  range: { date: string; startMin: number; endMin: number };
}

/**
 * 学习计划（来自禁飞区算法）
 */
export interface StudyPlan {
  slots: OptimizedSlot[];
  unassigned: Array<{ activityId: string; reason: string }>;
  healthScore: number;
  diagnostics: string[];
}

export interface OptimizedSlot {
  date: string;
  startMin: number;
  endMin: number;
  activityId: string;
  reason: string;
}

/**
 * 总体统计
 */
export interface OverallStats {
  totalCourses: number;
  totalTodos: number;
  totalGoals: number;
  activeGoals: number;
  completedTodos: number;
  overdueTodos: number;
  weeklyStudyMinutes: number;
  todayStudyMinutes: number;
}

/**
 * 每日学习时长
 */
export interface DailyStat {
  date: string;
  studyMinutes: number;
  todoCompleted: number;
}
