import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, TreePine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { requireSupabase } from '@/lib/supabase'

/** Self-registration for poslovođa uzgoja — account stays inactive until an admin approves it. */
export function RegisterPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirmPassword) {
      setError('Šifre se ne poklapaju')
      return
    }
    if (password.length < 6) {
      setError('Šifra mora imati najmanje 6 znakova')
      return
    }
    setBusy(true)
    try {
      const supabase = requireSupabase()
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, role: 'foreman' } },
      })
      if (signUpError) throw signUpError
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registracija nije uspjela')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <TreePine className="h-9 w-9 text-primary" />
          </div>
          <h1 className="text-xl font-bold">Registracija poslovođe uzgoja</h1>
          <p className="text-sm text-muted-foreground">
            Nalog čeka odobrenje administratora prije prve prijave
          </p>
        </div>

        <Card>
          <CardContent className="pt-4">
            {done ? (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <CheckCircle2 className="h-12 w-12 text-success" />
                <p className="font-medium">Zahtjev je poslat</p>
                <p className="text-sm text-muted-foreground">
                  Vaš nalog čeka odobrenje administratora. Bit ćete u mogućnosti da se
                  prijavite čim nalog bude aktiviran.
                </p>
                <Link to="/login">
                  <Button variant="outline">Nazad na prijavu</Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="fullName">Ime i prezime</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>
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
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword">Potvrda lozinke</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" size="lg" disabled={busy}>
                  {busy ? 'Slanje…' : 'Registruj se'}
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  Već imate nalog?{' '}
                  <Link to="/login" className="font-medium text-primary underline">
                    Prijavite se
                  </Link>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
