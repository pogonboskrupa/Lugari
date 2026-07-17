import { useEffect, useRef, useState } from 'react'
import { CircleMarker, Polyline } from 'react-leaflet'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatTime, rangerColor } from '@/lib/utils'
import type { TrackPoint } from '@/types'

interface ReplayProps {
  rangerId: string
  points: TrackPoint[]
}

/** Animated replay of a GPS track. Renders map layers + a floating control bar. */
export function TrackReplay({ rangerId, points }: ReplayProps) {
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!playing) return
    timer.current = setInterval(() => {
      setIndex((i) => {
        if (i >= points.length - 1) {
          setPlaying(false)
          return i
        }
        return i + 1
      })
    }, 120)
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [playing, points.length])

  if (points.length === 0) return null

  const color = rangerColor(rangerId)
  const visible = points.slice(0, index + 1)
  const current = points[Math.min(index, points.length - 1)]

  return (
    <>
      <Polyline
        positions={visible.map((p) => [p.lat, p.lng] as [number, number])}
        pathOptions={{ color, weight: 4 }}
      />
      <CircleMarker
        center={[current.lat, current.lng]}
        radius={8}
        pathOptions={{ color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 }}
      />
      <div className="absolute bottom-4 left-1/2 z-[1000] flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur">
        <Button size="icon" variant="ghost" onClick={() => setPlaying((p) => !p)}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => {
            setPlaying(false)
            setIndex(0)
          }}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
        <input
          type="range"
          min={0}
          max={points.length - 1}
          value={index}
          onChange={(e) => setIndex(Number(e.target.value))}
          className="w-36 accent-[var(--primary)]"
        />
        <span className="w-14 text-xs tabular-nums text-muted-foreground">
          {formatTime(new Date(current.t).toISOString())}
        </span>
      </div>
    </>
  )
}
