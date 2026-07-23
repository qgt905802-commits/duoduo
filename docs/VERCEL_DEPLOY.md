# Vercel 一键部署指南

## 前置条件

1. GitHub 账号（推送项目到 GitHub 仓库）
2. Vercel 账号（用 GitHub 登录 https://vercel.com）
3. 本机安装 Git

## 1 分钟部署

### Step 1：推送项目到 GitHub

```bash
cd "E:/基础（workbuddy）/ai-schedule-agent"
git init
git add .
git commit -m "AI schedule agent — ready for Vercel"

# 在 GitHub 创建仓库，然后：
git remote add origin https://github.com/你的用户名/ai-schedule-agent.git
git push -u origin main
```

### Step 2：Vercel 导入项目

1. 打开 https://vercel.com/new
2. 点击「Import」→ 选择你的 GitHub 仓库
3. Framework Preset 选「Other」
4. Build Command 保持默认（已写在 vercel.json 中）
5. 点击 Deploy

### Step 3：拿到 URL

部署成功后（约 2 分钟），Vercel 会给你一个 URL，形如：
```
https://ai-schedule-agent.vercel.app
```

### Step 4：手机上使用

1. 手机浏览器打开这个 URL
2. 浏览器菜单 → **「添加到主屏幕」**
3. 桌面出现「课表管家」图标，点开即用

---

## 工作原理

| 层 | 说明 |
| --- | --- |
| `vercel.json` | 配置前端 Vite 构建 + 后端 serverless function 路由 |
| `api/index.ts` | 所有 /api/* 请求的入口，包装 Express app |
| `server/db.ts` | 数据库存 `/tmp/chat.db`（内存文件系统） |

## ⚠️ 注意事项

1. **SQLite 数据不持久**：Vercel Serverless Functions 的 `/tmp` 在部署后清空，重启也会丢失。种子数据每次冷启动都会重建。
2. **CodeBuddy Agent SDK**：Vercel 上走 `/api/llm/chat` 调用你自己配置的 AI Provider（deepseek / 文心 / 通义千问等）。
3. **禁止上传 .env 中的密钥到 GitHub**：API Key 在应用内配置，不写在环境变量中。

---

## 本地开发（不受影响）

```bash
npm run dev
# 前端 http://localhost:5173 · 后端 http://localhost:3000
# 数据库 data/chat.db（本地持久化）
```

Vercel 适配代码通过 `process.env.VERCEL === '1'` 区分环境，本地开发行为完全不变。