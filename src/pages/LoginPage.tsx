import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { TreePine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'
import type { UserRole } from '@/types'

export function LoginPage() {
  const { signIn, signInDemo } = useAuthStore()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email, password)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Greška pri prijavi')
    } finally {
      setBusy(false)
    }
  }

  async function demo(role: UserRole) {
    await signInDemo(role)
    navigate('/')
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <TreePine className="h-9 w-9 text-primary" />
          </div>
          <h1 className="text-xl font-bold">ŠPD Unsko-sanske šume</h1>
          <p className="text-sm text-muted-foreground">Sistem za praćenje rada lugara</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Prijava</CardTitle>
            <CardDescription>Prijavite se svojim službenim nalogom</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Lozinka</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" size="lg" disabled={busy || !supabase}>
                {busy ? 'Prijava…' : 'Prijavi se'}
              </Button>
              {!supabase && (
                <p className="text-center text-xs text-muted-foreground">
                  Supabase nije konfigurisan — koristite demo pristup ispod.
                </p>
              )}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Demo pristup</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => void demo('ranger')}>
              Lugar
            </Button>
            <Button variant="outline" onClick={() => void demo('foreman')}>
              Poslovođa
            </Button>
            <Button variant="outline" onClick={() => void demo('silviculture_foreman')}>
              Uzgojni posl.
            </Button>
            <Button variant="outline" onClick={() => void demo('admin')}>
              Administrator
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
