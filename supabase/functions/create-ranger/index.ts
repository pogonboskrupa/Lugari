// Supabase Edge Function: poslovođa kreira nalog lugara (username + šifra).
// Deploy: supabase functions deploy create-ranger
//
// Koristi service_role ključ (auto-dostupan kao env var u Edge Functions
// runtimeu) da kreira auth korisnika sa sintetičkim emailom; profil u
// `profiles` tabeli pravi trigger `handle_new_user` (00002_user_management.sql)
// na osnovu user_metadata koji ova funkcija postavlja.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const USERNAME_DOMAIN = 'lugari.local'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Nedostaje autorizacija' }, 401)

  // Klijent u ime pozivatelja — koristi se samo da se sazna ko poziva.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user: caller },
  } = await callerClient.auth.getUser()
  if (!caller) return json({ error: 'Nevažeća sesija' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role, active')
    .eq('id', caller.id)
    .maybeSingle()

  if (!callerProfile || callerProfile.role !== 'foreman' || !callerProfile.active) {
    return json({ error: 'Samo aktivni poslovođa uzgoja može dodavati lugare' }, 403)
  }

  let body: { full_name?: string; username?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Neispravan zahtjev' }, 400)
  }

  const fullName = (body.full_name ?? '').trim()
  const username = (body.username ?? '').trim().toLowerCase()
  const password = body.password ?? ''

  if (!fullName || !username || password.length < 6) {
    return json(
      { error: 'Potrebno je ime, korisničko ime i šifra (min. 6 znakova)' },
      400,
    )
  }
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    return json(
      { error: 'Korisničko ime smije sadržati samo slova, brojeve, tačku, crtu i donju crtu' },
      400,
    )
  }

  const { data: existing } = await admin
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle()
  if (existing) return json({ error: 'Korisničko ime je već zauzeto' }, 409)

  const { data: created, error } = await admin.auth.admin.createUser({
    email: `${username}@${USERNAME_DOMAIN}`,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      role: 'ranger',
      username,
      supervisor_id: caller.id,
      active: 'true',
    },
  })

  if (error || !created.user) {
    return json({ error: error?.message ?? 'Kreiranje naloga nije uspjelo' }, 400)
  }

  return json({ id: created.user.id, username })
})
