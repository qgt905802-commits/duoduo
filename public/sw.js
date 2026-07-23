/**
 * AI 课表与学习管家 — Service Worker
 *
 * 离线缓存策略：Stale-While-Revalidate
 *   1. 安装时预缓存关键资源（HTML / JS / CSS / 图标）
 *   2. 导航请求：网络优先，失败时回退缓存
 *   3. 静态资源：缓存优先，后台更新
 *   4. API 请求：仅透传（不缓存）
 *
 * 适用场景：PWA 方案一（浏览器添加到主屏幕）
 */

const CACHE_VERSION = 'ai-schedule-v1';
const CACHE_NAME = `ai-schedule-${CACHE_VERSION}`;

/** 预缓存的关键资源 */
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg',
];

self.addEventListener('install', (event) => {
  console.log(`[SW] Installing v${CACHE_VERSION}...`);
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Precaching', PRECACHE_URLS);
      return cache.addAll(PRECACHE_URLS);
    }).then(() => {
      console.log('[SW] Install complete');
    })
  );
  // 立即激活（不等待旧 SW）
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log(`[SW] Activating v${CACHE_VERSION}...`);
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key.startsWith('ai-schedule-') && key !== CACHE_NAME)
          .map((oldKey) => {
            console.log(`[SW] Deleting old cache: ${oldKey}`);
            return caches.delete(oldKey);
          })
      );
    }).then(() => {
      console.log('[SW] Activate complete');
    })
  );
  // 接管所有客户端
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API 请求不缓存
  if (url.pathname.startsWith('/api/')) {
    return; // 透传到后端
  }

  // HTML 导航请求 → 网络优先，失败回退缓存
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, cloned);
          });
          return response;
        })
        .catch(() => {
          console.log('[SW] Offline — serving cached page');
          return caches.match(request) || caches.match('/index.html');
        })
    );
    return;
  }

  // 静态资源 → 缓存优先，后台更新
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request).then((response) => {
        const cloned = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, cloned);
        });
        return response;
      });

      return cached || fetchPromise;
    })
  );
});

console.log('[SW] Service Worker registered');