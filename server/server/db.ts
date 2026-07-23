import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据库文件路径（Vercel Serverless 使用 /tmp/，本地开发使用 data/）
const isVercel = process.env.VERCEL === '1';
const dbPath = isVercel
  ? '/tmp/chat.db'
  : path.join(__dirname, '..', 'data', 'chat.db');

console.log(`[DB] 数据库路径: ${dbPath}${isVercel ? ' (Vercel /tmp)' : ''}`);

// 确保 data 目录存在
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 创建数据库连接
const db: any = new Database(dbPath);

// 启用 WAL 模式以提高性能
db.pragma('journal_mode = WAL');

// 初始化数据库表
db.exec(`
  -- 会话表
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    model TEXT NOT NULL,
    sdk_session_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- 消息表
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    model TEXT,
    created_at TEXT NOT NULL,
    tool_calls TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  -- 为会话 ID 创建索引
  CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);

  -- ==========================================================================
  -- 业务表：AI 课表与学习管家
  -- ==========================================================================

  -- 教室表
  CREATE TABLE IF NOT EXISTS classrooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    building TEXT,
    capacity INTEGER NOT NULL DEFAULT 60,
    facilities TEXT,             -- JSON 数组：["投影","机房"]
    enrolled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  -- 课程表（核心表）
  CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'default',
    title TEXT NOT NULL,
    teacher TEXT,
    location TEXT,
    classroom_id TEXT,           -- 关联 classrooms.id
    color TEXT,                  -- 显示颜色 HEX
    weekday INTEGER NOT NULL,    -- 0=周日, 1=周一, ..., 6=周六
    start_min INTEGER NOT NULL,  -- 分钟数 0-1439
    end_min INTEGER NOT NULL,
    start_date TEXT NOT NULL,    -- 学期开始 ISO
    end_date TEXT NOT NULL,      -- 学期结束 ISO
    weeks TEXT,                  -- JSON 数组：哪些上课周 [1,2,3,...]
    note TEXT,
    source TEXT NOT NULL DEFAULT 'manual',  -- manual | ai_generated
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_courses_user ON courses(user_id);
  CREATE INDEX IF NOT EXISTS idx_courses_weekday ON courses(weekday);

  -- 待办事项表
  CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'default',
    title TEXT NOT NULL,
    description TEXT,
    course_id TEXT,              -- 关联课程（可选）
    priority INTEGER NOT NULL DEFAULT 3,  -- 1-5
    due_date TEXT,               -- ISO
    status TEXT NOT NULL DEFAULT 'pending', -- pending | in_progress | completed
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_todos_user ON todos(user_id);
  CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);

  -- 学习目标表
  CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'default',
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'study',  -- study | skill | exam | other
    target_value INTEGER,        -- 目标量化值（如「30 题」「10 小时」）
    current_value INTEGER NOT NULL DEFAULT 0,
    unit TEXT,                   -- 单位：「题」「小时」「本」
    start_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',  -- active | completed | archived
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id);

  -- 学习日志（用于统计）
  CREATE TABLE IF NOT EXISTS study_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'default',
    course_id TEXT,
    todo_id TEXT,
    category TEXT NOT NULL DEFAULT 'study',
    duration_min INTEGER NOT NULL,
    note TEXT,
    logged_date TEXT NOT NULL,   -- YYYY-MM-DD
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_study_logs_user_date ON study_logs(user_id, logged_date);

  -- 学习提醒表
  CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'default',
    title TEXT NOT NULL,
    trigger_at TEXT NOT NULL,    -- ISO datetime
    type TEXT NOT NULL DEFAULT 'once',  -- once | daily | weekly
    ref_id TEXT,                 -- 关联 todo/goal/course ID
    ref_type TEXT,               -- todo | goal | course
    status TEXT NOT NULL DEFAULT 'pending',  -- pending | fired | cancelled
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id);
  CREATE INDEX IF NOT EXISTS idx_reminders_trigger ON reminders(trigger_at);

  -- ==========================================================================
  -- AI Provider 表（用户自定义大模型 API）
  -- ==========================================================================
  CREATE TABLE IF NOT EXISTS ai_providers (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'default',
    name TEXT NOT NULL,             -- 用户自定义名称，如「DeepSeek-生产」
    type TEXT NOT NULL,             -- deepseek | wenxin | qwen | openai | custom
    base_url TEXT NOT NULL,         -- API base URL
    api_key TEXT NOT NULL,          -- 加密存储的 API Key（Base64）
    model TEXT NOT NULL,            -- 默认模型名
    enabled INTEGER NOT NULL DEFAULT 1,  -- 0/1
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_ai_providers_user ON ai_providers(user_id);
`);

