import { useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import { useStore } from '../../lib/store'
import { MapPinned, Truck, Radio } from 'lucide-react'
import { pinIcon } from '../../lib/mapIcon'
import { latestRepLocations, repDailySummary } from '../../lib/selectors'
import { fmtTime, todayKey } from '../../lib/format'
import { EmptyState, Money } from '../../components/ui'

const REP_COLORS = ['#2563eb', '#059669', '#dc2626', '#f59e0b', '#0891b2', '#7c3aed', '#db2777', '#65a30d']

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

  const center: [number, number] =
    active.length > 0 ? [active[0].loc.latitude, active[0].loc.longitude] : [24.7136, 46.6753]

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

      {active.length === 0 ? (
        <EmptyState
          icon={<MapPinned className="size-7" />}
          title="لا توجد مواقع بعد"
          desc="عندما يفتح المندوبون تطبيقهم سيبدأ النظام ببث مواقعهم على هذه الخريطة لحظياً."
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
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {active.map(({ rep, loc }) => (
                <Marker key={rep.id} position={[loc.latitude, loc.longitude]} icon={livePin(rep.id)}>
                  <Popup>
                    <div className="min-w-44 text-sm space-y-1" dir="rtl">
                      <div className="flex items-center gap-1.5 font-extrabold text-base">
                        <Truck className="size-4" /> {rep.full_name}
                      </div>
                      <div className="text-xs text-muted-foreground">شاحنة {rep.truck_id ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">آخر تحديث: {fmtTime(loc.captured_at)}</div>
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
              ))}
            </MapContainer>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {active.map(({ rep, loc }) => {
              const d = repDailySummary(data, rep.id, today).get(rep.id)
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
                  </div>
                  <div className="text-end shrink-0">
                    <Money value={d?.cash_collected ?? 0} className="font-extrabold text-accent block" />
                    <span className="text-[11px] text-muted-foreground">كاش اليوم</span>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
