/**
 * 业务 API 客户端
 *
 * 封装 fetch 调用，统一错误处理
 */

import type {
  Course,
  Classroom,
  Todo,
  Goal,
  Reminder,
  OverallStats,
  DailyStat,
  StudyPlan,
} from '../types';

const BASE = '';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`解析响应失败：${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new ApiError(data?.error || res.statusText, res.status, data);
  }
  return data;
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public body?: any) {
    super(message);
    this.name = 'ApiError';
  }
}

// ============= Classroom =============

export const classroomsApi = {
  list: () => request<{ classrooms: Classroom[] }>('/api/classrooms').then(d => d.classrooms),
  create: (data: Omit<Classroom, 'id' | 'created_at'>) =>
    request<{ classroom: Classroom }>('/api/classrooms', {
      method: 'POST',
      body: JSON.stringify(data),
    }).then(d => d.classroom),
};

// ============= Course =============

export const coursesApi = {
  list: () => request<{ courses: Course[] }>('/api/courses').then(d => d.courses),
  create: (data: Partial<Course>) =>
    request<{ course: Course }>('/api/courses', {
      method: 'POST',
      body: JSON.stringify(data),
    }).then(d => d.course),
  update: (id: string, data: Partial<Course>) =>
    request<{ course: Course }>(`/api/courses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }).then(d => d.course),
  remove: (id: string) =>
    request<{ success: boolean }>(`/api/courses/${id}`, {
      method: 'DELETE',
    }).then(d => d.success),
};

// ============= Free Classroom =============

export const freeClassroomsApi = {
  query: (data: { date: string; startMin: number; endMin: number; minCapacity?: number }) =>
    request<{ results: Array<{ classroom: Classroom; cacheHit: boolean }> }>(
      '/api/free-classrooms',
      { method: 'POST', body: JSON.stringify(data) }
    ).then(d => d.results),
};

// ============= Todo =============

export const todosApi = {
  list: (status?: Todo['status']) =>
    request<{ todos: Todo[] }>(
      `/api/todos${status ? `?status=${status}` : ''}`
    ).then(d => d.todos),
  create: (data: Partial<Todo>) =>
    request<{ todo: Todo }>('/api/todos', {
      method: 'POST',
      body: JSON.stringify(data),
    }).then(d => d.todo),
  update: (id: string, data: Partial<Todo>) =>
    request<{ todo: Todo }>(`/api/todos/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }).then(d => d.todo),
  remove: (id: string) =>
    request<{ success: boolean }>(`/api/todos/${id}`, {
      method: 'DELETE',
    }).then(d => d.success),
  stats: () =>
    request<{ stats: any }>('/api/todos/stats').then(d => d.stats),
};

// ============= Goal =============

export const goalsApi = {
  list: (status?: Goal['status']) =>
    request<{ goals: Goal[] }>(
      `/api/goals${status ? `?status=${status}` : ''}`
    ).then(d => d.goals),
  create: (data: Partial<Goal>) =>
    request<{ goal: Goal }>('/api/goals', {
      method: 'POST',
      body: JSON.stringify(data),
    }).then(d => d.goal),
  update: (id: string, data: Partial<Goal>) =>
    request<{ goal: Goal }>(`/api/goals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }).then(d => d.goal),
  remove: (id: string) =>
    request<{ success: boolean }>(`/api/goals/${id}`, {
      method: 'DELETE',
    }).then(d => d.success),
};

// ============= Stats =============

export const statsApi = {
  overall: () =>
    request<{ stats: OverallStats }>('/api/stats/overall').then(d => d.stats),
  daily: (days = 7) =>
    request<{ data: DailyStat[] }>(`/api/stats/daily?days=${days}`).then(d => d.data),
  logStudy: (data: { durationMin: number; category?: string; note?: string; courseId?: string }) =>
    request<{ log: { id: string } }>('/api/stats/log', {
      method: 'POST',
      body: JSON.stringify(data),
    }).then(d => d.log),
  studyPlan: (horizon: { startDate: string; endDate: string }) =>
    request<{ plan: StudyPlan }>('/api/stats/study-plan', {
      method: 'POST',
      body: JSON.stringify({ horizon }),
    }).then(d => d.plan),
};

// ============= Reminder =============

export const remindersApi = {
  list: () =>
    request<{ reminders: Reminder[] }>('/api/reminders').then(d => d.reminders),
  create: (data: Partial<Reminder>) =>
    request<{ reminder: Reminder }>('/api/reminders', {
      method: 'POST',
      body: JSON.stringify(data),
    }).then(d => d.reminder),
  cancel: (id: string) =>
    request<{ success: boolean }>(`/api/reminders/${id}/cancel`, {
      method: 'POST',
    }).then(d => d.success),
};

// ============= Agent Tools =============

export const agentToolsApi = {
  generateSchedule: (preset: 'cs' | 'liberal' | 'science' | 'custom' = 'cs') =>
    request<{ success: boolean; message: string }>('/api/tools/generate-schedule', {
      method: 'POST',
      body: JSON.stringify({ preset }),
    }),
  generateStudyPlan: (horizon: { startDate: string; endDate: string }) =>
    request<{ success: boolean; message: string }>('/api/tools/generate-study-plan', {
      method: 'POST',
      body: JSON.stringify(horizon),
    }),
};

// ============= AI Provider =============

export interface ProviderTemplate {
  type: 'deepseek' | 'wenxin' | 'qwen' | 'openai' | 'custom';
  name: string;
  baseUrl: string;
  defaultModel: string;
  description: string;
  apiKeyUrl: string;
  customizable: boolean;
}

export interface AIProvider {
  id: string;
  user_id: string;
  name: string;
  type: string;
  base_url: string;
  api_key: string;       // 服务端脱敏返回
  model: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export const providersApi = {
  list: () => request<{
    providers: AIProvider[];
    templates: ProviderTemplate[];
  }>('/api/providers').then(d => ({ providers: d.providers, templates: d.templates })),

  create: (data: {
    name: string;
    type: string;
    baseUrl: string;
    apiKey: string;
    model: string;
    enabled?: boolean;
  }) =>
    request<{ provider: AIProvider }>('/api/providers', {
      method: 'POST',
      body: JSON.stringify(data),
    }).then(d => d.provider),

  update: (id: string, data: {
    name?: string;
    type?: string;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    enabled?: boolean;
  }) =>
    request<{ provider: AIProvider }>(`/api/providers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }).then(d => d.provider),

  remove: (id: string) =>
    request<{ success: boolean }>(`/api/providers/${id}`, {
      method: 'DELETE',
    }).then(d => d.success),

  test: (id: string) =>
    request<{ ok: boolean; message: string; latencyMs?: number; models?: string[] }>(
      `/api/providers/${id}/test`,
      { method: 'POST' }
    ),
};

// ============= LLM =============

export const llmApi = {
  chat: (data: {
    providerId?: string;
    systemPrompt?: string;
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }) =>
    request<{
      ok: boolean;
      content?: string;
      usage?: any;
      error?: string;
    }>('/api/llm/chat', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};