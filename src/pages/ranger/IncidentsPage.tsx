import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Camera, MapPin, Mic, Plus, Send, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/store/authStore'
import { createIncident, getIncidents, saveFieldPhoto } from '@/services/dataService'
import { loadDepartments, classifyLocation } from '@/services/geoService'
import { formatDate, formatTime } from '@/lib/utils'
import { INCIDENT_TYPES, type Incident, type IncidentType } from '@/types'

export function IncidentsPage() {
  const { profile } = useAuthStore()
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState(params.get('novo') === '1')

  const [type, setType] = useState<IncidentType>('Bespravna sječa')
  const [description, setDescription] = useState('')
  const [treeCount, setTreeCount] = useState('')
  const [woodVolume, setWoodVolume] = useState('')
  const [woodSpecies, setWoodSpecies] = useState('')
  const [note, setNote] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [video, setVideo] = useState<File | null>(null)
  const [audio, setAudio] = useState<File | null>(null)
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null)
  const [department, setDepartment] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const photoInput = useRef<HTMLInputElement>(null)
  const videoInput = useRef<HTMLInputElement>(null)
  const audioInput = useRef<HTMLInputElement>(null)

  const reload = useCallback(() => {
    if (!profile) return
    void getIncidents().then((all) =>
      setIncidents(
        profile.role === 'ranger' ? all.filter((i) => i.ranger_id === profile.id) : all,
      ),
    )
  }, [profile])

  useEffect(reload, [reload])

  // Capture GPS position when the form opens.
  useEffect(() => {
    if (!open || !('geolocation' in navigator)) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setPosition(loc)
        void loadDepartments()
          .then((deps) => {
            const status = classifyLocation(loc.lat, loc.lng, deps)
            setDepartment(status.kind === 'outside' ? null : status.label)
          })
          .catch(() => undefined)
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }, [open])

  function closeDialog() {
    setOpen(false)
    params.delete('novo')
    setParams(params, { replace: true })
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    setBusy(true)
    try {
      const incident = await createIncident({
        ranger_id: profile.id,
        type,
        description,
        lat: position?.lat ?? null,
        lng: position?.lng ?? null,
        department,
        tree_count: treeCount ? Number(treeCount) : null,
        wood_volume_m3: woodVolume ? Number(woodVolume) : null,
        wood_species: woodSpecies || null,
        note: note || null,
        photo_urls: [],
        video_url: null,
        audio_url: null,
      })
      // Photos are stored locally and uploaded by the sync queue; each one is
      // linked to the incident so the silviculture foreman sees them together.
      for (const file of photos) {
        await saveFieldPhoto(file, {
          ranger_id: profile.id,
          lat: position?.lat ?? null,
          lng: position?.lng ?? null,
          department,
          taken_at: new Date().toISOString(),
          incident_id: incident.id,
        })
      }
      setDescription('')
      setTreeCount('')
      setWoodVolume('')
      setWoodSpecies('')
      setNote('')
      setPhotos([])
      setVideo(null)
      setAudio(null)
      closeDialog()
      reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Prijave</h1>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Nova prijava
        </Button>
      </div>

      {incidents.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">Nema prijava.</p>
      )}

      {incidents.map((incident) => (
        <Card key={incident.id}>
          <CardContent className="p-4">
            <div className="mb-1 flex items-center justify-between gap-2">
              <Badge variant="destructive">{incident.type}</Badge>
              <span className="text-xs text-muted-foreground">
                {formatDate(incident.created_at)} {formatTime(incident.created_at)}
              </span>
            </div>
            <p className="text-sm">{incident.description}</p>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
              {incident.department && <span>Odjel: {incident.department}</span>}
              {incident.tree_count != null && <span>Stabala: {incident.tree_count}</span>}
              {incident.wood_volume_m3 != null && <span>{incident.wood_volume_m3} m³</span>}
              {incident.wood_species && <span>{incident.wood_species}</span>}
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={open} onClose={closeDialog} title="Nova prijava">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="type">Vrsta</Label>
            <Select id="type" value={type} onChange={(e) => setType(e.target.value as IncidentType)}>
              {INCIDENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="desc">Opis</Label>
            <Textarea
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              required
            />
          </div>

          <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs">
            <MapPin className="h-4 w-4 shrink-0 text-primary" />
            {position
              ? `GPS: ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}${department ? ` · ${department}` : ''}`
              : 'Preuzimanje GPS lokacije…'}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              hidden
              onChange={(e) => setPhotos((p) => [...p, ...Array.from(e.target.files ?? [])])}
            />
            <input
              ref={videoInput}
              type="file"
              accept="video/*"
              capture="environment"
              hidden
              onChange={(e) => setVideo(e.target.files?.[0] ?? null)}
            />
            <input
              ref={audioInput}
              type="file"
              accept="audio/*"
              capture
              hidden
              onChange={(e) => setAudio(e.target.files?.[0] ?? null)}
            />
            <Button type="button" variant="outline" onClick={() => photoInput.current?.click()}>
              <Camera className="h-4 w-4" /> {photos.length > 0 ? `(${photos.length})` : 'Foto'}
            </Button>
            <Button type="button" variant="outline" onClick={() => videoInput.current?.click()}>
              <Video className="h-4 w-4" /> {video ? '✓' : 'Video'}
            </Button>
            <Button type="button" variant="outline" onClick={() => audioInput.current?.click()}>
              <Mic className="h-4 w-4" /> {audio ? '✓' : 'Audio'}
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="trees">Broj stabala</Label>
              <Input
                id="trees"
                type="number"
                min="0"
                value={treeCount}
                onChange={(e) => setTreeCount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="volume">Količina (m³)</Label>
              <Input
                id="volume"
                type="number"
                min="0"
                step="0.1"
                value={woodVolume}
                onChange={(e) => setWoodVolume(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="species">Vrsta drveta</Label>
            <Input
              id="species"
              placeholder="npr. bukva, jela, smrča"
              value={woodSpecies}
              onChange={(e) => setWoodSpecies(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="note">Napomena</Label>
            <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>

          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            <Send className="h-4 w-4" /> Pošalji uzgojnom poslovođi
          </Button>
        </form>
      </Dialog>
    </div>
  )
}
