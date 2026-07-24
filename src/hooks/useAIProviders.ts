/**
 * AI Provider 数据 Hook
 *
 * 管理用户配置的大模型 API 列表
 *
 * 设计：即使后端不可达，前端也至少有 5 个平台模板可选（Vercel 冷启动慢时会触发超时）
 */

import { useCallback, useEffect, useState } from 'react';
import { providersApi } from '../api/client';
import type { AIProvider, ProviderTemplate } from '../api/client';

/** 前端硬编码的 fallback 模板（即使后端超时也能用） */
const FALLBACK_TEMPLATES: ProviderTemplate[] = [
  {
    type: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    description: '深度求索，国产高性价比大模型',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    customizable: true,
  },
  {
    type: 'wenxin',
    name: '文心一言（百度千帆）',
    baseUrl: 'https://qianfan.baidubce.com/v2',
    defaultModel: 'ernie-4.0-8k',
    description: '百度文心一言，OpenAI 兼容接口',
    apiKeyUrl: 'https://console.bce.baidu.com/qianfan/ais/console/apiKey',
    customizable: true,
  },
  {
    type: 'qwen',
    name: '通义千问（阿里云 DashScope）',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    description: '阿里通义千问，OpenAI 兼容接口',
    apiKeyUrl: 'https://dashscope.console.aliyun.com/apiKey',
    customizable: true,
  },
  {
    type: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    description: 'OpenAI 官方接口',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    customizable: true,
  },
  {
    type: 'custom',
    name: '自定义（OpenAI 兼容）',
    baseUrl: '',
    defaultModel: '',
    description: '任何 OpenAI 兼容 API（如自部署、第三方代理）',
    apiKeyUrl: '',
    customizable: true,
  },
];

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
const RETRY_DELAY_MS = 3000;  // 失败后 3 秒重试
const MAX_RETRY = 2;

export function useAIProviders(): UseAIProvidersResult {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  // templates 立即用 fallback 填充（不再等待后端）
  const [templates, setTemplates] = useState<ProviderTemplate[]>(FALLBACK_TEMPLATES);
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
      // 用后端返回的模板覆盖（后端可能更新了模板）
      if (t && t.length > 0) setTemplates(t);
    } catch (e: any) {
      console.warn('[useAIProviders] 加载失败，使用 fallback 模板：', e?.message);
      setError(e?.message || '加载 Provider 失败');
      // 不覆盖 templates（保留 fallback），用户至少能选择
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // 失败后自动重试
    let retries = 0;
    const interval = setInterval(() => {
      if (providers.length === 0 && retries < MAX_RETRY && error) {
        retries++;
        console.log(`[useAIProviders] 自动重试 (${retries}/${MAX_RETRY})`);
        refresh();
      } else {
        clearInterval(interval);
      }
    }, RETRY_DELAY_MS);
    return () => clearInterval(interval);
  }, [refresh]);

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