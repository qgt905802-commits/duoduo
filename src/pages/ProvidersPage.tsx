/**
 * AI Provider 管理页
 *
 * 用户可在这里：
 * 1. 添加多个大模型 API（deepseek、文心一言、通义千问、OpenAI、自定义）
 * 2. 测试连接
 * 3. 启用/禁用、删除
 * 4. 选择当前对话使用的 Provider
 */

import { useState } from 'react';
import {
  Button, Input, Switch, Select, Tag, Dialog, Alert, message, Form,
} from 'tdesign-react';
import {
  AddIcon, DeleteIcon, CheckCircleIcon, CloseCircleIcon, EditIcon,
} from 'tdesign-icons-react';
import { useAIProviders } from '../hooks/useAIProviders';
import type { ProviderTemplate, AIProvider } from '../api/client';

export function ProvidersPage() {
  const pm = useAIProviders();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AIProvider | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string; latencyMs?: number }>>({});

  const openCreate = () => {
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (p: AIProvider) => {
    setEditing(p);
    setOpen(true);
  };

  const handleTest = async (id: string) => {
    message.info('测试中...');
    const result = await pm.testProvider(id);
    setTestResults(prev => ({ ...prev, [id]: result }));
    if (result.ok) {
      message.success(`连接成功（${result.latencyMs}ms）`);
    } else {
      message.error(`连接失败：${result.message}`);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确认删除 Provider「${name}」？`)) return;
    await pm.removeProvider(id);
    message.success('已删除');
  };

  return (
    <div className="flex-1 flex flex-col p-4 gap-3 overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--td-text-color-primary)' }}>
            AI 模型管理
          </h2>
          <div className="text-xs mt-0.5" style={{ color: 'var(--td-text-color-placeholder)' }}>
            在此添加你在 DeepSeek、文心一言、通义千问等平台申请的 API Key，应用会通过你的账号调用大模型。
          </div>
        </div>
        <Button theme="primary" icon={<AddIcon />} onClick={openCreate}>
          添加 Provider
        </Button>
      </div>

      {pm.error && (
        <Alert theme="error" message={pm.error} onClose={pm.refresh} />
      )}

      {pm.providers.length === 0 ? (
        <div
          className="text-center py-12 rounded-lg"
          style={{
            backgroundColor: 'var(--td-bg-color-container)',
            border: '1px dashed var(--td-component-border)',
          }}
        >
          <div className="text-sm mb-3" style={{ color: 'var(--td-text-color-secondary)' }}>
            还没有配置任何 Provider
          </div>
          <Button theme="primary" variant="outline" icon={<AddIcon />} onClick={openCreate}>
            添加第一个
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {pm.providers.map(p => {
            const isCurrent = p.id === pm.currentProviderId;
            const testResult = testResults[p.id];
            const template = pm.templates.find(t => t.type === p.type);

            return (
              <div
                key={p.id}
                className="p-4 rounded-lg"
                style={{
                  backgroundColor: 'var(--td-bg-color-container)',
                  border: isCurrent
                    ? '2px solid var(--td-brand-color)'
                    : '1px solid var(--td-component-border)',
                }}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Tag theme={isCurrent ? 'primary' : 'default'} variant="light">
                      {template?.name || p.type}
                    </Tag>
                    {isCurrent && <Tag theme="success" variant="light">当前使用</Tag>}
                  </div>
                  <Switch
                    value={p.enabled}
                    onChange={(v) => pm.updateProvider(p.id, { enabled: v })}
                  />
                </div>

                <div className="text-base font-medium mb-1" style={{ color: 'var(--td-text-color-primary)' }}>
                  {p.name}
                </div>

                <div className="text-xs space-y-0.5 mb-3" style={{ color: 'var(--td-text-color-secondary)' }}>
                  <div>模型：<span className="font-mono">{p.model}</span></div>
                  <div className="truncate">地址：<span className="font-mono">{p.base_url}</span></div>
                  <div>Key：<span className="font-mono">{p.api_key}</span></div>
                </div>

                {testResult && (
                  <div
                    className="flex items-center gap-1 text-xs mb-3"
                    style={{
                      color: testResult.ok ? 'var(--td-success-color)' : 'var(--td-error-color)',
                    }}
                  >
                    {testResult.ok ? <CheckCircleIcon size={12} /> : <CloseCircleIcon size={12} />}
                    {testResult.message}
                    {testResult.latencyMs && ` · ${testResult.latencyMs}ms`}
                  </div>
                )}

                <div className="flex gap-2 flex-wrap">
                  {!isCurrent && (
                    <Button size="small" variant="outline" onClick={() => pm.setCurrentProviderId(p.id)}>
                      设为当前
                    </Button>
                  )}
                  <Button
                    size="small"
                    variant="text"
                    icon={<CheckCircleIcon />}
                    onClick={() => handleTest(p.id)}
                  >
                    测试
                  </Button>
                  <Button
                    size="small"
                    variant="text"
                    icon={<EditIcon />}
                    onClick={() => openEdit(p)}
                  >
                    编辑
                  </Button>
                  <Button
                    size="small"
                    variant="text"
                    theme="danger"
                    icon={<DeleteIcon />}
                    onClick={() => handleDelete(p.id, p.name)}
                  >
                    删除
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ProviderEditorDialog
        open={open}
        onClose={() => setOpen(false)}
        editing={editing}
        templates={pm.templates}
        onSubmit={async (data) => {
          try {
            if (editing) {
              await pm.updateProvider(editing.id, data);
              message.success('已更新');
            } else {
              const created = await pm.addProvider(data);
              pm.setCurrentProviderId(created.id);
              message.success('已添加并设为当前');
            }
            setOpen(false);
          } catch (e: any) {
            message.error(e.message || '保存失败');
          }
        }}
      />
    </div>
  );
}

interface ProviderEditorDialogProps {
  open: boolean;
  onClose: () => void;
  editing: AIProvider | null;
  templates: ProviderTemplate[];
  onSubmit: (data: {
    name: string;
    type: string;
    baseUrl: string;
    apiKey: string;
    model: string;
    enabled?: boolean;
  }) => Promise<void>;
}

function ProviderEditorDialog({ open, onClose, editing, templates, onSubmit }: ProviderEditorDialogProps) {
  const [type, setType] = useState<string>('deepseek');
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // 初始化
  if (open && editing && editing.id !== (window as any).__editingId) {
    (window as any).__editingId = editing.id;
    setType(editing.type);
    setName(editing.name);
    setBaseUrl(editing.base_url);
    setApiKey(editing.api_key);
    setModel(editing.model);
    setEnabled(editing.enabled);
  } else if (open && !editing && (window as any).__editingId !== '__new__') {
    (window as any).__editingId = '__new__';
    setType('deepseek');
    setName('DeepSeek');
    setBaseUrl(templates.find(t => t.type === 'deepseek')?.baseUrl || '');
    setModel(templates.find(t => t.type === 'deepseek')?.defaultModel || '');
    setApiKey('');
    setEnabled(true);
  } else if (!open && (window as any).__editingId) {
    (window as any).__editingId = null;
  }

  const template = templates.find(t => t.type === type);
  const isCustom = type === 'custom';

  const handleTypeChange = (newType: string) => {
    setType(newType);
    const tpl = templates.find(t => t.type === newType);
    if (tpl && !editing) {
      setName(tpl.name);
      setBaseUrl(tpl.baseUrl);
      setModel(tpl.defaultModel);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) { message.warning('请输入名称'); return; }
    if (!baseUrl.trim()) { message.warning('请输入 API 地址'); return; }
    if (!editing && !apiKey.trim()) { message.warning('请输入 API Key'); return; }
    if (!model.trim()) { message.warning('请输入模型名'); return; }
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        type,
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        model: model.trim(),
        enabled,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      visible={open}
      onClose={onClose}
      header={editing ? '编辑 Provider' : '添加 Provider'}
      width={560}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button theme="primary" onClick={handleSubmit} loading={submitting}>
            {editing ? '保存' : '添加'}
          </Button>
        </div>
      }
    >
      <Form labelAlign="top">
        <Form.FormItem label="平台类型">
          <Select
            value={type}
            onChange={(v) => handleTypeChange(v as string)}
            disabled={!!editing}
          >
            {templates.map(t => (
              <Select.Option key={t.type} value={t.type} label={t.name}>
                <div>
                  <div>{t.name}</div>
                  <div className="text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>
                    {t.description}
                  </div>
                </div>
              </Select.Option>
            ))}
          </Select>
        </Form.FormItem>

        <Form.FormItem label="显示名称">
          <Input value={name} onChange={(v) => setName(v as string)} placeholder="如：DeepSeek-生产" />
        </Form.FormItem>

        <Form.FormItem
          label="API 地址"
          help={!isCustom && template ? `默认：${template.baseUrl}` : 'OpenAI 兼容接口的 base URL'}
        >
          <Input
            value={baseUrl}
            onChange={(v) => setBaseUrl(v as string)}
            placeholder="https://api.deepseek.com/v1"
          />
        </Form.FormItem>

        <Form.FormItem
          label={editing ? 'API Key（留空不修改）' : 'API Key'}
          help={
            !isCustom && template ? (
              <a href={template.apiKeyUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--td-brand-color)' }}>
                点击申请 {template.name} API Key ↗
              </a>
            ) : (
              '请输入你的 API Key，仅保存在本地数据库'
            )
          }
        >
          <Input
            value={apiKey}
            onChange={(v) => setApiKey(v as string)}
            placeholder="sk-..."
            type="password"
          />
        </Form.FormItem>

        <Form.FormItem
          label="模型名"
          help={!isCustom && template ? `默认：${template.defaultModel}（可改为该平台支持的任意模型）` : ''}
        >
          <Input
            value={model}
            onChange={(v) => setModel(v as string)}
            placeholder={template?.defaultModel || 'gpt-4o-mini'}
          />
        </Form.FormItem>

        <Form.FormItem label="启用">
          <Switch value={enabled} onChange={setEnabled} />
        </Form.FormItem>

        <div
          className="p-2 rounded text-xs"
          style={{
            backgroundColor: 'var(--td-bg-color-component)',
            color: 'var(--td-text-color-placeholder)',
          }}
        >
          💡 你的 API Key 仅保存在本地 SQLite（Base64 编码），
          调用大模型时由本应用后端代理发出请求，不会泄露给第三方。
        </div>
      </Form>
    </Dialog>
  );
}