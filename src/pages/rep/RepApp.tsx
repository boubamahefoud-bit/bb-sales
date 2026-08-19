import { useCallback, useEffect, useRef, useState } from 'react'
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
  Radio,
  MapPinOff,
  Loader2,
} from 'lucide-react'
import RepFinancials from './RepFinancials'
import RepInventory from './RepInventory'
import RepCustomers from './RepCustomers'
import RepSale from './RepSale'
import { haversineMeters } from '../../lib/geo'

type Tab = 'sale' | 'inventory' | 'customers' | 'financials'

const TABS: { id: Tab; label: string; icon: typeof Wallet }[] = [
  { id: 'sale', label: 'المنتجات والبيع', icon: Receipt },
  { id: 'inventory', label: 'المخزون المتوفر بالشاحنة', icon: Boxes },
  { id: 'customers', label: 'مواقع العملاء والعمليات', icon: Users },
  { id: 'financials', label: 'الفواتير والديون المستحقة', icon: Wallet },
]

type TrackingState = 'off' | 'starting' | 'on' | 'denied' | 'unsupported'

const SEND_MIN_MS = 15000
const SEND_MIN_METERS = 40

/**
 * Live GPS broadcasting: watches the device position and pushes a location row
 * whenever the rep moves enough or a minimum interval elapses. Works in both
 * session (email/password) and unique-link (token) modes via store.addRepLocation.
 */
function useRepTracking(addRepLocation: (lat: number, lng: number) => Promise<void>) {
  const [status, setStatus] = useState<TrackingState>('off')
  const [enabled, setEnabled] = useState(true)
  const lastSentRef = useRef<{ t: number; lat: number; lng: number } | null>(null)
  const addLocRef = useRef(addRepLocation)
  useEffect(() => {
    addLocRef.current = addRepLocation
  }, [addRepLocation])

  useEffect(() => {
    if (!enabled) {
      setStatus('off')
      return
    }
    if (!('geolocation' in navigator)) {
      setStatus('unsupported')
      return
    }
    setStatus('starting')
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        setStatus('on')
        const now = Date.now()
        const last = lastSentRef.current
        const moved = last
          ? haversineMeters(last.lat, last.lng, latitude, longitude)
          : Infinity
        if (!last || now - last.t >= SEND_MIN_MS || moved >= SEND_MIN_METERS) {
          lastSentRef.current = { t: now, lat: latitude, lng: longitude }
          addLocRef.current(latitude, longitude).catch(() => {})
        }
      },
      (err) => {
        setStatus(err.code === 1 ? 'denied' : 'off')
      },
      // Ultra-high accuracy: GPS + timeout 10s so rep and customer pins land
      // exactly, not on coarse cell-tower estimates.
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [enabled])

  return { status, enabled, setEnabled }
}

export default function RepApp() {
  const { user, store, logout, addRepLocation } = useStore()
  const { theme, toggle } = useTheme()
  const { show } = useToast()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('sale')

  const { status, enabled, setEnabled } = useRepTracking(
    useCallback(
      (lat: number, lng: number) => addRepLocation(lat, lng),
      [addRepLocation],
    ),
  )

  useEffect(() => {
    if (status === 'denied') {
      show('error', 'التتبع الحيّ معطّل — امنح التطبيق إذن الموقع من إعدادات المتصفح')
    } else if (status === 'unsupported') {
      show('info', 'الجهاز لا يدعم تحديد الموقع الحيّ')
    } else if (status === 'on' && enabled) {
      show('success', 'التتبع الحيّ مفعّل — يُرسل موقعك لحظياً')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, enabled])

  async function handleLogout() {
    setEnabled(false)
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
            <button
              onClick={() => setEnabled((v) => !v)}
              className={`btn-ghost btn-md !h-10 !w-10 !p-0 ${
                status === 'on' ? '!text-success' : status === 'denied' ? '!text-destructive' : ''
              }`}
              aria-label={status === 'on' ? 'إيقاف التتبع الحيّ' : 'تشغيل التتبع الحيّ'}
            >
              {status === 'starting' ? (
                <Loader2 className="size-5 animate-spin" />
              ) : status === 'on' ? (
                <Radio className="size-5 animate-pulse" />
              ) : (
                <MapPinOff className="size-5" />
              )}
            </button>
            <button onClick={toggle} className="btn-ghost btn-md !h-10 !w-10 !p-0" aria-label="تبديل الوضع الليلي">
              {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </button>
            <button onClick={handleLogout} className="btn-ghost btn-md !h-10 !w-10 !p-0" aria-label="تسجيل الخروج">
              <LogOut className="size-5" />
            </button>
          </div>
        </div>
      </header>

      {status === 'on' && (
        <div className="bg-success/10 text-success text-center text-[11px] font-bold py-1 px-4" dir="rtl">
          التتبع الحيّ مفعّل — يتم إرسال موقعك للمدير لحظياً
        </div>
      )}

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
