import { useMemo, useState } from 'react'
import { useStore } from '../../lib/store'
import {
  Users,
  Plus,
  UserRound,
  Copy,
  Check,
  Link2,
  Loader2,
  Truck as TruckIcon,
  Mail,
} from 'lucide-react'
import { Sheet, EmptyState, useToast } from '../../components/ui'
import { repDailySummary } from '../../lib/selectors'
import { todayKey } from '../../lib/format'
import type { UserProfile } from '../../lib/types'
import RepDetails from './RepDetails'

interface AddRepInput {
  full_name: string
  email: string
  password: string
  truck_id: string
}

export default function ManagerReps() {
  const { data, addRep } = useStore()
  const { show } = useToast()

  const reps = useMemo(() => data.users.filter((u) => u.role === 'sales_rep'), [data.users])

  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<AddRepInput>({ full_name: '', email: '', password: '', truck_id: '' })
  const [busy, setBusy] = useState(false)
  const [createdLink, setCreatedLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [selectedRep, setSelectedRep] = useState<UserProfile | null>(null)

  const today = todayKey()

  async function handleCreate() {
    const full_name = form.full_name.trim()
    const email = form.email.trim()
    const password = form.password
    if (!full_name || !email || !password) {
      show('error', 'الاسم والبريد وكلمة المرور مطلوبة')
      return
    }
    if (password.length < 6) {
      show('error', 'كلمة المرور يجب أن تكون 6 أحرف على الأقل')
      return
    }
    setBusy(true)
    try {
      const res = await addRep({ full_name, email, password, truck_id: form.truck_id.trim() })
      setCreatedLink(res.accessLink)
      show('success', 'تم إنشاء المندوب — انسخ رابط الوصول')
    } catch (e) {
      console.error(e)
      const raw = (e as Error)?.message ?? ''
      // Map the RPC rejection to a helpful Arabic message. The account may be
      // a rep that never got promoted — re-login triggers the self-heal.
      const friendly =
        /only managers can create sales reps/i.test(raw)
          ? 'حسابك ليس مخولاً بإنشاء مندوبين (يجب أن يكون مدير متجر). أعد تسجيل الدخول ثم حاول مرة أخرى.'
          : raw || 'تعذر إنشاء المندوب'
      show('error', friendly)
    } finally {
      setBusy(false)
    }
  }

  function closeSheet() {
    setAdding(false)
    setCreatedLink(null)
    setCopied(false)
    setForm({ full_name: '', email: '', password: '', truck_id: '' })
  }

  async function copyLink() {
    if (!createdLink) return
    try {
      await navigator.clipboard.writeText(createdLink)
      setCopied(true)
      show('success', 'تم نسخ رابط الوصول')
    } catch {
      show('error', 'تعذر النسخ')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
          <Users className="size-5" />
          <span className="tnum">{reps.length}</span> مندوب
        </div>
        <button onClick={() => setAdding(true)} className="btn-primary btn-md">
          <Plus className="size-5" /> مندوب جديد
        </button>
      </div>

      {reps.length === 0 ? (
        <EmptyState
          icon={<Users className="size-7" />}
          title="لا يوجد مندوبون بعد"
          desc="أنشئ أول مندوب (الاسم، البريد، كلمة المرور، رقم الشاحنة) وسيظهر رابط وصول خاص ليستخدمه المندوب."
          action={
            <button onClick={() => setAdding(true)} className="btn-primary btn-md">
              <UserRound className="size-5" /> إنشاء أول مندوب
            </button>
          }
        />
      ) : (
        <div className="space-y-2.5">
          {reps.map((r) => {
            const daily = repDailySummary(data, r.id, today).get(r.id)
            return (
              <button
                key={r.id}
                onClick={() => setSelectedRep(r)}
                className="card w-full p-4 flex items-center gap-3 text-start hover:border-primary/40"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground font-extrabold">
                  {r.full_name.slice(0, 1)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold truncate">{r.full_name}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground truncate">
                    <Mail className="size-3.5 shrink-0" />
                    <span className="truncate" dir="ltr">{r.email}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                    <TruckIcon className="size-3.5" /> شاحنة {r.truck_id ?? '—'}
                  </div>
                </div>
                <div className="text-end shrink-0 space-y-1">
                  <div className="text-xs text-muted-foreground font-bold">كاش اليوم</div>
                  <div className="font-extrabold text-accent tnum" dir="ltr">
                    {(daily?.cash_collected ?? 0).toFixed(2)} أ.م
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Create rep sheet */}
      <Sheet
        open={adding}
        onClose={closeSheet}
        title="إنشاء مندوب جديد"
        footer={
          createdLink ? undefined : (
            <>
              <button onClick={closeSheet} className="btn-outline btn-lg flex-1">إلغاء</button>
              <button onClick={handleCreate} disabled={busy} className="btn-primary btn-lg flex-1">
                {busy ? <Loader2 className="size-5 animate-spin" /> : <Plus className="size-5" />}
                إنشاء المندوب
              </button>
            </>
          )
        }
      >
        {createdLink ? (
          <div className="space-y-4 text-center fade-in-up">
            <span className="mx-auto grid size-16 place-items-center rounded-full bg-success/10 text-success">
              <Check className="size-9" />
            </span>
            <div>
              <div className="text-xl font-extrabold">تم إنشاء المندوب بنجاح</div>
              <p className="text-sm text-muted-foreground mt-1">
                أرسل الرابط التالي للمندوب ليتمكن من الدخول مباشرة — لا يحتاج كلمة مرور للدخول عبر الرابط.
              </p>
            </div>
            <div className="card p-4 space-y-2 text-start">
              <div className="label mb-0">رابط وصول المندوب</div>
              <div
                className="rounded-lg bg-muted px-3 py-2.5 text-xs font-bold break-all text-left"
                dir="ltr"
              >
                {createdLink}
              </div>
              <button onClick={copyLink} className="btn-primary btn-lg w-full">
                {copied ? <Check className="size-5" /> : <Copy className="size-5" />}
                {copied ? 'تم النسخ' : 'نسخ الرابط'}
              </button>
              <p className="text-xs text-muted-foreground text-center">
                يمكنك أيضاً مشاركة الرابط واسم المستخدم وكلمة المرور مع المندوب.
              </p>
            </div>
            <button onClick={closeSheet} className="btn-outline btn-lg w-full">تم</button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label htmlFor="rname" className="label">اسم المندوب *</label>
              <input
                id="rname"
                className="input"
                placeholder="مثال: محمد العتيبي"
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="remail" className="label">البريد الإلكتروني *</label>
              <input
                id="remail"
                type="email"
                dir="ltr"
                className="input text-left"
                placeholder="rep@company.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="rpass" className="label">كلمة المرور * (6 أحرف على الأقل)</label>
              <input
                id="rpass"
                type="password"
                dir="ltr"
                className="input text-left"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="rtruck" className="label">رقم / اسم الشاحنة</label>
              <div className="relative">
                <TruckIcon className="absolute start-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
                <input
                  id="rtruck"
                  className="input ps-11"
                  placeholder="مثال: شاحنة 01"
                  value={form.truck_id}
                  onChange={(e) => setForm((f) => ({ ...f, truck_id: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-info/10 text-info px-4 py-3 text-xs font-bold leading-relaxed">
              <Link2 className="size-4 shrink-0 mt-0.5" />
              سيحصل المندوب على رابط وصول فريد خاص به ولا يمكنه فتح لوحة المدير.
            </div>
          </div>
        )}
      </Sheet>

      {/* Per-rep drill-down */}
      <Sheet open={!!selectedRep} onClose={() => setSelectedRep(null)} title={selectedRep?.full_name ?? ''} size="lg">
        {selectedRep && <RepDetails rep={selectedRep} onClose={() => setSelectedRep(null)} />}
      </Sheet>
    </div>
  )
}
