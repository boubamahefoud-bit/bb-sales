import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { useEffect, useState, type ReactNode } from 'react'
import { ThemeProvider } from './lib/theme'
import { StoreProvider, useStore } from './lib/store'
import { ToastProvider } from './components/ui'
import Login from './pages/auth/Login'
import Signup from './pages/auth/Signup'
import RepApp from './pages/rep/RepApp'
import ManagerApp from './pages/manager/ManagerApp'
import { Truck, Link2Off } from 'lucide-react'
import type { UserProfile } from './lib/types'

export const REP_PORTAL_BASE = '/rep-portal'
export const ADMIN_DASHBOARD = '/admin/dashboard'
export const REP_DASHBOARD = '/rep/dashboard'

export function repPortalPath(token?: string | null): string {
  return `${REP_PORTAL_BASE}/${token ?? ''}`
}

/** Single source of truth for where each role belongs after login/load. */
export function roleHomePath(user: UserProfile): string {
  return user.role === 'manager' ? ADMIN_DASHBOARD : REP_DASHBOARD
}

function Splash() {
  return (
    <div className="min-h-dvh grid place-items-center" dir="rtl">
      <div className="text-center space-y-3">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground animate-pulse">
          <Truck className="size-8" />
        </span>
        <div className="text-muted-foreground text-sm font-bold">جارٍ التحميل...</div>
      </div>
    </div>
  )
}

/**
 * Authentication + RBAC middleware.
 * - Waits for the session/profile (role read from the profiles table on load).
 * - Redirects unauthenticated users to /login.
 * - Strictly enforces role isolation: a rep hitting a manager route is sent to
 *   their own portal, and a manager hitting a rep route is sent to /admin.
 * - Redirects are silent (no error toasts) so session switches never dead-end.
 */
function ManagerRoute({ children }: { children: ReactNode }) {
  const { user, initialized } = useStore()
  if (!initialized) return <Splash />
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'manager') return <Navigate to={roleHomePath(user)} replace />
  return <>{children}</>
}

/**
 * Rep unique-link portal: /rep-portal/:token.
 * The token in the URL IS the credential. On entry any active session on this
 * tab (e.g. a manager) is signed out and the rep is loaded via the token. The
 * standalone Sales Rep Interface renders here — it NEVER redirects to
 * /admin/dashboard. An invalid/expired link shows a friendly error screen.
 */
function RepPortalRoute({ children }: { children: ReactNode }) {
  const { token } = useParams()
  const { repToken, enterRepPortal } = useStore()
  const [portalError, setPortalError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    setPortalError(null)
    enterRepPortal(token).then((res) => {
      if (res.error) setPortalError(res.error)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  if (portalError) return <InvalidLinkScreen message={portalError} />
  if (!token || repToken !== token) return <Splash />
  return <>{children}</>
}

function InvalidLinkScreen({ message }: { message: string }) {
  return (
    <div className="min-h-dvh grid place-items-center p-6" dir="rtl">
      <div className="text-center space-y-4 max-w-sm">
        <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-destructive/10 text-destructive">
          <Link2Off className="size-9" />
        </span>
        <h1 className="text-xl font-extrabold">رابط الدخول غير صالح</h1>
        <p className="text-muted-foreground text-sm font-bold leading-relaxed">{message}</p>
        <p className="text-xs text-muted-foreground">
          تواصل مع المدير لتحصل على رابط جديد خاص بحسابك.
        </p>
        <a href="/" className="btn-primary btn-lg w-full inline-flex items-center justify-center gap-2">
          <Truck className="size-5" /> الصفحة الرئيسية
        </a>
      </div>
    </div>
  )
}

/** Session-based rep dashboard (/rep/dashboard) — no unique-link token needed. */
function RepDashboardRoute({ children }: { children: ReactNode }) {
  const { user, initialized } = useStore()
  if (!initialized) return <Splash />
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'sales_rep') return <Navigate to={ADMIN_DASHBOARD} replace />
  return <>{children}</>
}

/** Root catch-all: route users to their role home. */
function AuthRedirect() {
  const { user, initialized } = useStore()
  if (!initialized) return <Splash />
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={roleHomePath(user)} replace />
}

export default function App() {
  return (
    <ThemeProvider>
      <StoreProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route
                path="/admin/dashboard"
                element={
                  <ManagerRoute>
                    <ManagerApp />
                  </ManagerRoute>
                }
              />
              <Route
                path={REP_DASHBOARD}
                element={
                  <RepDashboardRoute>
                    <RepApp />
                  </RepDashboardRoute>
                }
              />
              <Route
                path={`${REP_PORTAL_BASE}/:token`}
                element={
                  <RepPortalRoute>
                    <RepApp />
                  </RepPortalRoute>
                }
              />
              <Route path="*" element={<AuthRedirect />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </StoreProvider>
    </ThemeProvider>
  )
}
