import { useMemo, useState } from 'react'
import { useStore } from '../../lib/store'
import {
  Boxes,
  Truck,
  ChevronDown,
  ChevronUp,
  PackageSearch,
} from 'lucide-react'
import { Money, Num, EmptyState } from '../../components/ui'
import { inventoryValue } from '../../lib/selectors'

/**
 * Admin view of every rep's loaded van stock (مخزون شاحنات المناديب).
 * Real-time: reads the same realtime/polled `data.inventory` the dashboard
 * already uses, so quantities update live as reps issue invoices.
 */
export default function ManagerVanInventory() {
  const { data } = useStore()
  const [expanded, setExpanded] = useState<string | null>(null)

  const reps = useMemo(() => data.users.filter((u) => u.role === 'sales_rep'), [data.users])

  const repStock = useMemo(
    () =>
      reps.map((r) => {
        const items = data.inventory.filter((i) => i.rep_id === r.id)
        const totalLoaded = items.reduce((s, i) => s + i.quantity_loaded, 0)
        const totalRemaining = items.reduce((s, i) => s + i.quantity_remaining, 0)
        return { rep: r, items, totalLoaded, totalRemaining, value: inventoryValue(items) }
      }),
    [reps, data.inventory],
  )

  const loadedReps = repStock.filter((s) => s.items.length > 0)
  const hasAnyStock = loadedReps.length > 0

  return (
    <div>
      <h2 className="section-title flex items-center gap-2">
        <Boxes className="size-5 text-primary" /> مخزون شاحنات المناديب
      </h2>

      {!hasAnyStock ? (
        <EmptyState
          icon={<PackageSearch className="size-7" />}
          title="لا يوجد مخزون محمّل بعد"
          desc="عندما يضيف المندوبون منتجات إلى شاحناتهم من تطبيقهم ستظهر الكميات المحملة والمباعة والمتبقية هنا لحظياً."
        />
      ) : (
        <div className="space-y-2.5">
          {loadedReps.map(({ rep, items, totalLoaded, totalRemaining, value }) => {
            const open = expanded === rep.id
            const sold = Math.max(0, totalLoaded - totalRemaining)
            return (
              <div key={rep.id} className="card overflow-hidden">
                <button
                  onClick={() => setExpanded(open ? null : rep.id)}
                  className="w-full p-4 text-start flex items-center gap-3 hover:bg-muted/40"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground font-extrabold">
                    {rep.full_name.slice(0, 1)}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-extrabold truncate">{rep.full_name}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                      <Truck className="size-3.5 shrink-0" /> شاحنة {rep.truck_id ?? '—'}
                    </span>
                  </span>
                  <span className="text-end shrink-0 space-y-0.5">
                    <span className="block text-xs font-bold text-muted-foreground">
                      محمّل <Num value={totalLoaded} /> · متبقي <Num value={totalRemaining} />
                    </span>
                    <Money value={value} className="font-extrabold block" />
                  </span>
                  {open ? (
                    <ChevronUp className="size-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="size-4 text-muted-foreground shrink-0" />
                  )}
                </button>

                {open && (
                  <div className="border-t border-border fade-in-up">
                    <div className="grid grid-cols-3 gap-2 border-b border-border bg-muted/40 px-4 py-3 text-center">
                      <div>
                        <div className="text-[11px] text-muted-foreground font-bold">محمل بالشاحنة</div>
                        <div className="font-extrabold tnum"><Num value={totalLoaded} /></div>
                      </div>
                      <div>
                        <div className="text-[11px] text-muted-foreground font-bold">الكمية المباعة</div>
                        <div className="font-extrabold tnum text-accent"><Num value={sold} /></div>
                      </div>
                      <div>
                        <div className="text-[11px] text-muted-foreground font-bold">الكمية المتبقية</div>
                        <div className="font-extrabold tnum text-destructive"><Num value={totalRemaining} /></div>
                      </div>
                    </div>
                    <div className="divide-y divide-border">
                      {items.map((i) => {
                        const itemSold = Math.max(0, i.quantity_loaded - i.quantity_remaining)
                        return (
                          <div key={i.id} className="flex items-center gap-3 px-4 py-3">
                            {i.product_image_url ? (
                              <img
                                src={i.product_image_url}
                                alt={i.product_name}
                                className="size-10 shrink-0 rounded-lg object-cover border border-border"
                                loading="lazy"
                              />
                            ) : (
                              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                                <Boxes className="size-5" />
                              </span>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-sm truncate">{i.product_name}</div>
                              <div className="text-xs text-muted-foreground">
                                <Money value={i.unit_price} /> / قطعة
                              </div>
                            </div>
                            <div className="text-end shrink-0 text-xs font-bold tnum space-y-0.5" dir="ltr">
                              <div className="text-muted-foreground">
                                محمّل <Num value={i.quantity_loaded} />
                              </div>
                              <div className="text-accent">
                                مباع <Num value={itemSold} />
                              </div>
                              <div className={i.quantity_remaining <= 0 ? 'text-destructive' : ''}>
                                متبقي <Num value={i.quantity_remaining} />
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
