import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../../lib/store'
import { useTheme } from '../../lib/theme'
import { useToast } from '../../components/ui'
import {
  Truck,
  LayoutDashboard,
  Users,
  Receipt,
  MapPinned,
  Moon,
  Sun,
  LogOut,
  ShieldCheck,
} from 'lucide-react'
import ManagerDashboard from './ManagerDashboard'
import ManagerReps from './ManagerReps'
import ManagerInvoices from './ManagerInvoices'
import ManagerLiveMap from './ManagerLiveMap'

type Tab = 'dashboard' | 'reps' | 'invoices' | 'map'

const NAV: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard },
  { id: 'reps', label: 'المندوبون', icon: Users },
  { id: 'invoices', label: 'الفواتير', icon: Receipt },
  { id: 'map', label: 'الخريطة الحية', icon: MapPinned },
]

export default function ManagerApp() {
  const { user, store, logout } = useStore()
  const { theme, toggle } = useTheme()
  const { show } = useToast()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('dashboard')

  async function handleLogout() {
    await logout()
    show('info', 'تم تسجيل الخروج')
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-dvh lg:flex" dir="rtl">
      {/* Sidebar (desktop) */}
      <aside className="hidden lg:flex lg:w-64 xl:w-72 shrink-0 flex-col border-e border-border bg-card sticky top-0 h-dvh">
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-border">
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Truck className="size-6" />
          </span>
          <div className="leading-tight min-w-0">
            <div className="font-extrabold truncate">{store?.name ?? 'BB Sales'}</div>
            <div className="text-xs text-muted-foreground">بي بي سيلز</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1" aria-label="التنقل الرئيسي">
          {NAV.map((n) => {
            const active = tab === n.id
            const Icon = n.icon
            return (
              <button
                key={n.id}
                onClick={() => setTab(n.id)}
                aria-current={active ? 'page' : undefined}
                className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-bold transition-colors ${
                  active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="size-5" />
                {n.label}
              </button>
            )
          })}
        </nav>

        <div className="p-3 border-t border-border space-y-2">
          <div className="rounded-xl bg-muted p-3 flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground font-extrabold">
              {(user?.full_name ?? '?').slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-extrabold text-sm truncate">{user?.full_name}</div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <ShieldCheck className="size-3.5" /> مدير عام
              </div>
            </div>
            <button onClick={handleLogout} className="btn-ghost btn-sm p-2" aria-label="تسجيل الخروج">
              <LogOut className="size-5" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        {/* Mobile / tablet header */}
        <header className="lg:hidden sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
          <div className="flex h-14 items-center justify-between px-4">
            <div className="flex items-center gap-2 min-w-0">
              <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
                <Truck className="size-5" />
              </span>
              <div className="leading-tight min-w-0">
                <div className="text-sm font-extrabold truncate">{store?.name ?? 'BB Sales'}</div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <ShieldCheck className="size-3" /> مدير عام
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={toggle} className="btn-ghost btn-sm p-2" aria-label="تبديل الوضع الليلي">
                {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
              </button>
              <button onClick={handleLogout} className="btn-ghost btn-sm p-2" aria-label="تسجيل الخروج">
                <LogOut className="size-5" />
              </button>
            </div>
          </div>
          {/* Horizontal tabs */}
          <div className="overflow-x-auto px-2 pb-2 flex gap-1">
            {NAV.map((n) => {
              const active = tab === n.id
              const Icon = n.icon
              return (
                <button
                  key={n.id}
                  onClick={() => setTab(n.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`shrink-0 inline-flex items-center gap-1.5 h-10 px-3.5 rounded-lg text-sm font-bold transition-colors ${
                    active ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
                  }`}
                >
                  <Icon className="size-4.5" />
                  {n.label}
                </button>
              )
            })}
          </div>
        </header>

        <main className="px-4 sm:px-6 lg:px-8 py-6 max-w-6xl">
          {tab === 'dashboard' && <ManagerDashboard />}
          {tab === 'reps' && <ManagerReps />}
          {tab === 'invoices' && <ManagerInvoices />}
          {tab === 'map' && <ManagerLiveMap />}
        </main>
      </div>
    </div>
  )
}
