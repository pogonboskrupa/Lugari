import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, CheckCircle2, Clock, Route, UserPlus, Users } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAuthStore } from '@/store/authStore'
import { createRanger, getRangersForSupervisor, getShiftsForDate } from '@/services/dataService'
import { computeDashboardStats } from '@/services/analyticsService'
import { loadDepartments, classifyLocation } from '@/services/geoService'
import { formatDuration, formatKm, formatTime, todayISO } from '@/lib/utils'
import type { Profile, WorkShift } from '@/types'

export function ForemanDashboard() {
  const { profile } = useAuthStore()
  const navigate = useNavigate()
  const [rangers, setRangers] = useState<Profile[]>([])
  const [shifts, setShifts] = useState<WorkShift[]>([])
  const [locations, setLocations] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [date, setDate] = useState(todayISO())

  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const reloadRangers = useCallback(() => {
    if (profile) void getRangersForSupervisor(profile.id).then(setRangers)
  }, [profile])

  useEffect(reloadRangers, [reloadRangers])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const all = await getShiftsForDate(date)
      // Poslovođa vidi samo svoje lugare — RLS to i sam garantuje na serveru.
      if (!cancelled) setShifts(all)
    }
    void load()
    const interval = setInterval(load, 30_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [date])

  // Resolve current department for active rangers.
  useEffect(() => {
    let cancelled = false
    void loadDepartments()
      .then((deps) => {
        if (cancelled) return
        const next: Record<string, string> = {}
        for (const shift of shifts) {
          const last = shift.points[shift.points.length - 1]
          if (!last) continue
          const status = classifyLocation(last.lat, last.lng, deps)
          next[shift.id] =
            status.kind === 'department'
              ? status.label
              : status.kind === 'landing'
                ? `Lager (${status.label})`
                : 'Van odjela'
        }
        setLocations(next)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [shifts])

  const rangerCount = rangers.length || new Set(shifts.map((s) => s.ranger_id)).size
  const stats = useMemo(() => computeDashboardStats(rangerCount, shifts), [rangerCount, shifts])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return shifts
    return shifts.filter((s) => {
      const name = (s.ranger?.full_name ?? '').toLowerCase()
      const deps = s.departments_visited.join(' ').toLowerCase()
      return name.includes(q) || deps.includes(q)
    })
  }, [shifts, search])

  async function handleAddRanger(e: FormEvent) {
    e.preventDefault()
    setAddBusy(true)
    setAddError(null)
    try {
      await createRanger({ full_name: newName, username: newUsername, password: newPassword })
      setNewName('')
      setNewUsername('')
      setNewPassword('')
      setAddOpen(false)
      reloadRangers()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Kreiranje naloga nije uspjelo')
    } finally {
      setAddBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold">Pregled lugara</h1>
        <div className="flex gap-2">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-auto"
          />
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <UserPlus className="h-4 w-4" /> Dodaj lugara
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard icon={Users} label="Ukupno lugara danas" value={String(stats.totalRangers)} />
        <StatCard
          icon={Activity}
          label="Aktivni lugari"
          value={String(stats.activeRangers)}
          accent="text-success"
        />
        <StatCard icon={CheckCircle2} label="Završili smjenu" value={String(stats.finishedRangers)} />
        <StatCard icon={Route} label="Ukupno kilometara" value={`${stats.totalKm.toFixed(1)} km`} />
        <StatCard icon={Clock} label="Prosječno vrijeme rada" value={formatDuration(stats.avgDurationMs)} />
      </div>

      <Input
        placeholder="Pretraga po lugaru ili odjelu…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Lugar</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Početak</TableHead>
            <TableHead>Trenutna lokacija / Odjel</TableHead>
            <TableHead>Kilometri</TableHead>
            <TableHead>Trajanje</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                Nema podataka za odabrani datum.
              </TableCell>
            </TableRow>
          )}
          {filtered.map((shift) => (
            <TableRow
              key={shift.id}
              className="cursor-pointer"
              onClick={() => navigate(`/lugar/${shift.ranger_id}?datum=${shift.work_date}`)}
            >
              <TableCell className="font-medium">
                {shift.ranger?.full_name ?? shift.ranger_id}
              </TableCell>
              <TableCell>
                {shift.status === 'active' ? (
                  <Badge variant="success">Aktivan</Badge>
                ) : (
                  <Badge variant="secondary">Završio</Badge>
                )}
              </TableCell>
              <TableCell>{formatTime(shift.started_at)}</TableCell>
              <TableCell className="max-w-[220px] truncate">
                {locations[shift.id] ?? shift.departments_visited.join(', ') ?? '—'}
              </TableCell>
              <TableCell className="tabular-nums">{formatKm(shift.distance_m)}</TableCell>
              <TableCell className="tabular-nums">
                {formatDuration(
                  shift.status === 'active'
                    ? Date.now() - new Date(shift.started_at).getTime()
                    : shift.duration_ms,
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="Dodaj lugara">
        <form onSubmit={handleAddRanger} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="rname">Ime i prezime</Label>
            <Input id="rname" value={newName} onChange={(e) => setNewName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rusername">Korisničko ime</Label>
            <Input
              id="rusername"
              placeholder="npr. pero.peric"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rpassword">Početna šifra</Label>
            <Input
              id="rpassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
            />
            <p className="text-xs text-muted-foreground">
              Lugar se prijavljuje korisničkim imenom i može kasnije promijeniti šifru.
            </p>
          </div>
          {addError && <p className="text-sm text-destructive">{addError}</p>}
          <Button type="submit" className="w-full" size="lg" disabled={addBusy}>
            {addBusy ? 'Kreiranje…' : 'Kreiraj nalog'}
          </Button>
        </form>
      </Dialog>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Users
  label: string
  value: string
  accent?: string
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <Icon className={`mb-2 h-5 w-5 ${accent ?? 'text-primary'}`} />
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  )
}
