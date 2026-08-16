import type {
  Customer,
  DataSnapshot,
  NewCustomerInput,
  RepLocation,
  SalesTransaction,
  Store,
  TransactionItem,
  TruckInventoryItem,
  UserProfile,
} from './types'

/**
 * Zero-state local persistence backend.
 * Used ONLY when no Supabase credentials are configured, so the app can be
 * previewed end-to-end. Starts completely empty (no demo accounts, no seed
 * figures). Production always uses Supabase.
 */
interface LocalDb {
  stores: Store[]
  users: UserProfile[]
  inventory: TruckInventoryItem[]
  customers: Customer[]
  transactions: SalesTransaction[]
  items: TransactionItem[]
  repLocations: RepLocation[]
}

const DB_KEY = 'bb_sales_local_v2'
const SESSION_KEY = 'bb_sales_session_v2'

const emptyDb = (): LocalDb => ({
  stores: [],
  users: [],
  inventory: [],
  customers: [],
  transactions: [],
  items: [],
  repLocations: [],
})

export class LocalBackend {
  private db: LocalDb
  private delay = 90

  constructor() {
    this.db = this.load()
  }

  private load(): LocalDb {
    try {
      const raw = window.localStorage.getItem(DB_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as LocalDb
        if (parsed && Array.isArray(parsed.users) && Array.isArray(parsed.stores)) return parsed
      }
    } catch {
      /* corrupted -> fresh */
    }
    const fresh = emptyDb()
    this.persist(fresh)
    return fresh
  }

  private persist(db: LocalDb) {
    window.localStorage.setItem(DB_KEY, JSON.stringify(db))
  }

  private async wait(): Promise<void> {
    await new Promise((r) => setTimeout(r, this.delay))
  }

  private commit(mutator: (d: LocalDb) => void) {
    mutator(this.db)
    this.persist(this.db)
  }

