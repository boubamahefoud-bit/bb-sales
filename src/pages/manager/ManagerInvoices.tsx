import { useMemo, useState } from 'react'
import { useStore } from '../../lib/store'
import { Receipt, Search, Eye } from 'lucide-react'
import { Money, Num, PaymentBadge, Sheet, EmptyState } from '../../components/ui'
import Invoice from '../../components/Invoice'
import { joinTransactions } from '../../lib/selectors'
import { fmtDateTime } from '../../lib/format'

type Filter = 'all' | 'paid' | 'partial' | 'debt'

export default function ManagerInvoices() {
  const { data } = useStore()

  const all = useMemo(() => joinTransactions(data), [data])
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim()
    return all.filter((t) => {
      if (filter !== 'all' && t.payment_status !== filter) return false
      if (!q) return true
      return (
        (t.customer?.name ?? '').includes(q) ||
        (t.rep?.full_name ?? '').includes(q) ||
        t.id.includes(q)
      )
    })
  }, [all, filter, query])

  const selected = useMemo(
    () => (selectedId ? (all.find((t) => t.id === selectedId) ?? null) : null),
    [selectedId, all],
  )

  const totals = useMemo(() => {
    let total = 0
    let paid = 0
    let debt = 0
    for (const t of all) {
      total += t.total_amount
      paid += t.paid_amount
      debt += t.debt_amount
    }
    return { total, paid, debt }
  }, [all])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-3.5 text-center">
          <div className="text-xs text-muted-foreground font-bold">الإجمالي</div>
          <Money value={totals.total} className="text-lg font-extrabold" />
        </div>
        <div className="card p-3.5 text-center">
          <div className="text-xs text-muted-foreground font-bold">المحصّل</div>
          <Money value={totals.paid} className="text-lg font-extrabold text-accent" />
        </div>
        <div className="card p-3.5 text-center">
          <div className="text-xs text-muted-foreground font-bold">ديون</div>
          <Money value={totals.debt} className="text-lg font-extrabold text-destructive" />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
          <input
            className="input ps-11"
            placeholder="ابحث بالعميل أو المندوب..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {(
            [
              ['all', 'الكل'],
              ['paid', 'مدفوع'],
              ['partial', 'جزئي'],
              ['debt', 'دين'],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilter(val as Filter)}
              className={`shrink-0 h-12 px-4 rounded-lg text-sm font-bold transition-colors ${
                filter === val ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Receipt className="size-7" />}
          title="لا توجد فواتير"
          desc="لم تُسجل أي فواتير بعد. ستظهر فواتير المندوبين هنا لحظياً."
        />
      ) : (
        <div className="space-y-2.5">
          {filtered.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedId(t.id)}
              className="card w-full p-4 text-start flex items-center gap-3 hover:border-primary/40"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground">
                <Receipt className="size-6" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-extrabold truncate">{t.customer?.name ?? '—'}</div>
                <div className="text-xs text-muted-foreground truncate mt-0.5">
                  {t.rep?.full_name ?? '—'} · {fmtDateTime(t.created_at)} · <Num value={t.items?.length ?? 0} /> صنف
                </div>
              </div>
              <div className="text-end shrink-0 space-y-1">
                <Money value={t.total_amount} className="font-extrabold block" />
                <PaymentBadge status={t.payment_status} />
              </div>
              <Eye className="size-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* Invoice viewer */}
      <Sheet open={!!selected} onClose={() => setSelectedId(null)} title="الفاتورة">
        {selected && (
          <Invoice
            transaction={selected}
            customer={selected.customer}
            rep={selected.rep}
            store={selected.store}
            items={selected.items ?? []}
          />
        )}
      </Sheet>
    </div>
  )
}
