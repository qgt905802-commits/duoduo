// @ts-nocheck
import express from "express";
import { query, unstable_v2_createSession, unstable_v2_authenticate, PermissionResult, CanUseTool } from "@tencent-ai/agent-sdk";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { promisify } from "util";
import * as db from "./db.js";
import * as scheduleSvc from "./services/schedule.js";
import * as todoSvc from "./services/todo.js";
import * as goalSvc from "./services/goal.js";
import * as statsSvc from "./services/stats.js";
import * as reminderSvc from "./services/reminder.js";
import * as aiProviderSvc from "./services/aiProvider.js";
import * as llmSvc from "./services/llm.js";
import * as tools from "./agents/tools.js";
import { buildSystemPrompt } from "./agents/prompts.js";
import { seedIfNeeded } from "./data/seed.js";

const execAsync = promisify(exec);

// 待处理的权限请求
interface PendingPermission {
  resolve: (result: PermissionResult) => void;
  reject: (error: Error) => void;
  toolName: string;
  input: Record<string, unknown>;
  sessionId: string;
  timestamp: number;
}

const pendingPermissions = new Map<string, PendingPermission>();

// 权限请求超时时间（5分钟）
const PERMISSION_TIMEOUT = 5 * 60 * 1000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// 缓存可用模型列表
let cachedModels: Array<{ modelId: string; name: string; description?: string }> = [];
const defaultModel = "claude-sonnet-4";

// 健康检查
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 登录方式类型
type LoginMethod = 'env' | 'cli' | 'none';

interface LoginStatusResponse {
  isLoggedIn: boolean;
  method?: LoginMethod;
  envConfigured?: boolean;
  cliConfigured?: boolean;
  error?: string;
  apiKey?: string; // 脱敏后的 API Key
  envVars?: {
    apiKey?: string;
    authToken?: string;
    internetEnv?: string;
    baseUrl?: string;
  };
}

// 检查 CodeBuddy CLI 登录状态
app.get("/api/check-login", async (req, res) => {
  const response: LoginStatusResponse = {
    isLoggedIn: false,
    envConfigured: false,
    cliConfigured: false,
    envVars: {},
  };
  
  // 1. 检查环境变量
  const apiKey = process.env.CODEBUDDY_API_KEY;
  const authToken = process.env.CODEBUDDY_AUTH_TOKEN;
  const internetEnv = process.env.CODEBUDDY_INTERNET_ENVIRONMENT;
  const baseUrl = process.env.CODEBUDDY_BASE_URL;
  
  if (apiKey || authToken) {
    response.envConfigured = true;
    // 脱敏显示
    if (apiKey) {
      response.envVars!.apiKey = apiKey.slice(0, 8) + '****' + apiKey.slice(-4);
      response.apiKey = response.envVars!.apiKey;
    }
    if (authToken) {
      response.envVars!.authToken = authToken.slice(0, 8) + '****' + authToken.slice(-4);
    }
    if (internetEnv) {
      response.envVars!.internetEnv = internetEnv;
    }
    if (baseUrl) {
      response.envVars!.baseUrl = baseUrl;
    }
  }
  
  // 2. 使用 unstable_v2_authenticate 检查登录状态（更可靠）
  try {
    let needsLogin = false;
    
    const result = await unstable_v2_authenticate({
      environment: 'external',
      onAuthUrl: async (authState) => {
        // 如果执行到这个回调，说明未登录
        needsLogin = true;
        console.log('[Check Login] 需要登录，认证 URL:', authState.authUrl);
        // 将认证 URL 返回给前端（如果需要）
        response.error = '未登录，请先登录 CodeBuddy CLI';
      }
    });
    
    // 如果没有触发 onAuthUrl 回调，说明已登录
    if (!needsLogin && result?.userinfo) {
      response.isLoggedIn = true;
      response.cliConfigured = true;
      
      // 判断登录方式
      if (response.envConfigured) {
        response.method = 'env';
      } else {
        response.method = 'cli';
      }
      
      console.log('[Check Login] 已登录用户:', result.userinfo.userName);
    } else if (!needsLogin) {
      // result 存在但没有 userinfo，仍然认为已登录
      response.isLoggedIn = true;
      response.cliConfigured = true;
      response.method = response.envConfigured ? 'env' : 'cli';
    }
  } catch (error: any) {
    console.error("[Check Login] SDK Error:", error);
    
    // 如果有环境变量配置，仍然认为是登录状态
    if (response.envConfigured) {
      response.isLoggedIn = true;
      response.method = 'env';
    } else {
      response.error = error?.message || String(error);
      response.method = 'none';
    }
  }
  
  res.json(response);
});

