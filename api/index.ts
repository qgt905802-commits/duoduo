/**
 * Vercel Serverless Function 入口
 *
 * 所有 /api/* 请求会被 vercel.json 的 rewrites 规则路由到此函数。
 * 本函数导入 server/index.ts 中创建的 Express app 并导出。
 *
 * Vercel @vercel/node runtime 自动处理 HTTP 请求 — 不需要手动 listen。
 */

// 直接导入 server/index.ts，它已经创建好了 Express app
// server/index.ts 在 VERCEL 环境变量=1 时不会调用 app.listen()
import app from '../server/index.js';

export default app;