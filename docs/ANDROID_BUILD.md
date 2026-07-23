# Android 打包指南

本应用是基于 Web 的 PWA（Progressive Web App），当前已配置方案一（PWA）。

---

## 方案一：PWA — 浏览器添加到主屏幕（✅ 已配置）

当前项目已完成 PWA 配置，无需 APK 构建工具即可在安卓设备上使用：

### 已完成的配置

| 配置项 | 文件 | 状态 |
| --- | --- | --- |
| manifest.json | `public/manifest.json` | ✅ 含 name / icons / theme_color / scope |
| Service Worker | `public/sw.js` | ✅ Stale-While-Revalidate 缓存策略 |
| SW 注册 | `index.html` | ✅ 页面加载后自动注册 |
| PWA 图标 | `public/icon-192.svg` / `public/icon-512.svg` | ✅ SVG 矢量图标 |
| 移动端 meta | `index.html` | ✅ viewport / theme-color / apple-mobile-web-app |
| HTTPS 指引 | 见下文 | HTTPS 是 PWA 必要条件 |

### 安卓设备上的使用步骤

1. **部署到 HTTPS 服务器**（必须，PWA 要求 HTTPS）
   ```bash
   # 构建
   npm run build

   # 部署 dist/ 到任何支持 HTTPS 的服务器
   # 推荐：Vercel / Netlify / Railway / Caddy + 自建
   ```

2. **手机 Chrome 浏览器访问** → `https://your-domain.com`

3. **浏览器菜单** → 「添加到主屏幕」

4. **从桌面图标打开** → 全屏运行（无地址栏），离线也可看图/文案（缓存）

### 本地 HTTPS 测试（开发用）

用 `mkcert` 生成自签名证书：

```bash
# 安装 mkcert（Windows）
choco install mkcert

# 生成 localhost 证书
mkcert -install
mkcert localhost 127.0.0.1

# 启动 vite 时使用 HTTPS
# 修改 vite.config.ts：
#   server: { https: { key: './localhost-key.pem', cert: './localhost.pem' } }
```

### Service Worker 缓存说明

- **首次访问**：自动缓存 HTML / JS / CSS / 图标
- **在线**：后端 API 正常调用，静态资源缓存优先
- **离线**：返回缓存页面（只能看 UI，无法调用 API）
- **更新**：每次部署 bump `CACHE_VERSION`（`public/sw.js` 第 13 行）

---

## 方案二：Capacitor 打包 APK（推荐给最终用户）

Capacitor 把 Web 应用包装成真正的安卓 APK，可以上架应用商店或直接分发。

### 前置环境

- Node.js 18+
- JDK 17+（[Adoptium](https://adoptium.net/)）
- Android SDK（通过 Android Studio 或命令行 tools 安装）
- 设置环境变量 `ANDROID_HOME` 和 `JAVA_HOME`

### 安装 Capacitor

```bash
cd "E:/基础（workbuddy）/ai-schedule-agent"
npm install --save-dev @capacitor/core @capacitor/cli @capacitor/android
npx cap init "AI 课表管家" "com.example.ai-schedule" --web-dir=dist
```

### 修改 `capacitor.config.ts`

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.ai-schedule',
  appName: 'AI 课表管家',
  webDir: 'dist',
  server: {
    // 后端 API 地址（如果你的应用需要联网）
    url: 'https://your-server.com',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
```

### 构建并打开 Android Studio

```bash
# 1. 先构建前端
npm run build

# 2. 添加 Android 平台
npx cap add android

# 3. 把 dist/ 同步到 android/
npx cap sync android

# 4. 用 Android Studio 打开
npx cap open android
```

### 生成 APK

在 Android Studio 中：

1. `Build → Generate Signed Bundle / APK...`
2. 选择 `APK`
3. 创建 keystore（首次需要，妥善保管！丢失则无法升级）
4. 选择 `release` 构建类型
5. 完成后在 `android/app/build/outputs/apk/release/app-release.apk` 找到 APK

或者命令行：

```bash
cd android
./gradlew assembleRelease
# 输出：android/app/build/outputs/apk/release/app-release.apk
```

### 把 APK 传到手机

```bash
# USB 连接后
adb install android/app/build/outputs/apk/release/app-release.apk

# 或者把 APK 放到网盘 / 邮件 / 内网，让用户扫码下载
```

---

## 方案三：TWA（Trusted Web Activity，最轻量）

如果你只想让现有的 PWA 出现在 Google Play 应用商店：

```bash
npm install --save-dev @bubblewrap/cli
npx bubblewrap init --manifest=https://your-server.com/manifest.json
npx bubblewrap build
```

会生成可直接上传到 Play Console 的 AAB 包。

---

## 关键注意事项

### 1. 后端 API 在 APK 中如何访问？

APK 内的 WebView 默认访问 Capacitor 配置的 `server.url`（即你的服务器）。
如果用户希望「完全离线 + 自带后端」，需要把 Node.js 后端打进 APK —— **不推荐**，
因为 APK 体积会很大且维护成本高。

**推荐**：APK 只装前端 UI，所有数据存到云端服务器。

### 2. 用户输入的 API Key 安全吗？

API Key 存在你服务器上的 SQLite（Base64 编码）。**强烈建议**：

- 生产环境启用 HTTPS（防中间人）
- 加密 API Key（用 `crypto` AES-256 替代当前的 Base64）
- 定期备份数据库

### 3. 安卓版本兼容

- 最低支持：Android 7.0（API 24，Capacitor 默认）
- 推荐目标：Android 13（API 33）

### 4. 性能优化

- 启用 Vite 压缩（当前已启用）
- 关闭 TDesign 主题切换的动画（低端机更流畅）
- 移除未使用的依赖（当前打包后 ~2.8 MB，可降到 ~1.5 MB）

---

## 一键打包脚本（可选）

把以下内容保存为 `build-apk.sh`：

```bash
#!/bin/bash
set -e

echo "==> 1. 构建前端"
npm run build

echo "==> 2. 同步到 Android"
npx cap sync android

echo "==> 3. 构建 release APK"
cd android
./gradlew assembleRelease

echo ""
echo "✅ APK 已生成："
ls -lh app/build/outputs/apk/release/app-release.apk
echo ""
echo "安装命令：adb install app/build/outputs/apk/release/app-release.apk"
```

---

## 常见问题

### Q: APK 在某些安卓手机上闪退？
A: 检查 `android/app/build.gradle` 的 `minSdkVersion` 是否 ≥ 24，并确保启用 `useLegacyPackaging = false`。

### Q: WebView 显示「不安全」警告？
A: 后端必须用 HTTPS，不能用 HTTP。

### Q: 用户怎么配置 AI Provider？
A: 打开 App → 左侧菜单「AI 模型」→ 添加 Provider → 输入 API Key。Key 只保存在用户本机的服务端数据库。