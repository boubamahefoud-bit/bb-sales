import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { supabase, isSupabaseConfigured } from './supabase'
import type { Session } from '@supabase/supabase-js'
import { LocalBackend } from './local'
import { compressImage } from './image'
import type {
  Customer,
  DataSnapshot,
  NewCustomerInput,
  RepSessionResult,
  SalesTransaction,
  Store,
  TruckInventoryItem,
  UserProfile,
} from './types'

/**
 * Classify a rep-portal load failure into a user-facing Arabic message.
 * A PGRST202 error means the rep_session RPC does not exist in the live DB
 * (migration not applied) — the link itself may be perfectly valid, so we
 * must not report it as "invalid link". Only a genuine rep_token rejection
 * from the RPC (rep_token_required / rep_token_invalid) is an invalid link.
 */
function repPortalError(err: unknown): string {
  // Local backend returns an already-user-facing Arabic string.
  if (typeof err === 'string') return err
  const msg = (err as { message?: string } | null | undefined)?.message ?? ''
  const code = (err as { code?: string } | null | undefined)?.code ?? ''
  if (code === 'PGRST202' || msg.includes('Could not find the function')) {
    return 'روابط المندوبين لم تُفعَّل في قاعدة البيانات بعد — يرجى تنفيذ ملف التحديث (migration.sql) من محرر SQL.'
  }
  if (msg.includes('rep_token_required') || msg.includes('rep_token_invalid')) {
    return 'رابط الدخول غير صالح أو منتهي'
  }
  console.error('rep_portal_load_error', err)
  return 'تعذر تحميل بيانات الحساب، حاول مرة أخرى لاحقاً'
}

interface StoreCtx {
  backendType: 'supabase' | 'local'
  initialized: boolean
  loading: boolean
  error: string | null
  user: UserProfile | null
  store: Store | null
  data: DataSnapshot
  login: (email: string, password: string) => Promise<{ error?: string; user?: UserProfile }>
  signUpManager: (input: { store_name: string; email: string; password: string }) => Promise<{ error?: string; needsEmailConfirm?: boolean }>
  logout: () => Promise<void>
  refresh: (session?: Session | null) => Promise<UserProfile | null>
  repToken: string | null
  enterRepPortal: (token: string) => Promise<{ error?: string; user?: UserProfile }>
  addRep: (input: { full_name: string; email: string; password: string; truck_id: string }) => Promise<{ rep: UserProfile; accessLink: string }>
  addCustomer: (input: NewCustomerInput) => Promise<Customer>
  updateCustomer: (id: string, patch: Partial<Customer>) => Promise<void>
  deleteCustomer: (id: string) => Promise<void>
  createSale: (input: { customerId: string; paidAmount: number; items: { product_name: string; quantity: number; unit_price: number }[] }) => Promise<SalesTransaction>
  addInventoryRow: (input: Omit<TruckInventoryItem, 'id' | 'updated_at'>) => Promise<void>
  updateInventory: (id: string, patch: Partial<TruckInventoryItem>) => Promise<void>
  uploadProductImage: (file: File) => Promise<string>
  addRepLocation: (latitude: number, longitude: number) => Promise<void>
}

const Ctx = createContext<StoreCtx | null>(null)

const emptyData: DataSnapshot = {
  stores: [],
  users: [],
  inventory: [],
  customers: [],
  transactions: [],
  items: [],
  repLocations: [],
}