// 数据库迁移：添加 sdk_session_id 列（如果不存在）
try {
  const tableInfo = db.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>;
  const hasColumn = tableInfo.some(col => col.name === 'sdk_session_id');
  if (!hasColumn) {
    db.exec("ALTER TABLE sessions ADD COLUMN sdk_session_id TEXT");
    console.log("[DB] Added sdk_session_id column to sessions table");
  }
} catch (e) {
  // 忽略错误（列可能已存在）
}

// 类型定义
export interface DbSession {
  id: string;
  title: string;
  model: string;
  sdk_session_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  model: string | null;
  created_at: string;
  tool_calls: string | null;
}

// ============= 会话操作 =============

// 获取所有会话
export function getAllSessions(): DbSession[] {
  const stmt = db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC');
  return stmt.all() as DbSession[];
}

// 获取单个会话
export function getSession(id: string): DbSession | undefined {
  const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
  return stmt.get(id) as DbSession | undefined;
}

// 创建会话
export function createSession(session: DbSession): DbSession {
  const stmt = db.prepare(`
    INSERT INTO sessions (id, title, model, sdk_session_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(session.id, session.title, session.model, session.sdk_session_id, session.created_at, session.updated_at);
  return session;
}

// 更新会话
export function updateSession(id: string, updates: Partial<Pick<DbSession, 'title' | 'model' | 'sdk_session_id'>>): boolean {
  const fields: string[] = [];
  const values: any[] = [];
  
  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(updates.title);
  }
  if (updates.model !== undefined) {
    fields.push('model = ?');
    values.push(updates.model);
  }
  if (updates.sdk_session_id !== undefined) {
    fields.push('sdk_session_id = ?');
    values.push(updates.sdk_session_id);
  }
  
  if (fields.length === 0) return false;
  
  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);
  
  const stmt = db.prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`);
  const result = stmt.run(...values);
  return result.changes > 0;
}

// 删除会话
export function deleteSession(id: string): boolean {
  const stmt = db.prepare('DELETE FROM sessions WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

// ============= 消息操作 =============

// 获取会话的所有消息
export function getMessagesBySession(sessionId: string): DbMessage[] {
  const stmt = db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC');
  return stmt.all(sessionId) as DbMessage[];
}

// 创建消息
export function createMessage(message: DbMessage): DbMessage {
  const stmt = db.prepare(`
    INSERT INTO messages (id, session_id, role, content, model, created_at, tool_calls)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    message.id,
    message.session_id,
    message.role,
    message.content,
    message.model,
    message.created_at,
    message.tool_calls
  );
  
  // 更新会话的 updated_at
  const updateStmt = db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?');
  updateStmt.run(new Date().toISOString(), message.session_id);
  
  return message;
}

// 更新消息内容
export function updateMessage(id: string, updates: Partial<Pick<DbMessage, 'content' | 'tool_calls'>>): boolean {
  const fields: string[] = [];
  const values: any[] = [];
  
  if (updates.content !== undefined) {
    fields.push('content = ?');
    values.push(updates.content);
  }
  if (updates.tool_calls !== undefined) {
    fields.push('tool_calls = ?');
    values.push(updates.tool_calls);
  }
  
  if (fields.length === 0) return false;
  
  values.push(id);
  
  const stmt = db.prepare(`UPDATE messages SET ${fields.join(', ')} WHERE id = ?`);
  const result = stmt.run(...values);
  return result.changes > 0;
}

// 删除消息
export function deleteMessage(id: string): boolean {
  const stmt = db.prepare('DELETE FROM messages WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

// 批量创建消息（用于保存对话）
export function createMessages(messages: DbMessage[]): void {
  const stmt = db.prepare(`
    INSERT INTO messages (id, session_id, role, content, model, created_at, tool_calls)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  const insertMany = db.transaction((msgs: DbMessage[]) => {
    for (const msg of msgs) {
      stmt.run(msg.id, msg.session_id, msg.role, msg.content, msg.model, msg.created_at, msg.tool_calls);
    }
  });
  
  insertMany(messages);
}

// 清空所有数据
export function clearAllData(): void {
  db.exec('DELETE FROM messages');
  db.exec('DELETE FROM sessions');
}

export default db;
