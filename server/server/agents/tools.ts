/**
 * Agent Tools 实现
 *
 * 本文件导出所有可被 LLM 调用的业务工具函数。
 * 这些函数会在 server/index.ts 中包装为 OpenAI Function Calling 格式的工具描述，
 * 并通过 SDK 的 tool 调用机制注册到 Agent。
 *
 * 注意：SDK 通过 query() 启动的 Agent 会根据 systemPrompt 自主决定是否调用工具。
 * 本项目为了简化，把工具封装为后端 API 端点（/api/tools/*），
 * Agent 可以通过让用户在前端触发，或通过返回结构化 JSON 让前端执行。
 *
 * 对于真正的「SDK 内置 tool」模式，需在 agent-sdk 中配置自定义 tools；
 * 这里采用「Agent 描述工具能力 + 前端 hook 触发」的方案。
 */

import * as scheduleService from '../services/schedule.js';
import * as todoService from '../services/todo.js';
import * as goalService from '../services/goal.js';
import * as statsService from '../services/stats.js';
import * as reminderService from '../services/reminder.js';
import { SYSTEM_PROMPT } from './prompts.js';
import type {
  Course,
  Classroom,
  Todo,
  Goal,
} from '../services/index.js';

/**
 * 工具调用结果（供 Agent 总结用）
 */
export interface ToolResult {
  success: boolean;
  message: string;
  data?: any;
}

/**
 * ============= 课表管理工具 =============
 */

export async function toolAddCourse(args: {
  title: string;
  teacher?: string;
  location?: string;
  classroomId?: string;
  weekday: number;
  startMin: number;
  endMin: number;
  startDate: string;
  endDate: string;
  weeks?: number[];
  color?: string;
  note?: string;
}): Promise<ToolResult> {
  try {
    const course = scheduleService.createCourse({
      ...args,
      source: 'ai_generated',
    });
    return {
      success: true,
      message: `已添加课程「${course.title}」`,
      data: course,
    };
  } catch (e: any) {
    if (e.name === 'ConflictError') {
      return {
        success: false,
        message: `添加课程失败：检测到冲突\n${e.report.summary}`,
        data: e.report,
      };
    }
    return { success: false, message: e.message || '添加课程失败' };
  }
}

export async function toolUpdateCourse(args: {
  id: string;
  title?: string;
  teacher?: string;
  weekday?: number;
  startMin?: number;
  endMin?: number;
  classroomId?: string;
}): Promise<ToolResult> {
  try {
    const course = scheduleService.updateCourse(args.id, args);
    return {
      success: true,
      message: `已更新课程「${course.title}」`,
      data: course,
    };
  } catch (e: any) {
    if (e.name === 'ConflictError') {
      return {
        success: false,
        message: `更新课程失败：检测到冲突\n${e.report.summary}`,
        data: e.report,
      };
    }
    return { success: false, message: e.message || '更新课程失败' };
  }
}

export async function toolDeleteCourse(id: string): Promise<ToolResult> {
  const ok = scheduleService.deleteCourse(id);
  return ok
    ? { success: true, message: '课程已删除' }
    : { success: false, message: '课程不存在' };
}

export async function toolListCourses(): Promise<ToolResult> {
  const courses = scheduleService.listCourses();
  return {
    success: true,
    message: `共 ${courses.length} 门课程`,
    data: courses,
  };
}

/**
 * AI 生成课表（批量）
 *
 * 接收简化的偏好参数，内置一组示例课程模板。
 * 实际生产环境可让 LLM 通过对话生成课程清单���然后调用本工具。
 */
