import { formatDuration, formatKm, formatTime } from '@/lib/utils'
import type { WorkShift } from '@/types'

interface ReportRow {
  name: string
  start: string
  end: string
  km: string
  duration: string
  departments: string
}

function shiftToRow(shift: WorkShift): ReportRow {
  return {
    name: shift.ranger?.full_name ?? shift.ranger_id,
    start: formatTime(shift.started_at),
    end: formatTime(shift.ended_at),
    km: formatKm(shift.distance_m),
    duration: formatDuration(shift.duration_ms),
    departments: shift.departments_visited.join(', ') || '—',
  }
}

// jsPDF i XLSX se učitavaju lazy — ne ulaze u početni bundle.
export async function exportDailyReportPDF(date: string, shifts: WorkShift[]): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])
  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.text('SPD Unsko-sanske sume — Dnevni izvjestaj', 14, 18)
  doc.setFontSize(11)
  doc.text(`Datum: ${date}`, 14, 26)

  autoTable(doc, {
    startY: 32,
    head: [['Lugar', 'Pocetak', 'Kraj', 'Kilometri', 'Vrijeme rada', 'Odjeli']],
    body: shifts.map((s) => {
      const r = shiftToRow(s)
      return [r.name, r.start, r.end, r.km, r.duration, r.departments]
    }),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [20, 83, 45] },
  })

  doc.save(`dnevni-izvjestaj-${date}.pdf`)
}

export async function exportReportExcel(date: string, shifts: WorkShift[]): Promise<void> {
  const XLSX = await import('xlsx')
  const rows = shifts.map((s) => {
    const r = shiftToRow(s)
    return {
      Lugar: r.name,
      Datum: s.work_date,
      'Početak rada': r.start,
      'Kraj rada': r.end,
      Kilometri: Number((s.distance_m / 1000).toFixed(2)),
      'Vrijeme rada': r.duration,
      'Prosječna brzina (km/h)': s.avg_speed_kmh,
      'Maksimalna brzina (km/h)': s.max_speed_kmh,
      'Vrijeme u odjelima': formatDuration(s.time_in_departments_ms),
      'Vrijeme na lageru': formatDuration(s.time_at_landing_ms),
      'Vrijeme van šume': formatDuration(s.time_outside_ms),
      Odjeli: r.departments,
    }
  })

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Izvještaj')
  XLSX.writeFile(wb, `izvjestaj-${date}.xlsx`)
}
