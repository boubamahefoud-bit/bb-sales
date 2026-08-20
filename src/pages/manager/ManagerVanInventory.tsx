import { useMemo, useState } from 'react'
import { useStore } from '../../lib/store'
import {
  Boxes,
  Truck,
  PackageSearch,
  UserRound,
} from 'lucide-react'
import { Money, Num, EmptyState, Sheet } from '../../components/ui'
import { inventoryValue } from '../../lib/selectors'
import type { UserProfile, TruckInventoryItem } from '../../lib/types'

/** Detailed stock inside a single rep's van (product names + quantities). */
function RepVanStock({ rep }: { rep: UserProfile }) {
  const { data } = useStore()
  const items = useMemo(
    () =>
      data.inventory
        .filter((i) => i.rep_id === rep.id)
        .sort((a, b) => a.product_name.localeCompare(b.product_name)),
    [data.inventory, rep.id],
  )
  const totalLoaded = items.reduce((s, i) => s + i.quantity_loaded, 0)
  const totalRemaining = items.reduce((s, i) => s + i.quantity_remaining, 0)
  const totalSold = Math.max(0, totalLoaded - totalRemaining)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-muted/60 p-3 text-center">
          <div className="text-[11px] text-muted-foreground font-bold">محمل بالشاحنة</div>
          <div className="font-extrabold tnum text-lg"><Num value={totalLoaded} /></div>
        </div>
        <div className="rounded-xl bg-muted/60 p-3 text-center">
          <div className="text-[11px] text-muted-foreground font-bold">الكمية المباعة</div>
          <div className="font-extrabold tnum text-lg text-accent"><Num value={totalSold} /></div>
        </div>
        <div className="rounded-xl bg-muted/60 p-3 text-center">
          <div className="text-[11px] text-muted-foreground font-bold">الكمية المتبقية</div>
          <div className="font-extrabold tnum text-lg text-destructive"><Num value={totalRemaining} /></div>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<PackageSearch className="size-7" />}
          title="الشاحنة فارغة"
          desc="لم يضف هذا المندوب أي منتجات إلى شاحنته بعد."
        />
      ) : (
        <div className="space-y-2">
          {items.map((i) => (
            <VanProductRow key={i.id} item={i} />
          ))}
        </div>
      )}
    </div>
  )
}

function VanProductRow({ item }: { item: TruckInventoryItem }) {
  const sold = Math.max(0, item.quantity_loaded - item.quantity_remaining)
  return (
    <div className="card p-3.5 flex items-center gap-3">
      {item.product_image_url ? (
        <img
          src={item.product_image_url}
          alt={item.product_name}
          className="size-11 shrink-0 rounded-lg object-cover border border-border"
          loading="lazy"
        />
      ) : (
        <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Boxes className="size-6" />
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-extrabold truncate">{item.product_name}</div>
        <div className="text-xs text-muted-foreground">
          <Money value={item.unit_price} /> / قطعة
        </div>
      </div>
      <div className="text-end shrink-0 text-xs font-bold tnum space-y-0.5" dir="ltr">
        <div className="text-muted-foreground">محمّل <Num value={item.quantity_loaded} /></div>
        <div className="text-accent">مباع <Num value={sold} /></div>
        <div className={item.quantity_remaining <= 0 ? 'text-destructive' : ''}>
          متبقي <Num value={item.quantity_remaining} />
        </div>
      </div>
    </div>
  )
}

/**
 * Admin "المخزون" tab: lists every sales rep; selecting one opens a detailed
 * view of the full stock currently inside that rep's van. Real-time — reads
 * the same realtime/polled data.inventory the dashboard already uses, so
 * quantities update live as reps issue invoices.
 */
export default function ManagerVanInventory() {
  const { data } = useStore()
  const [selectedRep, setSelectedRep] = useState<UserProfile | null>(null)

  const reps = useMemo(() => data.users.filter((u) => u.role === 'sales_rep'), [data.users])

  const repSummaries = useMemo(
    () =>
      reps.map((r) => {
        const items = data.inventory.filter((i) => i.rep_id === r.id)
        const totalLoaded = items.reduce((s, i) => s + i.quantity_loaded, 0)
        const totalRemaining = items.reduce((s, i) => s + i.quantity_remaining, 0)
        return { rep: r, productCount: items.length, totalLoaded, totalRemaining, value: inventoryValue(items) }
      }),
    [reps, data.inventory],
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
          <Boxes className="size-5" />
          <span className="tnum">{reps.length}</span> مندوب
        </div>
        <span className="badge-muted">
          <Num value={repSummaries.reduce((s, r) => s + r.productCount, 0)} /> منتج محمّل
        </span>
      </div>

      {reps.length === 0 ? (
        <EmptyState
          icon={<PackageSearch className="size-7" />}
          title="لا يوجد مندوبون بعد"
          desc="أنشئ مندوبين أولاً — بمجرد أن يضيفوا منتجات إلى شاحناتهم ستظهر هنا محملة ومباعة ومتبقية لحظياً."
        />
      ) : (
        <div className="space-y-2.5">
          {repSummaries.map(({ rep, productCount, totalLoaded, totalRemaining, value }) => (
            <button
              key={rep.id}
              onClick={() => setSelectedRep(rep)}
              className="card w-full p-4 flex items-center gap-3 text-start hover:border-primary/40"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground font-extrabold">
                {rep.full_name.slice(0, 1)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-extrabold truncate">{rep.full_name}</div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
                  <Truck className="size-3.5 shrink-0" /> شاحنة {rep.truck_id ?? '—'}
                </div>
              </div>
              <div className="text-end shrink-0 space-y-0.5">
                <div className="text-xs text-muted-foreground font-bold">
                  <Num value={productCount} /> منتج · محمّل <Num value={totalLoaded} /> · متبقي{' '}
                  <Num value={totalRemaining} />
                </div>
                <Money value={value} className="font-extrabold block" />
              </div>
              <UserRound className="size-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* Per-rep van stock detail */}
      <Sheet open={!!selectedRep} onClose={() => setSelectedRep(null)} title={`مخزون شاحنة ${selectedRep?.truck_id ?? ''}`} size="lg">
        {selectedRep && <RepVanStock rep={selectedRep} />}
      </Sheet>
    </div>
  )
}
