import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Building2, Landmark, Plus, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { roleLabel } from '@/components/layout/AppShell'
import {
  createForestry,
  createWorkUnit,
  getForestries,
  getProfiles,
  getWorkUnits,
  updateProfile,
} from '@/services/dataService'
import type { Forestry, Profile, WorkUnit } from '@/types'

/**
 * Admin console: forestries, work units and users.
 * New users are created through Supabase Auth (invite) — here the admin
 * manages their role, work-unit assignment and active state.
 */
export function AdminPage() {
  const [forestries, setForestries] = useState<Forestry[]>([])
  const [workUnits, setWorkUnits] = useState<WorkUnit[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])

  const [forestryDialog, setForestryDialog] = useState(false)
  const [unitDialog, setUnitDialog] = useState(false)
  const [editUser, setEditUser] = useState<Profile | null>(null)

  const [newForestryName, setNewForestryName] = useState('')
  const [newUnitName, setNewUnitName] = useState('')
  const [newUnitForestry, setNewUnitForestry] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => {
    void getForestries().then(setForestries)
    void getWorkUnits().then(setWorkUnits)
    void getProfiles().then(setProfiles)
  }, [])

  useEffect(reload, [reload])

  async function submitForestry(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await createForestry(newForestryName)
      setNewForestryName('')
      setForestryDialog(false)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Greška')
    } finally {
      setBusy(false)
    }
  }

  async function submitUnit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await createWorkUnit(newUnitForestry, newUnitName)
      setNewUnitName('')
      setUnitDialog(false)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Greška')
    } finally {
      setBusy(false)
    }
  }

  async function submitUser(e: FormEvent) {
    e.preventDefault()
    if (!editUser) return
    setBusy(true)
    setError(null)
    try {
      await updateProfile(editUser.id, {
        full_name: editUser.full_name,
        role: editUser.role,
        work_unit_id: editUser.work_unit_id,
        forestry_id: editUser.forestry_id,
        phone: editUser.phone,
        active: editUser.active,
      })
      setEditUser(null)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Greška')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <h1 className="text-lg font-bold">Administracija</h1>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Landmark className="h-4 w-4 text-primary" /> Šumarije
            </CardTitle>
            <Button size="sm" onClick={() => setForestryDialog(true)}>
              <Plus className="h-4 w-4" /> Dodaj
            </Button>
          </CardHeader>
          <CardContent>
            {forestries.length === 0 && (
              <p className="text-sm text-muted-foreground">Nema šumarija.</p>
            )}
            <ul className="space-y-1 text-sm">
              {forestries.map((f) => (
                <li key={f.id} className="rounded-lg bg-muted px-3 py-2">
                  {f.name}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 text-primary" /> Radne jedinice
            </CardTitle>
            <Button size="sm" onClick={() => setUnitDialog(true)}>
              <Plus className="h-4 w-4" /> Dodaj
            </Button>
          </CardHeader>
          <CardContent>
            {workUnits.length === 0 && (
              <p className="text-sm text-muted-foreground">Nema radnih jedinica.</p>
            )}
            <ul className="space-y-1 text-sm">
              {workUnits.map((w) => (
                <li key={w.id} className="flex justify-between rounded-lg bg-muted px-3 py-2">
                  <span>{w.name}</span>
                  <span className="text-muted-foreground">{w.forestry?.name}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" /> Korisnici
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ime</TableHead>
                <TableHead>Uloga</TableHead>
                <TableHead>Radna jedinica</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                    Nema korisnika. Novi korisnici se pozivaju putem Supabase Auth.
                  </TableCell>
                </TableRow>
              )}
              {profiles.map((p) => (
                <TableRow key={p.id} className="cursor-pointer" onClick={() => setEditUser({ ...p })}>
                  <TableCell className="font-medium">{p.full_name}</TableCell>
                  <TableCell>{roleLabel(p.role)}</TableCell>
                  <TableCell>{p.work_unit?.name ?? '—'}</TableCell>
                  <TableCell>
                    {p.active ? (
                      <Badge variant="success">Aktivan</Badge>
                    ) : (
                      <Badge variant="secondary">Deaktiviran</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={forestryDialog} onClose={() => setForestryDialog(false)} title="Nova šumarija">
        <form onSubmit={submitForestry} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="fname">Naziv šumarije</Label>
            <Input
              id="fname"
              placeholder="npr. Šumarija Bosanska Krupa"
              value={newForestryName}
              onChange={(e) => setNewForestryName(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            Sačuvaj
          </Button>
        </form>
      </Dialog>

      <Dialog open={unitDialog} onClose={() => setUnitDialog(false)} title="Nova radna jedinica">
        <form onSubmit={submitUnit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="uforestry">Šumarija</Label>
            <Select
              id="uforestry"
              value={newUnitForestry}
              onChange={(e) => setNewUnitForestry(e.target.value)}
              required
            >
              <option value="">Odaberi šumariju…</option>
              {forestries.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="uname">Naziv radne jedinice</Label>
            <Input
              id="uname"
              placeholder="npr. RJ Grmeč"
              value={newUnitName}
              onChange={(e) => setNewUnitName(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            Sačuvaj
          </Button>
        </form>
      </Dialog>

      <Dialog open={!!editUser} onClose={() => setEditUser(null)} title="Uredi korisnika">
        {editUser && (
          <form onSubmit={submitUser} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ename">Ime i prezime</Label>
              <Input
                id="ename"
                value={editUser.full_name}
                onChange={(e) => setEditUser({ ...editUser, full_name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="erole">Uloga</Label>
              <Select
                id="erole"
                value={editUser.role}
                onChange={(e) =>
                  setEditUser({ ...editUser, role: e.target.value as Profile['role'] })
                }
              >
                <option value="ranger">Lugar</option>
                <option value="foreman">Poslovođa</option>
                <option value="silviculture_foreman">Uzgojni poslovođa</option>
                <option value="admin">Administrator</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eunit">Radna jedinica</Label>
              <Select
                id="eunit"
                value={editUser.work_unit_id ?? ''}
                onChange={(e) =>
                  setEditUser({ ...editUser, work_unit_id: e.target.value || null })
                }
              >
                <option value="">Bez radne jedinice</option>
                {workUnits.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.forestry?.name})
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ephone">Telefon</Label>
              <Input
                id="ephone"
                value={editUser.phone ?? ''}
                onChange={(e) => setEditUser({ ...editUser, phone: e.target.value || null })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editUser.active}
                onChange={(e) => setEditUser({ ...editUser, active: e.target.checked })}
                className="accent-[var(--primary)]"
              />
              Aktivan nalog
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              Sačuvaj izmjene
            </Button>
          </form>
        )}
      </Dialog>
    </div>
  )
}
