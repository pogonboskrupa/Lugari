import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, CircleDashed } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/store/authStore'
import { completeTask, getTasksForRanger } from '@/services/dataService'
import { formatDate } from '@/lib/utils'
import type { RangerTask } from '@/types'

export function TasksPage() {
  const { profile } = useAuthStore()
  const [tasks, setTasks] = useState<RangerTask[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  const reload = useCallback(() => {
    if (profile) void getTasksForRanger(profile.id).then(setTasks)
  }, [profile])

  useEffect(reload, [reload])

  async function confirmDone(task: RangerTask) {
    setBusyId(task.id)
    try {
      // Completion is confirmed with the ranger's current field position.
      const pos = await new Promise<GeolocationPosition | null>((resolve) => {
        if (!('geolocation' in navigator)) return resolve(null)
        navigator.geolocation.getCurrentPosition(
          (p) => resolve(p),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 15000 },
        )
      })
      await completeTask(task.id, pos?.coords.latitude ?? null, pos?.coords.longitude ?? null)
      setTasks((ts) =>
        ts.map((t) =>
          t.id === task.id
            ? { ...t, status: 'done', completed_at: new Date().toISOString() }
            : t,
        ),
      )
    } finally {
      setBusyId(null)
    }
  }

  const pending = tasks.filter((t) => t.status === 'pending')
  const done = tasks.filter((t) => t.status === 'done')

  return (
    <div className="mx-auto max-w-lg space-y-3 p-4">
      <h1 className="text-lg font-bold">Zadaci</h1>

      {tasks.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">Nemate dodijeljenih zadataka.</p>
      )}

      {[...pending, ...done].map((task) => (
        <Card key={task.id}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              {task.status === 'done' ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
              ) : (
                <CircleDashed className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium">{task.title}</p>
                {task.description && (
                  <p className="mt-0.5 text-sm text-muted-foreground">{task.description}</p>
                )}
                <div className="mt-1.5 flex flex-wrap gap-2 text-xs">
                  {task.department && <Badge variant="secondary">{task.department}</Badge>}
                  {task.due_date && (
                    <Badge variant="outline">Rok: {formatDate(task.due_date)}</Badge>
                  )}
                  {task.status === 'done' && task.completed_at && (
                    <Badge variant="success">Izvršeno {formatDate(task.completed_at)}</Badge>
                  )}
                </div>
                {task.status === 'pending' && (
                  <Button
                    size="sm"
                    className="mt-2"
                    disabled={busyId === task.id}
                    onClick={() => void confirmDone(task)}
                  >
                    Potvrdi izvršenje na terenu
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
