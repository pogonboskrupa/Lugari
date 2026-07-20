import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { CheckCircle2, CircleDashed, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAuthStore } from '@/store/authStore'
import {
  createTask,
  getRangersForSupervisor,
  getTasksForForeman,
} from '@/services/dataService'
import { formatDate } from '@/lib/utils'
import type { Profile, RangerTask } from '@/types'

/** Foreman assigns tasks to rangers; completion is confirmed in the field with GPS. */
export function ForemanTasksPage() {
  const { profile } = useAuthStore()
  const [tasks, setTasks] = useState<RangerTask[]>([])
  const [rangers, setRangers] = useState<Profile[]>([])
  const [open, setOpen] = useState(false)

  const [rangerId, setRangerId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [department, setDepartment] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(() => {
    if (!profile) return
    void getTasksForForeman(profile.id).then(setTasks)
    void getRangersForSupervisor(profile.id).then(setRangers)
  }, [profile])

  useEffect(reload, [reload])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!profile || !rangerId) return
    setBusy(true)
    try {
      await createTask({
        foreman_id: profile.id,
        ranger_id: rangerId,
        title,
        description: description || null,
        department: department || null,
        due_date: dueDate || null,
      })
      setTitle('')
      setDescription('')
      setDepartment('')
      setDueDate('')
      setOpen(false)
      reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Zadaci lugarima</h1>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Novi zadatak
        </Button>
      </div>

      {tasks.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">Nema zadataka.</p>
      )}

      {tasks.map((task) => (
        <Card key={task.id}>
          <CardContent className="flex items-start gap-3 p-4">
            {task.status === 'done' ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            ) : (
              <CircleDashed className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium">{task.title}</p>
              <p className="text-xs text-muted-foreground">
                {task.ranger?.full_name ?? task.ranger_id}
              </p>
              {task.description && <p className="mt-0.5 text-sm">{task.description}</p>}
              <div className="mt-1.5 flex flex-wrap gap-2 text-xs">
                {task.department && <Badge variant="secondary">{task.department}</Badge>}
                {task.due_date && <Badge variant="outline">Rok: {formatDate(task.due_date)}</Badge>}
                {task.status === 'done' && task.completed_at && (
                  <Badge variant="success">
                    Izvršeno {formatDate(task.completed_at)}
                    {task.completed_lat != null ? ' · GPS potvrda' : ''}
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={open} onClose={() => setOpen(false)} title="Novi zadatak">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ranger">Lugar</Label>
            <Select
              id="ranger"
              value={rangerId}
              onChange={(e) => setRangerId(e.target.value)}
              required
            >
              <option value="">Odaberi lugara…</option>
              {rangers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.full_name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="title">Naziv zadatka</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tdesc">Opis</Label>
            <Textarea
              id="tdesc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tdep">Odjel</Label>
              <Input
                id="tdep"
                placeholder="npr. Risovac 15/1"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tdue">Rok</Label>
              <Input
                id="tdue"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            Dodijeli zadatak
          </Button>
        </form>
      </Dialog>
    </div>
  )
}
