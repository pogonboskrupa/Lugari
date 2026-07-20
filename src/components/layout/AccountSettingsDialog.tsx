import { useState, type FormEvent } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { changePassword } from '@/services/accountService'

interface AccountSettingsDialogProps {
  open: boolean
  onClose: () => void
}

export function AccountSettingsDialog({ open, onClose }: AccountSettingsDialogProps) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [busy, setBusy] = useState(false)

  function reset() {
    setCurrent('')
    setNext('')
    setConfirm('')
    setError(null)
    setSuccess(false)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (next.length < 6) {
      setError('Nova šifra mora imati najmanje 6 znakova')
      return
    }
    if (next !== confirm) {
      setError('Nova šifra i potvrda se ne poklapaju')
      return
    }
    setBusy(true)
    try {
      await changePassword(current, next)
      setSuccess(true)
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Promjena šifre nije uspjela')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset()
        onClose()
      }}
      title="Postavke naloga"
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <p className="text-sm font-medium">Promjena šifre</p>
        <div className="space-y-1.5">
          <Label htmlFor="current">Trenutna šifra</Label>
          <Input
            id="current"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="next">Nova šifra</Label>
          <Input
            id="next"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Potvrda nove šifre</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {success && <p className="text-sm text-success">Šifra je uspješno promijenjena.</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Čuvanje…' : 'Sačuvaj novu šifru'}
        </Button>
      </form>
    </Dialog>
  )
}
