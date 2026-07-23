import { useState } from 'react';
import {
  Button, Dropdown, Tag, Alert, Dialog, message,
} from 'tdesign-react';
import {
  AddIcon, StarIcon, ChevronLeftIcon, ChevronRightIcon,
} from 'tdesign-icons-react';
import { useSchedule } from '../hooks/useSchedule';
import { WeekView } from '../components/schedule/WeekView';
import { MonthView } from '../components/schedule/MonthView';
import { CourseModal } from '../components/schedule/CourseModal';
import { AIGeneratePanel } from '../components/schedule/AIGeneratePanel';
import type { Course } from '../types';

export function SchedulePage() {
  const {
    courses, classrooms, loading, error,
    viewMode, setViewMode,
    currentWeekStart, currentMonth,
    goPrev, goNext, goToday,
    addCourse, updateCourse, deleteCourse, refresh,
    lastConflict, clearConflict,
  } = useSchedule();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [prefill, setPrefill] = useState<any>(undefined);
  const [aiOpen, setAiOpen] = useState(false);

  const handleAddNew = () => {
    setEditingCourse(null);
    setPrefill(undefined);
    setModalOpen(true);
  };

  const handleEdit = (c: Course) => {
    setEditingCourse(c);
    setPrefill(undefined);
    setModalOpen(true);
  };

  const handleEmptyClick = (date: Date, hourStart: number) => {
    setEditingCourse(null);
    setPrefill({
      weekday: date.getDay(),
      startMin: hourStart,
      endMin: hourStart + 60,
      date,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (data: Partial<Course>) => {
    try {
      if (editingCourse) {
        await updateCourse(editingCourse.id, data);
        message.success('已更新');
      } else {
        await addCourse(data);
        message.success('已添加');
      }
    } catch (e: any) {
      // 冲突已通过 lastConflict 设置
      message.error(e.message || '保存失败');
      throw e;
    }
  };

  const handleDelete = async (id: string) => {
    await deleteCourse(id);
    message.success('已删除');
  };

  const handleAIGenerate = async (preset: 'cs' | 'liberal' | 'science' | 'custom') => {
    const r = await fetch('/api/tools/generate-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset }),
    });
    const result = await r.json();
    if (result.success && result.data) {
      await refresh();
      return result;
    }
    return result;
  };

  const handleCourseClick = (c: Course) => handleEdit(c);

  const navLabel = viewMode === 'week'
    ? `${currentWeekStart.getFullYear()} 年 ${currentWeekStart.getMonth() + 1} 月 ${currentWeekStart.getDate()} 日 起一周`
    : `${currentMonth.getFullYear()} 年 ${currentMonth.getMonth() + 1} 月`;

  return (
    <div className="flex-1 flex flex-col p-4 gap-3 overflow-hidden">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            shape="circle"
            icon={<ChevronLeftIcon />}
            onClick={goPrev}
          />
          <Button variant="outline" onClick={goToday}>今天</Button>
          <Button
            variant="outline"
            shape="circle"
            icon={<ChevronRightIcon />}
            onClick={goNext}
          />
          <span className="text-base font-medium ml-2" style={{ color: 'var(--td-text-color-primary)' }}>
            {navLabel}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Dropdown>
            <Button variant="outline">
              {viewMode === 'week' ? '周视图' : '月视图'}
            </Button>
            <Dropdown.DropdownMenu>
              <Dropdown.DropdownItem onClick={() => setViewMode('week')}>周视图</Dropdown.DropdownItem>
              <Dropdown.DropdownItem onClick={() => setViewMode('month')}>月视图</Dropdown.DropdownItem>
            </Dropdown.DropdownMenu>
          </Dropdown>
          <Button
            theme="primary"
            variant="outline"
            icon={<StarIcon />}
            onClick={() => setAiOpen(true)}
          >
            AI 生成课表
          </Button>
          <Button theme="primary" icon={<AddIcon />} onClick={handleAddNew}>
            新增课程
          </Button>
        </div>
      </div>

      {/* 提示信息 */}
      {error && (
        <Alert theme="error" message={error} onClose={() => refresh()} />
      )}
      {lastConflict && (
        <Alert
          theme="warning"
          message={
            <div>
              <div className="font-medium mb-1">⚠️ 检测到冲突</div>
              <div className="text-sm">{lastConflict.summary}</div>
              {lastConflict.conflicts.length > 0 && (
                <ul className="text-xs mt-2 list-disc pl-4">
                  {lastConflict.conflicts.slice(0, 5).map((c, i) => (
                    <li key={i}>
                      [{c.type}] {c.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          }
          onClose={clearConflict}
        />
      )}

      {/* 视图 */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {loading && courses.length === 0 ? (
          <div className="flex items-center justify-center flex-1">
            <span style={{ color: 'var(--td-text-color-secondary)' }}>加载中...</span>
          </div>
        ) : viewMode === 'week' ? (
          <WeekView
            weekStart={currentWeekStart}
            courses={courses}
            onCourseClick={handleCourseClick}
            onEmptyCellClick={handleEmptyClick}
          />
        ) : (
          <MonthView
            month={currentMonth}
            courses={courses}
            onCourseClick={handleCourseClick}
          />
        )}
      </div>

      {/* 底部状态栏 */}
      <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--td-text-color-secondary)' }}>
        <Tag variant="light">共 {courses.length} 门课程</Tag>
        <Tag variant="light">共 {classrooms.length} 间教室</Tag>
        <span>双击空白格可快速添加课程</span>
      </div>

      <CourseModal
        open={modalOpen}
        course={editingCourse}
        classrooms={classrooms}
        prefill={prefill}
        onClose={() => { setModalOpen(false); clearConflict(); }}
        onSubmit={handleSubmit}
        onDelete={editingCourse ? handleDelete : undefined}
      />

      <AIGeneratePanel
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onGenerated={() => {}}
        generate={handleAIGenerate}
      />
    </div>
  );
}