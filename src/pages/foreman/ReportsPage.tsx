import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileDown, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getForestries, getShiftsInRange, getWorkUnits } from '@/services/dataService'
import { exportDailyReportPDF, exportReportExcel } from '@/services/reportService'
import { formatDuration, formatKm, formatTime, todayISO } from '@/lib/utils'
import type { Forestry, WorkShift, WorkUnit } from '@/types'

/** Reports & movement history with date / forestry / work-unit filters and PDF/Excel export. */
export function ReportsPage() {
  const navigate = useNavigate()
  const [from, setFrom] = useState(todayISO())
  const [to, setTo] = useState(todayISO())
  const [shifts, setShifts] = useState<WorkShift[]>([])
  const [forestries, setForestries] = useState<Forestry[]>([])
  const [workUnits, setWorkUnits] = useState<WorkUnit[]>([])
  const [forestryId, setForestryId] = useState('')
  const [workUnitId, setWorkUnitId] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    void getForestries().then(setForestries)
    void getWorkUnits().then(setWorkUnits)
  }, [])

  useEffect(() => {
    void getShiftsInRange(from, to).then(setShifts)
  }, [from, to])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return shifts.filter((s) => {
      if (workUnitId && s.ranger?.work_unit_id !== workUnitId) return false
      if (forestryId) {
        const unit = workUnits.find((w) => w.id === s.ranger?.work_unit_id)
        if (unit?.forestry_id !== forestryId) return false
      }
      if (q) {
        const name = (s.ranger?.full_name ?? '').toLowerCase()
        const deps = s.departments_visited.join(' ').toLowerCase()
        if (!name.includes(q) && !deps.includes(q)) return false
      }
      return true
    })
  }, [shifts, search, forestryId, workUnitId, workUnits])

  const unitsForForestry = forestryId
    ? workUnits.filter((w) => w.forestry_id === forestryId)
    : workUnits

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold">Izvještaji i istorija kretanja</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void exportDailyReportPDF(`${from}_${to}`, filtered)}
          >
            <FileDown className="h-4 w-4" /> PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void exportReportExcel(`${from}_${to}`, filtered)}
          >
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <Select
          value={forestryId}
          onChange={(e) => {
            setForestryId(e.target.value)
            setWorkUnitId('')
          }}
        >
          <option value="">Sve šumarije</option>
          {forestries.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </Select>
        <Select value={workUnitId} onChange={(e) => setWorkUnitId(e.target.value)}>
          <option value="">Sve radne jedinice</option>
          {unitsForForestry.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>
        <Input
          placeholder="Lugar ili odjel…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Datum</TableHead>
            <TableHead>Lugar</TableHead>
            <TableHead>Početak</TableHead>
            <TableHead>Kraj</TableHead>
            <TableHead>Kilometri</TableHead>
            <TableHead>Vrijeme rada</TableHead>
            <TableHead>Odjeli</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                Nema podataka za odabrane filtere.
              </TableCell>
            </TableRow>
          )}
          {filtered.map((shift) => (
            <TableRow
              key={shift.id}
              className="cursor-pointer"
              onClick={() => navigate(`/lugar/${shift.ranger_id}?datum=${shift.work_date}`)}
            >
              <TableCell>{shift.work_date}</TableCell>
              <TableCell className="font-medium">
                {shift.ranger?.full_name ?? shift.ranger_id}
              </TableCell>
              <TableCell>{formatTime(shift.started_at)}</TableCell>
              <TableCell>{formatTime(shift.ended_at)}</TableCell>
              <TableCell className="tabular-nums">{formatKm(shift.distance_m)}</TableCell>
              <TableCell className="tabular-nums">{formatDuration(shift.duration_ms)}</TableCell>
              <TableCell className="max-w-[240px] truncate">
                {shift.departments_visited.join(', ') || '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
