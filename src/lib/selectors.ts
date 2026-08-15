import type {
  CustomerDebt,
  DataSnapshot,
  RepLocation,
  TransactionItem,
  TransactionWithItems,
  TruckInventoryItem,
  UserProfile,
} from './types'
import { todayKey } from './format'

export function joinTransactions(data: DataSnapshot): TransactionWithItems[] {
  const customerMap = new Map(data.customers.map((c) => [c.id, c]))
  const repMap = new Map(data.users.map((u) => [u.id, u]))
  const storeMap = new Map(data.stores.map((s) => [s.id, s]))
  const itemsByTx = new Map<string, TransactionItem[]>()
  for (const it of data.items) {
    const arr = itemsByTx.get(it.transaction_id) ?? []
    arr.push(it)
    itemsByTx.set(it.transaction_id, arr)
  }
  return data.transactions.map((t) => ({
    ...t,
    customer: customerMap.get(t.customer_id),
    rep: repMap.get(t.rep_id),
    store: storeMap.get(t.store_id),
    items: itemsByTx.get(t.id),
  }))
}

export function customerDebts(data: DataSnapshot): CustomerDebt[] {
  const debts = new Map<string, CustomerDebt>()
  for (const c of data.customers) {
    debts.set(c.id, {
      customer_id: c.id,
      customer_name: c.name,
      phone: c.phone ?? null,
      created_by_rep_id: c.created_by_rep_id,
      total_debt: 0,
      debt_limit: c.debt_limit ?? null,
      open_transactions: 0,
    })
  }
  for (const t of data.transactions) {
    const entry = debts.get(t.customer_id)
    if (!entry) continue
    if (t.debt_amount > 0) {
      entry.total_debt += t.debt_amount
      entry.open_transactions += 1
      if (!entry.last_transaction_at || t.created_at > entry.last_transaction_at) {
        entry.last_transaction_at = t.created_at
      }
    }
  }
  return [...debts.values()].sort((a, b) => b.total_debt - a.total_debt)
}

export interface RepDailyTotals {
  total_sales: number
  cash_collected: number
  debts_issued: number
  transactions_count: number
}

export function repDailySummary(
  data: DataSnapshot,
  repId?: string,
  date = todayKey(),
): Map<string, RepDailyTotals> {
  const map = new Map<string, RepDailyTotals>()
  for (const t of data.transactions) {
    if (repId && t.rep_id !== repId) continue
    if (t.created_at.slice(0, 10) !== date) continue
    const cur = map.get(t.rep_id) ?? { total_sales: 0, cash_collected: 0, debts_issued: 0, transactions_count: 0 }
    cur.total_sales += t.total_amount
    cur.cash_collected += t.paid_amount
    cur.debts_issued += t.debt_amount
    cur.transactions_count += 1
    map.set(t.rep_id, cur)
  }
  return map
}

export function inventoryValue(items: TruckInventoryItem[]): number {
  return items.reduce((s, i) => s + i.quantity_remaining * i.unit_price, 0)
}

export function totalOutstandingDebts(data: DataSnapshot): number {
  return data.transactions.reduce((s, t) => s + t.debt_amount, 0)
}

export function totalCollectedCash(data: DataSnapshot): number {
  return data.transactions.reduce((s, t) => s + t.paid_amount, 0)
}

export function totalSales(data: DataSnapshot): number {
  return data.transactions.reduce((s, t) => s + t.total_amount, 0)
}

export function repName(users: UserProfile[], id: string): string {
  return users.find((u) => u.id === id)?.full_name ?? '—'
}

/** Latest known location per rep (for the live map). */
export function latestRepLocations(data: DataSnapshot): Map<string, RepLocation> {
  const map = new Map<string, RepLocation>()
  for (const l of data.repLocations) {
    const prev = map.get(l.rep_id)
    if (!prev || l.captured_at > prev.captured_at) map.set(l.rep_id, l)
  }
  return map
}
