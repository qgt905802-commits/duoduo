/**
 * 通用 LLM 调用服务
 *
 * 把 OpenAI Chat Completions 兼容协议封装为统一接口。
 * 适用于所有用户配置的 Provider（deepseek、文心一言、通义千问、OpenAI 等）。
 *
 * 注：本服务流式调用 SSE 输出，前端可直接通过 fetch + ReadableStream 接收。
 */

import type { AIProvider } from './aiProvider.js';
import * as aiProviderService from './aiProvider.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  providerId?: string;             // 用户配置的 provider ID
  systemPrompt?: string;
  messages: ChatMessage[];
  model?: string;                   // 覆盖 provider 的默认模型
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface ChatResponse {
  ok: boolean;
  message?: string;
  content?: string;
  usage?: any;
  error?: string;
}

/**
 * 调用用户配置的 Provider
 */
export async function chat(req: ChatRequest, userId = 'default'): Promise<ChatResponse> {
  // 解析 provider
  let provider: AIProvider | null = null;
  if (req.providerId) {
    provider = aiProviderService.getProvider(req.providerId);
    if (!provider) return { ok: false, error: 'Provider 不存在' };
    if (provider.user_id !== userId) return { ok: false, error: '无权访问该 Provider' };
    if (!provider.enabled) return { ok: false, error: 'Provider 已禁用' };
  }

  // 构造请求
  const baseUrl = provider?.base_url || process.env.CODEBUDDY_BASE_URL || 'https://api.codebuddy.cn';
  const apiKey = provider?.api_key || process.env.CODEBUDDY_API_KEY || '';
  const model = req.model || provider?.model || process.env.CODEBUDDY_DEFAULT_MODEL || 'claude-sonnet-4';

  const url = baseUrl.replace(/\/$/, '') + '/chat/completions';
  const body = {
    model,
    messages: req.systemPrompt
      ? [{ role: 'system', content: req.systemPrompt }, ...req.messages]
      : req.messages,
    temperature: req.temperature ?? 0.7,
    max_tokens: req.maxTokens ?? 2048,
    stream: false, // 非流式由本服务消费，再通过 SSE 输出
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `${res.status}: ${text.slice(0, 300)}` };
    }

    const data: any = await res.json();
    const content = data?.choices?.[0]?.message?.content || '';
    return {
      ok: true,
      content,
      usage: data?.usage,
      message: data?.choices?.[0]?.finish_reason || 'stop',
    };
  } catch (e: any) {
    return { ok: false, error: e.message || '请求失败' };
  }
}

/**
 * 流式调用（直接转发 SSE 给客户端）
 */
export async function chatStream(
  req: ChatRequest,
  userId = 'default',
  onChunk: (chunk: string, done?: boolean) => void,
  onError: (err: string) => void
): Promise<void> {
  let provider: AIProvider | null = null;
  if (req.providerId) {
    provider = aiProviderService.getProvider(req.providerId);
    if (!provider) return onError('Provider 不存在');
    if (provider.user_id !== userId) return onError('无权访问该 Provider');
    if (!provider.enabled) return onError('Provider 已禁用');
  }

  const baseUrl = provider?.base_url || process.env.CODEBUDDY_BASE_URL || 'https://api.codebuddy.cn';
  const apiKey = provider?.api_key || process.env.CODEBUDDY_API_KEY || '';
  const model = req.model || provider?.model || process.env.CODEBUDDY_DEFAULT_MODEL || 'claude-sonnet-4';

  const url = baseUrl.replace(/\/$/, '') + '/chat/completions';
  const body = {
    model,
    messages: req.systemPrompt
      ? [{ role: 'system', content: req.systemPrompt }, ...req.messages]
      : req.messages,
    temperature: req.temperature ?? 0.7,
    max_tokens: req.maxTokens ?? 2048,
    stream: true,
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      return onError(`${res.status}: ${text.slice(0, 300)}`);
    }

    if (!res.body) {
      return onError('响应无 body');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      onChunk(chunk);
    }
    onChunk('', true);
  } catch (e: any) {
    onError(e.message || '流式请求失败');
  }
}