/** Great-circle distance between two coordinates in meters (haversine). */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/**
 * High-detail, Google-Maps-style vector basemap with full POI (restaurants,
 * shops, markets, buildings, street names, local landmarks). OpenFreeMap
 * serves the "liberty" style (OpenMapTiles) for free with no API key, rendered
 * via MapLibre GL — the open-source Mapbox GL fork — so it delivers true
 * vector tiles with smooth zooming and crisp labels at any DPI.
 */
export const OPENFREEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

/**
 * Esri World Imagery — global satellite imagery, free with no API key. Used as
 * the base raster layer under the OpenFreeMap vector layers (roads, labels,
 * POIs) to build the hybrid satellite view. All sources are 256px WebMercator
 * tiles, so raster and vector align pixel-perfectly at every zoom level.
 */
export const SATELLITE_TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

export const SATELLITE_ATTRIBUTION = '&copy; Esri, Maxar, Earthstar Geographics'

/**
 * OpenStreetMap Nominatim geocoding endpoint for place search (cities, streets,
 * shops, landmarks, addresses). Free, CORS-enabled, no API key.
 */
export const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search'

/**
 * Raster fallback (Esri World Street Map, retina-aware) kept for reference.
 */
export const STREETS_TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'

export const STREETS_ATTRIBUTION =
  '&copy; <a href="https://www.esri.com">Esri</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