export async function toolGenerateSchedule(args: {
  preset?: 'cs' | 'liberal' | 'science' | 'custom';
  courses?: Array<{
    title: string;
    teacher?: string;
    classroomName?: string;
    weekday: number;
    startMin: number;
    endMin: number;
    color?: string;
  }>;
}): Promise<ToolResult> {
  // 简化：从预设模板 + 用户偏好生成
  const presets = {
    cs: [
      { title: '高等数学', teacher: '王老师', weekday: 1, startMin: 480, endMin: 580, color: '#0052d9' },
      { title: '大学英语', teacher: '李老师', weekday: 1, startMin: 600, endMin: 700, color: '#2ba471' },
      { title: '数据结构', teacher: '张老师', weekday: 2, startMin: 840, endMin: 940, color: '#ed7b2f' },
      { title: '计算机网络', teacher: '陈老师', weekday: 3, startMin: 480, endMin: 580, color: '#e34d59' },
      { title: '操作系统', teacher: '刘老师', weekday: 3, startMin: 600, endMin: 700, color: '#8b5cf6' },
      { title: '马克思主义原理', teacher: '赵老师', weekday: 4, startMin: 840, endMin: 940, color: '#0ea5e9' },
      { title: '体育', teacher: '孙老师', weekday: 5, startMin: 840, endMin: 940, color: '#10b981' },
    ],
    liberal: [
      { title: '中国现代史', teacher: '周老师', weekday: 1, startMin: 480, endMin: 580, color: '#0052d9' },
      { title: '古代文学', teacher: '吴老师', weekday: 2, startMin: 600, endMin: 700, color: '#2ba471' },
      { title: '美学原理', teacher: '郑老师', weekday: 3, startMin: 840, endMin: 940, color: '#ed7b2f' },
      { title: '外国文学', teacher: '冯老师', weekday: 4, startMin: 480, endMin: 580, color: '#e34d59' },
      { title: '大学英语', teacher: '李老师', weekday: 5, startMin: 600, endMin: 700, color: '#8b5cf6' },
    ],
    science: [
      { title: '高等数学', teacher: '王老师', weekday: 1, startMin: 480, endMin: 580, color: '#0052d9' },
      { title: '大学物理', teacher: '黄老师', weekday: 2, startMin: 600, endMin: 700, color: '#2ba471' },
      { title: '无机化学', teacher: '徐老师', weekday: 3, startMin: 480, endMin: 580, color: '#ed7b2f' },
      { title: '生物基础', teacher: '马老师', weekday: 4, startMin: 840, endMin: 940, color: '#e34d59' },
    ],
    custom: [],
  };

  const items = (args.courses || (presets as any)[args.preset || 'cs'] || []) as Array<{
    title: string;
    teacher?: string;
    classroomName?: string;
    weekday: number;
    startMin: number;
    endMin: number;
    color?: string;
  }>;
  if (items.length === 0) {
    return { success: false, message: '未指定课程或预设' };
  }

  const semesterStart = computeSemesterStart();
  const semesterEnd = computeSemesterEnd(semesterStart);

  const inputs = items.map(item => {
    const classroom = item.classroomName
      ? scheduleService.listClassrooms().find(c => c.name === item.classroomName)
      : undefined;
    return {
      title: item.title,
      teacher: item.teacher,
      classroomId: classroom?.id,
      location: item.classroomName,
      weekday: item.weekday,
      startMin: item.startMin,
      endMin: item.endMin,
      startDate: semesterStart,
      endDate: semesterEnd,
      weeks: range(1, 18),
      color: item.color,
      source: 'ai_generated' as const,
    };
  });

  const result = scheduleService.bulkCreateCourses(inputs);

  return {
    success: true,
    message: `已生成 ${result.inserted.length} 门课程；${result.failed.length} 项失败`,
    data: result,
  };
}

function range(start: number, end: number): number[] {
  const result: number[] = [];
  for (let i = start; i <= end; i++) result.push(i);
  return result;
}

