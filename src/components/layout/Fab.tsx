import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Camera, Plus, Siren, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Floating Action Button with quick actions for the ranger. */
export function Fab() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  const actions = [
    { label: 'Nova fotografija', icon: Camera, to: '/foto?novo=1' },
    { label: 'Nova prijava', icon: Siren, to: '/prijave?novo=1' },
    { label: 'Službena knjiga', icon: BookOpen, to: '/knjiga?novo=1' },
  ]

  return (
    <div className="pointer-events-none absolute bottom-5 right-4 z-[1000] flex flex-col items-end gap-2">
      {open &&
        actions.map((action) => (
          <button
            key={action.to}
            onClick={() => {
              setOpen(false)
              navigate(action.to)
            }}
            className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-card py-2 pl-3 pr-4 text-sm font-medium shadow-lg"
          >
            <action.icon className="h-4 w-4 text-primary" />
            {action.label}
          </button>
        ))}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Brze akcije"
        className={cn(
          'pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition-transform',
          open && 'rotate-45',
        )}
      >
        {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
      </button>
    </div>
  )
}
