import { useState } from 'react';
import { Tabs, Button, Alert, message } from 'tdesign-react';
import { StarIcon } from 'tdesign-icons-react';
import { useStudy } from '../hooks/useStudy';
import { TodoList } from '../components/study/TodoList';
import { GoalList } from '../components/study/GoalList';
import { StatsCharts } from '../components/study/StatsCharts';
import { ReminderBar } from '../components/study/ReminderBar';

export function StudyPage() {
  const study = useStudy();

  const handleGeneratePlan = async () => {
    const start = new Date().toISOString().slice(0, 10);
    const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);
    try {
      await study.generateStudyPlan({ startDate: start, endDate: end });
      message.success('已生成学习计划，可在 AI 对话页查看详情');
    } catch (e: any) {
      message.error(e.message || '生成失败');
    }
  };

  return (
    <div className="flex-1 flex flex-col p-4 gap-3 overflow-hidden">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--td-text-color-primary)' }}>
          学习管家
        </h2>
        <Button
          theme="primary"
          variant="outline"
          icon={<StarIcon />}
          onClick={handleGeneratePlan}
          loading={study.loading}
        >
          生成下周学习计划
        </Button>
      </div>

      {study.error && (
        <Alert theme="error" message={study.error} onClose={study.refresh} />
      )}

      {study.lastGenerateMsg && (
        <Alert
          theme="info"
          message={`AI 生成结果：${study.lastGenerateMsg}`}
          onClose={study.clearPlanMsg}
        />
      )}

      <div className="flex-1 overflow-y-auto">
        <Tabs defaultValue="overview">
          <Tabs.TabPanel value="overview" label="总览">
            <div className="pt-4">
              <StatsCharts overall={study.overall} daily={study.daily} />
            </div>
          </Tabs.TabPanel>

          <Tabs.TabPanel value="todos" label={`待办（${study.todos.filter(t => t.status !== 'completed').length}）`}>
            <div className="pt-4">
              <TodoList
                todos={study.todos}
                onAdd={study.addTodo}
                onUpdate={study.updateTodo}
                onRemove={study.removeTodo}
              />
            </div>
          </Tabs.TabPanel>

          <Tabs.TabPanel value="goals" label={`目标（${study.goals.filter(g => g.status === 'active').length}）`}>
            <div className="pt-4">
              <GoalList
                goals={study.goals}
                onAdd={study.addGoal}
                onUpdate={study.updateGoal}
                onRemove={study.removeGoal}
              />
            </div>
          </Tabs.TabPanel>

          <Tabs.TabPanel value="reminders" label={`提醒（${study.reminders.filter(r => r.status === 'pending').length}）`}>
            <div className="pt-4">
              <ReminderBar
                reminders={study.reminders}
                onAdd={study.addReminder}
                onCancel={study.cancelReminder}
              />
            </div>
          </Tabs.TabPanel>
        </Tabs>
      </div>
    </div>
  );
}