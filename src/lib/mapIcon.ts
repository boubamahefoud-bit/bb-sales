import L from 'leaflet'

export function pinIcon(color = '#2563eb', size = 34): L.DivIcon {
  const svg = `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <filter id="pin-shadow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#00000055"/>
      </filter>
      <path fill="${color}" filter="url(#pin-shadow)" d="M12 1C7.03 1 3 5.03 3 10c0 5.5 9 13 9 13s9-7.5 9-13c0-4.97-4.03-9-9-9z"/>
      <circle cx="12" cy="10" r="3.4" fill="#ffffff"/>
    </svg>`
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size + 6],
  })
}
