import { useEffect, useMemo, useState } from 'react'
import { Camera, Navigation, Siren } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { getFieldPhotos, getIncidents } from '@/services/dataService'
import { formatDate, formatTime } from '@/lib/utils'
import { INCIDENT_TYPES, type FieldPhoto, type Incident } from '@/types'

/** Inbox of the silviculture foreman: incoming incidents with photos and navigation. */
export function SilvicultureDashboard() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [photos, setPhotos] = useState<FieldPhoto[]>([])
  const [typeFilter, setTypeFilter] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    void getIncidents().then(setIncidents)
    void getFieldPhotos().then(setPhotos)
  }, [])

  const photosByIncident = useMemo(() => {
    const map = new Map<string, FieldPhoto[]>()
    for (const photo of photos) {
      if (!photo.incident_id) continue
      const list = map.get(photo.incident_id) ?? []
      list.push(photo)
      map.set(photo.incident_id, list)
    }
    return map
  }, [photos])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return incidents.filter((i) => {
      if (typeFilter && i.type !== typeFilter) return false
      if (dateFilter && !i.created_at.startsWith(dateFilter)) return false
      if (q) {
        const hay =
          `${i.description} ${i.department ?? ''} ${i.ranger?.full_name ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [incidents, typeFilter, dateFilter, search])

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-lg font-bold">Prijave sa terena</h1>

      <div className="grid grid-cols-3 gap-2">
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">Sve vrste</option>
          {INCIDENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
        <Input
          placeholder="Pretraga…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">Nema prijava.</p>
      )}

      {filtered.map((incident) => {
        const incidentPhotos = photosByIncident.get(incident.id) ?? []
        return (
          <Card key={incident.id}>
            <CardContent className="p-4">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <Badge variant="destructive" className="gap-1">
                  <Siren className="h-3 w-3" /> {incident.type}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatDate(incident.created_at)} {formatTime(incident.created_at)}
                </span>
              </div>

              <p className="text-sm font-medium">{incident.ranger?.full_name ?? 'Lugar'}</p>
              <p className="mt-1 text-sm">{incident.description}</p>

              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                {incident.department && <span>Odjel: {incident.department}</span>}
                {incident.tree_count != null && <span>Stabala: {incident.tree_count}</span>}
                {incident.wood_volume_m3 != null && <span>{incident.wood_volume_m3} m³</span>}
                {incident.wood_species && <span>{incident.wood_species}</span>}
              </div>
              {incident.note && (
                <p className="mt-1 text-xs italic text-muted-foreground">{incident.note}</p>
              )}

              {incidentPhotos.length > 0 && (
                <div className="mt-2 flex gap-2 overflow-x-auto">
                  {incidentPhotos.map((photo) => (
                    <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer">
                      <img
                        src={photo.url}
                        alt="Fotografija prijave"
                        className="h-20 w-20 shrink-0 rounded-lg object-cover"
                      />
                    </a>
                  ))}
                </div>
              )}

              {incident.lat != null && incident.lng != null && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() =>
                    window.open(
                      `https://www.google.com/maps/dir/?api=1&destination=${incident.lat},${incident.lng}`,
                      '_blank',
                    )
                  }
                >
                  <Navigation className="h-4 w-4" /> Navigacija do lokacije
                </Button>
              )}
            </CardContent>
          </Card>
        )
      })}

      <h2 className="flex items-center gap-2 pt-2 text-base font-bold">
        <Camera className="h-4 w-4 text-primary" /> Sve fotografije sa terena
      </h2>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((photo) => (
          <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer">
            <img
              src={photo.url}
              alt="Fotografija s terena"
              className="aspect-square w-full rounded-lg object-cover"
            />
          </a>
        ))}
      </div>
    </div>
  )
}
