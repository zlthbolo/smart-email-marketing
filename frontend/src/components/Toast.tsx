import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem { id: number; title: string; description?: string; tone: ToastTone }
interface ToastContextValue { push: (title: string, tone?: ToastTone, description?: string) => void }

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((title: string, tone: ToastTone = 'info', description?: string) => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current, { id, title, description, tone }]);
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 5000);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" aria-live="polite" aria-atomic="false">
        {items.map((item) => {
          const Icon = item.tone === 'success' ? CheckCircle2 : item.tone === 'error' ? AlertCircle : Info;
          return (
            <div className={`toast toast--${item.tone}`} key={item.id} role="status">
              <Icon size={19} />
              <div><b>{item.title}</b>{item.description && <p>{item.description}</p>}</div>
              <button aria-label="إغلاق التنبيه" onClick={() => setItems((current) => current.filter((toast) => toast.id !== item.id))}><X size={16} /></button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside ToastProvider');
  return value;
}
