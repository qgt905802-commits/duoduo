import { useState } from 'react';
import { Button, Input, Tag, Dialog, message } from 'tdesign-react';
import { AddIcon, NotificationIcon } from 'tdesign-icons-react';
import type { Reminder } from '../../types';
import { DateTimeInput } from '../DateTimeInput';

interface ReminderBarProps {
  reminders: Reminder[];
  onAdd: (data: Partial<Reminder>) => Promise<unknown>;
  onCancel: (id: string) => Promise<unknown>;
}

export function ReminderBar({ reminders, onAdd, onCancel }: ReminderBarProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [triggerAt, setTriggerAt] = useState('');

  const handleAdd = async () => {
    if (!title.trim() || !triggerAt) {
      message.warning('请填写标题与触发时间');
      return;
    }
    await onAdd({ title, trigger_at: new Date(triggerAt).toISOString(), type: 'once' });
    setTitle('');
    setTriggerAt('');
    setOpen(false);
  };

  const pending = reminders.filter(r => r.status === 'pending');
  const fired = reminders.filter(r => r.status === 'fired');

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium flex items-center gap-1" style={{ color: 'var(--td-text-color-primary)' }}>
          <NotificationIcon size={14} />
          提醒
        </div>
        <Button
          size="small"
          variant="text"
          icon={<AddIcon />}
          onClick={() => setOpen(true)}
        >
          新增
        </Button>
      </div>

      {pending.length === 0 && fired.length === 0 ? (
        <div className="text-xs text-center py-2" style={{ color: 'var(--td-text-color-placeholder)' }}>
          暂无提醒
        </div>
      ) : (
        <div className="space-y-2">
          {pending.map(r => (
            <div
              key={r.id}
              className="flex items-center justify-between px-2 py-1.5 rounded text-xs"
              style={{
                backgroundColor: 'var(--td-bg-color-component)',
                border: '1px solid var(--td-component-border)',
              }}
            >
              <div className="flex-1 min-w-0">
                <div className="truncate" style={{ color: 'var(--td-text-color-primary)' }}>
                  {r.title}
                </div>
                <div style={{ color: 'var(--td-text-color-placeholder)' }}>
                  {formatRelativeTime(r.trigger_at)}
                </div>
              </div>
              <Button size="small" variant="text" onClick={() => onCancel(r.id)}>
                取消
              </Button>
            </div>
          ))}
          {fired.slice(0, 3).map(r => (
            <div
              key={r.id}
              className="flex items-center gap-2 px-2 py-1 rounded text-xs opacity-50"
              style={{ backgroundColor: 'var(--td-bg-color-component)' }}
            >
              <Tag size="small" theme="success" variant="light">已触发</Tag>
              <span className="truncate flex-1">{r.title}</span>
            </div>
          ))}
        </div>
      )}

      <Dialog
        visible={open}
        onClose={() => setOpen(false)}
        header="新增提醒"
        width={400}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button theme="primary" onClick={handleAdd}>添加</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input value={title} onChange={(v) => setTitle(v as string)} placeholder="提醒内容" />
          <DateTimeInput
            type="datetime-local"
            value={triggerAt}
            onChange={setTriggerAt}
          />
        </div>
      </Dialog>
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const target = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = target - now;
  const absMin = Math.abs(diffMs) / 60_000;

  if (diffMs < 0) {
    if (absMin < 60) return `${Math.round(absMin)} 分钟前`;
    if (absMin < 60 * 24) return `${Math.round(absMin / 60)} 小时前`;
    return `${Math.round(absMin / 60 / 24)} 天前`;
  }
  if (absMin < 60) return `${Math.round(absMin)} 分钟后`;
  if (absMin < 60 * 24) return `${Math.round(absMin / 60)} 小时后`;
  return `${Math.round(absMin / 60 / 24)} 天后`;
}