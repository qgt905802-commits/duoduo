/**
 * ============================================================================
 * ⚠️ AI 禁飞区 #2：空闲教室查询缓存策略
 * ============================================================================
 *
 * 业务背景：
 *   学生在排课时需要查询「某个时段有哪些空闲教室」。
 *   直接扫描 classrooms + courses 表在大规模校园（>500 间教室）下性能差。
 *
 * 缓存策略：
 *   - 粒度： (classroomId, date, startMin, endMin, minCapacity) 组合缓存
 *   - TTL：默认 60 秒（可在 DEFAULT_TTL_MS 调整）
 *   - LRU 容量上限：MAX_CACHE_ENTRIES（默认 1000 条）
 *   - 失效：课程写入时按 classroomId 失效相关缓存
 *
 * 触发时机：
 *   server/services/schedule.ts → findFreeClassrooms / createCourse / updateCourse
 *
 * ============================================================================
 */

import type {
  ClassroomCacheEntry,
  FreeClassroomQuery,
  FreeClassroomResult,
  TimeRange,
} from './types.js';
import type { Classroom } from '../services/schedule.js';

export type { FreeClassroomQuery, FreeClassroomResult };

/** 默认 TTL：60 秒 */
export const DEFAULT_TTL_MS = 60 * 1000;

/** LRU 容量上限 */
export const MAX_CACHE_ENTRIES = 1000;

/** 教学日时间范围（默认 08:00-21:45，对应 13 节课） */
const DAY_START_MIN = 8 * 60;
const DAY_END_MIN = 21 * 60 + 45;

/**
 * LRU 缓存（嵌入式 Map + 双向链表节点实现）
 */
class LRUCache<K, V> {
  private map = new Map<K, { value: V; ts: number }>();
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    // 更新访问时间（touch）
    entry.ts = Date.now();
    return entry.value;
  }

  set(key: K, value: V): void {
    if (this.map.size >= this.maxSize) {
      // 淘汰最久未使用的条目
      let oldestKey: K | null = null;
      let oldestTs = Infinity;
      this.map.forEach((v, k) => {
        if (v.ts < oldestTs) {
          oldestTs = v.ts;
          oldestKey = k;
        }
      });
      if (oldestKey !== null) {
        this.map.delete(oldestKey);
        console.log(`[ClassroomCache] LRU 淘汰: ${oldestKey}`);
      }
    }
    this.map.set(key, { value, ts: Date.now() });
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  delete(key: K): void {
    this.map.delete(key);
  }

  /** 按前缀删除匹配的 key */
  deletePrefix(prefix: string): number {
    let deleted = 0;
    for (const key of Array.from(this.map.keys())) {
      if (String(key).startsWith(prefix)) {
        this.map.delete(key);
        deleted++;
      }
    }
    return deleted;
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }

  /** 导出所有 key（仅用于调试） */
  debugKeys(): string[] {
    return Array.from(this.map.keys()).map(String);
  }
}

/**
 * 构建缓存键
 */
function buildCacheKey(
  classroomId: string,
  date: string,
  startMin: number,
  endMin: number,
  minCapacity: number
): string {
  return `CR:${classroomId}:${date}:${startMin}-${endMin}:cap${minCapacity}`;
}

/**
 * 全局 LRU 缓存实例
 */
const cache = new LRUCache<string, { freeSlots: TimeRange[]; cachedAt: number; ttl: number }>(
  MAX_CACHE_ENTRIES
);

/**
 * 查询空闲教室（带缓存）
 *
 * 对每个教室：
 *   1. 先查缓存
 *   2. 未命中：计算该教室的空闲时段，写入缓存
 *   3. 检查空闲时段是否覆盖查询时段（至少有一段完全覆盖 query.startMin ~ query.endMin）
 *   4. 检查容量 + 设施需求
 */
export async function queryFreeClassrooms(
  query: FreeClassroomQuery,
  allClassrooms: Classroom[]
): Promise<FreeClassroomResult[]> {
  console.log(
    `[ClassroomCache] queryFreeClassrooms: date=${query.date}, ${query.startMin}-${query.endMin}, minCap=${query.minCapacity || 0}, rooms=${allClassrooms.length}`
  );

  const results: FreeClassroomResult[] = [];
  let cacheHits = 0;

  for (const classroom of allClassrooms) {
    // 容量过滤
    if (query.minCapacity && classroom.capacity < query.minCapacity) continue;
    // 设施过滤
    if (
      query.requiredFacilities &&
      query.requiredFacilities.length > 0
    ) {
      const roomFacilities = classroom.facilities || [];
      const allMatch = query.requiredFacilities.every(f => roomFacilities.includes(f));
      if (!allMatch) continue;
    }

    const key = buildCacheKey(
      classroom.id,
      query.date,
      query.startMin,
      query.endMin,
      query.minCapacity || 0
    );

    let cacheHit = false;
    const cached = cache.get(key);

    if (cached) {
      // 检查 TTL
      const now = Date.now();
      if (now - cached.cachedAt <= cached.ttl) {
        // 缓存有效：检查该教室是否在查询时段有连续空闲
        const hasSlot = cached.freeSlots.some(
          slot =>
            slot.date === query.date &&
            slot.startMin <= query.startMin &&
            slot.endMin >= query.endMin
        );
        if (hasSlot) {
          cacheHit = true;
          cacheHits++;
        }
        // TTL 内即使教室不空闲也算命中（该时段确实不可用）
        if (!hasSlot) {
          continue; // 过滤掉
        }
      }
      // TTL 过期则失效
    }

    if (!cacheHit) {
      // 计算该教室当日的空闲时段
      const freeSlots = computeFreeSlots(
        classroom.id, // 传 ID 用于日志
        query.date
      );

      // 写入缓存
      cache.set(key, {
        freeSlots,
        cachedAt: Date.now(),
        ttl: DEFAULT_TTL_MS,
      });

      const hasSlot = freeSlots.some(
        slot =>
          slot.date === query.date &&
          slot.startMin <= query.startMin &&
          slot.endMin >= query.endMin
      );

      if (!hasSlot) continue;
    }

    results.push({ classroom, cacheHit });
  }

  console.log(
    `[ClassroomCache] 结果: ${results.length} 间空闲教室, 缓存命中 ${cacheHits}/${results.length}, 缓存总量 ${cache.size}`
  );

  return results;
}

