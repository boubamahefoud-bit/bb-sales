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
  SalesTransaction,
  Store,
  TruckInventoryItem,
  UserProfile,
} from './types'

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
  addRep: (input: { full_name: string; email: string; password: string; truck_id: string }) => Promise<{ rep: UserProfile; accessLink: string }>
  addCustomer: (input: NewCustomerInput) => Promise<Customer>
  updateCustomer: (id: string, patch: Partial<Customer>) => Promise<void>
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

  const isLocal = !isSupabaseConfigured

  const fetchSupabase = useCallback(async (session?: Session | null): Promise<{ u: UserProfile | null; d: DataSnapshot }> => {
    const authUser = session?.user ?? (await supabase!.auth.getSession()).data.session?.user ?? null

    let profile: UserProfile | null = null
    if (authUser) {
      const { data: p } = await supabase!
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle()
      if (p) {
        profile = p as UserProfile
      } else {
        // New user (or the trigger didn't run): auto-create a default profile
        // row via the security-definer RPC, then read it back.
        const { data: ensured } = await supabase!.rpc('ensure_user_profile')
        if (ensured) {
          const { data: p2 } = await supabase!
            .from('users')
            .select('*')
            .eq('id', authUser.id)
            .maybeSingle()
          profile = (p2 as UserProfile) ?? (ensured as unknown as UserProfile)
        }
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
    const { u, d } = await fetchSupabase(session)
    setUser(u)
    setStore(u?.store_id ? d.stores.find((s) => s.id === u.store_id) ?? null : null)
    setData(d)
    setInitialized(true)
    return u
  }, [fetchSupabase, isLocal])

  useEffect(() => {
    refresh().catch(() => setInitialized(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, isLocal])

  // Live auth-state sync (Supabase only): when a session appears — e.g. after
  // the email-confirmation link redirects back to the app — load the profile
  // so guards/redirects send the user to the right dashboard.
  useEffect(() => {
    if (isLocal || !supabase) return
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session) refresh(session)
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
        setStore(null)
        setData(emptyData)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [isLocal, refresh])

  // Realtime sync (Supabase only): live-update when reps create
  // transactions, customers, locations or the manager changes stock.
  useEffect(() => {
    if (isLocal || !user?.store_id) return
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
  }, [isLocal, user?.store_id, refresh])

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
              role: meta.role === 'manager' ? 'manager' : 'sales_rep',
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
    if (isLocal) {
      await localRef.current!.signOut()
    } else {
      await supabase!.auth.signOut()
    }
    setUser(null)
    setStore(null)
    setData(emptyData)
  }, [isLocal])

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
      if (!user) throw new Error('unauthorized')
      if (isLocal) return localRef.current!.addCustomer(input)
      const { data, error: e } = await supabase!
        .from('customers')
        .insert({ ...input, store_id: user.store_id, created_by_rep_id: user.id })
        .select()
        .single()
      if (e) throw e
      await refresh()
      return data as Customer
    },
    [isLocal, refresh, user],
  )

  const updateCustomer = useCallback(
    async (id: string, patch: Partial<Customer>) => {
      if (isLocal) {
        await localRef.current!.updateCustomer(id, patch)
      } else {
        const { error: e } = await supabase!.from('customers').update(patch).eq('id', id)
        if (e) throw e
      }
      await refresh()
    },
    [isLocal, refresh],
  )

  const createSale = useCallback(
    async (input: { customerId: string; paidAmount: number; items: { product_name: string; quantity: number; unit_price: number }[] }) => {
      if (!user) throw new Error('unauthorized')
      if (isLocal) {
        const tx = await localRef.current!.createSale(input)
        await refresh()
        return tx
      }
      const total = input.items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
      const paid = Math.min(input.paidAmount, total)
      const debt = Math.max(0, total - paid)
      const status = debt === 0 ? 'paid' : paid === 0 ? 'debt' : 'partial'

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
    [isLocal, refresh, user],
  )

  const addInventoryRow = useCallback(
    async (input: Omit<TruckInventoryItem, 'id' | 'updated_at'>) => {
      if (isLocal) {
        await localRef.current!.addInventoryRow(input)
      } else {
        const { error: e } = await supabase!.from('trucks_inventory').insert(input)
        if (e) throw e
      }
      await refresh()
    },
    [isLocal, refresh],
  )

  const updateInventory = useCallback(
    async (id: string, patch: Partial<TruckInventoryItem>) => {
      if (isLocal) {
        await localRef.current!.updateInventory(id, patch)
      } else {
        const { error: e } = await supabase!.from('trucks_inventory').update(patch).eq('id', id)
        if (e) throw e
      }
      await refresh()
    },
    [isLocal, refresh],
  )

  const uploadProductImage = useCallback(
    async (file: File) => {
      const compressed = await compressImage(file)
      if (isLocal) {
        return compressed.dataUrl
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
    [isLocal, user],
  )

  const addRepLocation = useCallback(
    async (latitude: number, longitude: number) => {
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
    [isLocal, user],
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
      addRep,
      addCustomer,
      updateCustomer,
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
      addRep,
      addCustomer,
      updateCustomer,
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
