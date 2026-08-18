import { useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import { useStore } from '../../lib/store'
import { MapPinned, Truck, Radio, Store, UserRound } from 'lucide-react'
import { pinIcon, shopIcon } from '../../lib/mapIcon'
import { latestRepLocations, repDailySummary } from '../../lib/selectors'
import { fmtTime, todayKey } from '../../lib/format'
import { haversineMeters, STREETS_TILE_URL, STREETS_ATTRIBUTION } from '../../lib/geo'
import { EmptyState, Money } from '../../components/ui'
import type { Customer } from '../../lib/types'

const REP_COLORS = ['#2563eb', '#059669', '#dc2626', '#f59e0b', '#0891b2', '#7c3aed', '#db2777', '#65a30d']
// Distance (meters) under which a rep is considered "at the customer's place".
const NEAR_CUSTOMER_M = 150

function livePin(id: string) {
  const color = REP_COLORS[Math.abs(hash(id)) % REP_COLORS.length]
  return pinIcon(color, 34)
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export default function ManagerLiveMap() {
  const { data } = useStore()
  const today = todayKey()

  const reps = useMemo(() => data.users.filter((u) => u.role === 'sales_rep'), [data.users])
  const latest = useMemo(() => latestRepLocations(data), [data])

  const active = useMemo(
    () => reps.filter((r) => latest.has(r.id)).map((r) => ({ rep: r, loc: latest.get(r.id)! })),
    [reps, latest],
  )

  const customersWithPos = useMemo(
    () => data.customers.filter((c) => c.latitude != null && c.longitude != null) as (Customer & { latitude: number; longitude: number })[],
    [data.customers],
  )

  // Reps located near one of their assigned customers -> highlight that customer.
  const nearbyByRep = useMemo(() => {
    const map = new Map<string, Customer[]>()
    for (const { rep, loc } of active) {
      const near = customersWithPos.filter(
        (c) => c.created_by_rep_id === rep.id && haversineMeters(loc.latitude, loc.longitude, c.latitude, c.longitude) <= NEAR_CUSTOMER_M,
      )
      if (near.length > 0) map.set(rep.id, near)
    }
    return map
  }, [active, customersWithPos])

  const highlightedCustomerIds = useMemo(() => {
    const ids = new Set<string>()
    for (const near of nearbyByRep.values()) for (const c of near) ids.add(c.id)
    return ids
  }, [nearbyByRep])

  const center: [number, number] =
    active.length > 0
      ? [active[0].loc.latitude, active[0].loc.longitude]
      : customersWithPos.length > 0
        ? [customersWithPos[0].latitude, customersWithPos[0].longitude]
        : [24.7136, 46.6753]

  const showMap = active.length > 0 || customersWithPos.length > 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="section-title flex items-center gap-2 mb-0">
          <MapPinned className="size-6 text-primary" /> تتبع المندوبين لحظياً
        </h1>
        <span className="badge-accent">
          <Radio className="size-3.5" />
          <span className="tnum">{active.length}</span> نشط
        </span>
      </div>

      {!showMap ? (
        <EmptyState
          icon={<MapPinned className="size-7" />}
          title="لا توجد مواقع بعد"
          desc="عندما يفتح المندوبون تطبيقهم ويُفعّلون التتبع سيبدأ النظام ببث مواقعهم على هذه الخريطة لحظياً."
        />
      ) : (
        <>
          <div className="card overflow-hidden" dir="ltr" style={{ height: 460 }} aria-label="خريطة تتبع المندوبين">
            <MapContainer
              center={center}
              zoom={12}
              scrollWheelZoom
              style={{ height: '100%', width: '100%' }}
              className="z-0"
            >
              <TileLayer attribution={STREETS_ATTRIBUTION} url={STREETS_TILE_URL} />

              {/* Customer markers (highlighted when a rep is nearby) */}
              {customersWithPos.map((c) => {
                const highlighted = highlightedCustomerIds.has(c.id)
                return (
                  <Marker
                    key={c.id}
                    position={[c.latitude, c.longitude]}
                    icon={shopIcon(highlighted ? '#16a34a' : '#64748b', highlighted ? 42 : 32)}
                  >
                    <Popup>
                      <div className="min-w-44 text-sm space-y-1" dir="rtl">
                        <div className="flex items-center gap-1.5 font-extrabold text-base">
                          <Store className="size-4" /> {c.name}
                        </div>
                        {c.phone && <div className="text-xs text-muted-foreground" dir="ltr">{c.phone}</div>}
                        {highlighted && (
                          <div className="text-xs font-extrabold text-success">
                            {(() => {
                              const near = [...nearbyByRep.values()].flat().filter((x) => x.id === c.id)
                              const repNames = [...new Set(near.map((n) => reps.find((r) => r.id === n.created_by_rep_id)?.full_name).filter(Boolean))]
                              return `المندوب عند العميل: ${repNames.join('، ')}`
                            })()}
                          </div>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                )
              })}

              {/* Live rep pins */}
              {active.map(({ rep, loc }) => {
                const near = nearbyByRep.get(rep.id) ?? []
                return (
                  <Marker key={rep.id} position={[loc.latitude, loc.longitude]} icon={livePin(rep.id)}>
                    <Popup>
                      <div className="min-w-44 text-sm space-y-1" dir="rtl">
                        <div className="flex items-center gap-1.5 font-extrabold text-base">
                          <Truck className="size-4" /> {rep.full_name}
                        </div>
                        <div className="text-xs text-muted-foreground">شاحنة {rep.truck_id ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">آخر تحديث: {fmtTime(loc.captured_at)}</div>
                        {near.length > 0 && (
                          <div className="pt-1 border-t border-border mt-1">
                            <div className="text-xs font-extrabold text-success">
                              <UserRound className="inline size-3.5 me-0.5" />
                              المندوب عند العميل: {near.map((c) => c.name).join('، ')}
                            </div>
                          </div>
                        )}
                        {(() => {
                          const d = repDailySummary(data, rep.id, today).get(rep.id)
                          return d ? (
                            <div className="pt-1 border-t border-border mt-1">
                              <div className="text-xs font-bold">كاش اليوم: <Money value={d.cash_collected} /></div>
                            </div>
                          ) : null
                        })()}
                      </div>
                    </Popup>
                  </Marker>
                )
              })}
            </MapContainer>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {active.map(({ rep, loc }) => {
              const d = repDailySummary(data, rep.id, today).get(rep.id)
              const near = nearbyByRep.get(rep.id) ?? []
              return (
                <div key={rep.id} className="card p-4 flex items-center gap-3">
                  <span className="relative shrink-0">
                    <span className="grid size-10 place-items-center rounded-xl bg-secondary text-secondary-foreground font-extrabold">
                      {rep.full_name.slice(0, 1)}
                    </span>
                    <span className="absolute -top-0.5 -end-0.5 grid size-3 place-items-center">
                      <span className="absolute inline-flex size-full rounded-full bg-accent opacity-60 animate-ping" />
                      <span className="relative inline-flex size-2.5 rounded-full bg-accent" />
                    </span>
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold truncate">{rep.full_name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      شاحنة {rep.truck_id ?? '—'} · آخر تحديث {fmtTime(loc.captured_at)}
                    </div>
                    {near.length > 0 && (
                      <div className="text-xs font-extrabold text-success truncate mt-0.5">
                        عند العميل: {near.map((c) => c.name).join('، ')}
                      </div>
                    )}
                  </div>
                  <div className="text-end shrink-0">
                    <Money value={d?.cash_collected ?? 0} className="font-extrabold text-accent block" />
                    <span className="text-[11px] text-muted-foreground">كاش اليوم</span>
                  </div>
                </div>
              )
            })}
          </div>

          {highlightedCustomerIds.size > 0 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span className="inline-block size-3 rounded-full bg-success/80" />
              العميل المميز بالأخضر = المندوب موجود حالياً بجانب محله.
            </p>
          )}
        </>
      )}
    </div>
  )
}
