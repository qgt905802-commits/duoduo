# AI 课表与学习管家

> 基于 CodeBuddy Agent SDK 构建的「HarmonyOS / 鸿蒙 H2 项目」全栈演示应用。
> 集成 AI 自动生成课表、学习计划约束求解、可视化统计、实时对话。

## 项目亮点

- 📅 **课表管理**：周/月视图、AI 一键生成、手动调整、冲突检测
- 📚 **学习管家**：待办、目标、提醒、学习日志、可视化统计
- 🤖 **AI 对话**：流式输出、工具调用可视化、权限控制
- ⚠️ **AI 禁飞区**：3 个核心算法（冲突检测 / 教室缓存 / 日程优化）由开发者亲自实现，
  AI Agent 仅**调用**而**不修改**

## 技术栈

| 层 | 技术 |
| --- | --- |
| 后端 | Node.js 22 + Express 4 + TypeScript 5 + tsx |
| 数据库 | SQLite (better-sqlite3) — 本地持久化 |
| AI | `@tencent-ai/agent-sdk`（CodeBuddy Agent SDK）|
| 前端 | React 18 + Vite 5 + TypeScript 5 |
| UI | TDesign React 组件库 + Tailwind CSS |
| 路由 | React Router 7 |

## 快速开始

### 1. 安装依赖

```bash
cd ai-schedule-agent
npm install
```

### 2. 配置环境

```bash
cp .env.example .env
# 编辑 .env，设置 CODEBUDDY_API_KEY 或 CODEBUDDY_AUTH_TOKEN
```

`.env` 关键配置：

```bash
CODEBUDDY_API_KEY=your_api_key_here
# 可选：自定义 API base URL
# CODEBUDDY_BASE_URL=https://api.codebuddy.cn
```

### 3. 启动开发服务器

```bash
npm run dev
```

- 前端：http://localhost:5173
- 后端：http://localhost:3000

### 4. 构建生产版本

```bash
npm run build
npm run preview
```

## 项目结构

```
ai-schedule-agent/
├── server/                              # 后端代码
│   ├── index.ts                         # Express + SSE 入口
│   ├── index.d.ts
│   ├── db.ts                            # SQLite 数据库（含 7 张业务表）
│   ├── services/                        # 业务服务层
│   │   ├── schedule.ts                  # 课表 + 教室 CRUD
│   │   ├── todo.ts                      # 待办
│   │   ├── goal.ts                      # 学习目标
│   │   ├── stats.ts                     # 统计 + 日志
│   │   ├── reminder.ts                  # 提醒
│   │   └── index.ts
│   ├── agents/                          # Agent 业务工具
│   │   ├── tools.ts                     # 14 个业务工具函数
│   │   └── prompts.ts                   # 系统提示词（含工具描述）
│   ├── forbidden/                       # ⚠️ AI 禁飞区
│   │   ├── README.md                    # 对接说明（必读）
│   │   ├── types.ts                     # 类型契约
│   │   ├── conflict-detector.ts         # 课表冲突检测（占位）
│   │   ├── classroom-cache.ts           # 空闲教室缓存（占位）
│   │   └── schedule-optimizer.ts        # 日程优化约束求解（占位）
│   └── data/
│       └── seed.ts                      # 种子数据（10 间教室 + 7 门示例课程）
│
├── src/                                 # 前端代码
│   ├── App.tsx                          # 路由（4 个主页面）
│   ├── main.tsx
│   ├── config.ts                        # 应用名称、版本
│   ├── types.ts                         # 类型（含 7 类业务类型）
│   ├── api/
│   │   └── client.ts                    # 后端 API 客户端
│   ├── hooks/
│   │   ├── useChat.ts                   # AI 对话流（已有）
│   │   ├── useSessions.ts
│   │   ├── useAgents.ts
│   │   ├── useModels.ts
│   │   ├── useTheme.ts
│   │   ├── useSchedule.ts               # 课表数据 hook
│   │   └── useStudy.ts                  # 学习管家数据 hook
│   ├── pages/
│   │   ├── ChatPage.tsx                 # AI 对话页（已有 + 增强）
│   │   ├── SchedulePage.tsx             # 课表管理页（新增）
│   │   └── StudyPage.tsx                # 学习管家页（新增）
│   ├── components/
│   │   ├── Sidebar.tsx                  # 侧边栏（含 tab 导航）
│   │   ├── Header.tsx                   # 顶部栏
│   │   ├── ChatMessages.tsx             # 消息流式渲染
│   │   ├── ChatInput.tsx                # 输入框
│   │   ├── Schedule/
│   │   │   ├── WeekView.tsx             # 周视图
│   │   │   ├── MonthView.tsx            # 月视图
│   │   │   ├── CourseModal.tsx          # 课程编辑弹窗
│   │   │   └── AIGeneratePanel.tsx      # AI 一键生成
│   │   ├── Study/
│   │   │   ├── TodoList.tsx             # 待办列表
│   │   │   ├── GoalList.tsx             # 目标列表
│   │   │   ├── ReminderBar.tsx          # 提醒
│   │   │   └── StatsCharts.tsx          # 统计图（SVG）
│   │   ├── NewChatView.tsx
│   │   ├── NewChatDialog.tsx
│   │   ├── SettingsPage.tsx
│   │   ├── ToolCallsCollapse.tsx
│   │   ├── PermissionDialog.tsx
│   │   ├── InlinePermissionCard.tsx
│   │   ├── AgentConfigDialog.tsx
│   │   └── iconMap.ts
│   ├── utils/
│   │   └── iconMap.ts
│   └── index.css                        # 全局样式（含响应式）
│
├── data/                                # 数据（运行时生成）
│   └── chat.db                          # SQLite 数据库
│
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── index.html
├── DEVELOPMENT.md
└── README.md                            # 本文件
```

