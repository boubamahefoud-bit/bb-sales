import { useMemo, useState } from 'react'
import { useStore } from '../../lib/store'
import {
  Users,
  Plus,
  UserRound,
  MapPin,
  LocateFixed,
  Loader2,
  Search,
} from 'lucide-react'
import { Money, Sheet, EmptyState, useToast } from '../../components/ui'
import type { Customer } from '../../lib/types'
import { customerDebts } from '../../lib/selectors'

export default function RepCustomers() {
  const { user, data, addCustomer } = useStore()
  const { show } = useToast()

  const myCustomers = useMemo(
    () => data.customers.filter((c) => c.created_by_rep_id === user?.id),
    [data.customers, user?.id],
  )
  const debts = useMemo(() => {
    const map = new Map(customerDebts(data).map((c) => [c.customer_id, c]))
    return map
  }, [data])

  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [debtLimit, setDebtLimit] = useState('')
  const [latitude, setLatitude] = useState<number | null>(null)
  const [longitude, setLongitude] = useState<number | null>(null)
  const [locating, setLocating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Customer | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) return myCustomers
    return myCustomers.filter((c) => c.name.includes(q) || (c.phone ?? '').includes(q))
  }, [myCustomers, query])

  function pickCurrentLocation() {
    if (!navigator.geolocation) {
      show('error', 'الجهاز لا يدعم تحديد الموقع')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude)
        setLongitude(pos.coords.longitude)
        setLocating(false)
        show('success', 'تم التقاط موقع العميل الحالي')
      },
      () => {
        setLocating(false)
        show('error', 'تعذر الوصول للموقع، تحقق من الأذونات')
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  async function handleAdd() {
    if (!name.trim()) {
      show('error', 'اسم العميل مطلوب')
      return
    }
    setBusy(true)
    try {
      await addCustomer({
        name: name.trim(),
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        debt_limit: debtLimit.trim() ? Number(debtLimit) : null,
        latitude,
        longitude,
      })
      show('success', 'تمت إضافة العميل')
      setAdding(false)
      setName('')
      setPhone('')
      setAddress('')
      setDebtLimit('')
      setLatitude(null)
      setLongitude(null)
    } catch (e) {
      console.error(e)
      show('error', 'تعذر إضافة العميل')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
          <Users className="size-5" />
          <NumCount n={myCustomers.length} />
        </div>
        <button onClick={() => setAdding(true)} className="btn-primary btn-md">
          <Plus className="size-5" /> عميل جديد
        </button>
      </div>

      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
        <input
          className="input ps-11"
          placeholder="ابحث عن عميل بالاسم أو الهاتف..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users className="size-7" />}
          title="لا يوجد عملاء بعد"
          desc="أضف عملاءك وحدد مواقعهم لتنظيم زياراتك وديونك."
          action={
            <button onClick={() => setAdding(true)} className="btn-primary btn-md">
              <UserRound className="size-5" /> إضافة أول عميل
            </button>
          }
        />
      ) : (
        <div className="space-y-2.5">
          {filtered.map((c) => {
            const debt = debts.get(c.id)
            return (
              <button key={c.id} onClick={() => setSelected(c)} className="card w-full p-4 text-start flex items-center gap-3 hover:border-primary/40">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground">
                  <UserRound className="size-6" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-extrabold truncate">{c.name}</span>
                  <span className="block text-xs text-muted-foreground truncate">
                    {c.phone ? <span dir="ltr">{c.phone}</span> : 'بدون هاتف'}
                    {c.latitude != null && (
                      <>
                        {' · '}
                        <MapPin className="inline size-3.5" /> موقع محدد
                      </>
                    )}
                  </span>
                </span>
                {debt && debt.total_debt > 0 ? (
                  <span className="text-end shrink-0">
                    <span className="block text-xs font-bold text-muted-foreground">الدين</span>
                    <Money value={debt.total_debt} className="font-extrabold text-destructive" />
                    {debt.debt_limit != null && (
                      <span className="block text-[10px] text-muted-foreground tnum" dir="ltr">
                        / {debt.debt_limit.toFixed(2)} حد
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="shrink-0 text-end space-y-0.5">
                    <span className="badge-accent block w-fit ms-auto">لا دين</span>
                    {debt?.debt_limit != null && (
                      <span className="block text-[10px] text-muted-foreground tnum" dir="ltr">
                        الحد {debt.debt_limit.toFixed(2)}
                      </span>
                    )}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Add customer sheet */}
      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title="إضافة عميل جديد"
        footer={
          <>
            <button onClick={() => setAdding(false)} className="btn-outline btn-lg flex-1">إلغاء</button>
            <button onClick={handleAdd} disabled={busy} className="btn-primary btn-lg flex-1">
              {busy ? <Loader2 className="size-5 animate-spin" /> : <Plus className="size-5" />}
              إضافة
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="cname" className="label">اسم العميل *</label>
            <input id="cname" className="input" placeholder="مثال: محل الركن التجاري" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="cphone" className="label">رقم الهاتف</label>
            <input id="cphone" type="tel" dir="ltr" className="input text-left" placeholder="05xxxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label htmlFor="climit" className="label">حد الدين المسموح (اختياري)</label>
            <input id="climit" type="number" inputMode="decimal" min={0} dir="ltr" className="input text-left tnum" placeholder="مثال: 500" value={debtLimit} onChange={(e) => setDebtLimit(e.target.value)} />
            <p className="text-xs text-muted-foreground mt-1">اتركه فارغاً للسماح بدين بدون حد.</p>
          </div>
          <div>
            <label htmlFor="caddr" className="label">العنوان</label>
            <input id="caddr" className="input" placeholder="الحي، الشارع، المعلم..." value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>

          {/* One-click current location */}
          <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-bold">موقع العميل</div>
              <button onClick={pickCurrentLocation} disabled={locating} className="btn-accent btn-sm">
                {locating ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4" />}
                تحديد موقعي الحالي
              </button>
            </div>
            {latitude != null && longitude != null ? (
              <div className="text-xs font-bold text-accent tnum" dir="ltr">
                {latitude.toFixed(6)}, {longitude.toFixed(6)}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                اضغط الزر وأنت في مكان العميل لالتقاط إحداثياته بنقرة واحدة.
              </p>
            )}
          </div>
        </div>
      </Sheet>

      {/* Customer detail sheet */}
      <Sheet open={!!selected} onClose={() => setSelected(null)} title="بيانات العميل">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-xl bg-secondary text-secondary-foreground">
                <UserRound className="size-7" />
              </span>
              <div>
                <div className="text-lg font-extrabold">{selected.name}</div>
                <div className="text-xs text-muted-foreground" dir="ltr">{selected.phone ?? '—'}</div>
              </div>
            </div>
            {selected.address && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="size-4 text-primary shrink-0" /> {selected.address}
              </div>
            )}
            {selected.latitude != null && selected.longitude != null ? (
              <a
                href={`https://www.google.com/maps?q=${selected.latitude},${selected.longitude}`}
                target="_blank"
                rel="noreferrer"
                className="btn-outline btn-md w-full"
              >
                <LocateFixed className="size-5" /> فتح الموقع على الخريطة
              </a>
            ) : (
              <p className="text-xs text-muted-foreground">لم يُحدد موقع هذا العميل بعد.</p>
            )}
            {debts.get(selected.id)?.total_debt ? (
              <div className="card p-4 flex items-center justify-between">
                <span className="text-sm font-bold">إجمالي الدين المستحق</span>
                <Money value={debts.get(selected.id)!.total_debt} className="text-xl font-extrabold text-destructive" />
              </div>
            ) : (
              <span className="badge-accent w-fit">لا توجد ديون</span>
            )}
            {selected.debt_limit != null && (
              <div className="card p-4 flex items-center justify-between">
                <span className="text-sm font-bold">حد الدين المسموح</span>
                <Money value={selected.debt_limit} className="text-xl font-extrabold" />
              </div>
            )}
          </div>
        )}
      </Sheet>
    </div>
  )
}

function NumCount({ n }: { n: number }) {
  return <span className="tnum">{n}</span>
}
