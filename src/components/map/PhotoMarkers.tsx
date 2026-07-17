import { Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import { formatDate, formatTime } from '@/lib/utils'
import type { FieldPhoto } from '@/types'

const photoIcon = L.divIcon({
  className: '',
  html: `<div style="width:30px;height:30px;border-radius:9999px;background:#0ea5e9;border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.4)">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
  </div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
})

interface PhotoMarkersProps {
  photos: FieldPhoto[]
}

export function PhotoMarkers({ photos }: PhotoMarkersProps) {
  return (
    <>
      {photos
        .filter((p) => p.lat != null && p.lng != null)
        .map((photo) => (
          <Marker key={photo.id} position={[photo.lat!, photo.lng!]} icon={photoIcon}>
            <Popup minWidth={220}>
              <a href={photo.url} target="_blank" rel="noreferrer">
                <img
                  src={photo.url}
                  alt="Fotografija s terena"
                  style={{ width: '100%', borderRadius: 8 }}
                />
              </a>
              <div style={{ marginTop: 6, fontSize: 12 }}>
                <strong>{photo.ranger?.full_name ?? 'Lugar'}</strong>
                <br />
                {formatDate(photo.taken_at)} {formatTime(photo.taken_at)}
                {photo.department && (
                  <>
                    <br />
                    Odjel: {photo.department}
                  </>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
    </>
  )
}