## 核心功能

### 1. 课表管理（/schedule）

| 功能 | 描述 |
| --- | --- |
| 周视图 | 7 天 × 时段网格，支持双击空白格快速添加 |
| 月视图 | 经典月历 + 课程摘要 |
| AI 一键生成 | 选择「计算机/文科/理工科」模板，批量插入课表 |
| 手动调整 | 编辑课程时间、地点、颜色、备注 |
| 冲突检测 | 保存前调用禁飞区算法校验，自动拒绝冲突 |
| 空闲教室 | ⚠️ 调用禁飞区缓存层 |

### 2. 学习管家（/study）

| 功能 | 描述 |
| --- | --- |
| 总览 | 4 张数据卡 + 近 7 天学习时长柱状图 |
| 待办 | 5 档优先级、截止日期、状态流转 |
| 目标 | 量化进度条、自动完成判定、分类标签 |
| 提醒 | 一次性 / 周期性，相对时间显示 |
| 生成学习计划 | ⚠️ 调用禁飞区约束求解器 |

### 3. AI 对话（/ 或 /chat/:id）

| 功能 | 描述 |
| --- | --- |
| 流式输出 | SSE 实时推送，逐字渲染 |
| 工具调用可视化 | 折叠面板展示调用细节与结果 |
| 权限控制 | 4 种模式：默认 / 自动编辑 / 仅规划 / 全部允许 |
| 多会话 | SQLite 持久化，切换 / 删除 / 重命名 |
| 自定义 Agent | 设置 systemPrompt、图标、颜色 |

## AI 禁飞区

本应用对应鸿蒙项目 H2（AI 课程表与学习管家），其 AI 禁飞区为：

> ①课表冲突检测算法 ②空闲教室查询的缓存策略 ③日程优化的多约束求解

这三个算法由开发者**亲自实现**，AI Agent **不会** 也 **不允许** 替换它们。
代码骨架已搭建于 `server/forbidden/`，每个文件顶部都有详细注释说明：

- `server/forbidden/README.md` — **必读**，包含对接方式、测试用例、占位行为
- `server/forbidden/conflict-detector.ts` — 课表冲突检测
- `server/forbidden/classroom-cache.ts` — 空闲教室缓存
- `server/forbidden/schedule-optimizer.ts` — 日程优化约束求解
- `server/forbidden/types.ts` — 类型契约

### 占位实现行为

| 模块 | 占位行为 | 影响 |
| --- | --- | --- |
| `detectConflicts` | 始终返回 `hasConflict: false` | 课表可被任意写入，**生产环境禁用** |
| `queryFreeClassrooms` | 直接返回所有教室 | 性能差但功能可用 |
| `optimizeSchedule` | 返回空排程 + 全部 unassigned | 学习管家不会生成计划 |

部署到生产环境前，**必须替换为真实算法**。

## REST API 概览

### 会话 / 消息
- `GET /api/sessions` / `POST /api/sessions` / `PATCH /api/sessions/:id` / `DELETE /api/sessions/:id`
- `POST /api/chat`（SSE 流式）

### 课表 / 教室
- `GET /api/courses` / `POST /api/courses` / `PATCH /api/courses/:id` / `DELETE /api/courses/:id`
- `GET /api/classrooms` / `POST /api/classrooms`
- `POST /api/free-classrooms`（空闲教室查询）

### 待办 / 目标 / 提醒
- `GET/POST/PATCH/DELETE /api/todos[/:id]`
- `GET /api/todos/stats`
- `GET/POST/PATCH/DELETE /api/goals[/:id]`
- `GET/POST /api/reminders[/:id/fire]`

### 统计
- `GET /api/stats/overall`
- `GET /api/stats/daily?days=7`
- `POST /api/stats/log`
- `POST /api/stats/study-plan`（⚠️ 调用禁飞区）

### Agent 工具
- `POST /api/tools/add-course`
- `POST /api/tools/update-course`
- `POST /api/tools/delete-course`
- `POST /api/tools/list-courses`
- `POST /api/tools/generate-schedule`
- `POST /api/tools/add-todo`
- `POST /api/tools/list-todos`
- `POST /api/tools/update-todo`
- `POST /api/tools/add-goal`
- `POST /api/tools/update-goal`
- `POST /api/tools/generate-study-plan`（⚠️ 调用禁飞区）
- `POST /api/tools/add-reminder`
- `POST /api/tools/log-study`

## 数据库表

| 表 | 说明 |
| --- | --- |
| `sessions` | AI 对话会话 |
| `messages` | 消息 |
| `classrooms` | 教室（含容量 / 设施） |
| `courses` | 课程（核心表） |
| `todos` | 待办事项 |
| `goals` | 学习目标 |
| `study_logs` | 学习日志（用于统计） |
| `reminders` | 提醒 |
| `meta` | 种子数据标记 |

## 响应式设计

- **桌面端**（≥768px）：完整布局，侧边栏常驻
- **平板**（768px）：自适应调整间距
- **移动端**（≤640px）：Dialog 自适应宽度，数据卡片 2 列堆叠

## 开发提示

- 修改后端代码：`tsx watch` 自动重启
- 修改前端代码：Vite HMR 热更新
- 数据库文件：`data/chat.db`，删除后下次启动会重建种子数据
- 主题切换：右上角太阳/月亮图标

## 路线图

- [ ] AI 自动排课（约束求解集成）
- [ ] 移动端 PWA 支持
- [ ] 数据导入 / 导出（Excel）
- [ ] 多用户支持（认证 + 数据隔离）
- [ ] 推送通知（Web Push API）

## 许可

本项目代码仅供学习与项目演示使用。