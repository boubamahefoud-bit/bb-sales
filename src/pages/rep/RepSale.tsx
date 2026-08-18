import { useMemo, useState } from 'react'
import { useStore } from '../../lib/store'
import {
  Search,
  UserRound,
  Plus,
  Minus,
  CheckCircle2,
  Receipt,
  Banknote,
  HandCoins,
  CreditCard,
  Loader2,
  ShoppingCart,
  X,
  PackageX,
} from 'lucide-react'
import { Money, Num, Sheet, EmptyState, useToast } from '../../components/ui'
import Invoice from '../../components/Invoice'
import { joinTransactions } from '../../lib/selectors'
import type { Customer } from '../../lib/types'

interface CartLine {
  product_name: string
  quantity: number
  unit_price: number
  available: number
}

type PayMode = 'cash' | 'debt' | 'partial'

export default function RepSale() {
  const { user, data, createSale } = useStore()
  const { show } = useToast()

  const stock = useMemo(
    () => data.inventory.filter((i) => i.rep_id === user?.id),
    [data.inventory, user?.id],
  )
  const myCustomers = useMemo(
    () => data.customers.filter((c) => c.created_by_rep_id === user?.id),
    [data.customers, user?.id],
  )

  const custDebtMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of data.transactions) m.set(t.customer_id, (m.get(t.customer_id) ?? 0) + Number(t.debt_amount || 0))
    return m
  }, [data.transactions])

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [showCustomerPicker, setShowCustomerPicker] = useState(false)
  const [custQuery, setCustQuery] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [payMode, setPayMode] = useState<PayMode>('cash')
  const [paidInput, setPaidInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [doneTxId, setDoneTxId] = useState<string | null>(null)

  const total = useMemo(() => cart.reduce((s, l) => s + l.quantity * l.unit_price, 0), [cart])

  // The payment mode is the source of truth for how the invoice is recorded:
  // - cash (نقداً): full amount paid up front -> paid = total, no debt.
  // - debt (آجل): nothing paid -> paid = 0, full amount becomes debt.
  // - partial (دفعة جزئية): paid = typed amount, debt = total - paid.
  // This guarantees a cash sale can never be recorded as a debt, even if the
  // cart total changed after the mode was selected.
  const paid = useMemo(() => {
    if (payMode === 'cash') return total
    if (payMode === 'debt') return 0
    const v = parseFloat(paidInput)
    return Number.isFinite(v) ? Math.min(Math.max(v, 0), total) : 0
  }, [payMode, paidInput, total])

  const debt = Math.max(0, total - paid)

  const currentDebt = useMemo(
    () =>
      customer
        ? data.transactions.filter((t) => t.customer_id === customer.id).reduce((s, t) => s + Number(t.debt_amount || 0), 0)
        : 0,
    [customer, data.transactions],
  )

  const limitInfo = useMemo(() => {
    if (!customer || customer.debt_limit == null) return null
    const limit = Number(customer.debt_limit)
    const projected = currentDebt + debt
    return { limit, current: currentDebt, projected, remaining: Math.max(0, limit - projected), over: projected > limit }
  }, [customer, currentDebt, debt])

  function addToCart(product: (typeof stock)[number]) {
    setCart((c) => {
      const existing = c.find((l) => l.product_name === product.product_name)
      if (existing) {
        if (existing.quantity >= product.quantity_remaining) return c
        return c.map((l) => (l.product_name === product.product_name ? { ...l, quantity: l.quantity + 1 } : l))
      }
      if (product.quantity_remaining <= 0) return c
      return [
        ...c,
        {
          product_name: product.product_name,
          quantity: 1,
          unit_price: product.unit_price,
          available: product.quantity_remaining,
        },
      ]
    })
  }

  function setQty(productName: string, delta: number) {
    setCart((c) =>
      c
        .map((l) =>
          l.product_name === productName
            ? { ...l, quantity: Math.max(0, Math.min(l.quantity + delta, l.available)) }
            : l,
        )
        .filter((l) => l.quantity > 0),
    )
  }

  function setPayModeFromLabel(mode: PayMode) {
    setPayMode(mode)
    if (mode === 'cash') setPaidInput(String(total || ''))
    else if (mode === 'debt') setPaidInput('')
    else setPaidInput(String(Math.round((total / 2) * 100) / 100))
  }

  const filteredCust = useMemo(() => {
    const q = custQuery.trim()
    if (!q) return myCustomers
    return myCustomers.filter((c) => c.name.includes(q) || (c.phone ?? '').includes(q))
  }, [myCustomers, custQuery])

  const canSubmit = !!customer && cart.length > 0 && total > 0 && !busy && !limitInfo?.over

  async function handleSubmit() {
    if (!customer) return
    setBusy(true)
    try {
      const tx = await createSale({
        customerId: customer.id,
        paidAmount: paid,
        items: cart.map((l) => ({
          product_name: l.product_name,
          quantity: l.quantity,
          unit_price: l.unit_price,
        })),
      })
      setDoneTxId(tx.id)
      show('success', 'تم تسجيل الفاتورة وخصم الكميات من المخزون')
    } catch (e) {
      console.error(e)
      show('error', 'تعذر تسجيل الفاتورة')
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setCustomer(null)
    setCart([])
    setPaidInput('')
    setPayMode('cash')
    setDoneTxId(null)
  }

  // Resolve the finished transaction from the (now refreshed) data so the
  // invoice shows the persisted record with its items.
  const doneTx = useMemo(() => {
    if (!doneTxId) return null
    return joinTransactions(data).find((t) => t.id === doneTxId) ?? null
  }, [doneTxId, data])

  return (
    <div className="space-y-4 pb-28">
      {/* Customer selection */}
      <button
        onClick={() => setShowCustomerPicker(true)}
        className="card w-full p-4 flex items-center gap-3 text-start hover:border-primary/40 transition-colors"
      >
        <span className="grid size-11 place-items-center rounded-xl bg-secondary text-secondary-foreground">
          <UserRound className="size-6" />
        </span>
        <span className="flex-1">
          {customer ? (
            <>
              <span className="block font-extrabold">{customer.name}</span>
              <span className="block text-xs text-muted-foreground" dir="ltr">{customer.phone}</span>
            </>
          ) : (
            <>
              <span className="block font-extrabold">اختر العميل</span>
              <span className="block text-xs text-muted-foreground">مطلوب لإصدار الفاتورة</span>
            </>
          )}
        </span>
        {customer && (
          <button onClick={() => setCustomer(null)} className="btn-ghost btn-sm p-1.5" aria-label="إزالة العميل">
            <X className="size-5" />
          </button>
        )}
      </button>

      {/* Stock products */}
      <div>
        <h2 className="section-title flex items-center gap-2"><ShoppingCart className="size-5 text-primary" /> أصناف الشاحنة</h2>
        {stock.length === 0 ? (
          <EmptyState
            icon={<PackageX className="size-7" />}
            title="لا يوجد مخزون"
            desc="حمّل الشاحنة من تبويب المخزون قبل إصدار الفواتير."
          />
        ) : (
          <div className="space-y-2.5">
            {stock.map((p) => {
              const line = cart.find((l) => l.product_name === p.product_name)
              const out = p.quantity_remaining <= 0
              return (
                <div key={p.id} className="card p-4 flex items-center gap-3">
                  {p.product_image_url ? (
                    <img
                      src={p.product_image_url}
                      alt={p.product_name}
                      className="size-11 shrink-0 rounded-lg object-cover border border-border"
                      loading="lazy"
                    />
                  ) : null}
                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold truncate">{p.product_name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      <Money value={p.unit_price} /> · المتاح <Num value={p.quantity_remaining} />
                    </div>
                  </div>
                  {out ? (
                    <span className="badge-destructive">نفد</span>
                  ) : line ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => setQty(line.product_name, -1)} className="btn-outline btn-md !h-11 !w-11 !p-0" aria-label="إنقاص">
                        <Minus className="size-5" />
                      </button>
                      <span className="w-9 text-center font-extrabold tnum text-lg">{line.quantity}</span>
                      <button
                        onClick={() => setQty(line.product_name, +1)}
                        disabled={line.quantity >= line.available}
                        className="btn-primary btn-md !h-11 !w-11 !p-0"
                        aria-label="زيادة"
                      >
                        <Plus className="size-5" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => addToCart(p)} className="btn-primary btn-sm">
                      <Plus className="size-4" /> إضافة
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Cart summary */}
      {cart.length > 0 && (
        <div className="card p-4 space-y-3 fade-in-up">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold">الفاتورة</h3>
            <span className="badge-muted"><span className="tnum">{cart.length}</span> صنف</span>
          </div>
          <div className="space-y-2 text-sm">
            {cart.map((l) => (
              <div key={l.product_name} className="flex items-center justify-between gap-3">
                <span className="truncate font-bold">{l.product_name}</span>
                <span className="text-muted-foreground shrink-0">
                  <span className="tnum" dir="ltr">{l.quantity} × {l.unit_price.toFixed(2)}</span>
                </span>
                <Money value={l.quantity * l.unit_price} className="shrink-0 font-extrabold" />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="font-extrabold">الإجمالي</span>
            <Money value={total} className="text-xl font-extrabold" />
          </div>
        </div>
      )}

      {/* Payment */}
      <div className="card p-4 space-y-3">
        <h3 className="font-extrabold">طريقة الدفع</h3>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => setPayModeFromLabel('cash')}
            className={`btn ${payMode === 'cash' ? 'btn-accent' : 'btn-outline'} btn-md !h-14 flex-col !gap-0.5 !py-2`}
          >
            <Banknote className="size-5" />
            <span className="text-xs">نقداً</span>
          </button>
          <button
            onClick={() => setPayModeFromLabel('partial')}
            className={`btn ${payMode === 'partial' ? 'btn-primary' : 'btn-outline'} btn-md !h-14 flex-col !gap-0.5 !py-2`}
          >
            <HandCoins className="size-5" />
            <span className="text-xs">دفعة جزئية</span>
          </button>
          <button
            onClick={() => setPayModeFromLabel('debt')}
            className={`btn ${payMode === 'debt' ? 'btn-destructive' : 'btn-outline'} btn-md !h-14 flex-col !gap-0.5 !py-2`}
          >
            <CreditCard className="size-5" />
            <span className="text-xs">آجل (دين)</span>
          </button>
        </div>

        <div>
          <label htmlFor="paid" className="label">المبلغ المدفوع الآن</label>
          <input
            id="paid"
            type="number"
            inputMode="decimal"
            min={0}
            className="input tnum"
            dir="ltr"
            value={paidInput}
            onChange={(e) => {
              setPaidInput(e.target.value)
              // Typing an amount drives the mode so the recorded invoice always
              // matches what the rep sees: 0 -> debt, full -> cash, middle -> partial.
              const v = parseFloat(e.target.value)
              if (total <= 0) return
              if (!Number.isFinite(v) || v <= 0) setPayMode('debt')
              else if (v >= total) setPayMode('cash')
              else setPayMode('partial')
            }}
            placeholder="0.00"
          />
        </div>

        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">الإجمالي</span>
            <Money value={total} className="font-bold" />
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">المدفوع</span>
            <Money value={paid} className="font-bold" />
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">المتبقي كدين</span>
            {debt > 0 ? <Money value={debt} className="font-bold text-destructive" /> : <span className="badge-accent">—</span>}
          </div>
          {limitInfo && (
            <div
              className={`rounded-lg px-3 py-2.5 text-xs font-bold leading-relaxed ${
                limitInfo.over ? 'bg-destructive/10 text-destructive' : 'bg-info/10 text-info'
              }`}
            >
              حد الدين: <span className="tnum" dir="ltr">{limitInfo.limit.toFixed(2)} أ.م</span>
              {' · '}الدين الحالي: <span className="tnum" dir="ltr">{limitInfo.current.toFixed(2)}</span>
              {limitInfo.over ? (
                <span className="block mt-1">تجاوز حد الدين — لا يمكن إصدار الفاتورة بهذا المبلغ الآجل.</span>
              ) : (
                <>
                  {' · '}المتبقي من الحد: <span className="tnum" dir="ltr">{limitInfo.remaining.toFixed(2)}</span>
                </>
              )}
            </div>
          )}
        </div>

        <button onClick={handleSubmit} disabled={!canSubmit} className="btn-accent btn-lg w-full">
          {busy ? <Loader2 className="size-5 animate-spin" /> : <Receipt className="size-5" />}
          تسجيل الفاتورة
        </button>
        {!customer && <p className="text-xs text-center text-muted-foreground">اختر العميل أولاً</p>}
        {customer && cart.length === 0 && <p className="text-xs text-center text-muted-foreground">أضف أصنافاً إلى الفاتورة</p>}
      </div>

      {/* Customer picker */}
      <Sheet open={showCustomerPicker} onClose={() => setShowCustomerPicker(false)} title="اختر العميل">
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
            <input className="input ps-11" placeholder="ابحث..." value={custQuery} onChange={(e) => setCustQuery(e.target.value)} />
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {filteredCust.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">لا يوجد عملاء مطابقون.</p>
            ) : (
              filteredCust.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setCustomer(c)
                    setShowCustomerPicker(false)
                    setCustQuery('')
                  }}
                  className="card w-full p-3.5 text-start flex items-center gap-3 hover:border-primary/40"
                >
                  <span className="grid size-9 place-items-center rounded-lg bg-secondary text-secondary-foreground">
                    <UserRound className="size-5" />
                  </span>
                  <span className="flex-1">
                    <span className="block font-bold">{c.name}</span>
                    <span className="block text-xs text-muted-foreground" dir="ltr">{c.phone ?? '—'}</span>
                    {(custDebtMap.get(c.id) ?? 0) > 0 && (
                      <span className="block text-[11px] font-bold text-destructive mt-0.5">
                        دين حالي: <Money value={custDebtMap.get(c.id) ?? 0} />
                        {c.debt_limit != null && (
                          <span className="text-muted-foreground">
                            {' '}· حد <span dir="ltr">{Number(c.debt_limit).toFixed(0)}</span>
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </Sheet>

      {/* Success sheet with digital invoice */}
      <Sheet open={!!doneTx} onClose={reset} title="تم تسجيل الفاتورة">
        {doneTx && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="grid size-14 place-items-center rounded-full bg-success/10 text-success">
                <CheckCircle2 className="size-9" />
              </span>
              <div className="font-extrabold">صدرت الفاتورة وتم خصم المخزون</div>
            </div>
            <Invoice
              transaction={doneTx}
              customer={doneTx.customer}
              rep={doneTx.rep}
              store={doneTx.store}
              items={doneTx.items ?? []}
            />
            <button onClick={reset} className="btn-primary btn-lg w-full">
              إصدار فاتورة جديدة
            </button>
          </div>
        )}
      </Sheet>
    </div>
  )
}
