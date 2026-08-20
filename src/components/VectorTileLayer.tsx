import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import maplibreGL from '@maplibre/maplibre-gl-leaflet'
import 'maplibre-gl/dist/maplibre-gl.css'
import { OPENFREEMAP_STYLE_URL } from '../lib/geo'

/**
 * High-detail vector basemap rendered with MapLibre GL (open Mapbox GL fork).
 * OpenFreeMap serves the "liberty" style (OpenMapTiles data) with full POIs —
 * restaurants, shops, markets, buildings, street names and landmarks — for
 * free, with no API key. The layer mounts into Leaflet's tilePane so existing
 * markers/popups keep rendering above it.
 */
export default function VectorTileLayer() {
  const map = useMap()

  useEffect(() => {
    const layer = maplibreGL({ style: OPENFREEMAP_STYLE_URL })
    layer.addTo(map)
    return () => {
      layer.remove()
    }
  }, [map])

  return null
}