function toNumber(v: unknown): number {
  return typeof v === 'number' ? v : Number(v ?? 0)
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const localRef = useRef<LocalBackend | null>(null)
  if (!localRef.current) localRef.current = new LocalBackend()

  const [initialized, setInitialized] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<UserProfile | null>(null)
  const [store, setStore] = useState<Store | null>(null)
  const [data, setData] = useState<DataSnapshot>(emptyData)
  const [repToken, setRepToken] = useState<string | null>(null)
  // Mirrors `user` so callbacks (refresh, polling) can read the latest rep
  // without adding `user` to their deps (which would retrigger the effects).
  const userRef = useRef<UserProfile | null>(null)
  useEffect(() => {
    userRef.current = user
  }, [user])

  const isLocal = !isSupabaseConfigured

  /** Loads a rep's full snapshot using their unique link token as the credential. */
  const fetchRepPortal = useCallback(
    async (token: string): Promise<{ u: UserProfile | null; d: DataSnapshot; error?: unknown }> => {
      if (isLocal) {
        const local = localRef.current!
        const { user: u, error: err } = await local.signInByToken(token)
        if (err || !u) return { u: null, d: emptyData, error: err }
        const d = await local.fetchAll()
        return { u, d }
      }
      const { data, error: e } = await supabase!.rpc('rep_session', { p_token: token })
      if (e || !data) return { u: null, d: emptyData, error: e ?? new Error('rep_session returned no data') }
      const s = data as RepSessionResult
      const u = s.profile
      const d: DataSnapshot = {
        stores: s.store ? [s.store] : [],
        users: u ? [u] : [],
        inventory: s.inventory ?? [],
        customers: s.customers ?? [],
        transactions: s.transactions ?? [],
        items: s.items ?? [],
        repLocations: s.repLocations ?? [],
      }
      return { u, d }
    },
    [isLocal],
  )

  const fetchSupabase = useCallback(async (session?: Session | null): Promise<{ u: UserProfile | null; d: DataSnapshot }> => {
    const authUser = session?.user ?? (await supabase!.auth.getSession()).data.session?.user ?? null

    let profile: UserProfile | null = null
    if (authUser) {
      // Always run the self-healing RPC on load so ANY stale manager profile
      // is repaired to role='manager' + store_id (fixes "Only managers can
      // create sales reps" even when the profile row already exists).
      const { data: ensured } = await supabase!.rpc('ensure_user_profile')
      const { data: p } = await supabase!
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle()
      if (p) {
        profile = p as UserProfile
      } else if (ensured) {
        profile = ensured as unknown as UserProfile
      }
    }

    const d = { ...emptyData }
    if (profile) {
      const [s, u, i, c, t, it, r] = await Promise.all([
        supabase!.from('stores').select('*').limit(1),
        supabase!.from('users').select('*').order('created_at'),
        supabase!.from('trucks_inventory').select('*').order('product_name'),
        supabase!.from('customers').select('*').order('created_at', { ascending: false }),
        supabase!.from('sales_transactions').select('*').order('created_at', { ascending: false }),
        supabase!.from('transaction_items').select('*'),
        supabase!.from('rep_locations').select('*').order('captured_at', { ascending: false }).limit(500),
      ])
      d.stores = (s?.data as Store[]) ?? []
      d.users = (u?.data as UserProfile[]) ?? []
      d.inventory = (i?.data as TruckInventoryItem[]) ?? []
      d.customers = (c?.data as Customer[]) ?? []
      d.transactions = (t?.data as SalesTransaction[]) ?? []
      d.items = (it?.data as DataSnapshot['items']) ?? []
      d.repLocations = (r?.data as DataSnapshot['repLocations']) ?? []
    }
    return { u: profile, d }
  }, [])

  const refresh = useCallback(async (session?: Session | null): Promise<UserProfile | null> => {
    if (isLocal) {
      const local = localRef.current!
      const u = local.getSession()
      const d = await local.fetchAll()
      setUser(u)
      setStore(u?.store_id ? d.stores.find((s) => s.id === u.store_id) ?? null : null)
      setData(d)
      setInitialized(true)
      return u
    }
    if (repToken) {
      // Rep portal unique-link mode: the token (not a session) is the credential.
      const res = await fetchRepPortal(repToken)
      // A refresh happens on mount and every 20s poll. If the RPC fails for a
      // transient reason (network blip, RPC briefly unavailable), keep the
      // existing rep snapshot instead of wiping a working session.
      if (!res.u) {
        if (userRef.current) return userRef.current
        return null
      }
      const u = res.u
      setUser(u)
      setStore(u.store_id ? res.d.stores.find((s) => s.id === u.store_id) ?? null : null)
      setData(res.d)
      setInitialized(true)
      return u
    }
    const { u, d } = await fetchSupabase(session)
    setUser(u)
    setStore(u?.store_id ? d.stores.find((s) => s.id === u.store_id) ?? null : null)
    setData(d)
    setInitialized(true)
    return u
  }, [fetchSupabase, fetchRepPortal, isLocal, repToken])

  useEffect(() => {
    refresh().catch(() => setInitialized(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, isLocal])

  // Token-mode polling: no realtime channel exists without an auth session, so
  // keep the rep's snapshot fresh by re-fetching the rep_session RPC.
  useEffect(() => {
    if (isLocal || !repToken) return
    const id = window.setInterval(() => {
      refresh().catch(() => {})
    }, 20000)
    return () => window.clearInterval(id)
  }, [isLocal, repToken, refresh])

  // Live auth-state sync (Supabase only): when a session appears — e.g. after
  // the email-confirmation link redirects back to the app — load the profile
  // so guards/redirects send the user to the right dashboard.
  useEffect(() => {
    if (isLocal || !supabase) return
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session) refresh(session)
      } else if (event === 'SIGNED_OUT') {
        // Ignore the session wipe when we deliberately sign out on entering a
        // rep unique link (enterRepPortal loads the rep via the token instead).
        if (repToken) return
        setUser(null)
        setStore(null)
        setData(emptyData)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [isLocal, refresh, repToken])

  // Realtime sync (Supabase only): live-update when reps create
  // transactions, customers, locations or the manager changes stock.
  // Skipped in rep unique-link (token) mode because there is no auth session;
  // token mode refreshes via polling instead.
  useEffect(() => {
    if (isLocal || !user?.store_id || repToken) return
    const storeId = user.store_id
    const sub = supabase!
      .channel(`bb-live-${storeId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sales_transactions', filter: `store_id=eq.${storeId}` },
        () => refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customers', filter: `store_id=eq.${storeId}` },
        () => refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rep_locations', filter: `store_id=eq.${storeId}` },
        () => refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trucks_inventory', filter: `store_id=eq.${storeId}` },
        () => refresh(),
      )
      .subscribe()
    return () => {
      supabase!.removeChannel(sub)
    }
  }, [isLocal, user?.store_id, refresh, repToken])

  const login = useCallback(
    async (email: string, password: string) => {
      setLoading(true)
      setError(null)
      try {
        if (isLocal) {
          const { user: u, error: err } = await localRef.current!.signIn(email, password)
          if (err || !u) return { error: err ?? 'تعذر تسجيل الدخول' }
          const profile = await refresh()
          return { user: profile ?? u }
        }
        const { error: authErr } = await supabase!.auth.signInWithPassword({ email, password })
        if (authErr) return { error: 'بيانات الدخول غير صحيحة' }
        let profile = await refresh()
        if (!profile) {
          // Last-resort fallback: build a minimal profile from the auth user
          // metadata so the redirect still happens. The dashboard can always
          // re-run ensure_user_profile on first load.
          const { data: sessionData } = await supabase!.auth.getSession()
          const au = sessionData.session?.user
          if (au) {
            const meta = (au.user_metadata ?? {}) as Record<string, unknown>
            profile = {
              id: au.id,
              email: au.email ?? '',
              role: meta.role === 'manager' || meta.role === 'admin' ? 'manager' : 'sales_rep',
              full_name: typeof meta.full_name === 'string' ? meta.full_name : '',
              store_id: null,
              created_at: au.created_at,
            } as UserProfile
            setUser(profile)
          }
        }
        if (!profile) return { error: 'تعذر تحميل الملف الشخصي' }
        return { user: profile }
      } finally {
        setLoading(false)
        setInitialized(true)
      }
    },
    [isLocal, refresh],
  )

  const signUpManager = useCallback(
    async (input: { store_name: string; email: string; password: string }) => {
      setLoading(true)
      setError(null)
      try {
        if (isLocal) {
          const { user: u, error: err } = await localRef.current!.signUpManager(input)
          if (err || !u) return { error: err ?? 'تعذر إنشاء الحساب' }
          await refresh()
          return {}
        }
        const { data, error: signErr } = await supabase!.auth.signUp({
          email: input.email,
          password: input.password,
          options: {
            data: { store_name: input.store_name, full_name: input.store_name, role: 'manager' },
          },
        })
        if (signErr) return { error: signErr.message }
        if (!data.session) {
          // Email confirmation enabled — the trigger sets the manager
          // role + store on signup, so a follow-up login works.
          return { needsEmailConfirm: true }
        }
        await supabase!.rpc('complete_manager_signup')
        await refresh()
        return {}
      } finally {
        setLoading(false)
        setInitialized(true)
      }
    },
    [isLocal, refresh],
  )

  const logout = useCallback(async () => {
    setRepToken(null)
    if (isLocal) {
      await localRef.current!.signOut()
    } else {
      await supabase!.auth.signOut()
    }
    setUser(null)
    setStore(null)
    setData(emptyData)
  }, [isLocal])

  /**
   * Rep unique-link auth: /rep-portal/:token. The token itself is the
   * credential — no email/password session. Any active session (e.g. a
   * manager logged into this tab) is signed out so the link renders the
   * standalone Sales Rep Interface and NEVER redirects to /admin/dashboard.
   */
  const enterRepPortal = useCallback(
    async (token: string): Promise<{ error?: string; user?: UserProfile }> => {
      setLoading(true)
      setError(null)
      try {
        if (isLocal) {
          const { user: u, error: err } = await localRef.current!.signInByToken(token)
          if (err || !u) return { error: err ?? 'رابط الدخول غير صالح أو منتهي' }
          setRepToken(token)
          const d = await localRef.current!.fetchAll()
          setUser(u)
          setStore(u.store_id ? d.stores.find((s) => s.id === u.store_id) ?? null : null)
          setData(d)
          setInitialized(true)
          return { user: u }
        }
        // Bypass/clear any active Manager session on this tab first.
        await supabase!.auth.signOut().catch(() => {})
        setRepToken(token)
        const res = await fetchRepPortal(token)
        if (!res.u) {
          setRepToken(null)
          return { error: repPortalError(res.error) }
        }
        const u = res.u
        setUser(u)
        setStore(u.store_id ? res.d.stores.find((s) => s.id === u.store_id) ?? null : null)
        setData(res.d)
        setInitialized(true)
        return { user: u }
      } finally {
        setLoading(false)
      }
    },
    [fetchRepPortal, isLocal],
  )

  const addRep = useCallback(
    async (input: { full_name: string; email: string; password: string; truck_id: string }) => {
      if (!user) throw new Error('unauthorized')
      if (isLocal) {
        const res = await localRef.current!.addRep(input)
        await refresh()
        return res
      }
      const { data, error: e } = await supabase!.rpc('create_sales_rep', {
        p_full_name: input.full_name,
        p_email: input.email,
        p_password: input.password,
        p_truck_id: input.truck_id,
      })
      if (e) throw e
      const res = data as { id: string; rep_token: string }
      await refresh()
      const rep = { ...(await refreshAndGetUser(res.id)) }
      return {
        rep,
        accessLink: `${window.location.origin}/rep-portal/${res.rep_token}`,
      }
    },
    [isLocal, refresh, user],
  )

  async function refreshAndGetUser(id: string): Promise<UserProfile> {
    const { data: p } = await supabase!.from('users').select('*').eq('id', id).single()
    return p as UserProfile
  }

  const addCustomer = useCallback(
    async (input: NewCustomerInput) => {
      if (repToken) {
        const { data, error: e } = await supabase!.rpc('rep_add_customer', {
          p_token: repToken,
          p_name: input.name,
          p_phone: input.phone ?? null,
          p_address: input.address ?? null,
          p_latitude: input.latitude ?? null,
          p_longitude: input.longitude ?? null,
          p_debt_limit: input.debt_limit ?? null,
        })
        if (e) throw e
        await refresh()
        return data as Customer
      }
      if (!user) throw new Error('unauthorized')
      if (isLocal) return localRef.current!.addCustomer(input)
      const { data, error: e } = await supabase!
        .from('customers')
        .insert({
          name: input.name,
          phone: input.phone ?? null,
          address: input.address ?? null,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          debt_limit: input.debt_limit ?? null,
          store_id: user.store_id,
          created_by_rep_id: input.created_by_rep_id ?? user.id,
        })
        .select()
        .single()
      if (e) throw e
      await refresh()
      return data as Customer
    },
    [isLocal, refresh, repToken, user],
  )

  const updateCustomer = useCallback(
    async (id: string, patch: Partial<Customer>) => {
      if (repToken) {
        const { error: e } = await supabase!.rpc('rep_update_customer', {
          p_token: repToken,
          p_customer_id: id,
          p_patch: patch,
        })
        if (e) throw e
      } else if (isLocal) {
        await localRef.current!.updateCustomer(id, patch)
      } else {
        const { error: e } = await supabase!.from('customers').update(patch).eq('id', id)
        if (e) throw e
      }
      await refresh()
    },
    [isLocal, refresh, repToken],
  )

  const deleteCustomer = useCallback(
    async (id: string) => {
      if (repToken) {
        const { error: e } = await supabase!.rpc('rep_delete_customer', {
          p_token: repToken,
          p_customer_id: id,
        })
        if (e) throw e
      } else if (isLocal) {
        await localRef.current!.deleteCustomer(id)
      } else {
        const { error: e } = await supabase!.from('customers').delete().eq('id', id)
        if (e) throw e
      }
      await refresh()
    },
    [isLocal, refresh, repToken],
  )

  const createSale = useCallback(
    async (input: { customerId: string; paidAmount: number; items: { product_name: string; quantity: number; unit_price: number }[] }) => {
      if (!user) throw new Error('unauthorized')
      const total = input.items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
      const paid = Math.min(input.paidAmount, total)
      const debt = Math.max(0, total - paid)

      // Client-side debt-limit guard (the DB trigger is the hard backstop).
      const customer = data.customers.find((c) => c.id === input.customerId)
      if (debt > 0 && customer?.debt_limit != null) {
        const existingDebt = data.transactions
          .filter((t) => t.customer_id === input.customerId)
          .reduce((s, t) => s + toNumber(t.debt_amount), 0)
        if (existingDebt + debt > toNumber(customer.debt_limit)) {
          throw new Error(`تجاوز حد الدين المسموح للعميل (الحد ${toNumber(customer.debt_limit)} ر.س)`)
        }
      }

      if (isLocal) {
        const tx = await localRef.current!.createSale(input)
        await refresh()
        return tx
      }
      const status = debt === 0 ? 'paid' : paid === 0 ? 'debt' : 'partial'

      if (repToken) {
        const { data: tx, error: e } = await supabase!.rpc('rep_create_sale', {
          p_token: repToken,
          p_customer_id: input.customerId,
          p_paid_amount: paid,
          p_items: input.items,
        })
        if (e) throw e
        await refresh()
        return tx as SalesTransaction
      }

      const { data: tx, error: txErr } = await supabase!
        .from('sales_transactions')
        .insert({
          store_id: user.store_id,
          rep_id: user.id,
          customer_id: input.customerId,
          total_amount: total,
          paid_amount: paid,
          debt_amount: debt,
          payment_status: status,
        })
        .select()
        .single()
      if (txErr) throw txErr

      const { error: itemsErr } = await supabase!.from('transaction_items').insert(
        input.items.map((i) => ({
          transaction_id: (tx as SalesTransaction).id,
          product_name: i.product_name,
          quantity: i.quantity,
          unit_price: i.unit_price,
          subtotal: i.quantity * i.unit_price,
        })),
      )
      if (itemsErr) throw itemsErr

      const { data: stockRows } = await supabase!
        .from('trucks_inventory')
        .select('id, product_name, quantity_remaining')
        .eq('rep_id', user.id)
      const stockByProduct = new Map(
        (stockRows ?? []).map((r) => [r.product_name, r as { id: string; quantity_remaining: number }]),
      )
      for (const it of input.items) {
        const row = stockByProduct.get(it.product_name)
        if (row) {
          const next = Math.max(0, toNumber(row.quantity_remaining) - it.quantity)
          await supabase!.from('trucks_inventory').update({ quantity_remaining: next }).eq('id', row.id)
        }
      }
      await refresh()
      return tx as SalesTransaction
    },
    [data, isLocal, refresh, repToken, user],
  )

  const addInventoryRow = useCallback(
    async (input: Omit<TruckInventoryItem, 'id' | 'updated_at'>) => {
      if (repToken) {
        const { error: e } = await supabase!.rpc('rep_add_inventory', {
          p_token: repToken,
          p_product_name: input.product_name,
          p_product_image_url: input.product_image_url ?? null,
          p_quantity_loaded: input.quantity_loaded,
          p_unit_price: input.unit_price,
        })
        if (e) throw e
      } else if (isLocal) {
        await localRef.current!.addInventoryRow(input)
      } else {
        const { error: e } = await supabase!.from('trucks_inventory').insert(input)
        if (e) throw e
      }
      await refresh()
    },
    [isLocal, refresh, repToken],
  )

  const updateInventory = useCallback(
    async (id: string, patch: Partial<TruckInventoryItem>) => {
      if (repToken) {
        const { error: e } = await supabase!.rpc('rep_update_inventory', {
          p_token: repToken,
          p_item_id: id,
          p_patch: patch,
        })
        if (e) throw e
      } else if (isLocal) {
        await localRef.current!.updateInventory(id, patch)
      } else {
        const { error: e } = await supabase!.from('trucks_inventory').update(patch).eq('id', id)
        if (e) throw e
      }
      await refresh()
    },
    [isLocal, refresh, repToken],
  )

  const uploadProductImage = useCallback(
    async (file: File) => {
      const compressed = await compressImage(file)
      if (isLocal) {
        return compressed.dataUrl
      }
      // Rep unique-link mode: no session, so upload into a folder named by the
      // secret rep_token (the anon storage policy only allows such paths).
      if (repToken) {
        const path = `${repToken}/${crypto.randomUUID()}.jpg`
        const { error: upErr } = await supabase!.storage
          .from('product-images')
          .upload(path, compressed.blob, { contentType: 'image/jpeg', upsert: true })
        if (upErr) throw upErr
        const { data } = supabase!.storage.from('product-images').getPublicUrl(path)
        return data.publicUrl
      }
      if (!user) throw new Error('unauthorized')
      const path = `${user.store_id}/${user.id}/${crypto.randomUUID()}.jpg`
      const { error: upErr } = await supabase!.storage
        .from('product-images')
        .upload(path, compressed.blob, { contentType: 'image/jpeg', upsert: true })
      if (upErr) throw upErr
      const { data } = supabase!.storage.from('product-images').getPublicUrl(path)
      return data.publicUrl
    },
    [isLocal, repToken, user],
  )

  const addRepLocation = useCallback(
    async (latitude: number, longitude: number) => {
      if (repToken) {
        await supabase!.rpc('rep_add_location', { p_token: repToken, p_latitude: latitude, p_longitude: longitude })
        return
      }
      if (!user || user.role !== 'sales_rep') return
      if (isLocal) {
        await localRef.current!.addRepLocation(latitude, longitude)
        return
      }
      await supabase!.from('rep_locations').insert({
        store_id: user.store_id,
        rep_id: user.id,
        latitude,
        longitude,
      })
    },
    [isLocal, repToken, user],
  )

  const value = useMemo<StoreCtx>(
    () => ({
      backendType: isLocal ? 'local' : 'supabase',
      initialized,
      loading,
      error,
      user,
      store,
      data,
      login,
      signUpManager,
      logout,
      refresh,
      repToken,
      enterRepPortal,
      addRep,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      createSale,
      addInventoryRow,
      updateInventory,
      uploadProductImage,
      addRepLocation,
    }),
    [
      initialized,
      loading,
      error,
      user,
      store,
      data,
      login,
      signUpManager,
      logout,
      refresh,
      repToken,
      enterRepPortal,
      addRep,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      createSale,
      addInventoryRow,
      updateInventory,
      uploadProductImage,
      addRepLocation,
      isLocal,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): StoreCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
