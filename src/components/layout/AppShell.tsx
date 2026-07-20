import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  BookOpen,
  Camera,
  CloudOff,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Map as MapIcon,
  Moon,
  RefreshCw,
  Settings,
  Siren,
  Sun,
  TreePine,
  Users,
} from 'lucide-react'
import { AccountSettingsDialog } from './AccountSettingsDialog'
import { useAuthStore } from '@/store/authStore'
import { useOnline } from '@/hooks/useOnline'
import { useTheme } from '@/hooks/useTheme'
import { onSyncStateChange, pendingCount } from '@/services/syncService'
import { subscribeToNotifications } from '@/services/notificationService'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

interface NavItem {
  to: string
  label: string
  icon: typeof MapIcon
}

function navForRole(role: string): NavItem[] {
  switch (role) {
    case 'ranger':
      return [
        { to: '/', label: 'Radni dan', icon: MapIcon },
        { to: '/knjiga', label: 'Knjiga', icon: BookOpen },
        { to: '/prijave', label: 'Prijave', icon: Siren },
        { to: '/foto', label: 'Foto', icon: Camera },
        { to: '/zadaci', label: 'Zadaci', icon: ListChecks },
      ]
    case 'foreman':
      return [
        { to: '/', label: 'Pregled', icon: LayoutDashboard },
        { to: '/karta', label: 'Karta', icon: MapIcon },
        { to: '/prijave', label: 'Prijave', icon: Siren },
        { to: '/izvjestaji', label: 'Izvještaji', icon: BookOpen },
        { to: '/zadaci', label: 'Zadaci', icon: ListChecks },
      ]
    case 'admin':
      return [
        { to: '/', label: 'Organizacija', icon: Users },
        { to: '/karta', label: 'Karta', icon: MapIcon },
        { to: '/izvjestaji', label: 'Izvještaji', icon: BookOpen },
      ]
    default:
      return []
  }
}

export function AppShell() {
  const { profile, signOut } = useAuthStore()
  const online = useOnline()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  const [pending, setPending] = useState(0)
  const [toast, setToast] = useState<{ title: string; body: string } | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    void pendingCount().then(setPending)
    return onSyncStateChange(setPending)
  }, [])

  useEffect(() => {
    if (!profile) return
    return subscribeToNotifications(profile.id, (title, body) => {
      setToast({ title, body })
      setTimeout(() => setToast(null), 6000)
    })
  }, [profile])

  if (!profile) return null
  const items = navForRole(profile.role)

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-2.5">
        <TreePine className="h-6 w-6 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">{profile.full_name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {roleLabel(profile.role)}
            {profile.work_unit?.name ? ` · ${profile.work_unit.name}` : ''}
          </p>
        </div>
        {!online && (
          <Badge variant="warning" className="gap-1">
            <CloudOff className="h-3 w-3" /> Offline
          </Badge>
        )}
        {pending > 0 && (
          <Badge variant="secondary" className="gap-1">
            <RefreshCw className="h-3 w-3" /> {pending}
          </Badge>
        )}
        <button
          onClick={() => setSettingsOpen(true)}
          className="rounded-full p-2 text-muted-foreground hover:bg-accent"
          aria-label="Postavke naloga"
        >
          <Settings className="h-5 w-5" />
        </button>
        <button
          onClick={toggle}
          className="rounded-full p-2 text-muted-foreground hover:bg-accent"
          aria-label="Promijeni temu"
        >
          {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
        <button
          onClick={() => {
            void signOut().then(() => navigate('/login'))
          }}
          className="rounded-full p-2 text-muted-foreground hover:bg-accent"
          aria-label="Odjava"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </header>

      <main className="relative flex-1 overflow-y-auto">
        <Outlet />
        {toast && (
          <div className="fixed left-1/2 top-16 z-[1300] w-[92%] max-w-sm -translate-x-1/2 rounded-xl border border-border bg-card p-3 shadow-xl">
            <p className="text-sm font-semibold">{toast.title}</p>
            <p className="text-xs text-muted-foreground">{toast.body}</p>
          </div>
        )}
      </main>

      <AccountSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <nav className="border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-lg items-stretch justify-around">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

export function roleLabel(role: string): string {
  switch (role) {
    case 'admin':
      return 'Administrator'
    case 'foreman':
      return 'Poslovođa uzgoja'
    case 'ranger':
      return 'Lugar'
    default:
      return role
  }
}
