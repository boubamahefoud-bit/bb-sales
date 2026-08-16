export type Role = 'manager' | 'sales_rep'

export type PaymentStatus = 'paid' | 'partial' | 'debt'

export interface Store {
  id: string
  name: string
  owner_user_id: string
  created_at: string
}

export interface UserProfile {
  id: string
  email: string
  role: Role
  full_name: string
  phone?: string | null
  store_id?: string | null
  truck_id?: string | null
  rep_token?: string | null
  password?: string
  created_at: string
}

export interface TruckInventoryItem {
  id: string
  store_id: string
  rep_id: string
  product_name: string
  product_image_url?: string | null
  quantity_loaded: number
  quantity_remaining: number
  unit_price: number
  updated_at: string
}

export interface Customer {
  id: string
  store_id: string
  name: string
  phone?: string | null
  address?: string | null
  latitude?: number | null
  longitude?: number | null
  debt_limit?: number | null
  created_by_rep_id: string
  created_at: string
}

export interface SalesTransaction {
  id: string
  store_id: string
  rep_id: string
  customer_id: string
  total_amount: number
  paid_amount: number
  debt_amount: number
  payment_status: PaymentStatus
  created_at: string
}

export interface TransactionItem {
  id: string
  transaction_id: string
  product_name: string
  quantity: number
  unit_price: number
  subtotal: number
}

export interface RepLocation {
  id: string
  store_id: string
  rep_id: string
  latitude: number
  longitude: number
  captured_at: string
}

export interface DataSnapshot {
  stores: Store[]
  users: UserProfile[]
  inventory: TruckInventoryItem[]
  customers: Customer[]
  transactions: SalesTransaction[]
  items: TransactionItem[]
  repLocations: RepLocation[]
}

/** Shape returned by the `rep_session` RPC (unique-link auth). */
export interface RepSessionResult {
  profile: UserProfile
  store: Store | null
  inventory: TruckInventoryItem[]
  customers: Customer[]
  transactions: SalesTransaction[]
  items: TransactionItem[]
  repLocations: RepLocation[]
}

/* ---------- Joined / computed shapes ---------- */

export interface TransactionWithItems extends SalesTransaction {
  customer?: Pick<Customer, 'id' | 'name' | 'phone' | 'address'>
  rep?: Pick<UserProfile, 'id' | 'full_name' | 'truck_id'>
  store?: Pick<Store, 'id' | 'name'>
  items?: TransactionItem[]
}

export interface CustomerDebt {
  customer_id: string
  customer_name: string
  phone?: string | null
  created_by_rep_id: string
  total_debt: number
  debt_limit?: number | null
  open_transactions: number
  last_transaction_at?: string | null
}

/* ---------- Payloads ---------- */

export interface NewCustomerInput {
  name: string
  phone?: string | null
  address?: string | null
  latitude?: number | null
  longitude?: number | null
  debt_limit?: number | null
  /** Managers may assign the customer to a specific rep; reps default to themselves. */
  created_by_rep_id?: string
}

export interface NewTransactionInput {
  customer_id: string
  paid_amount: number
  items: { product_name: string; quantity: number; unit_price: number }[]
}
