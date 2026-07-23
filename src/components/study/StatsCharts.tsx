/**
 * 学习统计图表
 *
 * 纯 SVG/CSS 实现，避免引入额外依赖。
 * 提供：
 * - 柱状图（每日学习时长）
 * - 数据卡片（总览数据）
 */

import type { DailyStat, OverallStats } from '../../types';

interface StatsChartsProps {
  overall: OverallStats | null;
  daily: DailyStat[];
}

export function StatsCharts({ overall, daily }: StatsChartsProps) {
  return (
    <div className="space-y-4">
      {/* 数据卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="今日学习"
          value={`${Math.round((overall?.todayStudyMinutes || 0) / 60 * 10) / 10} 小时`}
          color="var(--td-brand-color)"
          subtitle={`本周累计 ${Math.round((overall?.weeklyStudyMinutes || 0) / 6) / 10} 小时`}
        />
        <StatCard
          label="待办完成率"
          value={overall ? `${Math.round((overall.completedTodos / Math.max(overall.totalTodos, 1)) * 100)}%` : '0%'}
          color="#2ba471"
          subtitle={`${overall?.completedTodos || 0} / ${overall?.totalTodos || 0}`}
        />
        <StatCard
          label="逾期待办"
          value={`${overall?.overdueTodos || 0}`}
          color={(overall?.overdueTodos || 0) > 0 ? '#e34d59' : '#8b5cf6'}
          subtitle="需要尽快处理"
        />
        <StatCard
          label="活跃目标"
          value={`${overall?.activeGoals || 0}`}
          color="#ed7b2f"
          subtitle={`共 ${overall?.totalGoals || 0} 个目标`}
        />
      </div>

      {/* 周柱状图 */}
      <div
        className="p-4 rounded-xl"
        style={{
          backgroundColor: 'var(--td-bg-color-container)',
          border: '1px solid var(--td-component-border)',
        }}
      >
        <div className="text-sm font-medium mb-3" style={{ color: 'var(--td-text-color-primary)' }}>
          近 7 天学习时长（分钟）
        </div>
        <DailyBarChart data={daily} />
      </div>
    </div>
  );
}

function StatCard({ label, value, color, subtitle }: {
  label: string; value: string; color: string; subtitle?: string;
}) {
  return (
    <div
      className="p-3 rounded-lg"
      style={{
        backgroundColor: 'var(--td-bg-color-container)',
        border: '1px solid var(--td-component-border)',
      }}
    >
      <div className="text-xs mb-1" style={{ color: 'var(--td-text-color-secondary)' }}>{label}</div>
      <div className="text-2xl font-semibold" style={{ color }}>{value}</div>
      {subtitle && (
        <div className="text-xs mt-1" style={{ color: 'var(--td-text-color-placeholder)' }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

function DailyBarChart({ data }: { data: DailyStat[] }) {
  if (!data.length) {
    return (
      <div className="text-center py-4 text-sm" style={{ color: 'var(--td-text-color-placeholder)' }}>
        暂无数据
      </div>
    );
  }

  const max = Math.max(...data.map(d => d.studyMinutes), 60); // 至少 60 分钟作为刻度
  const W = 600, H = 200, padding = 30;
  const barWidth = (W - padding * 2) / data.length - 8;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + 40}`} style={{ width: '100%', height: 240 }}>
        {data.map((d, i) => {
          const x = padding + i * ((W - padding * 2) / data.length);
          const barH = (d.studyMinutes / max) * H;
          const y = H - barH + 5;
          const label = d.date.slice(5);
          return (
            <g key={d.date}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(barH, 2)}
                fill="var(--td-brand-color)"
                opacity={d.studyMinutes === 0 ? 0.3 : 0.85}
                rx={3}
              />
              {d.studyMinutes > 0 && (
                <text
                  x={x + barWidth / 2}
                  y={y - 4}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--td-text-color-secondary)"
                >
                  {d.studyMinutes}
                </text>
              )}
              <text
                x={x + barWidth / 2}
                y={H + 20}
                textAnchor="middle"
                fontSize={10}
                fill="var(--td-text-color-placeholder)"
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
