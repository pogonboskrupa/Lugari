import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Camera } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { getFieldPhotos, saveFieldPhoto } from '@/services/dataService'
import { loadDepartments, classifyLocation } from '@/services/geoService'
import { formatDate, formatTime } from '@/lib/utils'
import type { FieldPhoto } from '@/types'

export function PhotosPage() {
  const { profile } = useAuthStore()
  const [photos, setPhotos] = useState<FieldPhoto[]>([])
  const [busy, setBusy] = useState(false)
  const [params, setParams] = useSearchParams()
  const input = useRef<HTMLInputElement>(null)

  const reload = useCallback(() => {
    if (!profile) return
    void getFieldPhotos().then((all) =>
      setPhotos(profile.role === 'ranger' ? all.filter((p) => p.ranger_id === profile.id) : all),
    )
  }, [profile])

  useEffect(reload, [reload])

  // Auto-open camera when arriving via the FAB.
  useEffect(() => {
    if (params.get('novo') === '1') {
      input.current?.click()
      params.delete('novo')
      setParams(params, { replace: true })
    }
  }, [params, setParams])

  async function handleCapture(file: File) {
    if (!profile) return
    setBusy(true)
    try {
      // Attach GPS + department metadata to the photo.
      const position = await new Promise<GeolocationPosition | null>((resolve) => {
        if (!('geolocation' in navigator)) return resolve(null)
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 15000 },
        )
      })

      let department: string | null = null
      if (position) {
        try {
          const deps = await loadDepartments()
          const status = classifyLocation(
            position.coords.latitude,
            position.coords.longitude,
            deps,
          )
          department = status.kind === 'outside' ? null : status.label
        } catch {
          // GeoJSON not cached yet — department stays unknown.
        }
      }

      await saveFieldPhoto(file, {
        ranger_id: profile.id,
        lat: position?.coords.latitude ?? null,
        lng: position?.coords.longitude ?? null,
        department,
        taken_at: new Date().toISOString(),
        incident_id: null,
      })
      reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Fotografije</h1>
        <Button size="sm" disabled={busy} onClick={() => input.current?.click()}>
          <Camera className="h-4 w-4" /> Slikaj
        </Button>
      </div>

      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleCapture(file)
          e.target.value = ''
        }}
      />

      {photos.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">Nema fotografija.</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        {photos.map((photo) => (
          <a
            key={photo.id}
            href={photo.url}
            target="_blank"
            rel="noreferrer"
            className="overflow-hidden rounded-xl border border-border bg-card"
          >
            <img src={photo.url} alt="Fotografija s terena" className="aspect-square w-full object-cover" />
            <div className="p-2 text-xs">
              <p className="font-medium">{photo.department ?? 'Van odjela'}</p>
              <p className="text-muted-foreground">
                {formatDate(photo.taken_at)} {formatTime(photo.taken_at)}
              </p>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
