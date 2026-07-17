import { useEffect, useState, type ReactNode } from 'react'
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet'
import L from 'leaflet'
import type { Layer } from 'leaflet'
import type { Feature } from 'geojson'
import { loadDepartments, type DepartmentCollection } from '@/services/geoService'
import { departmentLabel, type DepartmentProperties } from '@/types'

// Fix default marker icons under Vite bundling.
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'

L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl })

/** Center of the Una-Sana canton forests. */
const DEFAULT_CENTER: [number, number] = [44.72, 16.35]
const DEFAULT_ZOOM = 11

interface MapViewProps {
  children?: ReactNode
  center?: [number, number]
  zoom?: number
  showDepartments?: boolean
  className?: string
}

function styleDepartment(feature?: Feature) {
  const props = feature?.properties as DepartmentProperties | undefined
  if (props?.lager) {
    return { color: '#b45309', weight: 2, fillColor: '#f59e0b', fillOpacity: 0.25 }
  }
  return { color: '#166534', weight: 1.5, fillColor: '#22c55e', fillOpacity: 0.12 }
}

function onEachDepartment(feature: Feature, layer: Layer) {
  const props = feature.properties as DepartmentProperties
  const label = departmentLabel(props)
  layer.bindTooltip(props.odjel, {
    permanent: true,
    direction: 'center',
    className: 'department-label !bg-transparent !border-0 !shadow-none font-semibold text-xs',
  })
  layer.bindPopup(
    `<div style="min-width:170px">
      <strong>${label}</strong><br/>
      Šumarija: ${props.sumarija}<br/>
      Gospodarska jedinica: ${props.gospodarska_jedinica}<br/>
      Odjel: ${props.odjel}
      ${props.lager ? '<br/><em>Lager</em>' : ''}
    </div>`,
  )
}

export function MapView({
  children,
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  showDepartments = true,
  className,
}: MapViewProps) {
  const [departments, setDepartments] = useState<DepartmentCollection | null>(null)

  useEffect(() => {
    if (!showDepartments) return
    loadDepartments()
      .then(setDepartments)
      .catch(() => setDepartments(null))
  }, [showDepartments])

  return (
    <MapContainer center={center} zoom={zoom} className={className} zoomControl={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {departments && (
        <GeoJSON data={departments} style={styleDepartment} onEachFeature={onEachDepartment} />
      )}
      {children}
    </MapContainer>
  )
}
