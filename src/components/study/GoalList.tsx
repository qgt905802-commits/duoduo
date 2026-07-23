import { useState } from 'react';
import { Button, Input, Tag, Progress, Dropdown, message, Select } from 'tdesign-react';
import { AddIcon, MoreIcon } from 'tdesign-icons-react';
import type { Goal } from '../../types';
import { DateTimeInput } from '../DateTimeInput';

interface GoalListProps {
  goals: Goal[];
  onAdd: (data: Partial<Goal>) => Promise<unknown>;
  onUpdate: (id: string, data: Partial<Goal>) => Promise<unknown>;
  onRemove: (id: string) => Promise<unknown>;
}

const CATEGORY_LABEL: Record<Goal['category'], { label: string; color: string }> = {
  study: { label: '学业', color: 'blue' },
  skill: { label: '技能', color: 'green' },
  exam: { label: '考试', color: 'red' },
  other: { label: '其他', color: 'gray' },
};

export function GoalList({ goals, onAdd, onUpdate, onRemove }: GoalListProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<Goal['category']>('study');
  const [targetValue, setTargetValue] = useState<number>(0);
  const [unit, setUnit] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');

  const handleAdd = async () => {
    if (!title.trim()) {
      message.warning('请输入目标名称');
      return;
    }
    if (!dueDate) {
      message.warning('请设置截止日期');
      return;
    }
    await onAdd({
      title: title.trim(),
      category,
      target_value: targetValue > 0 ? targetValue : undefined,
      unit: unit || undefined,
      start_date: new Date().toISOString().slice(0, 10),
      due_date: dueDate,
      status: 'active',
    });
    setTitle('');
    setCategory('study');
    setTargetValue(0);
    setUnit('');
    setDueDate('');
    setShowAdd(false);
  };

  const activeGoals = goals.filter(g => g.status === 'active');
  const completedGoals = goals.filter(g => g.status === 'completed');

  return (
    <div className="space-y-4">
      <Button
        theme="primary"
        variant="outline"
        icon={<AddIcon />}
        onClick={() => setShowAdd(!showAdd)}
      >
        {showAdd ? '取消' : '新增目标'}
      </Button>

      {showAdd && (
        <div
          className="p-3 rounded-lg space-y-2"
          style={{ backgroundColor: 'var(--td-bg-color-component)' }}
        >
          <Input value={title} onChange={(v) => setTitle(v as string)} placeholder="目标名称（如：看完 30 道题）" />
          <div className="grid grid-cols-2 gap-2">
            <Select value={category} onChange={(v) => setCategory(v as any)}>
              {(Object.entries(CATEGORY_LABEL) as Array<[Goal['category'], any]>).map(([k, v]) => (
                <Select.Option key={k} value={k} label={v.label} />
              ))}
            </Select>
            <DateTimeInput
              type="date"
              value={dueDate}
              onChange={setDueDate}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={String(targetValue || '')}
              onChange={(v) => setTargetValue(parseInt(v as string) || 0)}
              placeholder="目标数值"
            />
            <Input
              value={unit}
              onChange={(v) => setUnit(v as string)}
              placeholder="单位（如：题/小时）"
            />
          </div>
          <Button theme="primary" block onClick={handleAdd}>
            创建
          </Button>
        </div>
      )}

      {/* 进行中的目标 */}
      {activeGoals.length > 0 ? (
        <div>
          <div className="text-xs font-medium mb-2" style={{ color: 'var(--td-text-color-secondary)' }}>
            进行中（{activeGoals.length}）
          </div>
          <div className="space-y-2">
            {activeGoals.map(g => (
              <GoalItem key={g.id} goal={g} onUpdate={onUpdate} onRemove={onRemove} />
            ))}
          </div>
        </div>
      ) : (
        !showAdd && (
          <div className="text-center py-4 text-sm" style={{ color: 'var(--td-text-color-placeholder)' }}>
            暂无目标，设定第一个吧 🎯
          </div>
        )
      )}

      {/* 已完成 */}
      {completedGoals.length > 0 && (
        <div>
          <div className="text-xs font-medium mb-2" style={{ color: 'var(--td-text-color-placeholder)' }}>
            已完成（{completedGoals.length}）
          </div>
          <div className="space-y-2 opacity-60">
            {completedGoals.slice(0, 5).map(g => (
              <GoalItem key={g.id} goal={g} onUpdate={onUpdate} onRemove={onRemove} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function GoalItem({ goal, onUpdate, onRemove }: {
  goal: Goal;
  onUpdate: (id: string, data: Partial<Goal>) => Promise<unknown>;
  onRemove: (id: string) => Promise<unknown>;
}) {
  const cat = CATEGORY_LABEL[goal.category];
  const percentage = goal.target_value
    ? Math.min(100, Math.round((goal.current_value / goal.target_value) * 100))
    : 0;

  const handleProgress = () => {
    if (!goal.target_value) {
      message.info('该目标未设定数值，请直接编辑');
      return;
    }
    const input = prompt(`当前进度：${goal.current_value}/${goal.target_value}\n请输入新的当前值：`);
    if (input === null) return;
    const newVal = Number(input);
    if (isNaN(newVal) || newVal < 0) {
      message.warning('请输入有效的非负数字');
      return;
    }
    onUpdate(goal.id, { current_value: newVal } as any);
  };

  return (
    <div
      className="p-3 rounded-lg"
      style={{
        backgroundColor: 'var(--td-bg-color-container)',
        border: '1px solid var(--td-component-border)',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium" style={{ color: 'var(--td-text-color-primary)' }}>
              {goal.title}
            </span>
            <Tag size="small" theme={cat.color as any} variant="light">{cat.label}</Tag>
            {goal.status === 'completed' && (
              <Tag size="small" theme="success" variant="light">✓ 已完成</Tag>
            )}
          </div>
          {goal.description && (
            <div className="text-xs mb-2" style={{ color: 'var(--td-text-color-secondary)' }}>
              {goal.description}
            </div>
          )}
          {goal.target_value ? (
            <div>
              <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--td-text-color-secondary)' }}>
                <span>{goal.current_value} / {goal.target_value} {goal.unit || ''}</span>
                <span>{percentage}%</span>
              </div>
              <Progress percentage={percentage} />
            </div>
          ) : (
            <div className="text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>
              截止：{goal.due_date}
            </div>
          )}
        </div>
        <Dropdown>
          <Button variant="text" shape="circle" icon={<MoreIcon />} />
          <Dropdown.DropdownMenu>
            <Dropdown.DropdownItem onClick={handleProgress}>更新进度</Dropdown.DropdownItem>
            {goal.status !== 'archived' && (
              <Dropdown.DropdownItem onClick={() => onUpdate(goal.id, { status: 'archived' })}>
                归档
              </Dropdown.DropdownItem>
            )}
            <Dropdown.DropdownItem theme="error" onClick={() => onRemove(goal.id)}>删除</Dropdown.DropdownItem>
          </Dropdown.DropdownMenu>
        </Dropdown>
      </div>
    </div>
  );
}