/**
 * AI Provider 服务
 *
 * 用户可在前端配置自己的大模型 API（deepseek、文心一言、通义千问、OpenAI 等）。
 * 所有 provider 的 API Key 在后端加密（Base64）存储。
 */

import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';

// 简易 Base64 加密（用于本地 SQLite；生产环境应使用更严格的加密）
const ENCODE_KEY = process.env.AI_KEY_ENC_PREFIX || 'ai-schedule-agent:';

function encodeApiKey(plain: string): string {
  return Buffer.from(ENCODE_KEY + plain).toString('base64');
}

function decodeApiKey(encoded: string): string {
  const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
  if (decoded.startsWith(ENCODE_KEY)) {
    return decoded.slice(ENCODE_KEY.length);
  }
  return decoded;
}

/** 内置 Provider 模板（用户可一键创建） */
export interface ProviderTemplate {
  type: 'deepseek' | 'wenxin' | 'qwen' | 'openai' | 'custom';
  name: string;
  baseUrl: string;
  defaultModel: string;
  description: string;
  /** API Key 申请地址 */
  apiKeyUrl: string;
  /** 是否支持自定义模型（custom 始终为 true） */
  customizable: boolean;
}

export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
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

export interface AIProvider {
  id: string;
  user_id: string;
  name: string;
  type: string;
  base_url: string;
  api_key: string;             // 明文（仅在内存中使用）
  model: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface ProviderRow {
  id: string;
  user_id: string;
  name: string;
  type: string;
  base_url: string;
  api_key: string;
  model: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

function rowToProvider(row: ProviderRow): AIProvider {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    type: row.type,
    base_url: row.base_url,
    api_key: decodeApiKey(row.api_key),
    model: row.model,
    enabled: !!row.enabled,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface CreateProviderInput {
  name: string;
  type: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  enabled?: boolean;
}

export function listProviders(userId = 'default'): AIProvider[] {
  const rows = db
    .prepare('SELECT * FROM ai_providers WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId) as ProviderRow[];
  return rows.map(rowToProvider);
}

export function getProvider(id: string): AIProvider | null {
  const row = db
    .prepare('SELECT * FROM ai_providers WHERE id = ?')
    .get(id) as ProviderRow | undefined;
  return row ? rowToProvider(row) : null;
}

export function createProvider(input: CreateProviderInput, userId = 'default'): AIProvider {
  const id = uuidv4();
  const now = new Date().toISOString();
  const encodedKey = encodeApiKey(input.apiKey);
  db.prepare(`
    INSERT INTO ai_providers (id, user_id, name, type, base_url, api_key, model, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, userId, input.name, input.type, input.baseUrl, encodedKey, input.model,
    input.enabled === false ? 0 : 1, now, now
  );
  return getProvider(id)!;
}

export function updateProvider(id: string, updates: Partial<CreateProviderInput>, userId = 'default'): AIProvider | null {
  const existing = getProvider(id);
  if (!existing || existing.user_id !== userId) return null;

  const fields: string[] = [];
  const values: any[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.type !== undefined) {
    fields.push('type = ?');
    values.push(updates.type);
  }
  if (updates.baseUrl !== undefined) {
    fields.push('base_url = ?');
    values.push(updates.baseUrl);
  }
  if (updates.apiKey !== undefined && updates.apiKey !== '') {
    fields.push('api_key = ?');
    values.push(encodeApiKey(updates.apiKey));
  }
  if (updates.model !== undefined) {
    fields.push('model = ?');
    values.push(updates.model);
  }
  if (updates.enabled !== undefined) {
    fields.push('enabled = ?');
    values.push(updates.enabled ? 1 : 0);
  }

  if (fields.length === 0) return existing;

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  db.prepare(`UPDATE ai_providers SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getProvider(id);
}

export function deleteProvider(id: string, userId = 'default'): boolean {
  const existing = getProvider(id);
  if (!existing || existing.user_id !== userId) return false;
  const result = db.prepare('DELETE FROM ai_providers WHERE id = ?').run(id);
  return result.changes > 0;
}

/**
 * 测试 Provider 连通性（向 base URL 发送一次空请求）
 */
export async function testProvider(p: AIProvider): Promise<{ ok: boolean; message: string; latencyMs?: number; models?: string[] }> {
  const start = Date.now();
  try {
    const url = p.base_url.replace(/\/$/, '') + '/models';
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${p.api_key}`,
        'Content-Type': 'application/json',
      },
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, message: `${res.status}: ${text.slice(0, 200)}`, latencyMs };
    }
    const data: any = await res.json().catch(() => ({}));
    const models = Array.isArray(data?.data)
      ? data.data.map((m: any) => m.id || m.name || m).filter(Boolean)
      : [];
    return { ok: true, message: '连接成功', latencyMs, models };
  } catch (e: any) {
    return { ok: false, message: e.message || '连接失败' };
  }
}