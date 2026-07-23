import { useState, useEffect } from 'react';
import {
  Dialog, Form, Input, Select, Button, ColorPicker, message,
} from 'tdesign-react';
import type { Course, Classroom } from '../../types';
import { pickColor } from '../../hooks/useSchedule';
import { DateTimeInput } from '../DateTimeInput';
import { CLASS_PERIODS, minToTimeStr, type ClassPeriod } from '../../config/classTimes';

interface CourseModalProps {
  open: boolean;
  course: Course | null;       // null = 新建
  classrooms: Classroom[];
  prefill?: {
    weekday?: number;
    startMin?: number;
    endMin?: number;
    date?: Date;
  };
  onClose: () => void;
  onSubmit: (data: Partial<Course>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

const WEEKDAYS = [
  { label: '周一', value: 1 },
  { label: '周二', value: 2 },
  { label: '周三', value: 3 },
  { label: '周四', value: 4 },
  { label: '周五', value: 5 },
  { label: '周六', value: 6 },
  { label: '周日', value: 0 },
];

export function CourseModal({
  open, course, classrooms, prefill, onClose, onSubmit, onDelete,
}: CourseModalProps) {
  const [title, setTitle] = useState('');
  const [teacher, setTeacher] = useState('');
  const [location, setLocation] = useState('');
  const [classroomId, setClassroomId] = useState<string | undefined>();
  const [weekday, setWeekday] = useState<number>(1);
  const [periodIndex, setPeriodIndex] = useState<number>(1);   // 当前选中的节次
  const [startMin, setStartMin] = useState<number>(CLASS_PERIODS[0].startMin);
  const [endMin, setEndMin] = useState<number>(CLASS_PERIODS[0].endMin);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [color, setColor] = useState<string>(pickColor(0));
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  /** 节次切换时同步开始/结束时间 */
  const handlePeriodChange = (idx: number) => {
    setPeriodIndex(idx);
    const p = CLASS_PERIODS.find(x => x.index === idx);
    if (p) {
      setStartMin(p.startMin);
      setEndMin(p.endMin);
    }
  };

  useEffect(() => {
    if (course) {
      setTitle(course.title);
      setTeacher(course.teacher || '');
      setLocation(course.location || '');
      setClassroomId(course.classroom_id);
      setWeekday(course.weekday);
      // 根据已有 start_min 推断对应节次，找不到则回退第 1 节
      const matched = CLASS_PERIODS.find(p => p.startMin === course.start_min);
      setPeriodIndex(matched?.index || 1);
      setStartMin(course.start_min);
      setEndMin(course.end_min);
      setStartDate(course.start_date);
      setEndDate(course.end_date);
      setColor(course.color || pickColor(0));
      setNote(course.note || '');
    } else {
      setTitle('');
      setTeacher('');
      setLocation('');
      setClassroomId(undefined);
      setWeekday(prefill?.weekday ?? 1);
      // 根据 prefill 推断对应节次
      const matched = prefill?.startMin !== undefined
        ? CLASS_PERIODS.find(p => p.startMin === prefill.startMin)
        : undefined;
      const pIdx = matched?.index || 1;
      setPeriodIndex(pIdx);
      const p = CLASS_PERIODS.find(x => x.index === pIdx)!;
      setStartMin(p.startMin);
      setEndMin(p.endMin);
      // 默认学期：本周一至第 18 周末
      const today = new Date();
      const day = today.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      const semStart = new Date(today);
      semStart.setDate(today.getDate() + diff);
      const semEnd = new Date(semStart);
      semEnd.setDate(semStart.getDate() + 18 * 7 - 1);
      setStartDate(prefill?.date ? toDateStr(prefill.date) : toDateStr(semStart));
      setEndDate(toDateStr(semEnd));
      setColor(pickColor(Math.floor(Math.random() * 10)));
      setNote('');
    }
  }, [course, prefill, open]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      message.warning('请输入课程名称');
      return;
    }
    if (endMin <= startMin) {
      message.warning('结束时间必须晚于开始时间');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        title,
        teacher,
        location,
        classroom_id: classroomId,
        weekday,
        start_min: startMin,
        end_min: endMin,
        start_date: startDate,
        end_date: endDate,
        color,
        note,
        source: course?.source || 'manual',
      });
      onClose();
    } catch (e: any) {
      // 错误由父组件处理（已通过 lastConflict 设置）
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!course || !onDelete) return;
    if (!confirm(`确认删除「${course.title}」？`)) return;
    setSubmitting(true);
    try {
      await onDelete(course.id);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  // 把分钟数转换为 HH:MM 字符串
  const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  const fromHHMM = (s: string): number => {
    const [h, m] = s.split(':').map(Number);
    return h * 60 + (m || 0);
  };

  return (
    <Dialog
      visible={open}
      onClose={onClose}
      header={course ? '编辑课程' : '新增课程'}
      width={600}
      footer={
        <div className="flex justify-between w-full">
          <div>
            {course && onDelete && (
              <Button theme="danger" variant="text" onClick={handleDelete} disabled={submitting}>
                删除课程
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={submitting}>取消</Button>
            <Button theme="primary" onClick={handleSubmit} loading={submitting}>
              {course ? '保存' : '添加'}
            </Button>
          </div>
        </div>
      }
    >
      <Form labelAlign="top">
        <Form.FormItem label="课程名称">
          <Input value={title} onChange={(v) => setTitle(v as string)} placeholder="如：高等数学" />
        </Form.FormItem>

        <div className="grid grid-cols-2 gap-4">
          <Form.FormItem label="教师">
            <Input value={teacher} onChange={(v) => setTeacher(v as string)} placeholder="王老师" />
          </Form.FormItem>
          <Form.FormItem label="颜色">
            <ColorPicker
              value={color}
              onChange={(v) => setColor(typeof v === 'string' ? v : (v as any).hex || '#0052d9')}
              enableAlpha={false}
              format="HEX"
            />
          </Form.FormItem>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Form.FormItem label="教室">
            <Select
              value={classroomId}
              onChange={(v) => setClassroomId(v as string)}
              placeholder="选择教室"
              clearable
              filterable
            >
              {classrooms.map(c => (
                <Select.Option key={c.id} value={c.id} label={`${c.name}（${c.capacity} 人）`} />
              ))}
            </Select>
          </Form.FormItem>
          <Form.FormItem label="地点描述">
            <Input value={location} onChange={(v) => setLocation(v as string)} placeholder="教学楼 A101" />
          </Form.FormItem>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Form.FormItem label="星期">
            <Select value={weekday} onChange={(v) => setWeekday(v as number)}>
              {WEEKDAYS.map(d => (
                <Select.Option key={d.value} value={d.value} label={d.label} />
              ))}
            </Select>
          </Form.FormItem>
          <Form.FormItem
            label={
              <span>
                节次（{minToTimeStr(startMin)} - {minToTimeStr(endMin)}）
              </span>
            }
            help="系统内置 13 个标准时段"
          >
            <Select
              value={periodIndex}
              onChange={(v) => handlePeriodChange(v as number)}
            >
              {CLASS_PERIODS.map(p => (
                <Select.Option
                  key={p.index}
                  value={p.index}
                  label={`第 ${p.index} 节 · ${minToTimeStr(p.startMin)}-${minToTimeStr(p.endMin)}`}
                />
              ))}
            </Select>
          </Form.FormItem>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Form.FormItem label="学期开始">
            <DateTimeInput
              type="date"
              value={startDate}
              onChange={setStartDate}
            />
          </Form.FormItem>
          <Form.FormItem label="学期结束">
            <DateTimeInput
              type="date"
              value={endDate}
              onChange={setEndDate}
            />
          </Form.FormItem>
        </div>

        <Form.FormItem label="备注">
          <Input value={note} onChange={(v) => setNote(v as string)} placeholder="可选" />
        </Form.FormItem>

        <div
          className="mt-2 p-2 rounded text-xs"
          style={{
            backgroundColor: 'var(--td-bg-color-component)',
            color: 'var(--td-text-color-placeholder)',
          }}
        >
          ⚠️ 冲突检测说明：保存时会调用禁飞区「课表冲突检测算法」，
          若与现有课程时间/教室/教师冲突会提示错误。
        </div>
      </Form>
    </Dialog>
  );
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}