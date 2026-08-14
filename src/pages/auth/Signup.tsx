import { useState } from 'react'
import { useNavigate, Navigate, Link } from 'react-router-dom'
import { Truck, Store, Eye, EyeOff, UserPlus, Loader2, MailCheck, ArrowRight } from 'lucide-react'
import { useStore } from '../../lib/store'
import { useToast } from '../../components/ui'
import { ADMIN_DASHBOARD, repPortalPath } from '../../App'

export default function Signup() {
  const { user, signUpManager } = useStore()
  const { show } = useToast()
  const navigate = useNavigate()

  const [storeName, setStoreName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsConfirm, setNeedsConfirm] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!storeName.trim()) return setError('اسم المحل مطلوب')
    if (!email.trim()) return setError('البريد الإلكتروني مطلوب')
    if (password.length < 6) return setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
    if (password !== confirm) return setError('كلمتا المرور غير متطابقتين')

    setBusy(true)
    setError(null)
    const res = await signUpManager({ store_name: storeName, email, password })
    setBusy(false)
    if (res.error) return setError(res.error)
    if (res.needsEmailConfirm) {
      setNeedsConfirm(true)
      show('info', 'تم إنشاء الحساب، تحقق من بريدك الإلكتروني للتفعيل')
      return
    }
    show('success', 'تم إنشاء حساب المدير بنجاح')
    navigate(ADMIN_DASHBOARD, { replace: true })
  }

  if (user && !needsConfirm) {
    const to = user.role === 'manager' ? ADMIN_DASHBOARD : repPortalPath(user.rep_token)
    return <Navigate to={to} replace />
  }

  if (needsConfirm) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-4" dir="rtl">
        <div className="w-full max-w-md card p-8 text-center space-y-4 fade-in-up">
          <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-accent/10 text-accent">
            <MailCheck className="size-9" />
          </span>
          <h1 className="text-xl font-extrabold">تحقق من بريدك الإلكتروني</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            تم إنشاء حساب المدير لـ <b>{storeName}</b>، أرسلنا لك رابط تفعيل على <b dir="ltr">{email}</b>.
            بعد التفعيل سجّل الدخول من الصفحة الرئيسية.
          </p>
          <Link to="/login" className="btn-primary btn-lg w-full">
            <ArrowRight className="size-5" /> العودة لتسجيل الدخول
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md space-y-6 fade-in-up">
        <div className="text-center space-y-3">
          <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-pop">
            <Truck className="size-9" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold">إنشاء حساب مدير</h1>
            <p className="text-sm text-muted-foreground mt-1">سجّل متجرك وابدأ بإدارة مندوبيك ومبيعاتك</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          {error && (
            <div role="alert" className="rounded-lg bg-destructive/10 text-destructive px-4 py-3 text-sm font-bold">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="store" className="label">اسم المحل / المتجر *</label>
            <div className="relative">
              <Store className="absolute start-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
              <input
                id="store"
                className="input ps-11"
                placeholder="مثال: مؤسسة النور التجارية"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="email" className="label">البريد الإلكتروني للمدير *</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              dir="ltr"
              className="input text-left"
              placeholder="manager@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="password" className="label">كلمة المرور *</label>
            <div className="relative">
              <input
                id="password"
                type={showPw ? 'text' : 'password'}
                autoComplete="new-password"
                dir="ltr"
                className="input text-left pe-12"
                placeholder="6 أحرف على الأقل"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                className="absolute inset-y-0 end-0 pe-3.5 text-muted-foreground hover:text-foreground"
                aria-label={showPw ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              >
                {showPw ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="confirm" className="label">تأكيد كلمة المرور *</label>
            <input
              id="confirm"
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              dir="ltr"
              className="input text-left"
              placeholder="أعد إدخال كلمة المرور"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>

          <button type="submit" disabled={busy} className="btn-primary btn-lg w-full">
            {busy ? <Loader2 className="size-5 animate-spin" /> : <UserPlus className="size-5" />}
            إنشاء الحساب
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          لديك حساب بالفعل؟{' '}
          <Link to="/login" className="font-bold text-primary hover:underline">سجّل الدخول</Link>
        </p>
      </div>
    </div>
  )
}
