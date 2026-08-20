import { useMemo } from 'react'
import { useStore } from '../../lib/store'
import {
  LayoutDashboard,
  TrendingUp,
  Banknote,
  HandCoins,
  Users,
  Boxes,
  Receipt,
  Store,
  ArrowUpRight,
} from 'lucide-react'
import { StatCard, Money, Num, EmptyState } from '../../components/ui'
import {
  totalSales,
  totalCollectedCash,
  totalOutstandingDebts,
  inventoryValue,
  repDailySummary,
  joinTransactions,
} from '../../lib/selectors'
import { todayKey } from '../../lib/format'

export default function ManagerDashboard() {
  const { store, data } = useStore()

  const reps = useMemo(() => data.users.filter((u) => u.role === 'sales_rep'), [data.users])
  const txCount = data.transactions.length
  const totalInvValue = inventoryValue(data.inventory)
  const today = todayKey()

  const todaySummary = useMemo(() => {
    let sales = 0
    let cash = 0
    let debt = 0
    for (const r of repDailySummary(data, undefined, today).values()) {
      sales += r.total_sales
      cash += r.cash_collected
      debt += r.debts_issued
    }
    return { sales, cash, debt }
  }, [data, today])

  const recent = useMemo(() => joinTransactions(data).slice(0, 6), [data])

  return (
    <div className="space-y-6">
      <div className="card p-5 flex items-center gap-4">
        <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Store className="size-8" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-muted-foreground">متجر</div>
          <div className="text-xl font-extrabold truncate">{store?.name ?? '—'}</div>
        </div>
        <span className="badge-primary"><span className="tnum">{reps.length}</span> مندوب</span>
      </div>

      {/* Today's KPIs */}
      <div>
        <h2 className="section-title flex items-center gap-2">
          <LayoutDashboard className="size-5 text-primary" /> أداء اليوم
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="مبيعات اليوم" value={<Money value={todaySummary.sales} />} icon={<TrendingUp className="size-5" />} tone="primary" />
          <StatCard label="الكاش المحصّل" value={<Money value={todaySummary.cash} />} icon={<Banknote className="size-5" />} tone="accent" />
          <StatCard label="ديون اليوم" value={<Money value={todaySummary.debt} />} icon={<HandCoins className="size-5" />} tone="warning" />
          <StatCard label="الفواتير" value={<Num value={txCount} />} icon={<Receipt className="size-5" />} tone="info" />
        </div>
      </div>

      {/* All-time KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="إجمالي المبيعات" value={<Money value={totalSales(data)} />} icon={<TrendingUp className="size-5" />} tone="primary" />
        <StatCard label="إجمالي الكاش" value={<Money value={totalCollectedCash(data)} />} icon={<Banknote className="size-5" />} tone="accent" />
        <StatCard label="ديون مستحقة" value={<Money value={totalOutstandingDebts(data)} />} icon={<HandCoins className="size-5" />} tone="destructive" />
        <StatCard label="قيمة المخزون" value={<Money value={totalInvValue} />} icon={<Boxes className="size-5" />} tone="info" />
      </div>

      {/* Reps snapshot */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold flex items-center gap-2">
            <Users className="size-5 text-primary" /> المندوبون
          </h3>
          <span className="badge-muted"><Num value={reps.length} /> مندوب</span>
        </div>
        {reps.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            لم تُضف أي مندوبين بعد — أنشئ أول مندوب واحصل على رابط وصول خاص به.
          </p>
        ) : (
          <div className="space-y-2">
            {reps.map((r) => {
              const daily = repDailySummary(data, r.id, today).get(r.id)
              return (
                <div key={r.id} className="flex items-center gap-3 rounded-xl bg-muted/60 p-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground font-extrabold">
                    {r.full_name.slice(0, 1)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">{r.full_name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      شاحنة {r.truck_id ?? '—'} · {r.email}
                    </div>
                  </div>
                  <div className="text-end shrink-0">
                    <Money value={daily?.cash_collected ?? 0} className="font-extrabold text-sm block" />
                    <span className="text-[11px] text-muted-foreground">كاش اليوم</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Recent transactions */}
      <div>
        <h2 className="section-title flex items-center gap-2">
          <Receipt className="size-5 text-primary" /> آخر الفواتير
        </h2>
        {recent.length === 0 ? (
          <EmptyState
            icon={<Receipt className="size-7" />}
            title="لا توجد فواتير بعد"
            desc="ستظهر هنا فور إصدار المندوبين لأول فاتورة. كل شيء يبدأ من صفر حقيقي."
          />
        ) : (
          <div className="space-y-2">
            {recent.map((t) => (
              <div key={t.id} className="card p-4 flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground">
                  <Receipt className="size-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold truncate">{t.customer?.name ?? '—'}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {t.rep?.full_name ?? '—'} · <Num value={t.items?.length ?? 0} /> صنف
                  </div>
                </div>
                <div className="flex items-center gap-1 text-sm font-bold text-accent shrink-0">
                  <ArrowUpRight className="size-4" />
                  <Money value={t.total_amount} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