// 保存环境变量配置
app.post("/api/save-env-config", (req, res) => {
  const { apiKey, authToken, internetEnv, baseUrl } = req.body;
  
  if (!apiKey && !authToken) {
    return res.status(400).json({ error: '请至少配置 API Key 或 Auth Token' });
  }
  
  const configuredVars: string[] = [];
  
  // 设置环境变量（仅在当前进程有效）
  if (apiKey) {
    process.env.CODEBUDDY_API_KEY = apiKey;
    configuredVars.push('CODEBUDDY_API_KEY');
  }
  if (authToken) {
    process.env.CODEBUDDY_AUTH_TOKEN = authToken;
    configuredVars.push('CODEBUDDY_AUTH_TOKEN');
  }
  if (internetEnv) {
    process.env.CODEBUDDY_INTERNET_ENVIRONMENT = internetEnv;
    configuredVars.push('CODEBUDDY_INTERNET_ENVIRONMENT');
  }
  if (baseUrl) {
    process.env.CODEBUDDY_BASE_URL = baseUrl;
    configuredVars.push('CODEBUDDY_BASE_URL');
  }
  
  // 清除模型缓存，以便重新获取
  cachedModels = [];
  
  res.json({ 
    success: true, 
    message: `已设置: ${configuredVars.join(', ')}`,
    note: '环境变量仅在当前服务器进程有效，重启后需要重新设置'
  });
});

// 获取可用模型列表
app.get("/api/models", async (req, res) => {
  try {
    if (cachedModels.length === 0) {
      console.log("[Models] Creating session to fetch available models...");
      
      const session = await unstable_v2_createSession({ 
        cwd: process.cwd()
      });
      
      console.log("[Models] Session created, calling getAvailableModels()...");
      const models = await session.getAvailableModels();
      console.log("[Models] Got", models.length, "models");
      
      if (models && Array.isArray(models)) {
        cachedModels = models;
      }
    }
    
    res.json({ 
      models: cachedModels.length > 0 ? cachedModels : [
        { modelId: "claude-sonnet-4", name: "Claude Sonnet 4" }
      ],
      defaultModel 
    });
  } catch (error: any) {
    console.error("[Models] Error:", error);
    res.json({
      models: [
        { modelId: "claude-sonnet-4", name: "Claude Sonnet 4" },
        { modelId: "claude-opus-4", name: "Claude Opus 4" }
      ],
      defaultModel,
      error: error?.message || String(error)
    });
  }
});

// ============= 会话 API =============

// 获取所有会话（包含消息数量）
app.get("/api/sessions", (req, res) => {
  try {
    const sessions = db.getAllSessions();
    const sessionsWithMessages = sessions.map(session => {
      const messages = db.getMessagesBySession(session.id);
      return {
        ...session,
        messageCount: messages.length
      };
    });
    res.json({ sessions: sessionsWithMessages });
  } catch (error: any) {
    console.error("[Sessions] Error:", error);
    res.status(500).json({ error: error?.message || "获取会话失败" });
  }
});

