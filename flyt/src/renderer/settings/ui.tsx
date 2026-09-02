import { useEffect, useState, type ReactNode } from 'react';

export function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="section">
      <header className="section-header">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </header>
      <div className="card">{children}</div>
    </section>
  );
}

export function Row({ label, hint, children, stacked }: { label: string; hint?: string; children: ReactNode; stacked?: boolean }) {
  return (
    <div className={`row${stacked ? ' stacked' : ''}`}>
      <div className="row-text">
        <div className="row-label">{label}</div>
        {hint && <div className="row-hint">{hint}</div>}
      </div>
      <div className="row-control">{children}</div>
    </div>
  );
}

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`toggle${checked ? ' on' : ''}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="knob" />
    </button>
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <select className="select" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div className="slider">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="slider-value">{format ? format(value) : value}</span>
    </div>
  );
}

export function Button({
  children,
  onClick,
  kind = 'default',
  disabled,
  small,
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: 'default' | 'primary' | 'danger' | 'ghost';
  disabled?: boolean;
  small?: boolean;
}) {
  return (
    <button type="button" className={`btn ${kind}${small ? ' small' : ''}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function Badge({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'muted'; children: ReactNode }) {
  return <span className={`status-badge ${tone}`}>{children}</span>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

/** Text input that commits on blur or Enter instead of on every keystroke. */
export function DraftInput({
  value,
  onCommit,
  placeholder,
  className,
  list,
  type = 'text',
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  className?: string;
  list?: string;
  type?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <input
      className={`input ${className ?? ''}`}
      type={type}
      value={draft}
      placeholder={placeholder}
      list={list}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setDraft(value);
      }}
    />
  );
}
