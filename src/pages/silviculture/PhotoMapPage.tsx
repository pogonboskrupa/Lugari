import { useEffect, useState } from 'react'
import { Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import { MapView } from '@/components/map/MapView'
import { PhotoMarkers } from '@/components/map/PhotoMarkers'
import { getFieldPhotos, getIncidents } from '@/services/dataService'
import { formatDate, formatTime } from '@/lib/utils'
import type { FieldPhoto, Incident } from '@/types'

const incidentIcon = L.divIcon({
  className: '',
  html: `<div style="width:30px;height:30px;border-radius:9999px;background:#dc2626;border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.4)">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
  </div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
})

/** Map of all field photos and incident locations for the silviculture foreman. */
export function PhotoMapPage() {
  const [photos, setPhotos] = useState<FieldPhoto[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])

  useEffect(() => {
    void getFieldPhotos().then(setPhotos)
    void getIncidents().then(setIncidents)
  }, [])

  return (
    <div className="relative h-full">
      <MapView className="absolute inset-0">
        <PhotoMarkers photos={photos} />
        {incidents
          .filter((i) => i.lat != null && i.lng != null)
          .map((incident) => (
            <Marker key={incident.id} position={[incident.lat!, incident.lng!]} icon={incidentIcon}>
              <Popup minWidth={200}>
                <strong>{incident.type}</strong>
                <br />
                {incident.ranger?.full_name ?? 'Lugar'}
                <br />
                {formatDate(incident.created_at)} {formatTime(incident.created_at)}
                <br />
                {incident.description}
                <br />
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${incident.lat},${incident.lng}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Navigacija →
                </a>
              </Popup>
            </Marker>
          ))}
      </MapView>
    </div>
  )
}
