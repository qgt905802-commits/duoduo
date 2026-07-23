import { useState } from 'react';
import { Button, Dialog, Radio, message, Loading } from 'tdesign-react';
import { StarIcon } from 'tdesign-icons-react';
import type { Course } from '../../types';

interface AIGeneratePanelProps {
  open: boolean;
  onClose: () => void;
  onGenerated: (inserted: Course[], failed: any[]) => void;
  generate: (preset: 'cs' | 'liberal' | 'science' | 'custom') => Promise<{ success: boolean; message: string; data?: any }>;
}

const PRESETS = [
  { value: 'cs', label: '计算机专业', desc: '高数、英语、数据结构、计算机网络、操作系统、马原、体育' },
  { value: 'liberal', label: '文科专业', desc: '中国现代史、古代文学、美学原理、外国文学、英语' },
  { value: 'science', label: '理工科专业', desc: '高数、大学物理、无机化学、生物基础' },
  { value: 'custom', label: '自定义', desc: '由 AI 根据你的描述生成（请在对话框中说明）' },
];

export function AIGeneratePanel({ open, onClose, onGenerated, generate }: AIGeneratePanelProps) {
  const [preset, setPreset] = useState<'cs' | 'liberal' | 'science' | 'custom'>('cs');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ inserted: number; failed: number; msg: string } | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setResult(null);
    try {
      const r = await generate(preset);
      if (r.success && r.data) {
        setResult({
          inserted: r.data.inserted?.length || 0,
          failed: r.data.failed?.length || 0,
          msg: r.message,
        });
        onGenerated(r.data.inserted || [], r.data.failed || []);
      } else {
        message.error(r.message || '生成失败');
      }
    } catch (e: any) {
      message.error(e.message || '生成失败');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setResult(null);
    onClose();
  };

  return (
    <Dialog
      visible={open}
      onClose={handleClose}
      header={
        <div className="flex items-center gap-2">
          <StarIcon style={{ color: 'var(--td-brand-color)' }} />
          <span>AI 自动生成课表</span>
        </div>
      }
      width={520}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose}>关闭</Button>
          <Button
            theme="primary"
            icon={loading ? <Loading /> : <StarIcon />}
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? '生成中...' : '一键生成'}
          </Button>
        </div>
      }
    >
      <div className="text-sm mb-3" style={{ color: 'var(--td-text-color-secondary)' }}>
        选择专业模板，AI 会根据冲突检测算法（禁飞区）批量插入课程。
      </div>

      <Radio.Group value={preset} onChange={(v) => setPreset(v as any)}>
        <div className="space-y-2">
          {PRESETS.map(p => (
            <Radio key={p.value} value={p.value}>
              <div className="py-1">
                <div className="font-medium">{p.label}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--td-text-color-placeholder)' }}>
                  {p.desc}
                </div>
              </div>
            </Radio>
          ))}
        </div>
      </Radio.Group>

      {result && (
        <div
          className="mt-4 p-3 rounded-md text-sm"
          style={{
            backgroundColor: 'var(--td-bg-color-component)',
            color: 'var(--td-text-color-primary)',
          }}
        >
          <div>✓ 已生成 <strong>{result.inserted}</strong> 门课程</div>
          {result.failed > 0 && (
            <div style={{ color: 'var(--td-error-color)' }}>
              ✗ {result.failed} 项因冲突未插入
            </div>
          )}
          <div className="text-xs mt-1" style={{ color: 'var(--td-text-color-placeholder)' }}>
            {result.msg}
          </div>
        </div>
      )}

      <div
        className="mt-3 p-2 rounded text-xs"
        style={{
          backgroundColor: 'var(--td-bg-color-component)',
          color: 'var(--td-text-color-placeholder)',
        }}
      >
        💡 提示：批量插入时，禁飞区算法会逐条校验时间/教室冲突。
        如需自定义课表，可在 AI 对话页描述需求。
      </div>
    </Dialog>
  );
}