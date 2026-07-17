import { CircleMarker } from 'react-leaflet'
import { buildHeatmapGrid } from '@/services/analyticsService'
import type { TrackPoint } from '@/types'

interface HeatmapLayerProps {
  tracks: TrackPoint[][]
}

/** Lightweight dependency-free heatmap: grid cells rendered as translucent circles. */
export function HeatmapLayer({ tracks }: HeatmapLayerProps) {
  const cells = buildHeatmapGrid(tracks)
  if (cells.length === 0) return null
  const max = Math.max(...cells.map((c) => c.count))

  return (
    <>
      {cells.map((cell) => {
        const intensity = cell.count / max
        const color =
          intensity > 0.66 ? '#dc2626' : intensity > 0.33 ? '#f59e0b' : '#22c55e'
        return (
          <CircleMarker
            key={`${cell.lat}:${cell.lng}`}
            center={[cell.lat, cell.lng]}
            radius={8 + intensity * 14}
            pathOptions={{ stroke: false, fillColor: color, fillOpacity: 0.25 + intensity * 0.35 }}
          />
        )
      })}
    </>
  )
}