// 获取单个会话及其消息
app.get("/api/sessions/:sessionId", (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = db.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: "会话不存在" });
    }
    
    const messages = db.getMessagesBySession(sessionId);
    
    // 解析 tool_calls JSON
    const parsedMessages = messages.map(msg => ({
      ...msg,
      tool_calls: msg.tool_calls ? JSON.parse(msg.tool_calls) : null
    }));
    
    res.json({ session, messages: parsedMessages });
  } catch (error: any) {
    console.error("[Session] Error:", error);
    res.status(500).json({ error: error?.message || "获取会话失败" });
  }
});

// 创建新会话
app.post("/api/sessions", (req, res) => {
  try {
    const { model = defaultModel, title = "新对话" } = req.body;
    const now = new Date().toISOString();
    
    const session = db.createSession({
      id: uuidv4(),
      title,
      model,
      created_at: now,
      updated_at: now
    });
    
    res.json({ session });
  } catch (error: any) {
    console.error("[Create Session] Error:", error);
    res.status(500).json({ error: error?.message || "创建会话失败" });
  }
});

// 更新会话
app.patch("/api/sessions/:sessionId", (req, res) => {
  try {
    const { sessionId } = req.params;
    const { title, model } = req.body;
    
    const success = db.updateSession(sessionId, { title, model });
    
    if (!success) {
      return res.status(404).json({ error: "会话不存在" });
    }
    
    res.json({ success: true });
  } catch (error: any) {
    console.error("[Update Session] Error:", error);
    res.status(500).json({ error: error?.message || "更新会话失败" });
  }
});

// 删除会话
app.delete("/api/sessions/:sessionId", (req, res) => {
  try {
    const { sessionId } = req.params;
    const success = db.deleteSession(sessionId);
    
    if (!success) {
      return res.status(404).json({ error: "会话不存在" });
    }
    
    res.json({ success: true });
  } catch (error: any) {
    console.error("[Delete Session] Error:", error);
    res.status(500).json({ error: error?.message || "删除会话失败" });
  }
});

// ============= 聊天 API =============

// 权限响应 API
app.post("/api/permission-response", (req, res) => {
  const { requestId, behavior, message } = req.body;
  
  console.log(`[Permission] Response received: requestId=${requestId}, behavior=${behavior}`);
  
  const pending = pendingPermissions.get(requestId);
  if (!pending) {
    console.log(`[Permission] Request not found: ${requestId}`);
    return res.status(404).json({ error: "权限请求不存在或已超时" });
  }
  
  // 清除请求
  pendingPermissions.delete(requestId);
  
  if (behavior === 'allow') {
    pending.resolve({
      behavior: 'allow',
      updatedInput: pending.input
    });
  } else {
    pending.resolve({
      behavior: 'deny',
      message: message || '用户拒绝了此操作'
    });
  }

  res.json({ success: true });
});

// ============================================================
// ============= AI Provider（用户配置大模型 API） =============
// ============================================================

// 获取所有 Provider（API Key 脱敏返回）
app.get("/api/providers", (req, res) => {
  const userId = (req.query.userId as string) || "default";
  const providers = aiProviderSvc.listProviders(userId);
  res.json({
    providers: providers.map(p => ({ ...p, api_key: maskKey(p.api_key) })),
    templates: aiProviderSvc.PROVIDER_TEMPLATES,
  });
});

app.get("/api/providers/:id", (req, res) => {
  const p = aiProviderSvc.getProvider(req.params.id);
  if (!p) return res.status(404).json({ error: 'Provider 不存在' });
  res.json({ provider: { ...p, api_key: maskKey(p.api_key) } });
});

