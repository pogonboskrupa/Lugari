import { CircleMarker, Polyline, Popup } from 'react-leaflet'
import { formatTime, rangerColor } from '@/lib/utils'
import type { TrackPoint } from '@/types'

interface TrackLayerProps {
  rangerId: string
  rangerName: string
  points: TrackPoint[]
  /** Show a pulsing live marker at the last point. */
  live?: boolean
  color?: string
}

export function TrackLayer({ rangerId, rangerName, points, live, color }: TrackLayerProps) {
  if (points.length === 0) return null

  const trackColor = color ?? rangerColor(rangerId)
  const positions = points.map((p) => [p.lat, p.lng] as [number, number])
  const start = points[0]
  const end = points[points.length - 1]

  return (
    <>
      <Polyline positions={positions} pathOptions={{ color: trackColor, weight: 4, opacity: 0.85 }} />
      <CircleMarker
        center={[start.lat, start.lng]}
        radius={7}
        pathOptions={{ color: '#fff', weight: 2, fillColor: '#16a34a', fillOpacity: 1 }}
      >
        <Popup>
          <strong>{rangerName}</strong>
          <br />
          Početak: {formatTime(new Date(start.t).toISOString())}
        </Popup>
      </CircleMarker>
      <CircleMarker
        center={[end.lat, end.lng]}
        radius={7}
        pathOptions={{
          color: '#fff',
          weight: 2,
          fillColor: live ? trackColor : '#dc2626',
          fillOpacity: 1,
          className: live ? 'live-marker' : undefined,
        }}
      >
        <Popup>
          <strong>{rangerName}</strong>
          <br />
          {live ? 'Trenutna lokacija' : `Kraj: ${formatTime(new Date(end.t).toISOString())}`}
          <br />
          {end.speed >= 0 ? `Brzina: ${end.speed.toFixed(1)} km/h` : ''}
        </Popup>
      </CircleMarker>
    </>
  )
}
