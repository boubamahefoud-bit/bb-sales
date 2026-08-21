import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../../lib/store'
import { useTheme } from '../../lib/theme'
import { useToast } from '../../components/ui'
import {
  Truck,
  Wallet,
  Boxes,
  Users,
  Receipt,
  Moon,
  Sun,
  LogOut,
  UserCircle2,
} from 'lucide-react'
import RepFinancials from './RepFinancials'
import RepInventory from './RepInventory'
import RepCustomers from './RepCustomers'
import RepSale from './RepSale'

type Tab = 'sale' | 'inventory' | 'customers' | 'financials'

const TABS: { id: Tab; label: string; icon: typeof Wallet }[] = [
  { id: 'sale', label: 'المنتجات والبيع', icon: Receipt },
  { id: 'inventory', label: 'المخزون المتوفر بالشاحنة', icon: Boxes },
  { id: 'customers', label: 'العملاء والعمليات', icon: Users },
  { id: 'financials', label: 'الفواتير والديون المستحقة', icon: Wallet },
]

export default function RepApp() {
  const { user, store, logout } = useStore()
  const { theme, toggle } = useTheme()
  const { show } = useToast()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('sale')

  async function handleLogout() {
    await logout()
    show('info', 'تم تسجيل الخروج')
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-dvh pb-20" dir="rtl">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto max-w-3xl flex h-16 items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Truck className="size-5" />
            </span>
            <div className="leading-tight min-w-0">
              <div className="text-sm font-extrabold">{store?.name ?? 'BB Sales'}</div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                <UserCircle2 className="size-3.5 shrink-0" />
                <span className="truncate">{user?.full_name}</span>
                {user?.truck_id && (
                  <span className="badge-muted !py-0 !px-2 text-[10px]">شاحنة {user.truck_id}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={toggle} className="btn-ghost btn-md !h-10 !w-10 !p-0" aria-label="تبديل الوضع الليلي">
              {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </button>
            <button onClick={handleLogout} className="btn-ghost btn-md !h-10 !w-10 !p-0" aria-label="تسجيل الخروج">
              <LogOut className="size-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-5">
        {tab === 'sale' && <RepSale />}
        {tab === 'inventory' && <RepInventory />}
        {tab === 'customers' && <RepCustomers />}
        {tab === 'financials' && <RepFinancials />}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur"
        aria-label="التنقل الرئيسي"
      >
        <div className="mx-auto max-w-3xl grid grid-cols-4">
          {TABS.map((t) => {
            const active = tab === t.id
            const Icon = t.icon
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={active ? 'page' : undefined}
                className={`relative flex flex-col items-center justify-center gap-1 py-2.5 min-h-14 transition-colors ${
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" />}
                <Icon className="size-6" />
                <span className="text-[11px] font-bold">{t.label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