app.post("/api/providers", (req, res) => {
  try {
    const userId = req.body.userId || "default";
    const p = aiProviderSvc.createProvider(req.body, userId);
    res.json({ provider: { ...p, api_key: maskKey(p.api_key) } });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.patch("/api/providers/:id", (req, res) => {
  try {
    const userId = req.body.userId || "default";
    const p = aiProviderSvc.updateProvider(req.params.id, req.body, userId);
    if (!p) return res.status(404).json({ error: 'Provider 不存在' });
    res.json({ provider: { ...p, api_key: maskKey(p.api_key) } });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/api/providers/:id", (req, res) => {
  const userId = (req.query.userId as string) || req.body?.userId || "default";
  const ok = aiProviderSvc.deleteProvider(req.params.id, userId);
  res.json({ success: ok });
});

app.post("/api/providers/:id/test", async (req, res) => {
  const p = aiProviderSvc.getProvider(req.params.id);
  if (!p) return res.status(404).json({ error: 'Provider 不存在' });
  const result = await aiProviderSvc.testProvider(p);
  res.json(result);
});

// 通用 LLM 调用（OpenAI 兼容）
app.post("/api/llm/chat", async (req, res) => {
  try {
    const userId = req.body.userId || "default";
    const result = await llmSvc.chat(req.body, userId);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/llm/chat-stream", async (req, res) => {
  const userId = req.body.userId || "default";
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  await llmSvc.chatStream(
    req.body,
    userId,
    (chunk, done) => {
      if (done) {
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
      } else {
        res.write(`data: ${JSON.stringify({ type: 'delta', content: chunk })}\n\n`);
      }
    },
    (err) => {
      res.write(`data: ${JSON.stringify({ type: 'error', error: err })}\n\n`);
      res.end();
    }
  );
});

function maskKey(key: string): string {
  if (!key || key.length < 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

// 发送消息并获取流式响应
app.post("/api/chat", async (req, res) => {
  const { sessionId, message, model, systemPrompt, cwd, permissionMode } = req.body;
  
  // 请求日志
  console.log(`\n[Chat] ========== 新请求 ==========`);
  console.log(`[Chat] SessionId: ${sessionId}`);
  console.log(`[Chat] Model: ${model}`);
  console.log(`[Chat] Message: ${message?.slice(0, 100)}${message?.length > 100 ? '...' : ''}`);
  console.log(`[Chat] CWD: ${cwd || 'default'}`);

  if (!message) {
    console.log(`[Chat] 错误: 消息为空`);
    return res.status(400).json({ error: "消息不能为空" });
  }

  // 获取或创建会话
  let session = sessionId ? db.getSession(sessionId) : null;
  const now = new Date().toISOString();
  
  if (!session) {
    // 创建新会话
    console.log(`[Chat] 创建新会话`);
    session = db.createSession({
      id: sessionId || uuidv4(),
      title: message.slice(0, 30) + (message.length > 30 ? '...' : ''),
      model: model || defaultModel,
      sdk_session_id: null,  // 稍后从 SDK 获取
      created_at: now,
      updated_at: now
    });
  } else {
    console.log(`[Chat] 使用现有会话, SDK Session: ${session.sdk_session_id || 'none'}`);
  }

  const selectedModel = model || session.model;
  
  // 获取 SDK session ID（用于恢复对话）
  const sdkSessionId = session.sdk_session_id;

  // 创建用户消息 ID 和助手消息 ID
  const userMessageId = uuidv4();
  const assistantMessageId = uuidv4();

  // 保存用户消息到数据库
  try {
    db.createMessage({
      id: userMessageId,
      session_id: session.id,
      role: 'user',
      content: message,
      model: null,
      created_at: now,
      tool_calls: null
    });
    console.log(`[Chat] 用户消息已保存: ${userMessageId}`);
  } catch (dbError: any) {
    console.error(`[Chat] 保存用户消息失败:`, dbError);
    return res.status(500).json({ error: "保存消息失败", detail: dbError?.message });
  }

  // 设置 SSE 头
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // 默认系统提示词（来自 agents/prompts.ts）
  const defaultSystemPrompt = buildSystemPrompt();
  
  // 工作目录：优先使用请求中的 cwd，否则使用当前目录
  const workingDir = cwd || process.cwd();

  try {
    console.log(`[Chat] 调用 SDK query...`);
    console.log(`[Chat] - Model: ${selectedModel}`);
    console.log(`[Chat] - Resume: ${sdkSessionId || 'none'}`);
    console.log(`[Chat] - CWD: ${workingDir}`);
    console.log(`[Chat] - PermissionMode: ${permissionMode || 'default'}`);
    
    // 创建 canUseTool 回调
    const canUseTool: CanUseTool = async (toolName, input, options) => {
      console.log(`[Permission] Tool request: ${toolName}`);
      console.log(`[Permission] Input:`, JSON.stringify(input, null, 2));
      
      // bypassPermissions 模式直接放行
      if (permissionMode === 'bypassPermissions') {
        console.log(`[Permission] Bypassing permissions for ${toolName}`);
        return { behavior: 'allow', updatedInput: input };
      }
      
      // 创建权限请求
      const requestId = uuidv4();
      const permissionRequest = {
        requestId,
        toolUseId: options.toolUseID,
        toolName,
        input,
        sessionId: session.id,
        timestamp: Date.now()
      };
      
      // 发送权限请求到前端
      res.write(`data: ${JSON.stringify({ 
        type: "permission_request", 
        ...permissionRequest
      })}\n\n`);
      
      // 创建 Promise 等待用户响应
      return new Promise<PermissionResult>((resolve, reject) => {
        const pending: PendingPermission = {
          resolve,
          reject,
          toolName,
          input,
          sessionId: session.id,
          timestamp: Date.now()
        };
        
        pendingPermissions.set(requestId, pending);
        
        // 设置超时
        setTimeout(() => {
          if (pendingPermissions.has(requestId)) {
            pendingPermissions.delete(requestId);
            console.log(`[Permission] Request timeout: ${requestId}`);
            resolve({
              behavior: 'deny',
              message: '权限请求超时'
            });
          }
        }, PERMISSION_TIMEOUT);
      });
    };
    
    // 使用 Query API 发送消息
    // 如果有 sdk_session_id，使用 resume 恢复对话上下文
    const stream = query({
      prompt: message,
      options: {
        cwd: workingDir,
        model: selectedModel,
        maxTurns: 10,
        systemPrompt: systemPrompt || defaultSystemPrompt,
        permissionMode: permissionMode || 'default',
        canUseTool,
        ...(sdkSessionId ? { resume: sdkSessionId } : {})  // 使用 resume 恢复对话
      }
    });

    let fullResponse = "";
    let toolCalls: Array<{ 
      id: string; 
      name: string; 
      input?: Record<string, unknown>;
      status: string; 
      result?: string;
      isError?: boolean;
    }> = [];
    let newSdkSessionId: string | null = null;  // 用于存储 SDK 返回的 session_id

    // 发送会话ID和消息ID
    res.write(`data: ${JSON.stringify({ 
      type: "init", 
      sessionId: session.id, 
      userMessageId, 
      assistantMessageId,
      model: selectedModel 
    })}\n\n`);

    // 当前正在执行的工具 ID（用于匹配 tool_result）
    let currentToolId: string | null = null;

    // 处理流式响应
    for await (const msg of stream) {
      console.log("[Stream] Message type:", msg.type, msg);
      
      // 处理 system 消息，获取 SDK 的 session_id
      if (msg.type === "system" && (msg as any).subtype === "init") {
        newSdkSessionId = (msg as any).session_id;
        console.log(`[Stream] Got SDK session_id: ${newSdkSessionId}`);
        
        // 保存 SDK session_id 到数据库（如果是新的）
        if (newSdkSessionId && newSdkSessionId !== sdkSessionId) {
          db.updateSession(session.id, { sdk_session_id: newSdkSessionId });
          console.log(`[Stream] Saved SDK session_id to database`);
        }
      } else if (msg.type === "assistant") {
        const content = msg.message.content;

        if (typeof content === "string") {
          fullResponse += content;
          res.write(`data: ${JSON.stringify({ type: "text", content })}\n\n`);
        } else if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "text") {
              fullResponse += block.text;
              res.write(`data: ${JSON.stringify({ type: "text", content: block.text })}\n\n`);
            } else if (block.type === "tool_use") {
              currentToolId = block.id || uuidv4();
              const toolInput = (block as any).input || {};
              console.log(`[Stream] Tool use: id=${currentToolId}, name=${block.name}`);
              console.log(`[Stream] Tool input:`, JSON.stringify(toolInput, null, 2));
              
              const toolCall = { 
                id: currentToolId, 
                name: block.name, 
                input: toolInput,
                status: "running" 
              };
              toolCalls.push(toolCall);
              res.write(`data: ${JSON.stringify({ 
                type: "tool", 
                id: toolCall.id,
                name: toolCall.name,
                input: toolCall.input,
                status: toolCall.status
              })}\n\n`);
            }
          }
        }
      } else if (msg.type === "tool_result") {
        // 处理工具结果（独立的消息类型）
        const msgAny = msg as any;
        const toolId = msgAny.tool_use_id || currentToolId;
        const isError = msgAny.is_error || false;
        const content = msgAny.content;
        
        console.log(`[Stream] Tool result: tool_use_id=${toolId}, is_error=${isError}`);
        console.log(`[Stream] Tool result content type:`, typeof content);
        console.log(`[Stream] Tool result content:`, typeof content === 'string' ? content.slice(0, 500) : JSON.stringify(content, null, 2)?.slice(0, 500));
        
        const tool = toolCalls.find(t => t.id === toolId) || toolCalls[toolCalls.length - 1];
        if (tool) {
          tool.status = isError ? "error" : "completed";
          tool.isError = isError;
          tool.result = typeof content === 'string' 
            ? content 
            : JSON.stringify(content);
          res.write(`data: ${JSON.stringify({ 
            type: "tool_result", 
            toolId: tool.id, 
            content: tool.result,
            isError: isError
          })}\n\n`);
        }
        currentToolId = null;
      } else if (msg.type === "result") {
        // 完成时确保所有工具都标记为完成
        toolCalls.forEach(tool => {
          if (tool.status === "running") {
            tool.status = "completed";
            res.write(`data: ${JSON.stringify({ type: "tool_result", toolId: tool.id, content: tool.result || "已完成" })}\n\n`);
          }
        });
        res.write(`data: ${JSON.stringify({ type: "done", duration: msg.duration, cost: msg.cost })}\n\n`);
      }
    }

    // 保存助手消息到数据库
    db.createMessage({
      id: assistantMessageId,
      session_id: session.id,
      role: 'assistant',
      content: fullResponse,
      model: selectedModel,
      created_at: new Date().toISOString(),
      tool_calls: toolCalls.length > 0 ? JSON.stringify(toolCalls) : null
    });

    // 更新会话标题（如果是第一条消息）
    const messages = db.getMessagesBySession(session.id);
    if (messages.length <= 2) {
      db.updateSession(session.id, { 
        title: message.slice(0, 30) + (message.length > 30 ? '...' : ''),
        model: selectedModel
      });
    }

    console.log(`[Chat] 请求完成 ✓`);
    res.end();
  } catch (error: any) {
    console.error(`\n[Chat] ========== 错误 ==========`);
    console.error(`[Chat] Error Name:`, error?.name);
    console.error(`[Chat] Error Message:`, error?.message);
    console.error(`[Chat] Error Code:`, error?.code);
    console.error(`[Chat] Error Stack:`, error?.stack);
    console.error(`[Chat] Full Error:`, JSON.stringify(error, null, 2));
    
    const errorMessage = error?.message || "处理请求时发生错误";
    res.write(`data: ${JSON.stringify({ type: "error", message: errorMessage })}\n\n`);
    res.end();
  }
});

// ============================================================
// ============= 业务 API：课表 / 学习管家 / 工具 =============
// ============================================================

// ============= Classroom =============

app.get("/api/classrooms", (req, res) => {
  res.json({ classrooms: scheduleSvc.listClassrooms() });
});

app.post("/api/classrooms", (req, res) => {
  try {
    const c = scheduleSvc.createClassroom({
      ...req.body,
      facilities: req.body.facilities || [],
      enrolled: req.body.enrolled || 0,
      created_at: new Date().toISOString(),
    });
    res.json({ classroom: c });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// ============= Course =============

app.get("/api/courses", (req, res) => {
  const userId = (req.query.userId as string) || "default";
  res.json({ courses: scheduleSvc.listCourses(userId) });
});

app.post("/api/courses", async (req, res) => {
  try {
    const userId = req.body.userId || "default";
    const course = scheduleSvc.createCourse(req.body, userId);
    res.json({ course });
  } catch (e: any) {
    if (e.name === "ConflictError") {
      return res.status(409).json({ error: e.message, report: e.report });
    }
    res.status(400).json({ error: e.message });
  }
});

app.patch("/api/courses/:id", (req, res) => {
  try {
    const course = scheduleSvc.updateCourse(req.params.id, req.body);
    res.json({ course });
  } catch (e: any) {
    if (e.name === "ConflictError") {
      return res.status(409).json({ error: e.message, report: e.report });
    }
    if (e.message === "课程不存在") return res.status(404).json({ error: e.message });
    res.status(400).json({ error: e.message });
  }
});

app.delete("/api/courses/:id", (req, res) => {
  const ok = scheduleSvc.deleteCourse(req.params.id);
  res.json({ success: ok });
});

// 空闲教室查询
app.post("/api/free-classrooms", async (req, res) => {
  try {
    const results = await scheduleSvc.findFreeClassrooms(req.body);
    res.json({ results });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// ============= Todo =============

app.get("/api/todos", (req, res) => {
  const userId = (req.query.userId as string) || "default";
  const status = req.query.status as any;
  res.json({ todos: todoSvc.listTodos({ userId, status }) });
});

app.post("/api/todos", (req, res) => {
  try {
    const userId = req.body.userId || "default";
    const todo = todoSvc.createTodo(req.body, userId);
    res.json({ todo });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.patch("/api/todos/:id", (req, res) => {
  try {
    const todo = todoSvc.updateTodo(req.params.id, req.body);
    res.json({ todo });
  } catch (e: any) {
    res.status(404).json({ error: e.message });
  }
});

app.delete("/api/todos/:id", (req, res) => {
  const ok = todoSvc.deleteTodo(req.params.id);
  res.json({ success: ok });
});

app.get("/api/todos/stats", (req, res) => {
  const userId = (req.query.userId as string) || "default";
  res.json({ stats: todoSvc.todoStats(userId) });
});

// ============= Goal =============

app.get("/api/goals", (req, res) => {
  const userId = (req.query.userId as string) || "default";
  const status = req.query.status as any;
  res.json({ goals: goalSvc.listGoals({ userId, status }) });
});

app.post("/api/goals", (req, res) => {
  try {
    const userId = req.body.userId || "default";
    const goal = goalSvc.createGoal(req.body, userId);
    res.json({ goal });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.patch("/api/goals/:id", (req, res) => {
  try {
    const goal = goalSvc.updateGoal(req.params.id, req.body);
    res.json({ goal });
  } catch (e: any) {
    res.status(404).json({ error: e.message });
  }
});

app.delete("/api/goals/:id", (req, res) => {
  const ok = goalSvc.deleteGoal(req.params.id);
  res.json({ success: ok });
});

// ============= Stats =============

app.get("/api/stats/overall", (req, res) => {
  const userId = (req.query.userId as string) || "default";
  res.json({ stats: statsSvc.getOverallStats(userId) });
});

app.get("/api/stats/daily", (req, res) => {
  const userId = (req.query.userId as string) || "default";
  const days = parseInt((req.query.days as string) || "7");
  res.json({ data: statsSvc.dailyStudyMinutes(userId, days) });
});

app.post("/api/stats/log", (req, res) => {
  const userId = req.body.userId || "default";
  const result = statsSvc.logStudy(req.body, userId);
  res.json({ log: result });
});

app.post("/api/stats/study-plan", async (req, res) => {
  try {
    const userId = req.body.userId || "default";
    const result = await statsSvc.generateStudyPlan(userId, req.body.horizon);
    res.json({ plan: result });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// ============= Reminder =============

app.get("/api/reminders", (req, res) => {
  const userId = (req.query.userId as string) || "default";
  res.json({ reminders: reminderSvc.listReminders(userId) });
});

app.post("/api/reminders", (req, res) => {
  try {
    const userId = req.body.userId || "default";
    const r = reminderSvc.createReminder(req.body, userId);
    res.json({ reminder: r });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/reminders/:id/fire", (req, res) => {
  const ok = reminderSvc.markFired(req.params.id);
  res.json({ success: ok });
});

app.post("/api/reminders/:id/cancel", (req, res) => {
  const ok = reminderSvc.cancelReminder(req.params.id);
  res.json({ success: ok });
});

// ============= Agent Tools =============

// 这些端点供前端调用，触发具体的 Agent 描述能力
app.post("/api/tools/add-course", async (req, res) => {
  res.json(await tools.toolAddCourse(req.body));
});

app.post("/api/tools/update-course", async (req, res) => {
  res.json(await tools.toolUpdateCourse(req.body));
});

app.post("/api/tools/delete-course", async (req, res) => {
  res.json(await tools.toolDeleteCourse(req.body.id));
});

app.post("/api/tools/list-courses", async (req, res) => {
  res.json(await tools.toolListCourses());
});

app.post("/api/tools/generate-schedule", async (req, res) => {
  res.json(await tools.toolGenerateSchedule(req.body));
});

app.post("/api/tools/add-todo", async (req, res) => {
  res.json(await tools.toolAddTodo(req.body));
});

app.post("/api/tools/list-todos", async (req, res) => {
  res.json(await tools.toolListTodos(req.body?.status));
});

app.post("/api/tools/update-todo", async (req, res) => {
  res.json(await tools.toolUpdateTodo(req.body));
});

app.post("/api/tools/add-goal", async (req, res) => {
  res.json(await tools.toolAddGoal(req.body));
});

app.post("/api/tools/update-goal", async (req, res) => {
  res.json(await tools.toolUpdateGoal(req.body));
});

app.post("/api/tools/generate-study-plan", async (req, res) => {
  res.json(await tools.toolGenerateStudyPlan(req.body));
});

app.post("/api/tools/add-reminder", async (req, res) => {
  res.json(await tools.toolAddReminder(req.body));
});

app.post("/api/tools/log-study", async (req, res) => {
  res.json(await tools.toolLogStudy(req.body));
});

// 启动服��器
const isVercel = process.env.VERCEL === '1';

if (!isVercel) {
  app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════╗
║                                            ║
║     ◉ AI 课表与学习管家 · API 服务器        ║
║                                            ║
║     地址: http://localhost:${PORT}            ║
║     数据库: SQLite (data/chat.db)          ║
║     禁飞区: server/forbidden/README.md     ║
║                                            ║
╚════════════════════════════════════════════╝
    `);

    // 首次启动时写入种子数据
    try {
      seedIfNeeded();
    } catch (e) {
      console.warn('[seed] 初始化失败：', e);
    }
  });
} else {
  // Vercel Serverless 环境：不调用 listen，但需要初始化种子数据
  try {
    seedIfNeeded();
    console.log('[Vercel] 种子数据初始化完成');
  } catch (e) {
    console.warn('[Vercel][seed] 初始化失败：', e);
  }
}

export default app;
