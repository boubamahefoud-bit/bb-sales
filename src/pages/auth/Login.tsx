import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { Truck, Eye, EyeOff, LogIn, UserPlus, Loader2 } from 'lucide-react'
import { useStore } from '../../lib/store'
import { useToast } from '../../components/ui'
import { ADMIN_DASHBOARD, repPortalPath } from '../../App'

export default function Login() {
  const { user, login } = useStore()
  const { show } = useToast()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) {
      setError('يرجى إدخال البريد الإلكتروني وكلمة المرور')
      return
    }
    setBusy(true)
    setError(null)
    const res = await login(email, password)
    setBusy(false)
    if (res.error) {
      setError(res.error)
      return
    }
    show('success', 'تم تسجيل الدخول بنجاح')
    navigate('/', { replace: true })
  }

  if (user) {
    const to = user.role === 'manager' ? ADMIN_DASHBOARD : repPortalPath(user.rep_token)
    return <Navigate to={to} replace />
  }

  return (
    <div className="min-h-dvh flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md space-y-6 fade-in-up">
        <div className="text-center space-y-3">
          <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-pop">
            <Truck className="size-9" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold">BB Sales</h1>
            <p className="text-sm text-muted-foreground mt-1">بي بي سيلز — تسجيل الدخول</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          {error && (
            <div role="alert" className="rounded-lg bg-destructive/10 text-destructive px-4 py-3 text-sm font-bold">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="label">البريد الإلكتروني</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              dir="ltr"
              className="input text-left"
              placeholder="name@bbsales.app"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="password" className="label">كلمة المرور</label>
            <div className="relative">
              <input
                id="password"
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                dir="ltr"
                className="input text-left pe-12"
                placeholder="••••••••"
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

          <button type="submit" disabled={busy} className="btn-primary btn-lg w-full">
            {busy ? <Loader2 className="size-5 animate-spin" /> : <LogIn className="size-5" />}
            تسجيل الدخول
          </button>
        </form>

        <div className="text-center">
          <button
            onClick={() => navigate('/signup')}
            className="inline-flex items-center gap-2 font-bold text-primary hover:underline"
          >
            <UserPlus className="size-4" />
            إنشاء حساب — مدير متجر جديد
          </button>
        </div>
      </div>
    </div>
  )
}
