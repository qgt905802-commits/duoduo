import { useState } from 'react';
import { Button, Input, Checkbox, Tag, Dropdown, message } from 'tdesign-react';
import { AddIcon, MoreIcon, TimeIcon } from 'tdesign-icons-react';
import type { Todo } from '../../types';

interface TodoListProps {
  todos: Todo[];
  onAdd: (data: Partial<Todo>) => Promise<unknown>;
  onUpdate: (id: string, data: Partial<Todo>) => Promise<unknown>;
  onRemove: (id: string) => Promise<unknown>;
}

const PRIORITY_LABEL: Record<number, { label: string; color: string }> = {
  5: { label: '紧急', color: 'red' },
  4: { label: '高', color: 'orange' },
  3: { label: '中', color: 'blue' },
  2: { label: '低', color: 'gray' },
  1: { label: '很低', color: 'gray' },
};

export function TodoList({ todos, onAdd, onUpdate, onRemove }: TodoListProps) {
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<number>(3);
  const [newDueDate, setNewDueDate] = useState<string>('');

  const handleAdd = async () => {
    if (!newTitle.trim()) {
      message.warning('请输入待办内容');
      return;
    }
    await onAdd({
      title: newTitle.trim(),
      priority: newPriority,
      due_date: newDueDate || undefined,
      status: 'pending',
    });
    setNewTitle('');
    setNewPriority(3);
    setNewDueDate('');
  };

  const grouped = {
    pending: todos.filter(t => t.status === 'pending'),
    in_progress: todos.filter(t => t.status === 'in_progress'),
    completed: todos.filter(t => t.status === 'completed'),
  };

  return (
    <div className="space-y-4">
      {/* 新增待办 */}
      <div
        className="p-3 rounded-lg flex flex-col gap-2"
        style={{ backgroundColor: 'var(--td-bg-color-component)' }}
      >
        <div className="flex gap-2">
          <Input
            value={newTitle}
            onChange={(v) => setNewTitle(v as string)}
            placeholder="添加新待办..."
            onEnter={handleAdd}
          />
          <Button theme="primary" icon={<AddIcon />} onClick={handleAdd}>
            添加
          </Button>
        </div>
        <div className="flex gap-2 items-center text-xs">
          <span style={{ color: 'var(--td-text-color-secondary)' }}>优先级</span>
          <select
            value={newPriority}
            onChange={(e) => setNewPriority(Number(e.target.value))}
            className="px-2 py-1 rounded"
            style={{
              border: '1px solid var(--td-component-border)',
              backgroundColor: 'var(--td-bg-color-container)',
              color: 'var(--td-text-color-primary)',
            }}
          >
            {[5, 4, 3, 2, 1].map(p => (
              <option key={p} value={p}>{PRIORITY_LABEL[p].label}</option>
            ))}
          </select>
          <span style={{ color: 'var(--td-text-color-secondary)' }}>截止</span>
          <input
            type="date"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
            className="px-2 py-1 rounded"
            style={{
              border: '1px solid var(--td-component-border)',
              backgroundColor: 'var(--td-bg-color-container)',
              color: 'var(--td-text-color-primary)',
            }}
          />
        </div>
      </div>

      {/* 进行中 */}
      {grouped.in_progress.length > 0 && (
        <Section title="进行中" count={grouped.in_progress.length}>
          {grouped.in_progress.map(t => (
            <TodoItem
              key={t.id}
              todo={t}
              onUpdate={onUpdate}
              onRemove={onRemove}
            />
          ))}
        </Section>
      )}

      {/* 待办 */}
      {grouped.pending.length > 0 && (
        <Section title="待办" count={grouped.pending.length}>
          {grouped.pending.map(t => (
            <TodoItem
              key={t.id}
              todo={t}
              onUpdate={onUpdate}
              onRemove={onRemove}
            />
          ))}
        </Section>
      )}

      {/* 已完成 */}
      {grouped.completed.length > 0 && (
        <Section title="已完成" count={grouped.completed.length} muted>
          {grouped.completed.slice(0, 10).map(t => (
            <TodoItem
              key={t.id}
              todo={t}
              onUpdate={onUpdate}
              onRemove={onRemove}
            />
          ))}
          {grouped.completed.length > 10 && (
            <div className="text-xs px-2" style={{ color: 'var(--td-text-color-placeholder)' }}>
              还有 {grouped.completed.length - 10} 项已完成...
            </div>
          )}
        </Section>
      )}

      {todos.length === 0 && (
        <div
          className="text-center py-8 text-sm"
          style={{ color: 'var(--td-text-color-placeholder)' }}
        >
          暂无待办，添加第一个吧 ✏️
        </div>
      )}
    </div>
  );
}

function Section({ title, count, children, muted }: {
  title: string; count: number; children: React.ReactNode; muted?: boolean;
}) {
  return (
    <div>
      <div
        className="text-xs font-medium mb-2 flex items-center gap-2"
        style={{ color: muted ? 'var(--td-text-color-placeholder)' : 'var(--td-text-color-secondary)' }}
      >
        <span>{title}</span>
        <span
          className="px-1.5 py-0.5 rounded text-[10px]"
          style={{ backgroundColor: 'var(--td-bg-color-component)' }}
        >
          {count}
        </span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function TodoItem({ todo, onUpdate, onRemove }: {
  todo: Todo;
  onUpdate: (id: string, data: Partial<Todo>) => Promise<unknown>;
  onRemove: (id: string) => Promise<unknown>;
}) {
  const isCompleted = todo.status === 'completed';
  const isOverdue = todo.due_date && !isCompleted && new Date(todo.due_date) < new Date();
  const priorityInfo = PRIORITY_LABEL[todo.priority] || PRIORITY_LABEL[3];

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg group hover:shadow-sm transition-shadow"
      style={{
        backgroundColor: 'var(--td-bg-color-container)',
        border: '1px solid var(--td-component-border)',
      }}
    >
      <Checkbox
        checked={isCompleted}
        onChange={(v) => onUpdate(todo.id, { status: v ? 'completed' : 'pending' })}
      />
      <div className="flex-1 min-w-0">
        <div
          className="text-sm truncate"
          style={{
            color: isCompleted ? 'var(--td-text-color-placeholder)' : 'var(--td-text-color-primary)',
            textDecoration: isCompleted ? 'line-through' : 'none',
          }}
        >
          {todo.title}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>
          <Tag size="small" theme={priorityInfo.color as any} variant="light">
            {priorityInfo.label}
          </Tag>
          {todo.due_date && (
            <span className="flex items-center gap-1">
              <TimeIcon size={12} />
              {todo.due_date.slice(0, 10)}
              {isOverdue && (
                <span style={{ color: 'var(--td-error-color)' }}>(已逾期)</span>
              )}
            </span>
          )}
        </div>
      </div>
      <Dropdown>
        <Button variant="text" shape="circle" icon={<MoreIcon />} />
        <Dropdown.DropdownMenu>
          {todo.status !== 'in_progress' && (
            <Dropdown.DropdownItem onClick={() => onUpdate(todo.id, { status: 'in_progress' })}>
              标记进行中
            </Dropdown.DropdownItem>
          )}
          {todo.status === 'completed' && (
            <Dropdown.DropdownItem onClick={() => onUpdate(todo.id, { status: 'pending' })}>
              撤销完成
            </Dropdown.DropdownItem>
          )}
          <Dropdown.DropdownItem theme="error" onClick={() => onRemove(todo.id)}>
            删除
          </Dropdown.DropdownItem>
        </Dropdown.DropdownMenu>
      </Dropdown>
    </div>
  );
}