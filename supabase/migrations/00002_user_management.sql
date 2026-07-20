-- Upravljanje korisnicima: samoregistracija poslovođe + kreiranje lugara
-- Nadograđuje 00001_schema.sql — pokrenuti nakon njega.

-- ── 1. Spajanje uloga 'foreman' i 'silviculture_foreman' ────────────────────
-- Poslovođa uzgoja je sada jedna uloga: prati GPS svojih lugara i prima
-- njihove prijave/fotografije/izvještaje. Više nema odvojene org-wide uloge.

update profiles set role = 'foreman' where role = 'silviculture_foreman';

alter table profiles drop constraint profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('admin', 'foreman', 'ranger'));

-- ── 2. Nove kolone: username (lugar) i supervisor_id (izvor istine za vezu poslovođa↔lugar) ──

alter table profiles add column username text unique;
alter table profiles add column supervisor_id uuid references profiles(id) on delete set null;

-- ── 3. Automatsko kreiranje profila pri kreiranju auth korisnika ────────────
-- Radi i za samoregistraciju poslovođe (auth.signUp) i za kreiranje lugara
-- (auth.admin.createUser iz Edge funkcije) — oba postavljaju odgovarajuće
-- raw_user_meta_data, trigger napravi profil bez potrebe za RLS insert politikom.

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role, username, supervisor_id, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'ranger'),
    new.raw_user_meta_data->>'username',
    nullif(new.raw_user_meta_data->>'supervisor_id', '')::uuid,
    coalesce((new.raw_user_meta_data->>'active')::boolean, false)
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Napomena: u Supabase Auth postavkama preporučeno je isključiti "Confirm
-- email" — aplikacija već ima vlastiti gate (profiles.active) za odobrenje
-- poslovođe, pa dodatna email potvrda samo komplikuje tok bez sigurnosne koristi.

-- ── 4. RPC za prijavu korisničkim imenom (lugar nema email) ─────────────────
-- Ne otkriva ništa osjetljivo: vraća samo izračunati sintetički email ili null.

create or replace function resolve_login_email(p_identifier text) returns text
language sql stable security definer set search_path = public as $$
  select case
    when p_identifier ilike '%@%' then p_identifier
    else (
      select lower(username) || '@lugari.local'
      from profiles
      where lower(username) = lower(p_identifier) and role = 'ranger'
    )
  end
$$;

grant execute on function resolve_login_email(text) to anon, authenticated;

-- ── 5. RLS: prelazak sa work_unit_id na supervisor_id ────────────────────────

drop policy profiles_foreman on profiles;
create policy profiles_foreman on profiles for select to authenticated
  using (auth_role() = 'foreman' and supervisor_id = auth.uid());

drop policy shifts_foreman on work_shifts;
create policy shifts_foreman on work_shifts for select to authenticated
  using (
    auth_role() = 'foreman'
    and ranger_id in (select id from profiles where supervisor_id = auth.uid())
  );

drop policy logbook_foreman on logbook_entries;
create policy logbook_foreman on logbook_entries for select to authenticated
  using (
    auth_role() = 'foreman'
    and ranger_id in (select id from profiles where supervisor_id = auth.uid())
  );

-- Uzgojni poslovođa više nema org-wide vidljivost prijava/fotografija —
-- svaki poslovođa vidi samo svoje lugare, isto kao GPS tragove.
drop policy incidents_silviculture on incidents;
drop policy incidents_foreman on incidents;
create policy incidents_foreman on incidents for select to authenticated
  using (
    auth_role() = 'foreman'
    and ranger_id in (select id from profiles where supervisor_id = auth.uid())
  );

drop policy photos_silviculture on field_photos;
drop policy photos_foreman on field_photos;
create policy photos_foreman on field_photos for select to authenticated
  using (
    auth_role() = 'foreman'
    and ranger_id in (select id from profiles where supervisor_id = auth.uid())
  );

-- Poslovođa može ažurirati samo ime i aktivan status svojih lugara — kroz
-- RPC, ne kroz blanket UPDATE politiku (da ne može mijenjati ulogu ili
-- nadzornika lugara, ili dirati tuđe lugare).
create or replace function foreman_update_ranger(
  p_ranger_id uuid, p_full_name text, p_active boolean
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update profiles set full_name = p_full_name, active = p_active
  where id = p_ranger_id and supervisor_id = auth.uid() and role = 'ranger';
end $$;

grant execute on function foreman_update_ranger(uuid, text, boolean) to authenticated;

-- ── 6. Trigeri za obavijesti: koristiti supervisor_id direktno ───────────────

create or replace function notify_foreman_shift_end() returns trigger
language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  if new.status = 'finished' then
    select supervisor_id into fid from profiles where id = new.ranger_id;
    if fid is not null then
      insert into notifications (recipient_id, type, title, body, ref_id)
      values (fid, 'shift_end', 'Završen radni dan',
              (select full_name from profiles where id = new.ranger_id) ||
              ' je završio radni dan (' || round(new.distance_m / 1000.0, 1) || ' km).',
              new.id);
    end if;
  end if;
  return new;
end $$;

drop function if exists notify_silviculture_incident() cascade;
create or replace function notify_foreman_incident() returns trigger
language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  select supervisor_id into fid from profiles where id = new.ranger_id;
  if fid is not null then
    insert into notifications (recipient_id, type, title, body, ref_id)
    values (fid, 'incident', 'Nova prijava',
            (select full_name from profiles where id = new.ranger_id) || ': ' || new.type,
            new.id);
  end if;
  return new;
end $$;

create trigger incidents_notify after insert on incidents
  for each row execute function notify_foreman_incident();

drop function if exists notify_silviculture_photo() cascade;
create or replace function notify_foreman_photo() returns trigger
language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  select supervisor_id into fid from profiles where id = new.ranger_id;
  if fid is not null then
    insert into notifications (recipient_id, type, title, body, ref_id)
    values (fid, 'photo', 'Nova fotografija',
            (select full_name from profiles where id = new.ranger_id) ||
            coalesce(' · ' || new.department, ''),
            new.id);
  end if;
  return new;
end $$;

create trigger field_photos_notify after insert on field_photos
  for each row execute function notify_foreman_photo();
