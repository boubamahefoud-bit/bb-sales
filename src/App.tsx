import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import type { ReactNode } from 'react'
import { ThemeProvider } from './lib/theme'
import { StoreProvider, useStore } from './lib/store'
import { ToastProvider, useToast } from './components/ui'
import Login from './pages/auth/Login'
import Signup from './pages/auth/Signup'
import RepApp from './pages/rep/RepApp'
import ManagerApp from './pages/manager/ManagerApp'
import { Truck } from 'lucide-react'

export const REP_PORTAL_BASE = '/rep-portal'
export const ADMIN_DASHBOARD = '/admin/dashboard'

export function repPortalPath(token?: string | null): string {
  return `${REP_PORTAL_BASE}/${token ?? ''}`
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

/** Guards all /admin/* routes. A rep hitting these gets blocked + toast. */
function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, initialized } = useStore()
  const { show } = useToast()

  useEffect(() => {
    if (initialized && user && user.role === 'sales_rep') {
      show('error', 'Access Denied: Sales Reps cannot view Manager Dashboard')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, user])

  if (!initialized) return <Splash />
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'manager') return <Navigate to={repPortalPath(user.rep_token)} replace />
  return <>{children}</>
}

/** Guards /rep-portal/:token. A rep can ONLY access their own unique link. */
function RepRoute({ children }: { children: ReactNode }) {
  const { token } = useParams()
  const { user, initialized } = useStore()
  const { show } = useToast()

  useEffect(() => {
    if (initialized && user && user.role === 'manager') {
      show('error', 'Access Denied: Managers cannot view the Sales Rep Portal')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, user])

  if (!initialized) return <Splash />
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'sales_rep') return <Navigate to={ADMIN_DASHBOARD} replace />
  if (!user.rep_token || user.rep_token !== token) return <Navigate to={repPortalPath(user.rep_token)} replace />
  return <>{children}</>
}

/** Root catch-all: route users to their role home. */
function AuthRedirect() {
  const { user, initialized } = useStore()
  if (!initialized) return <Splash />
  if (!user) return <Navigate to="/login" replace />
  return user.role === 'manager' ? (
    <Navigate to={ADMIN_DASHBOARD} replace />
  ) : (
    <Navigate to={repPortalPath(user.rep_token)} replace />
  )
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
                  <ProtectedRoute>
                    <ManagerApp />
                  </ProtectedRoute>
                }
              />
              <Route
                path={`${REP_PORTAL_BASE}/:token`}
                element={
                  <RepRoute>
                    <RepApp />
                  </RepRoute>
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
