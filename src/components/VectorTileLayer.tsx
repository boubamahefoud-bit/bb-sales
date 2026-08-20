import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import maplibreGL from '@maplibre/maplibre-gl-leaflet'
import type { StyleSpecification, LayerSpecification, SourceSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { pinIcon } from '../lib/mapIcon'
import {
  OPENFREEMAP_STYLE_URL,
  SATELLITE_TILE_URL,
  SATELLITE_ATTRIBUTION,
  NOMINATIM_SEARCH_URL,
} from '../lib/geo'

export type MapMode = 'street' | 'satellite'

let satelliteStylePromise: Promise<StyleSpecification> | null = null

/**
 * Builds the satellite style once: the OpenFreeMap "liberty" vector style with
 * an Esri World Imagery raster layer injected at the very bottom (replacing the
 * background), so roads, street names and every POI render on top of live
 * satellite imagery — the same hybrid look Google Maps uses.
 */
function getSatelliteStyle(): Promise<StyleSpecification> {
  if (!satelliteStylePromise) {
    satelliteStylePromise = fetch(OPENFREEMAP_STYLE_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`style fetch failed: ${r.status}`)
        return r.json() as Promise<StyleSpecification>
      })
      .then((style) => {
        const layers = (style.layers ?? []).slice()
        const bgIndex = layers.findIndex((l) => l.id === 'background')
        const satelliteLayer: LayerSpecification = {
          id: 'satellite-imagery',
          type: 'raster',
          source: 'esri-imagery',
        }
        if (bgIndex >= 0) layers.splice(bgIndex, 0, satelliteLayer)
        else layers.unshift(satelliteLayer)
        const sources: Record<string, SourceSpecification> = {
          ...(style.sources ?? {}),
          'esri-imagery': {
            type: 'raster',
            tiles: [SATELLITE_TILE_URL],
            tileSize: 256,
            maxzoom: 19,
            attribution: SATELLITE_ATTRIBUTION,
          },
        }
        return { ...style, sources, layers }
      })
  }
  return satelliteStylePromise
}

interface NominatimResult {
  lat: string
  lon: string
  display_name: string
}

/**
 * High-detail vector basemap (OpenFreeMap/MapLibre, full POI) with a street/
 * satellite mode switch and a place search box (Nominatim geocoding). Mounts
 * into Leaflet's tilePane so existing markers/popups keep rendering above it.
 */
export default function VectorTileLayer({ mode = 'street' }: { mode?: MapMode }) {
  const map = useMap()
  const layerRef = useRef<ReturnType<typeof maplibreGL> | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const [viewMode, setViewMode] = useState<MapMode>(mode)
  const [query, setQuery] = useState('')
  const [searchState, setSearchState] = useState<'idle' | 'busy' | 'ok' | 'error'>('idle')
  const [searchMsg, setSearchMsg] = useState('')

  useEffect(() => {
    const layer = maplibreGL({ style: OPENFREEMAP_STYLE_URL })
    layer.addTo(map)
    layerRef.current = layer
    return () => {
      layer.remove()
      layerRef.current = null
      markerRef.current?.remove()
      markerRef.current = null
    }
  }, [map])

  useEffect(() => {
    const glMap = layerRef.current?.getMaplibreMap()
    if (!glMap) return
    if (viewMode === 'satellite') {
      getSatelliteStyle()
        .then((style) => glMap.setStyle(style))
        .catch(() => {
          setViewMode('street')
          setSearchMsg('تعذر تحميل صور القمر الصناعي، تم العودة إلى الخريطة العادية')
        })
    } else {
      glMap.setStyle(OPENFREEMAP_STYLE_URL)
    }
  }, [viewMode])

  async function handleSearch(e: FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q || searchState === 'busy') return
    setSearchState('busy')
    setSearchMsg('جاري البحث…')
    try {
      const url = `${NOMINATIM_SEARCH_URL}?format=jsonv2&limit=1&addressdetails=0&q=${encodeURIComponent(q)}`
      const res = await fetch(url, { headers: { Accept: 'application/json' } })
      if (!res.ok) throw new Error(`geocode ${res.status}`)
      const places = (await res.json()) as NominatimResult[]
      if (!places.length) {
        setSearchState('error')
        setSearchMsg('لم يُعثر على المكان، جرّب اسم مدينة أو شارع أو معلم آخر')
        return
      }
      const place = places[0]
      const lat = parseFloat(place.lat)
      const lng = parseFloat(place.lon)
      map.flyTo([lat, lng], 16)
      markerRef.current?.remove()
      markerRef.current = L.marker([lat, lng], { icon: pinIcon('#dc2626', 38) }).addTo(map)
      markerRef.current.bindPopup(place.display_name)
      markerRef.current.openPopup()
      setSearchState('ok')
      setSearchMsg('')
    } catch {
      setSearchState('error')
      setSearchMsg('تعذر البحث الآن، تحقق من اتصالك بالإنترنت')
    }
  }

  const toggle = (m: MapMode) => setViewMode(m)

  return (
    <>
      <div
        className="absolute top-2 end-2 z-[1100] flex w-64 max-w-[calc(100%-1rem)] flex-col gap-1.5"
        dir="rtl"
      >
        <div className="inline-flex rounded-xl border border-border bg-card/95 p-1 gap-1 shadow-pop">
          <button
            type="button"
            onClick={() => toggle('street')}
            className={`btn-sm flex-1 ${viewMode === 'street' ? 'btn-accent' : 'btn-ghost'}`}
          >
            شارع
          </button>
          <button
            type="button"
            onClick={() => toggle('satellite')}
            className={`btn-sm flex-1 ${viewMode === 'satellite' ? 'btn-accent' : 'btn-ghost'}`}
          >
            قمر صناعي
          </button>
        </div>
        <form
          onSubmit={handleSearch}
          className="flex items-center gap-1.5 rounded-xl border border-border bg-card/95 p-1.5 shadow-pop"
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث عن مكان، شارع، معلم…"
            aria-label="البحث عن مكان"
            className="input !h-8 min-w-0 flex-1 text-sm"
          />
          <button
            type="submit"
            disabled={searchState === 'busy'}
            className="btn-accent btn-sm shrink-0"
          >
            بحث
          </button>
        </form>
        {searchMsg && (
          <div
            className={`pointer-events-auto rounded-xl border px-3 py-1.5 text-xs font-bold shadow-pop ${
              searchState === 'error'
                ? 'border-destructive/40 bg-destructive/10 text-destructive'
                : 'border-border bg-card text-muted-foreground'
            }`}
          >
            {searchMsg}
          </div>
        )}
      </div>
    </>
  )
}
