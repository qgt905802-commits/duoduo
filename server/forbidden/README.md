# ⚠️ AI 禁飞区 — 完整实现

> 本目录包含 3 个核心算法的**完整实现**，代码可直接运行，
> 所有算法已脱离占位状态。

---

## 模块清单

| 文件 | 功能 | 核心接口 |
| --- | --- | --- |
| `types.ts` | 全部类型定义 | `TimeRange`, `CourseSlot`, `ConflictReport`, `ScheduleOptimizeInput/Output` |
| `conflict-detector.ts` | 课表冲突检测 | `detectConflicts()` — 4 类检测（时间/教室/教师/容量） |
| `classroom-cache.ts` | 空闲教室查询 + LRU 缓存 | `queryFreeClassrooms()` / `invalidate()` |
| `schedule-optimizer.ts` | 日程优化贪心调度 | `optimizeSchedule()` — 时隙网格 + 多约束匹配 |
| `README.md` | 本文件 | — |

---

## 算法详情

### 1. 课表冲突检测 (`conflict-detector.ts`)

**核心函数**: `detectConflicts(candidate, existing, capacity?, enrolled?)`

**检测 4 类冲突**：
- **时间重叠**：逐一比对 candidate 与每门 existing 课程的时间区间（半开区间，same day）
- **教室占用**：按 `classroomId` 过滤，检测同教室课程是否在同一时段
- **教师冲突**：按 `teacher` 过滤，检测同教师课程是否在同一时段
- **容量超限**：若传入 `capacity` + `enrolled`，检查 `enrolled > capacity`

**辅助函数**：
- `rangesOverlap(a, b)` — 判断两个时间区间是否重叠
- `findTimeOverlaps(slots)` — 扫描线算法 O(N log N)，用于批量检测所有成对冲突

**复杂度**：O(N) 逐对比较，N 为学生课程数（通常 < 50 门）

### 2. 空闲教室缓存 (`classroom-cache.ts`)

**核心函数**: `queryFreeClassrooms(query, allClassrooms)`

**缓存策略**：
- **LRU**：嵌入式双链表 Map 实现，容量上限 1000 条
- **TTL**：默认 60 秒（可调整 `DEFAULT_TTL_MS`）
- **粒度**：`CR:{classroomId}:{date}:{startMin}-{endMin}:cap{minCapacity}`

**查询流程**：
1. 过滤教室（容量 / 设施）
2. 查缓存（TTL 内命中直接返回）
3. 未命中 → 调用 `computeFreeSlots()` 计算空闲时段 → 写入缓存
4. 检查查询时段是否完全落在某段空闲时段内

**辅助函数**：
- `computeFreeSlots(classroomId, date, busySlots)` — 合并 busy 时段 + 间隙检测
- `invalidate(classroomId?, date?)` — 失效缓存（课程写入时调用）

### 3. 日程优化 (`schedule-optimizer.ts`)

**核心函数**: `optimizeSchedule(input)`

**算法流程**：
1. **生成 timeGrid**：每天 08:00-22:00 拆为 30 分钟时隙
2. **标记固定课程占用**：对应时隙 + 前后休息间隙均标记为 `occupied`
3. **活动排序**：priority DESC → deadline ASC → duration ASC
4. **贪心匹配**：
   - 按日期优先级遍历（截止日期前的优先）
   - 扫描时隙，找连续 n 个空闲时隙
   - 如有 `preferredTimeOfDay`，仅扫描对应区域（morning/afternoon/evening）
   - 满足每日上限（`dailyMaxMinutes`）才排入
5. **评分**：
   - 排入率（60 分）
   - 每日均衡度（25 分，标准差低 = 高分）
   - 紧急性覆盖（15 分）

**复杂度**：O(A × D × S)，A=活动数，D=天数，S=每日时隙数（28 个）

---

## 对接位置

| 禁飞区 | 调用文件 | 调用方法 |
| --- | --- | --- |
| 冲突检测 | `server/services/schedule.ts` | `createCourse()` / `updateCourse()` |
| 教室缓存 | `server/services/schedule.ts` | `findFreeClassrooms()` / `createCourse()`（失效） |
| 日程优化 | `server/services/stats.ts` | `generateStudyPlan()` |

---

## 日志输出

所有模块都有 `console.log` 输出，便于调试：

```
[ConflictDetector] course=abc123 开始检测... 现有 7 门课
[ConflictDetector] course=abc123 检测完成：hasConflict=false, conflicts=0

[ClassroomCache] queryFreeClassrooms: date=2026-07-23, 480-580, minCap=0, rooms=10
[ClassroomCache] 结果: 3 间空闲教室, 缓存命中 2/3, 缓存总量 5
[ClassroomCache] 失效教室 abc-123, 清除 2 条

[ScheduleOptimizer] 开始优化：fixedSlots=7, activities=5, 2026-07-23 ~ 2026-07-29, dailyMax=240min, restGap=30min
[ScheduleOptimizer] ✓ 复习高数 → 2026-07-23 15:30-16:30
[ScheduleOptimizer] ✓ 背单词 → 2026-07-23 19:00-19:30
[ScheduleOptimizer] 完成：3/5 排入, healthScore=72, 耗时 8ms
```

---

## 测试建议

```bash
# 在项目根目录运行（需要 vitest）
npm test -- server/forbidden/__tests__/conflict-detector.test.ts
```

测试用例建议（参考 coverage）：
- `detectConflicts`：两门完全重叠 / 首尾相连不重叠 / 不同日期不重叠 / 教室占用 / 教师冲突
- `queryFreeClassrooms`：缓存命中 / 未命中 / TTL 过期 / LRU 淘汰
- `optimizeSchedule`：全部排入 / 部分排入 / 超出每日上限 / 偏好时段