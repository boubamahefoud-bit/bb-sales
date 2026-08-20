import { MapContainer, Marker, Popup } from 'react-leaflet'
import { shopIcon } from '../lib/mapIcon'
import { Phone, MapPin, Store, UserRound } from 'lucide-react'
import { Money } from './ui'
import VectorTileLayer from './VectorTileLayer'

export interface MapCustomer {
  id: string
  name: string
  phone?: string | null
  address?: string | null
  latitude: number
  longitude: number
  repName?: string
  totalDebt?: number
}

export default function CustomerMap({
  customers,
  height = 480,
}: {
  customers: MapCustomer[]
  height?: number
}) {
  const withPos = customers.filter((c) => c.latitude != null && c.longitude != null)
  const center: [number, number] =
    withPos.length > 0 ? [withPos[0].latitude, withPos[0].longitude] : [24.7136, 46.6753]

  return (
    <div
      className="card overflow-hidden"
      style={{ height }}
      dir="ltr"
      aria-label="خريطة مواقع العملاء"
    >
      <MapContainer
        center={center}
        zoom={11}
        scrollWheelZoom
        style={{ height: '100%', width: '100%' }}
        className="z-0"
      >
        {/* High-detail vector basemap (OpenFreeMap/MapLibre, full POI) */}
        <VectorTileLayer />
        {withPos.map((c) => (
          <Marker key={c.id} position={[c.latitude, c.longitude]} icon={shopIcon('#2563eb', 34)}>
            <Popup>
              <div className="min-w-44 text-sm space-y-1.5" dir="rtl">
                <div className="flex items-center gap-1.5 font-extrabold text-base">
                  <Store className="size-4 text-primary shrink-0" /> {c.name}
                </div>
                {c.phone && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Phone className="size-3.5 shrink-0" /> <span dir="ltr">{c.phone}</span>
                  </div>
                )}
                {c.address && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <MapPin className="size-3.5 shrink-0" /> {c.address}
                  </div>
                )}
                {c.repName && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <UserRound className="size-3.5 shrink-0" /> المندوب: {c.repName}
                  </div>
                )}
                {c.totalDebt != null && c.totalDebt > 0 && (
                  <div className="text-xs font-bold text-destructive">
                    الدين: <Money value={c.totalDebt} />
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
