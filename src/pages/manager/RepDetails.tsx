import { useMemo, useState } from 'react'
import { useStore } from '../../lib/store'
import {
  Truck,
  Mail,
  Wallet,
  HandCoins,
  CreditCard,
  Receipt,
  Users,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Money, Num, PaymentBadge, StatCard, EmptyState } from '../../components/ui'
import type { UserProfile } from '../../lib/types'
import { joinTransactions, customerDebts, repDailySummary } from '../../lib/selectors'
import { fmtDateTime, todayKey } from '../../lib/format'

export default function RepDetails({ rep, onClose }: { rep: UserProfile; onClose: () => void }) {
  const { data } = useStore()

  const txns = useMemo(() => joinTransactions(data).filter((t) => t.rep_id === rep.id), [data, rep.id])
  const customers = useMemo(() => data.customers.filter((c) => c.created_by_rep_id === rep.id), [data.customers, rep.id])
  const debts = useMemo(() => customerDebts(data).filter((c) => c.created_by_rep_id === rep.id), [data])

  const totalSales = useMemo(() => txns.reduce((s, t) => s + t.total_amount, 0), [txns])
  const totalDebt = useMemo(() => txns.reduce((s, t) => s + t.debt_amount, 0), [txns])
  const totalCash = useMemo(() => txns.reduce((s, t) => s + t.paid_amount, 0), [txns])
  const customerDebtTotal = useMemo(() => debts.reduce((s, c) => s + c.total_debt, 0), [debts])

  const today = todayKey()
  const daily = repDailySummary(data, rep.id, today).get(rep.id)

  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground font-extrabold text-lg">
          {rep.full_name.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-extrabold text-lg truncate">{rep.full_name}</div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {rep.truck_id && (
              <span className="flex items-center gap-1">
                <Truck className="size-3.5" /> شاحنة {rep.truck_id}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Mail className="size-3.5" /> <span dir="ltr">{rep.email}</span>
            </span>
          </div>
        </div>
        <button onClick={onClose} className="btn-outline btn-sm shrink-0">إغلاق</button>
      </div>

      {/* Performance stats */}
      <div className="grid grid-cols-2 gap-2.5">
        <StatCard label="إجمالي المبيعات" value={<Money value={totalSales} />} icon={<Wallet className="size-5" />} tone="primary" />
        <StatCard label="النقد المحصّل" value={<Money value={totalCash} />} icon={<HandCoins className="size-5" />} tone="accent" />
        <StatCard label="ديون صادرة" value={<Money value={totalDebt} />} icon={<CreditCard className="size-5" />} tone="destructive" />
        <StatCard label="عدد الفواتير" value={<Num value={txns.length} />} icon={<Receipt className="size-5" />} tone="info" />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <StatCard
          label="كاش اليوم"
          value={<Money value={daily?.cash_collected ?? 0} />}
          sub={daily ? <><Num value={daily.transactions_count} /> فاتورة اليوم</> : 'لا حركة اليوم'}
          icon={<HandCoins className="size-5" />}
          tone="accent"
        />
        <StatCard
          label="العملاء"
          value={<Num value={customers.length} />}
          sub={<><Num value={debts.length} /> عميل بدين</>}
          icon={<Users className="size-5" />}
          tone="muted"
        />
      </div>

      {customerDebtTotal > 0 && (
        <div className="card p-4 flex items-center justify-between">
          <span className="text-sm font-bold">إجمالي ديون عملاء المندوب</span>
          <Money value={customerDebtTotal} className="text-lg font-extrabold text-destructive" />
        </div>
      )}

      {/* Itemized invoices */}
      <div>
        <h3 className="section-title flex items-center gap-2 mb-3">
          <Receipt className="size-5 text-primary" /> الفواتير المفصّلة
        </h3>
        {txns.length === 0 ? (
          <EmptyState icon={<Receipt className="size-7" />} title="لا فواتير بعد" desc="لم يسجل هذا المندوب أي فواتير." />
        ) : (
          <div className="space-y-2.5">
            {txns.map((t) => {
              const open = expanded === t.id
              return (
                <div key={t.id} className="card overflow-hidden">
                  <button
                    onClick={() => setExpanded(open ? null : t.id)}
                    className="w-full p-4 text-start flex items-center gap-3 hover:bg-muted/40"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
                      <Receipt className="size-5" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-extrabold truncate">{t.customer?.name ?? '—'}</span>
                      <span className="block text-xs text-muted-foreground truncate">{fmtDateTime(t.created_at)}</span>
                    </span>
                    <span className="text-end shrink-0 space-y-1">
                      <Money value={t.total_amount} className="font-extrabold block" />
                      <PaymentBadge status={t.payment_status} />
                    </span>
                    {open ? <ChevronUp className="size-4 text-muted-foreground shrink-0" /> : <ChevronDown className="size-4 text-muted-foreground shrink-0" />}
                  </button>
                  {open && (
                    <div className="border-t border-border px-4 py-3 space-y-3 fade-in-up">
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <div className="text-[11px] text-muted-foreground font-bold">الإجمالي</div>
                          <Money value={t.total_amount} className="font-extrabold" />
                        </div>
                        <div>
                          <div className="text-[11px] text-muted-foreground font-bold">المدفوع</div>
                          <Money value={t.paid_amount} className="font-extrabold text-accent" />
                        </div>
                        <div>
                          <div className="text-[11px] text-muted-foreground font-bold">الدين</div>
                          <Money value={t.debt_amount} className="font-extrabold text-destructive" />
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs text-muted-foreground border-b border-border">
                              <th className="text-start py-2 font-bold">الصنف</th>
                              <th className="text-center py-2 font-bold">الكمية</th>
                              <th className="text-end py-2 font-bold">السعر</th>
                              <th className="text-end py-2 font-bold">الإجمالي</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(t.items ?? []).map((it, i) => (
                              <tr key={i} className="border-b border-border/60 last:border-0">
                                <td className="py-2 font-bold">{it.product_name}</td>
                                <td className="py-2 text-center tnum" dir="ltr">{it.quantity}</td>
                                <td className="py-2 text-end tnum" dir="ltr"><Money value={it.unit_price} /></td>
                                <td className="py-2 text-end tnum" dir="ltr"><Money value={it.subtotal} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