function computeSemesterStart(): string {
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

/**
 * ============= 待办 / 目标 / 学习计划 =============
 */

export async function toolAddTodo(args: {
  title: string;
  description?: string;
  priority?: number;
  dueDate?: string;
  courseId?: string;
}): Promise<ToolResult> {
  const todo = todoService.createTodo(args);
  return { success: true, message: `已添加待办「${todo.title}」`, data: todo };
}

export async function toolListTodos(status?: 'pending' | 'in_progress' | 'completed'): Promise<ToolResult> {
  const todos = todoService.listTodos({ status });
  return { success: true, message: `共 ${todos.length} 项待办`, data: todos };
}

export async function toolUpdateTodo(args: {
  id: string;
  status?: Todo['status'];
  priority?: number;
  title?: string;
}): Promise<ToolResult> {
  try {
    const todo = todoService.updateTodo(args.id, args);
    return { success: true, message: '已更新待办', data: todo };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export async function toolAddGoal(args: {
  title: string;
  description?: string;
  category?: Goal['category'];
  targetValue?: number;
  unit?: string;
  startDate: string;
  dueDate: string;
}): Promise<ToolResult> {
  const goal = goalService.createGoal(args);
  return { success: true, message: `已创建目标「${goal.title}」`, data: goal };
}

export async function toolUpdateGoal(args: {
  id: string;
  currentValue?: number;
  status?: Goal['status'];
}): Promise<ToolResult> {
  try {
    const goal = goalService.updateGoal(args.id, args);
    return { success: true, message: '已更新目标', data: goal };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export async function toolGenerateStudyPlan(args: {
  startDate?: string;
  endDate?: string;
}): Promise<ToolResult> {
  const startDate = args.startDate || new Date().toISOString().slice(0, 10);
  const end = args.endDate
    ? new Date(args.endDate)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const endDate = end.toISOString().slice(0, 10);

  const result = await statsService.generateStudyPlan('default', { startDate, endDate });
  return {
    success: true,
    message: `已生成 ${result.slots.length} 项排程，未排入 ${result.unassigned.length} 项，健康度 ${result.healthScore}`,
    data: result,
  };
}

export async function toolAddReminder(args: {
  title: string;
  triggerAt: string;
  type?: 'once' | 'daily' | 'weekly';
}): Promise<ToolResult> {
  const r = reminderService.createReminder(args);
  return { success: true, message: `已创建提醒「${r.title}」`, data: r };
}

export async function toolLogStudy(args: {
  durationMin: number;
  category?: string;
  note?: string;
  courseId?: string;
}): Promise<ToolResult> {
  statsService.logStudy(args);
  return { success: true, message: `已记录 ${args.durationMin} 分钟学习` };
}

/**
 * ============= 工具描述（OpenAI Function Calling 格式） =============
 *
 * 这些描述会作为系统提示词的附录，让 LLM 知道有哪些工具可用。
 * 由于 SDK 的 query() API 通过 canUseTool 处理所有内置工具调用，
 * 而自定义业务工具通过 /api/tools/* 端点暴露给前端，
 * Agent 在对话中提及「调用 XX 工具」时，由前端 hook 解析并发起请求。
 *
 * 本节提供的描述用于在 systemPrompt 中列出所有可用能力。
 */
export const TOOL_DESCRIPTIONS = `
# 可用工具列表

## 课表
- \`add_course(title, teacher?, weekday, startMin, endMin, ...)\`：添加课程
- \`update_course(id, ...)\`：更新课程
- \`delete_course(id)\`：删除课程
- \`list_courses()\`：列出所有课程
- \`generate_schedule(preset)\`：批量生成课表（preset: cs/liberal/science/custom）

## 待办 / 目标
- \`add_todo(title, priority?, dueDate?)\`：添加待办
- \`update_todo(id, status?)\`：更新待办（pending/in_progress/completed）
- \`list_todos(status?)\`：列出待办
- \`add_goal(title, targetValue, unit, startDate, dueDate)\`：添加学习目标
- \`update_goal(id, currentValue)\`：更新目标进度

## 学习计划 / 提醒
- \`generate_study_plan(startDate?, endDate?)\`：生成学习计划（⚠️ 内部调用禁飞区算法）
- \`add_reminder(title, triggerAt)\`：添加提醒
- \`log_study(durationMin, category?)\`：记录学习时长
`;

/**
 * 系统提示词（含工具描述）
 */
export function buildSystemPrompt(): string {
  return SYSTEM_PROMPT + '\n\n' + TOOL_DESCRIPTIONS;
}