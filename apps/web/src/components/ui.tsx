import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { Icon, type IconName } from './icons';

/* ------------------------------------------------------------------- button */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'default';

export function Button({
  children,
  variant = 'default',
  size,
  block,
  loading,
  icon,
  className = '',
  disabled,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: 'sm';
  block?: boolean;
  loading?: boolean;
  icon?: IconName;
}) {
  const variantClass = variant === 'default' ? '' : `btn-${variant}`;
  return (
    <button
      type={type}
      className={`btn ${variantClass} ${size === 'sm' ? 'btn-sm' : ''} ${block ? 'btn-block' : ''} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <span className="spinner" aria-hidden="true" /> : icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string }) {
  return (
    <button type="button" className={`icon-btn ${className}`} aria-label={label} title={label} {...props}>
      <Icon name={icon} />
    </button>
  );
}

/* --------------------------------------------------------------------- card */
export function Card({
  children,
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article';
}) {
  return <Tag className={`card ${className}`}>{children}</Tag>;
}

export function PageHead({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="row-between">
        <h1>{title}</h1>
        {action}
      </div>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  optional,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor: string;
  children: ReactNode;
  optional?: boolean;
}) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>
        {label}
        {optional ? <span className="muted" style={{ fontWeight: 600 }}> · optional</span> : null}
      </label>
      {children}
      {hint && !error ? <span className="hint">{hint}</span> : null}
      {error ? <span className="error-text" role="alert">{error}</span> : null}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({
  children,
  pressed,
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { pressed?: boolean }) {
  return (
    <button type="button" className="chip" aria-pressed={pressed} onClick={onClick} {...props}>
      {children}
    </button>
  );
}

export function SwitchRow({
  label,
  description,
  checked,
  onChange,
  id,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  id: string;
}) {
  return (
    <div className="switch-row">
      <div>
        <div className="strong">{label}</div>
        {description ? <div className="tiny muted">{description}</div> : null}
      </div>
      <label className="switch">
        <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <span aria-hidden="true" />
        <span className="sr-only">{label}</span>
      </label>
    </div>
  );
}

/* -------------------------------------------------------------------- rings */
export function ProgressRing({
  value,
  max,
  label,
  center,
  sub,
  tone = 'primary',
  size = 138,
}: {
  value: number;
  max: number;
  label: string;
  center: ReactNode;
  sub?: string;
  tone?: 'primary' | 'water' | 'over';
  size?: number;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  return (
    <div className={`ring ${tone === 'water' ? 'water' : tone === 'over' ? 'over' : ''}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" role="img" aria-label={`${label}: ${Math.round(pct)} percent`}>
        <circle className="ring-circle" cx="60" cy="60" r={radius} />
        <circle
          className="ring-value"
          cx="60"
          cy="60"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="ring-center">
        <strong>{center}</strong>
        {sub ? <span>{sub}</span> : null}
      </div>
    </div>
  );
}

export function ProgressBar({ value, max, tone = 'primary' }: { value: number; max: number; tone?: 'primary' | 'water' | 'over' }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={`progress ${tone === 'water' ? 'water' : tone === 'over' ? 'over' : ''}`} aria-hidden="true">
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ------------------------------------------------------------------ states */
export function EmptyState({
  icon = 'plate',
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Icon name={icon} size={48} strokeWidth={1.4} />
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-state" role="alert">
      <Icon name="alert" size={20} />
      <div className="grow">
        <div>{message}</div>
        {onRetry ? (
          <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: 8 }} onClick={onRetry}>
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading-inline" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="stack-sm" aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <div key={index} className="skeleton text" style={{ width: `${90 - index * 12}%` }} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- modal */
export function Modal({
  title,
  children,
  onClose,
  actions,
  labelledBy,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  actions?: ReactNode;
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = ref.current?.querySelector<HTMLElement>('button, [href], input, select, textarea');
    focusable?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={labelledBy ? undefined : title} aria-labelledby={labelledBy} ref={ref}>
        <div className="modal-head">
          <h2 id={labelledBy ?? 'modal-title'}>{title}</h2>
          <IconButton icon="close" label="Close dialog" onClick={onClose} />
        </div>
        {children}
        {actions ? <div className="modal-actions">{actions}</div> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- toast */
type ToastTone = 'default' | 'success' | 'error';
interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}
interface ToastContextValue {
  push: (message: string, tone?: ToastTone) => void;
}
const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);
  const push = useCallback((message: string, tone: ToastTone = 'default') => {
    counter.current += 1;
    const id = counter.current;
    setItems((current) => [...current.slice(-2), { id, message, tone }]);
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 4200);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className={`toast ${item.tone}`}>
            <span>{item.message}</span>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}
              style={{ background: 'none', border: 0, color: 'inherit', padding: 0, display: 'grid' }}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
