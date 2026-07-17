import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/store/authStore'
import { addLogbookEntry, getLogbookEntries } from '@/services/dataService'
import { formatDate, todayISO } from '@/lib/utils'
import { LOGBOOK_ACTIVITIES, type LogbookActivity, type LogbookEntry } from '@/types'

export function LogbookPage() {
  const { profile } = useAuthStore()
  const [entries, setEntries] = useState<LogbookEntry[]>([])
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState(params.get('novo') === '1')

  const [entryDate, setEntryDate] = useState(todayISO())
  const [entryTime, setEntryTime] = useState(() =>
    new Date().toTimeString().slice(0, 5),
  )
  const [department, setDepartment] = useState('')
  const [activity, setActivity] = useState<LogbookActivity>('Obilazak odjela')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(() => {
    if (profile) void getLogbookEntries(profile.id).then(setEntries)
  }, [profile])

  useEffect(reload, [reload])

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
      await addLogbookEntry({
        ranger_id: profile.id,
        entry_date: entryDate,
        entry_time: entryTime,
        department,
        activity,
        description,
      })
      setDescription('')
      setDepartment('')
      closeDialog()
      reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Službena knjiga</h1>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Novi unos
        </Button>
      </div>

      {entries.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">Nema unosa.</p>
      )}

      {entries.map((entry) => (
        <Card key={entry.id}>
          <CardContent className="p-4">
            <div className="mb-1 flex items-center justify-between gap-2">
              <Badge variant="secondary">{entry.activity}</Badge>
              <span className="text-xs text-muted-foreground">
                {formatDate(entry.entry_date)} · {entry.entry_time}
              </span>
            </div>
            {entry.department && (
              <p className="text-sm font-medium">Odjel: {entry.department}</p>
            )}
            {entry.description && (
              <p className="mt-1 text-sm text-muted-foreground">{entry.description}</p>
            )}
          </CardContent>
        </Card>
      ))}

      <Dialog open={open} onClose={closeDialog} title="Novi unos u službenu knjigu">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="date">Datum</Label>
              <Input
                id="date"
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="time">Vrijeme</Label>
              <Input
                id="time"
                type="time"
                value={entryTime}
                onChange={(e) => setEntryTime(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="department">Odjel</Label>
            <Input
              id="department"
              placeholder="npr. Risovac 15/1"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="activity">Aktivnost</Label>
            <Select
              id="activity"
              value={activity}
              onChange={(e) => setActivity(e.target.value as LogbookActivity)}
            >
              {LOGBOOK_ACTIVITIES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Opis aktivnosti</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            Sačuvaj unos
          </Button>
        </form>
      </Dialog>
    </div>
  )
}
