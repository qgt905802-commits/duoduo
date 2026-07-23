/**
 * 学习管家数据 Hook
 *
 * 聚合 Todo / Goal / Reminder / Stats
 */

import { useCallback, useEffect, useState } from 'react';
import {
  todosApi, goalsApi, remindersApi, statsApi, agentToolsApi,
} from '../api/client';
import type {
  Todo, Goal, Reminder, OverallStats, DailyStat, StudyPlan,
} from '../types';

export interface UseStudyResult {
  todos: Todo[];
  goals: Goal[];
  reminders: Reminder[];
  overall: OverallStats | null;
  daily: DailyStat[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addTodo: (data: Partial<Todo>) => Promise<Todo>;
  updateTodo: (id: string, data: Partial<Todo>) => Promise<Todo>;
  removeTodo: (id: string) => Promise<void>;
  addGoal: (data: Partial<Goal>) => Promise<Goal>;
  updateGoal: (id: string, data: Partial<Goal>) => Promise<Goal>;
  removeGoal: (id: string) => Promise<void>;
  addReminder: (data: Partial<Reminder>) => Promise<Reminder>;
  cancelReminder: (id: string) => Promise<void>;
  logStudy: (data: { durationMin: number; category?: string; note?: string; courseId?: string }) => Promise<void>;
  generateStudyPlan: (horizon: { startDate: string; endDate: string }) => Promise<StudyPlan>;
  generateSchedule: (preset: 'cs' | 'liberal' | 'science' | 'custom') => Promise<{ success: boolean; message: string }>;
  lastPlan: StudyPlan | null;
  lastGenerateMsg: string | null;
  clearPlanMsg: () => void;
}

export function useStudy(): UseStudyResult {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [overall, setOverall] = useState<OverallStats | null>(null);
  const [daily, setDaily] = useState<DailyStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastPlan, setLastPlan] = useState<StudyPlan | null>(null);
  const [lastGenerateMsg, setLastGenerateMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, g, r, ov, d] = await Promise.all([
        todosApi.list(),
        goalsApi.list(),
        remindersApi.list(),
        statsApi.overall(),
        statsApi.daily(7),
      ]);
      setTodos(t);
      setGoals(g);
      setReminders(r);
      setOverall(ov);
      setDaily(d);
    } catch (e: any) {
      setError(e.message || '加载数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const addTodo = useCallback(async (data: Partial<Todo>) => {
    const todo = await todosApi.create(data);
    setTodos(prev => [todo, ...prev]);
    return todo;
  }, []);

  const updateTodo = useCallback(async (id: string, data: Partial<Todo>) => {
    const updated = await todosApi.update(id, data);
    setTodos(prev => prev.map(t => (t.id === id ? updated : t)));
    return updated;
  }, []);

  const removeTodo = useCallback(async (id: string) => {
    await todosApi.remove(id);
    setTodos(prev => prev.filter(t => t.id !== id));
  }, []);

  const addGoal = useCallback(async (data: Partial<Goal>) => {
    const goal = await goalsApi.create(data);
    setGoals(prev => [...prev, goal]);
    return goal;
  }, []);

  const updateGoal = useCallback(async (id: string, data: Partial<Goal>) => {
    const updated = await goalsApi.update(id, data);
    setGoals(prev => prev.map(g => (g.id === id ? updated : g)));
    return updated;
  }, []);

  const removeGoal = useCallback(async (id: string) => {
    await goalsApi.remove(id);
    setGoals(prev => prev.filter(g => g.id !== id));
  }, []);

  const addReminder = useCallback(async (data: Partial<Reminder>) => {
    const r = await remindersApi.create(data);
    setReminders(prev => [...prev, r]);
    return r;
  }, []);

  const cancelReminder = useCallback(async (id: string) => {
    await remindersApi.cancel(id);
    setReminders(prev => prev.map(r => (r.id === id ? { ...r, status: 'cancelled' } : r)));
  }, []);

  const logStudy = useCallback(async (data: { durationMin: number; category?: string; note?: string; courseId?: string }) => {
    await statsApi.logStudy(data);
    await refresh();
  }, [refresh]);

  const generateStudyPlan = useCallback(async (horizon: { startDate: string; endDate: string }) => {
    const plan = await statsApi.studyPlan(horizon);
    setLastPlan(plan);
    return plan;
  }, []);

  const generateSchedule = useCallback(async (preset: 'cs' | 'liberal' | 'science' | 'custom') => {
    const r = await agentToolsApi.generateSchedule(preset);
    setLastGenerateMsg(r.message);
    return r;
  }, []);

  const clearPlanMsg = useCallback(() => setLastPlan(null), []);

  return {
    todos, goals, reminders, overall, daily, loading, error,
    refresh,
    addTodo, updateTodo, removeTodo,
    addGoal, updateGoal, removeGoal,
    addReminder, cancelReminder,
    logStudy,
    generateStudyPlan, generateSchedule,
    lastPlan, lastGenerateMsg, clearPlanMsg,
  };
}