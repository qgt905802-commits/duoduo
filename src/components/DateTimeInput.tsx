/**
 * 通用日期/时间输入组件
 *
 * TDesign React 的 Input 不支持 type="time"/"date"/"datetime-local"。
 * 这里使用原生 HTML input 并应用 TDesign 风格的样式。
 */

interface DateTimeInputProps {
  type: 'time' | 'date' | 'datetime-local';
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}

export function DateTimeInput({ type, value, onChange, disabled }: DateTimeInputProps) {
  return (
    <input
      type={type}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      style={{
        width: '100%',
        height: 30,
        padding: '0 12px',
        borderRadius: 'var(--td-radius-default)',
        border: '1px solid var(--td-component-stroke)',
        backgroundColor: 'var(--td-bg-color-component)',
        color: 'var(--td-text-color-primary)',
        font: 'inherit',
        outline: 'none',
        transition: 'border-color 0.2s',
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = 'var(--td-brand-color)';
        e.currentTarget.style.boxShadow = '0 0 0 2px var(--td-brand-color-light)';
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = 'var(--td-component-stroke)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    />
  );
}