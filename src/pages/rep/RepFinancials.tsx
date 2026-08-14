import { useMemo, useState } from 'react'
import { useStore } from '../../lib/store'
import {
  Banknote,
  HandCoins,
  Receipt,
  TrendingUp,
  ListChecks,
} from 'lucide-react'
import { StatCard, Money, Num, PaymentBadge, EmptyState } from '../../components/ui'
import { repDailySummary, joinTransactions, customerDebts } from '../../lib/selectors'
import { fmtDateTime, sameDay, todayKey } from '../../lib/format'

export default function RepFinancials() {
  const { user, data } = useStore()
  const [day, setDay] = useState(todayKey())

  const myTxs = useMemo(() => {
    const joined = joinTransactions(data)
    return joined.filter((t) => t.rep_id === user?.id)
  }, [data, user?.id])

  const todayTotals = repDailySummary(data, user?.id, day).get(user?.id ?? '') ?? {
    total_sales: 0,
    cash_collected: 0,
    debts_issued: 0,
    transactions_count: 0,
  }

  const dayTxs = useMemo(
    () => myTxs.filter((t) => sameDay(t.created_at, day)).slice(0, 50),
    [myTxs, day],
  )

  const myDebts = useMemo(() => {
    return customerDebts(data).filter((c) => c.created_by_rep_id === user?.id)
  }, [data, user?.id])

  const totalDebts = myDebts.reduce((s, c) => s + c.total_debt, 0)
  const allTimeSales = myTxs.reduce((s, t) => s + t.total_amount, 0)

  function shiftDay(delta: number) {
    const d = new Date(`${day}T00:00:00`)
    d.setDate(d.getDate() + delta)
    setDay(d.toISOString().slice(0, 10))
  }

  return (
    <div className="space-y-5">
      {/* Income KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="مبيعات اليوم"
          value={<Money value={todayTotals.total_sales} />}
          icon={<TrendingUp className="size-5" />}
          tone="primary"
        />
        <StatCard
          label="محصل نقداً"
          value={<Money value={todayTotals.cash_collected} />}
          icon={<Banknote className="size-5" />}
          tone="accent"
        />
        <StatCard
          label="دين اليوم"
          value={<Money value={todayTotals.debts_issued} />}
          icon={<HandCoins className="size-5" />}
          tone="warning"
        />
        <StatCard
          label="عدد الفواتير"
          value={<Num value={todayTotals.transactions_count} />}
          icon={<Receipt className="size-5" />}
          tone="info"
        />
      </div>

      {/* Day switcher + cumulative */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button onClick={() => shiftDay(-1)} className="btn-outline btn-sm !h-9 !px-3" aria-label="اليوم السابق">
              →
            </button>
            <span className="text-sm font-extrabold whitespace-nowrap">{fmtDateTime(`${day}T12:00:00`)}</span>
            <button onClick={() => shiftDay(1)} className="btn-outline btn-sm !h-9 !px-3" aria-label="اليوم التالي">
              ←
            </button>
          </div>
          <button onClick={() => setDay(todayKey())} className="btn-ghost btn-sm">اليوم</button>
        </div>
        <div className="grid grid-cols-3 divide-x divide-border rtl:divide-x-reverse text-center">
          <div>
            <div className="text-xs text-muted-foreground font-bold">إجمالي الكاش المتراكم</div>
            <Money value={myTxs.reduce((s, t) => s + t.paid_amount, 0)} className="font-extrabold" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground font-bold">إجمالي المبيعات</div>
            <Money value={allTimeSales} className="font-extrabold" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground font-bold">ديوني المستحقة</div>
            <Money value={totalDebts} className="font-extrabold text-destructive" />
          </div>
        </div>
      </div>

      {/* Day transactions */}
      <div>
        <h2 className="section-title flex items-center gap-2">
          <ListChecks className="size-5 text-primary" /> فواتير هذا اليوم
        </h2>
        {dayTxs.length === 0 ? (
          <EmptyState
            icon={<Receipt className="size-7" />}
            title="لا توجد فواتير"
            desc="لم تُسجل أي مبيعات في هذا اليوم."
          />
        ) : (
          <div className="space-y-2.5">
            {dayTxs.map((t) => (
              <div key={t.id} className="card p-4 flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground">
                  <Receipt className="size-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold truncate">{t.customer?.name ?? '—'}</div>
                  <div className="text-xs text-muted-foreground">
                    {fmtDateTime(t.created_at)} · <Num value={t.items?.length ?? 0} /> صنف
                  </div>
                </div>
                <div className="text-end shrink-0">
                  <Money value={t.total_amount} className="font-extrabold block" />
                  <PaymentBadge status={t.payment_status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
