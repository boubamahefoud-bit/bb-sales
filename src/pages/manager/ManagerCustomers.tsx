import { useMemo, useState } from 'react'
import { useStore } from '../../lib/store'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import { pinIcon } from '../../lib/mapIcon'
import {
  Contact,
  Plus,
  Search,
  LocateFixed,
  Loader2,
  UserRound,
  MapPin,
  Trash2,
  Map as MapIcon,
  List,
} from 'lucide-react'
import { Money, Sheet, EmptyState, useToast } from '../../components/ui'
import type { Customer, UserProfile } from '../../lib/types'
import { customerDebts, repName } from '../../lib/selectors'
import CustomerMap from '../../components/CustomerMap'

interface CustForm {
  name: string
  phone: string
  address: string
  debt_limit: string
  rep_id: string
  latitude: number | null
  longitude: number | null
}

const emptyForm: CustForm = { name: '', phone: '', address: '', debt_limit: '', rep_id: '', latitude: null, longitude: null }

export default function ManagerCustomers() {
  const { user, data, addCustomer, updateCustomer, deleteCustomer } = useStore()
  const { show } = useToast()

  const reps = useMemo(() => data.users.filter((u) => u.role === 'sales_rep'), [data.users])
  const debts = useMemo(() => new Map(customerDebts(data).map((c) => [c.customer_id, c])), [data])

  const [view, setView] = useState<'list' | 'map'>('list')
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [form, setForm] = useState<CustForm>(emptyForm)
  const [locating, setLocating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const allCustomers = useMemo(() => data.customers, [data.customers])

  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) return allCustomers
    return allCustomers.filter((c) => c.name.includes(q) || (c.phone ?? '').includes(q))
  }, [allCustomers, query])

  const positioned = useMemo(
    () =>
      allCustomers
        .filter((c) => c.latitude != null && c.longitude != null)
        .map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone ?? null,
          address: c.address ?? null,
          latitude: c.latitude as number,
          longitude: c.longitude as number,
          repName: repName(data.users, c.created_by_rep_id),
          totalDebt: debts.get(c.id)?.total_debt ?? 0,
        })),
    [allCustomers, debts, data.users],
  )

  function pickCurrentLocation() {
    if (!navigator.geolocation) {
      show('error', 'الجهاز لا يدعم تحديد الموقع')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({ ...f, latitude: pos.coords.latitude, longitude: pos.coords.longitude }))
        setLocating(false)
        show('success', 'تم التقاط الموقع')
      },
      () => {
        setLocating(false)
        show('error', 'تعذر الوصول للموقع، تحقق من الأذونات')
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  function openCreate() {
    setEditing(null)
    setForm({ ...emptyForm, rep_id: user?.id ?? '' })
    setConfirmDelete(false)
    setCreating(true)
  }

  function openEdit(c: Customer) {
    setCreating(false)
    setConfirmDelete(false)
    setEditing(c)
    setForm({
      name: c.name,
      phone: c.phone ?? '',
      address: c.address ?? '',
      debt_limit: c.debt_limit != null ? String(c.debt_limit) : '',
      rep_id: c.created_by_rep_id,
      latitude: c.latitude ?? null,
      longitude: c.longitude ?? null,
    })
  }

  function close() {
    setCreating(false)
    setEditing(null)
    setForm(emptyForm)
    setConfirmDelete(false)
  }

  function validate(): string | null {
    if (!form.name.trim()) return 'اسم العميل مطلوب'
    if (form.debt_limit.trim() && (!Number.isFinite(Number(form.debt_limit)) || Number(form.debt_limit) < 0)) {
      return 'حد الدين يجب أن يكون رقماً غير سالب'
    }
    return null
  }

  async function handleSave() {
    const err = validate()
    if (err) {
      show('error', err)
      return
    }
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      debt_limit: form.debt_limit.trim() ? Number(form.debt_limit) : null,
      latitude: form.latitude,
      longitude: form.longitude,
      created_by_rep_id: form.rep_id || user?.id || '',
    }
    setBusy(true)
    try {
      if (editing) {
        await updateCustomer(editing.id, payload)
        show('success', 'تم تحديث العميل')
      } else {
        await addCustomer(payload)
        show('success', 'تم إنشاء العميل')
      }
      close()
    } catch (e) {
      console.error(e)
      show('error', 'تعذر حفظ العميل')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!editing) return
    setBusy(true)
    try {
      await deleteCustomer(editing.id)
      show('success', 'تم حذف العميل')
      close()
    } catch (e) {
      console.error(e)
      show('error', 'تعذر حذف العميل')
    } finally {
      setBusy(false)
    }
  }

  const hasPosition = form.latitude != null && form.longitude != null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
          <Contact className="size-5" />
          <span className="tnum">{allCustomers.length}</span> عميل
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-muted p-1 gap-1">
            <button
              onClick={() => setView('list')}
              className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-bold transition-colors ${
                view === 'list' ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground'
              }`}
            >
              <List className="size-4" /> قائمة
            </button>
            <button
              onClick={() => setView('map')}
              className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-bold transition-colors ${
                view === 'map' ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground'
              }`}
            >
              <MapIcon className="size-4" /> خريطة
            </button>
          </div>
          <button onClick={openCreate} className="btn-primary btn-md">
            <Plus className="size-5" /> عميل جديد
          </button>
        </div>
      </div>

      {view === 'map' ? (
        positioned.length === 0 ? (
          <EmptyState
            icon={<MapPin className="size-7" />}
            title="لا توجد مواقع محددة"
            desc="أضف مواقع العملاء لرؤيتهم على الخريطة."
          />
        ) : (
          <CustomerMap customers={positioned} height={520} />
        )
      ) : (
        <>
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
              icon={<Contact className="size-7" />}
              title="لا يوجد عملاء بعد"
              desc="سجّل عملاء متجرك مع أرقامهم وحدود ديونهم ومواقعهم."
              action={
                <button onClick={openCreate} className="btn-primary btn-md">
                  <Plus className="size-5" /> إنشاء أول عميل
                </button>
              }
            />
          ) : (
            <div className="space-y-2.5">
              {filtered.map((c) => {
                const debt = debts.get(c.id)
                const over = debt?.debt_limit != null && debt.total_debt > debt.debt_limit
                return (
                  <button
                    key={c.id}
                    onClick={() => openEdit(c)}
                    className="card w-full p-4 text-start flex items-center gap-3 hover:border-primary/40"
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground">
                      <UserRound className="size-6" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-extrabold truncate">{c.name}</span>
                      <span className="block text-xs text-muted-foreground truncate" dir="ltr">
                        {c.phone ?? '—'}
                      </span>
                      <span className="block text-[11px] text-muted-foreground truncate mt-0.5">
                        مندوب: {repName(data.users, c.created_by_rep_id)}
                        {c.latitude != null && (
                          <>
                            {' · '}
                            <MapPin className="inline size-3" /> موقع
                          </>
                        )}
                      </span>
                    </span>
                    <span className="text-end shrink-0 space-y-0.5">
                      {debt && debt.total_debt > 0 ? (
                        <>
                          <Money value={debt.total_debt} className="font-extrabold text-destructive block" />
                          {debt.debt_limit != null ? (
                            <span className={`block text-[10px] font-bold tnum ${over ? 'text-destructive' : 'text-muted-foreground'}`} dir="ltr">
                              حد {debt.debt_limit.toFixed(2)} {over ? '· تجاوز' : ''}
                            </span>
                          ) : (
                            <span className="block text-[10px] text-muted-foreground">دين</span>
                          )}
                        </>
                      ) : (
                        <span className="badge-accent block w-fit ms-auto">لا دين</span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Create / Edit sheet */}
      <Sheet
        open={creating || !!editing}
        onClose={close}
        title={editing ? 'تعديل بيانات العميل' : 'إنشاء عميل جديد'}
        size="lg"
        footer={
          <>
            {editing && (
              <button
                onClick={() => setConfirmDelete(true)}
                className="btn-destructive btn-lg px-4"
                aria-label="حذف العميل"
              >
                <Trash2 className="size-5" />
              </button>
            )}
            <button onClick={close} className="btn-outline btn-lg flex-1">إلغاء</button>
            <button onClick={handleSave} disabled={busy} className="btn-primary btn-lg flex-1">
              {busy ? <Loader2 className="size-5 animate-spin" /> : <Contact className="size-5" />}
              {editing ? 'حفظ التعديلات' : 'إنشاء العميل'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {confirmDelete && editing && (
            <div className="rounded-xl bg-destructive/10 text-destructive px-4 py-3 text-sm font-bold flex items-center justify-between gap-3">
              <span>تأكيد حذف العميل «{editing.name}»؟</span>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => setConfirmDelete(false)} className="btn-outline btn-sm">إلغاء</button>
                <button onClick={handleDelete} disabled={busy} className="btn-destructive btn-sm">
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} حذف
                </button>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="mc-name" className="label">اسم العميل *</label>
            <input id="mc-name" className="input" placeholder="مثال: محل الركن التجاري" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label htmlFor="mc-phone" className="label">رقم الهاتف</label>
            <input id="mc-phone" type="tel" dir="ltr" className="input text-left" placeholder="05xxxxxxxx" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div>
            <label htmlFor="mc-addr" className="label">العنوان</label>
            <input id="mc-addr" className="input" placeholder="الحي، الشارع، المعلم..." value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="mc-limit" className="label">حد الدين المسموح (ر.س)</label>
              <input id="mc-limit" type="number" inputMode="decimal" min={0} dir="ltr" className="input text-left tnum" placeholder="مثال: 500" value={form.debt_limit} onChange={(e) => setForm((f) => ({ ...f, debt_limit: e.target.value }))} />
              <p className="text-xs text-muted-foreground mt-1">اتركه فارغاً للسماح بدون حد.</p>
            </div>
            <div>
              <label htmlFor="mc-rep" className="label">المندوب المسؤول</label>
              <select id="mc-rep" className="input" value={form.rep_id} onChange={(e) => setForm((f) => ({ ...f, rep_id: e.target.value }))}>
                <option value={user?.id ?? ''}>المدير (بدون مندوب)</option>
                {reps.map((r: UserProfile) => (
                  <option key={r.id} value={r.id}>
                    {r.full_name} {r.truck_id ? `· ${r.truck_id}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Location */}
          <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-bold">موقع العميل</div>
              <button onClick={pickCurrentLocation} disabled={locating} className="btn-accent btn-sm">
                {locating ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4" />}
                تحديد موقعي الحالي
              </button>
            </div>
            {hasPosition ? (
              <div className="text-xs font-bold text-accent tnum" dir="ltr">
                {form.latitude!.toFixed(6)}, {form.longitude!.toFixed(6)}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">اضغط الزر أو انقر على الخريطة لتحديد الموقع.</p>
            )}
            <LocationPicker
              lat={form.latitude}
              lng={form.longitude}
              onChange={(lat, lng) => setForm((f) => ({ ...f, latitude: lat, longitude: lng }))}
            />
          </div>
        </div>
      </Sheet>
    </div>
  )
}

function LocationPicker({
  lat,
  lng,
  onChange,
}: {
  lat: number | null
  lng: number | null
  onChange: (lat: number, lng: number) => void
}) {
  const center: [number, number] = lat != null && lng != null ? [lat, lng] : [24.7136, 46.6753]

  function ClickHandler() {
    useMapEvents({
      click(e) {
        onChange(e.latlng.lat, e.latlng.lng)
      },
    })
    return null
  }

  return (
    <div dir="ltr" className="h-56 rounded-xl overflow-hidden border border-border z-0">
      <MapContainer
        center={center}
        zoom={13}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler />
        {lat != null && lng != null && <Marker position={[lat, lng]} icon={pinIcon('#2563eb', 30)} />}
      </MapContainer>
    </div>
  )
}
