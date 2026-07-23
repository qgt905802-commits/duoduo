/**
 * AI Provider 数据 Hook
 *
 * 管理用户配置的大模型 API 列表
 */

import { useCallback, useEffect, useState } from 'react';
import { providersApi } from '../api/client';
import type { AIProvider, ProviderTemplate } from '../api/client';

export interface UseAIProvidersResult {
  providers: AIProvider[];
  templates: ProviderTemplate[];
  loading: boolean;
  error: string | null;
  /** 当前选中的 provider ID（存 localStorage） */
  currentProviderId: string | null;
  setCurrentProviderId: (id: string | null) => void;
  currentProvider: AIProvider | null;
  refresh: () => Promise<void>;
  addProvider: (data: {
    name: string;
    type: string;
    baseUrl: string;
    apiKey: string;
    model: string;
    enabled?: boolean;
  }) => Promise<AIProvider>;
  updateProvider: (id: string, data: Partial<{
    name: string;
    type: string;
    baseUrl: string;
    apiKey: string;
    model: string;
    enabled: boolean;
  }>) => Promise<AIProvider>;
  removeProvider: (id: string) => Promise<void>;
  testProvider: (id: string) => Promise<{ ok: boolean; message: string; latencyMs?: number; models?: string[] }>;
}

const STORAGE_KEY = 'currentProviderId';

export function useAIProviders(): UseAIProvidersResult {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [templates, setTemplates] = useState<ProviderTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentProviderId, _setCurrentProviderId] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY)
  );

  const setCurrentProviderId = useCallback((id: string | null) => {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
    _setCurrentProviderId(id);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { providers: p, templates: t } = await providersApi.list();
      setProviders(p);
      setTemplates(t);
    } catch (e: any) {
      setError(e.message || '加载 Provider 失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const addProvider = useCallback(async (data: {
    name: string;
    type: string;
    baseUrl: string;
    apiKey: string;
    model: string;
    enabled?: boolean;
  }) => {
    const p = await providersApi.create(data);
    setProviders(prev => [p, ...prev]);
    return p;
  }, []);

  const updateProvider = useCallback(async (id: string, data: Partial<{
    name: string; type: string; baseUrl: string; apiKey: string; model: string; enabled: boolean;
  }>) => {
    const p = await providersApi.update(id, data);
    setProviders(prev => prev.map(x => (x.id === id ? p : x)));
    return p;
  }, []);

  const removeProvider = useCallback(async (id: string) => {
    await providersApi.remove(id);
    setProviders(prev => prev.filter(x => x.id !== id));
    if (currentProviderId === id) setCurrentProviderId(null);
  }, [currentProviderId, setCurrentProviderId]);

  const testProvider = useCallback(async (id: string) => {
    return providersApi.test(id);
  }, []);

  const currentProvider = providers.find(p => p.id === currentProviderId) || null;

  return {
    providers, templates, loading, error,
    currentProviderId, setCurrentProviderId,
    currentProvider,
    refresh, addProvider, updateProvider, removeProvider, testProvider,
  };
}