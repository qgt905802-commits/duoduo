/**
 * 内置课程时段
 *
 * 根据学校作息时间硬编码，每天最多 13 节课。
 * 用户在添加课程时，只能从下拉框选择预定义时段，无需手动输入时间。
 */

export interface ClassPeriod {
  /** 课程序号（1-based） */
  index: number;
  /** 开始时间，分钟数（0-1439） */
  startMin: number;
  /** 结束时间，分钟数 */
  endMin: number;
}

/**
 * 内置 13 个时段
 * 来源：图片中的标准高校作息时间表
 */
export const CLASS_PERIODS: ClassPeriod[] = [
  { index: 1,  startMin: 8 * 60,       endMin: 8 * 60 + 45  },  // 08:00-08:45
  { index: 2,  startMin: 8 * 60 + 50,  endMin: 9 * 60 + 35  },  // 08:50-09:35
  { index: 3,  startMin: 9 * 60 + 50,  endMin: 10 * 60 + 35 },  // 09:50-10:35
  { index: 4,  startMin: 10 * 60 + 40, endMin: 11 * 60 + 25 },  // 10:40-11:25
  { index: 5,  startMin: 11 * 60 + 30, endMin: 12 * 60 + 15 },  // 11:30-12:15
  { index: 6,  startMin: 13 * 60 + 30, endMin: 14 * 60 + 15 },  // 13:30-14:15
  { index: 7,  startMin: 14 * 60 + 20, endMin: 15 * 60 + 5  },  // 14:20-15:05
  { index: 8,  startMin: 15 * 60 + 20, endMin: 16 * 60 + 5  },  // 15:20-16:05
  { index: 9,  startMin: 16 * 60 + 10, endMin: 16 * 60 + 55 },  // 16:10-16:55
  { index: 10, startMin: 18 * 60 + 30, endMin: 19 * 60 + 15 },  // 18:30-19:15
  { index: 11, startMin: 19 * 60 + 20, endMin: 20 * 60 + 5  },  // 19:20-20:05
  { index: 12, startMin: 20 * 60 + 10, endMin: 20 * 60 + 55 },  // 20:10-20:55
  { index: 13, startMin: 21 * 60,      endMin: 21 * 60 + 45 },  // 21:00-21:45
];

/**
 * 把分钟数转换为 HH:MM 字符串
 */
export function minToTimeStr(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * 把 HH:MM 字符串解析为分钟数
 */
export function timeStrToMin(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * 根据开始分钟数查找对应时段，找不到则返回 undefined
 */
export function findPeriodByStartMin(startMin: number): ClassPeriod | undefined {
  return CLASS_PERIODS.find(p => p.startMin === startMin);
}

/**
 * 根据课程序号查找
 */
export function findPeriodByIndex(index: number): ClassPeriod | undefined {
  return CLASS_PERIODS.find(p => p.index === index);
}