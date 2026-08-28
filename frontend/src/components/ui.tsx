import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Inbox,
  LoaderCircle,
  Search,
  X,
} from 'lucide-react';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { useEffect, useId } from 'react';
import { getApiErrorMessage } from '../lib/api';
import { statusLabel } from '../lib/format';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'secondary',
  className = '',
  children,
  loading = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean }) {
  return (
    <button className={`button button--${variant} ${className}`} disabled={loading || props.disabled} {...props}>
      {loading && <LoaderCircle className="spin" size={16} aria-hidden="true" />}
      {children}
    </button>
  );
}

export function IconButton({ label, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button className={`icon-button ${className}`} aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}

export function StatusBadge({ status, label }: { status?: string | null; label?: string }) {
  const normalized = (status || 'UNKNOWN').toUpperCase();
  const positive = ['ACTIVE', 'HEALTHY', 'CONNECTED', 'VERIFIED', 'DELIVERED', 'SENT', 'INTERESTED', 'COMPLETED', 'READY', 'UP', 'OK'];
  const negative = ['PROBLEM', 'FAILED', 'BOUNCED', 'BLOCKED', 'DISCONNECTED', 'DOWN', 'ERROR'];
  const warning = ['WARNING', 'PAUSED', 'SCHEDULED', 'QUEUED', 'OUT_OF_OFFICE', 'UNKNOWN'];
  const tone = positive.includes(normalized)
    ? 'success'
    : negative.includes(normalized)
      ? 'danger'
      : warning.includes(normalized)
        ? 'warning'
        : 'neutral';
  return <span className={`status status--${tone}`}>{label || statusLabel(status)}</span>;
}

export function LoadingState({ label = 'جارٍ تحميل البيانات…', rows = 4 }: { label?: string; rows?: number }) {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <div className="loading-state__title"><LoaderCircle className="spin" size={18} />{label}</div>
      <div className="skeleton-stack" aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => <span className="skeleton-line" key={i} />)}
      </div>
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'تعذّر تحميل البيانات' }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <div className="state-panel state-panel--error" role="alert">
      <AlertTriangle size={24} />
      <div>
        <h3>{title}</h3>
        <p>{getApiErrorMessage(error)}</p>
      </div>
      {onRetry && <Button onClick={onRetry}>إعادة المحاولة</Button>}
    </div>
  );
}

export function EmptyState({
  icon = <Inbox size={27} />,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'بحث…' }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="search-input">
      <Search size={17} aria-hidden="true" />
      <span className="sr-only">{placeholder}</span>
      <input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  size = 'medium',
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  size?: 'small' | 'medium' | 'large';
}) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = oldOverflow;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`modal modal--${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="modal__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <IconButton label="إغلاق" onClick={onClose}><X size={20} /></IconButton>
        </header>
        <div className="modal__body">{children}</div>
      </section>
    </div>
  );
}

export function Drawer({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <header className="drawer__header"><h2>{title}</h2><IconButton label="إغلاق" onClick={onClose}><X size={20} /></IconButton></header>
        <div className="drawer__body">{children}</div>
      </aside>
    </div>
  );
}

export function Field({ label, hint, error, required, children }: { label: string; hint?: string; error?: string; required?: boolean; children: ReactNode }) {
  return (
    <label className={`field ${error ? 'field--error' : ''}`}>
      <span className="field__label">{label}{required && <b aria-hidden="true"> *</b>}</span>
      {children}
      {error ? <span className="field__error">{error}</span> : hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  return (
    <label className={`toggle-row ${disabled ? 'is-disabled' : ''}`}>
      <span><b>{label}</b>{description && <small>{description}</small>}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} disabled={disabled} />
      <span className="toggle" aria-hidden="true"><span /></span>
    </label>
  );
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'success' | 'warning' | 'danger' }) {
  const Icon = tone === 'success' ? CheckCircle2 : AlertTriangle;
  return <div className={`notice notice--${tone}`}><Icon size={18} /> <div>{children}</div></div>;
}

export function Card({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`card ${className}`} {...props}>{children}</div>;
}

export function Pagination({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (page: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="pagination">
      <span>صفحة {page} من {totalPages} · {total} نتيجة</span>
      <div>
        <Button onClick={() => onPage(page - 1)} disabled={page <= 1}>السابق</Button>
        <Button onClick={() => onPage(page + 1)} disabled={page >= totalPages}>التالي <ChevronLeft size={15} /></Button>
      </div>
    </div>
  );
}
