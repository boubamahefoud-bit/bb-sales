import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, AlertTriangle, X } from 'lucide-react'
import { fmtMoney, fmtNum, CURRENCY } from '../lib/format'

/* ---------- Money ---------- */

export function Money({ value, className = '' }: { value: number; className?: string }) {
  return (
    <span className={`tnum ${className}`} dir="ltr">
      {fmtMoney(value)}
    </span>
  )
}

export function Num({ value, className = '' }: { value: number; className?: string }) {
  return (
    <span className={`tnum ${className}`} dir="ltr">
      {fmtNum(value)}
    </span>
  )
}

export function CurrencyTag() {
  return <span className="tnum text-xs text-muted-foreground">{CURRENCY}</span>
}

/* ---------- Toast ---------- */

type ToastKind = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

const ToastCtx = createContext<{ show: (kind: ToastKind, message: string) => void } | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const show = useCallback((kind: ToastKind, message: string) => {
    const id = ++idRef.current
    setToasts((t) => [...t, { id, kind, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500)
  }, [])

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[1000] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-border bg-card px-4 py-3 text-sm font-bold text-foreground shadow-pop fade-in-up max-w-sm"
          >
            {t.kind === 'success' && <CheckCircle2 className="size-5 shrink-0 text-success" />}
            {t.kind === 'error' && <AlertTriangle className="size-5 shrink-0 text-destructive" />}
            {t.kind === 'info' && <AlertTriangle className="size-5 shrink-0 text-info" />}
            <span>{t.message}</span>
            <button
              className="ms-1 text-muted-foreground hover:text-foreground"
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
              aria-label="إغلاق"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

/* ---------- Stat Card ---------- */

export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = 'primary',
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  icon?: ReactNode
  tone?: 'primary' | 'accent' | 'warning' | 'destructive' | 'info' | 'muted'
}) {
  const tones: Record<string, string> = {
    primary: 'bg-primary/10 text-primary',
    accent: 'bg-accent/10 text-accent',
    warning: 'bg-warning/15 text-warning-foreground',
    destructive: 'bg-destructive/10 text-destructive',
    info: 'bg-info/10 text-info',
    muted: 'bg-muted text-muted-foreground',
  }
  return (
    <div className="card p-4 sm:p-5 flex items-start gap-3.5">
      {icon && <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${tones[tone]}`}>{icon}</span>}
      <div className="min-w-0">
        <div className="text-xs font-bold text-muted-foreground">{label}</div>
        <div className="mt-1 text-xl sm:text-2xl font-extrabold leading-tight break-words">{value}</div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </div>
    </div>
  )
}

/* ---------- Modal / Sheet ---------- */

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'md' | 'lg'
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[900] flex items-end sm:items-center justify-center">
      <button className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} aria-label="إغلاق" />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full flex flex-col rounded-t-2xl sm:rounded-2xl bg-card text-card-foreground border border-border shadow-pop fade-in-up ${
          size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg'
        } max-h-[92dvh]`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-lg font-extrabold">{title}</h2>
          <button onClick={onClose} className="btn-ghost btn-sm p-1.5" aria-label="إغلاق">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5 flex-1">{children}</div>
        {footer && <div className="border-t border-border px-5 py-4 flex items-center gap-3">{footer}</div>}
      </div>
    </div>
  )
}

/* ---------- Empty state ---------- */

export function EmptyState({
  icon,
  title,
  desc,
  action,
}: {
  icon?: ReactNode
  title: string
  desc?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center px-4">
      {icon && <span className="grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground">{icon}</span>}
      <div className="font-extrabold text-foreground">{title}</div>
      {desc && <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">{desc}</p>}
      {action}
    </div>
  )
}

/* ---------- Skeleton ---------- */

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton rounded-lg ${className}`} />
}

export function LoadingBlock() {
  return (
    <div className="space-y-3 p-4">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  )
}

/* ---------- Payment status badge ---------- */

export function PaymentBadge({ status }: { status: 'paid' | 'partial' | 'debt' }) {
  if (status === 'paid') return <span className="badge-accent">مدفوع بالكامل</span>
  if (status === 'partial') return <span className="badge-warning">دفعة جزئية</span>
  return <span className="badge-destructive">دين</span>
}

/* ---------- Segmented control ---------- */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div role="tablist" className="inline-flex rounded-xl bg-muted p-1 gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-10 px-4 rounded-lg text-sm font-bold transition-colors ${
            value === o.value ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
