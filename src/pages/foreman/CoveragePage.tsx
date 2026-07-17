import { useEffect, useMemo, useState } from 'react'
import { TreePine } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getShiftsInRange } from '@/services/dataService'
import { computeCoverage } from '@/services/analyticsService'
import { loadDepartments } from '@/services/geoService'
import { departmentLabel } from '@/types'
import { formatDate, todayISO } from '@/lib/utils'
import type { WorkShift } from '@/types'

/** Shows which departments have not been visited for N days. */
export function CoveragePage() {
  const [days, setDays] = useState(7)
  const [allDepartments, setAllDepartments] = useState<string[]>([])
  const [shifts, setShifts] = useState<WorkShift[]>([])

  useEffect(() => {
    void loadDepartments()
      .then((deps) =>
        setAllDepartments(
          deps.features.filter((f) => !f.properties.lager).map((f) => departmentLabel(f.properties)),
        ),
      )
      .catch(() => setAllDepartments([]))
  }, [])

  useEffect(() => {
    // Look back 90 days for last-visit information.
    const from = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)
    void getShiftsInRange(from, todayISO()).then(setShifts)
  }, [])

  const coverage = useMemo(
    () => computeCoverage(allDepartments, shifts, days),
    [allDepartments, shifts, days],
  )

  const visitedCount = allDepartments.length - coverage.length

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold">Pokrivenost odjela</h1>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Nisu obiđeni</span>
          <Input
            type="number"
            min={1}
            value={days}
            onChange={(e) => setDays(Math.max(1, Number(e.target.value)))}
            className="w-20"
          />
          <span className="text-muted-foreground">dana</span>
        </div>
      </div>

      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <TreePine className="h-8 w-8 text-primary" />
          <div>
            <p className="text-2xl font-bold tabular-nums">
              {visitedCount} / {allDepartments.length}
            </p>
            <p className="text-xs text-muted-foreground">
              odjela obiđeno u posljednjih {days} dana
            </p>
          </div>
        </CardContent>
      </Card>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Odjel</TableHead>
            <TableHead>Zadnji obilazak</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {coverage.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                Svi odjeli su obiđeni u zadanom periodu. 🎉
              </TableCell>
            </TableRow>
          )}
          {coverage.map((c) => (
            <TableRow key={c.department}>
              <TableCell className="font-medium">{c.department}</TableCell>
              <TableCell>{c.lastVisit ? formatDate(c.lastVisit) : 'Nikada'}</TableCell>
              <TableCell>
                {c.daysAgo === null ? (
                  <Badge variant="destructive">Bez obilaska</Badge>
                ) : (
                  <Badge variant="warning">prije {c.daysAgo} dana</Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