  private findUser(email: string): UserProfile | undefined {
    return this.db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase())
  }

  private profileOf(id: string | null): UserProfile | null {
    if (!id) return null
    return this.db.users.find((u) => u.id === id) ?? null
  }

  accessLinkOf(rep: UserProfile): string {
    return `${window.location.origin}/rep-portal/${rep.rep_token}`
  }

  /* ---------- Auth ---------- */

  getSession(): UserProfile | null {
    try {
      return this.profileOf(window.localStorage.getItem(SESSION_KEY))
    } catch {
      return null
    }
  }

  async signUpManager(input: { store_name: string; email: string; password: string }): Promise<{ user: UserProfile | null; error?: string }> {
    await this.wait()
    if (!input.store_name.trim()) return { user: null, error: 'اسم المحل مطلوب' }
    if (this.findUser(input.email)) return { user: null, error: 'هذا البريد مسجل بالفعل' }
    const userId = crypto.randomUUID()
    const store: Store = {
      id: crypto.randomUUID(),
      name: input.store_name.trim(),
      owner_user_id: userId,
      created_at: new Date().toISOString(),
    }
    const manager: UserProfile = {
      id: userId,
      email: input.email.trim(),
      role: 'manager',
      full_name: input.store_name.trim(),
      store_id: store.id,
      password: input.password,
      created_at: new Date().toISOString(),
    }
    this.commit((d) => {
      d.stores.push(store)
      d.users.push(manager)
    })
    window.localStorage.setItem(SESSION_KEY, userId)
    return { user: manager }
  }

  async signIn(email: string, password: string): Promise<{ user: UserProfile | null; error?: string }> {
    await this.wait()
    const u = this.findUser(email)
    if (!u || u.password !== password) return { user: null, error: 'بيانات الدخول غير صحيحة' }
    window.localStorage.setItem(SESSION_KEY, u.id)
    return { user: u }
  }

  /** Unique-link auth: the rep_token itself is the credential (no password). */
  async signInByToken(token: string): Promise<{ user: UserProfile | null; error?: string }> {
    await this.wait()
    const u = this.db.users.find((x) => x.role === 'sales_rep' && x.rep_token === token)
    if (!u) return { user: null, error: 'رابط الدخول غير صالح أو منتهي' }
    window.localStorage.setItem(SESSION_KEY, u.id)
    return { user: u }
  }

  async signOut(): Promise<void> {
    window.localStorage.removeItem(SESSION_KEY)
  }

  /* ---------- Data ---------- */

  async fetchAll(): Promise<DataSnapshot> {
    await this.wait()
    const me = this.getSession()
    const empty: DataSnapshot = {
      stores: [],
      users: [],
      inventory: [],
      customers: [],
      transactions: [],
      items: [],
      repLocations: [],
    }
    if (!me) return empty
    if (me.role === 'manager') {
      const storeId = me.store_id
      const txIds = new Set(this.db.transactions.filter((t) => t.store_id === storeId).map((t) => t.id))
      return {
        stores: this.db.stores.filter((s) => s.id === storeId),
        users: this.db.users.filter((u) => u.store_id === storeId || u.id === me.id),
        inventory: this.db.inventory.filter((i) => i.store_id === storeId),
        customers: this.db.customers.filter((c) => c.store_id === storeId),
        transactions: this.db.transactions.filter((t) => t.store_id === storeId),
        items: this.db.items.filter((i) => txIds.has(i.transaction_id)),
        repLocations: this.db.repLocations.filter((l) => l.store_id === storeId),
      }
    }
    const txIds = new Set(this.db.transactions.filter((t) => t.rep_id === me.id).map((t) => t.id))
    return {
      stores: this.db.stores.filter((s) => s.id === me.store_id),
      users: this.db.users.filter((u) => u.id === me.id),
      inventory: this.db.inventory.filter((i) => i.rep_id === me.id),
      customers: this.db.customers.filter((c) => c.created_by_rep_id === me.id),
      transactions: this.db.transactions.filter((t) => t.rep_id === me.id),
      items: this.db.items.filter((i) => txIds.has(i.transaction_id)),
      repLocations: this.db.repLocations.filter((l) => l.rep_id === me.id),
    }
  }

  async addRep(input: { full_name: string; email: string; password: string; truck_id: string }): Promise<{ rep: UserProfile; accessLink: string }> {
    await this.wait()
    const me = this.getSession()
    if (!me || me.role !== 'manager') throw new Error('unauthorized')
    if (!input.email || !input.password) throw new Error('email/password required')
    if (this.findUser(input.email)) throw new Error('هذا البريد مسجل بالفعل')
    const rep: UserProfile = {
      id: crypto.randomUUID(),
      email: input.email.trim(),
      role: 'sales_rep',
      full_name: input.full_name.trim() || input.email.split('@')[0],
      store_id: me.store_id,
      truck_id: input.truck_id.trim(),
      rep_token: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    }
    this.commit((d) => d.users.push(rep))
    return { rep, accessLink: this.accessLinkOf(rep) }
  }

  async addCustomer(input: NewCustomerInput): Promise<Customer> {
    await this.wait()
    const me = this.getSession()
    if (!me) throw new Error('unauthorized')
    const cust: Customer = {
      id: crypto.randomUUID(),
      store_id: me.store_id ?? '',
      name: input.name,
      phone: input.phone ?? null,
      address: input.address ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      debt_limit: input.debt_limit ?? null,
      created_by_rep_id: input.created_by_rep_id ?? me.id,
      created_at: new Date().toISOString(),
    }
    this.commit((d) => d.customers.push(cust))
    return cust
  }

  async updateCustomer(id: string, patch: Partial<Customer>): Promise<void> {
    await this.wait()
    this.commit((d) => {
      const c = d.customers.find((x) => x.id === id)
      if (c) Object.assign(c, patch)
    })
  }

  async deleteCustomer(id: string): Promise<void> {
    await this.wait()
    this.commit((d) => {
      d.customers = d.customers.filter((x) => x.id !== id)
    })
  }

  async createSale(input: {
    customerId: string
    paidAmount: number
    items: { product_name: string; quantity: number; unit_price: number }[]
  }): Promise<SalesTransaction> {
    await this.wait()
    const me = this.getSession()
    if (!me) throw new Error('unauthorized')
    const total = input.items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
    const paid = Math.min(input.paidAmount, total)
    const debt = Math.max(0, total - paid)
    const customer = this.db.customers.find((c) => c.id === input.customerId)
    if (debt > 0 && customer?.debt_limit != null) {
      const existingDebt = this.db.transactions
        .filter((t) => t.customer_id === input.customerId)
        .reduce((s, t) => s + t.debt_amount, 0)
      if (existingDebt + debt > customer.debt_limit) {
        throw new Error(`تجاوز حد الدين المسموح للعميل (الحد ${customer.debt_limit} ر.س)`)
      }
    }
    const status: SalesTransaction['payment_status'] = debt === 0 ? 'paid' : paid === 0 ? 'debt' : 'partial'
    const tx: SalesTransaction = {
      id: crypto.randomUUID(),
      store_id: me.store_id ?? '',
      rep_id: me.id,
      customer_id: input.customerId,
      total_amount: total,
      paid_amount: paid,
      debt_amount: debt,
      payment_status: status,
      created_at: new Date().toISOString(),
    }
    const txItems: TransactionItem[] = input.items.map((i) => ({
      id: crypto.randomUUID(),
      transaction_id: tx.id,
      product_name: i.product_name,
      quantity: i.quantity,
      unit_price: i.unit_price,
      subtotal: i.quantity * i.unit_price,
    }))
    this.commit((d) => {
      d.transactions.push(tx)
      d.items.push(...txItems)
      for (const it of input.items) {
        const row = d.inventory.find(
          (x) => x.rep_id === me.id && x.product_name === it.product_name,
        )
        if (row) row.quantity_remaining = Math.max(0, row.quantity_remaining - it.quantity)
      }
    })
    return tx
  }

  async addInventoryRow(input: Omit<TruckInventoryItem, 'id' | 'updated_at'>): Promise<void> {
    await this.wait()
    const row: TruckInventoryItem = {
      ...input,
      id: crypto.randomUUID(),
      updated_at: new Date().toISOString(),
    }
    this.commit((d) => d.inventory.push(row))
  }

  async updateInventory(id: string, patch: Partial<TruckInventoryItem>): Promise<void> {
    await this.wait()
    this.commit((d) => {
      const row = d.inventory.find((x) => x.id === id)
      if (row) {
        Object.assign(row, patch)
        row.updated_at = new Date().toISOString()
      }
    })
  }

  async addRepLocation(latitude: number, longitude: number): Promise<void> {
    await this.wait()
    const me = this.getSession()
    if (!me) return
    const loc: RepLocation = {
      id: crypto.randomUUID(),
      store_id: me.store_id ?? '',
      rep_id: me.id,
      latitude,
      longitude,
      captured_at: new Date().toISOString(),
    }
    this.commit((d) => d.repLocations.push(loc))
  }
}