/**
 * 缓存失效
 *
 * 调用时机：课程写入（createCourse / updateCourse / deleteCourse）
 *
 * @param classroomId 要失效的教室 ID（可选，省略则清空全部）
 * @param date 要失效的日期（可选，省略则清空该教室所有日期）
 */
export function invalidate(classroomId?: string, date?: string): void {
  if (!classroomId && !date) {
    const prevSize = cache.size;
    cache.clear();
    console.log(`[ClassroomCache] 清空全部缓存，清除 ${prevSize} 条`);
    return;
  }

  if (classroomId && !date) {
    const prefix = `CR:${classroomId}:`;
    const deleted = cache.deletePrefix(prefix);
    console.log(`[ClassroomCache] 失效教室 ${classroomId}，清除 ${deleted} 条`);
    return;
  }

  if (classroomId && date) {
    // 按教室 + 日期模糊删除（因为 startMin/endMin/minCapacity 不固定）
    const prefix = `CR:${classroomId}:${date}:`;
    const deleted = cache.deletePrefix(prefix);
    console.log(`[ClassroomCache] 失效 ${classroomId} @ ${date}，清除 ${deleted} 条`);
    return;
  }

  if (date && !classroomId) {
    // 按日期删除（性能差，一般不这么用）
    const keysToDelete: string[] = [];
    for (const key of cache.debugKeys()) {
      if (key.includes(`:${date}:`)) keysToDelete.push(key);
    }
    for (const k of keysToDelete) {
      cache.delete(k as any);
    }
    console.log(`[ClassroomCache] 失效日期 ${date}，清除 ${keysToDelete.length} 条`);
  }
}

/**
 * 计算教室空闲时段
 *
 * 步骤：
 *   1. 从 services/schedule.ts 加载该教室当日的所有占用
 *   2. 合并重叠的 busy 时段
 *   3. 在 [dayStart, dayEnd] 区间内找空闲间隙
 *
 * ⚠️ 注：为了纯函数设计，busySlots 为空则由外部 courses 表传入；
 *    本函数负责纯计算逻辑。
 */
export function computeFreeSlots(
  classroomId: string,
  date: string,
  busySlots: TimeRange[] = [],
  services?: { listCourses: () => any[] }
): TimeRange[] {
  console.log(`[ClassroomCache] computeFreeSlots: ${classroomId} @ ${date}, busy=${busySlots.length}`);

  // 1. 过滤出 date 当天的所有 busy 时段，按 startMin 排序
  const dayBusy = busySlots
    .filter(b => b.date === date)
    .sort((a, b) => a.startMin - b.startMin);

  // 2. 合并重叠的 busy 时段
  const merged: TimeRange[] = [];
  for (const busy of dayBusy) {
    if (merged.length === 0) {
      merged.push({ ...busy });
    } else {
      const last = merged[merged.length - 1];
      if (busy.startMin <= last.endMin) {
        // 重叠：拉长结束时间
        last.endMin = Math.max(last.endMin, busy.endMin);
      } else {
        merged.push({ ...busy });
      }
    }
  }

  // 3. 在 [DAY_START_MIN, DAY_END_MIN] 中找空闲间隙
  const free: TimeRange[] = [];
  let cursor = DAY_START_MIN;

  for (const busy of merged) {
    if (busy.startMin > cursor) {
      free.push({
        date,
        startMin: cursor,
        endMin: busy.startMin,
      });
    }
    cursor = Math.max(cursor, busy.endMin);
  }

  if (cursor < DAY_END_MIN) {
    free.push({
      date,
      startMin: cursor,
      endMin: DAY_END_MIN,
    });
  }

  console.log(
    `[ClassroomCache] ${classroomId} @ ${date}: ${dayBusy.length} busy → ${merged.length} merged → ${free.length} free slots`
  );

  return free;
}

/**
 * 调试：查看当前缓存占用
 */
export function debugCacheInfo(): { size: number; keys: string[] } {
  return {
    size: cache.size,
    keys: cache.debugKeys(),
  };
}