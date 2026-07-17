-- ŠPD Unsko-sanske šume — Lugari
-- Kompletna shema baze sa Row Level Security politikama.
-- Pokrenuti u Supabase SQL editoru ili preko `supabase db push`.

-- ── Organizacija ─────────────────────────────────────────────────────────────

create table forestries (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table work_units (
  id uuid primary key default gen_random_uuid(),
  forestry_id uuid not null references forestries(id) on delete cascade,
  name text not null,
  foreman_id uuid,
  created_at timestamptz not null default now(),
  unique (forestry_id, name)
);

-- ── Korisnici ────────────────────────────────────────────────────────────────
-- Profili su vezani na Supabase Auth korisnike (id = auth.users.id).

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('admin', 'foreman', 'silviculture_foreman', 'ranger')),
  work_unit_id uuid references work_units(id) on delete set null,
  forestry_id uuid references forestries(id) on delete set null,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table work_units
  add constraint work_units_foreman_fk
  foreign key (foreman_id) references profiles(id) on delete set null;

-- Pomoćne funkcije za RLS (security definer da se izbjegne rekurzija na profiles).
create or replace function auth_role() returns text
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function auth_work_unit() returns uuid
language sql stable security definer set search_path = public as $$
  select work_unit_id from profiles where id = auth.uid()
$$;

-- ── Radni dani (GPS tragovi) ─────────────────────────────────────────────────

create table work_shifts (
  id uuid primary key,
  ranger_id uuid not null references profiles(id) on delete cascade,
  work_date date not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  status text not null default 'active' check (status in ('active', 'finished')),
  distance_m integer not null default 0,
  duration_ms bigint not null default 0,
  avg_speed_kmh numeric(6,2) not null default 0,
  max_speed_kmh numeric(6,2) not null default 0,
  points jsonb not null default '[]'::jsonb,
  departments_visited text[] not null default '{}',
  time_in_departments_ms bigint not null default 0,
  time_at_landing_ms bigint not null default 0,
  time_outside_ms bigint not null default 0,
  created_at timestamptz not null default now(),
  unique (ranger_id, work_date)
);

create index work_shifts_date_idx on work_shifts (work_date);
create index work_shifts_ranger_idx on work_shifts (ranger_id, work_date desc);

-- ── Službena knjiga ──────────────────────────────────────────────────────────

create table logbook_entries (
  id uuid primary key,
  ranger_id uuid not null references profiles(id) on delete cascade,
  entry_date date not null,
  entry_time text not null,
  department text not null default '',
  activity text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

create index logbook_ranger_idx on logbook_entries (ranger_id, entry_date desc);

-- ── Prijave ──────────────────────────────────────────────────────────────────

create table incidents (
  id uuid primary key,
  ranger_id uuid not null references profiles(id) on delete cascade,
  type text not null,
  description text not null,
  lat double precision,
  lng double precision,
  department text,
  tree_count integer,
  wood_volume_m3 numeric(10,2),
  wood_species text,
  note text,
  photo_urls text[] not null default '{}',
  video_url text,
  audio_url text,
  created_at timestamptz not null default now()
);

create index incidents_created_idx on incidents (created_at desc);

-- ── Fotografije ──────────────────────────────────────────────────────────────

create table field_photos (
  id uuid primary key,
  ranger_id uuid not null references profiles(id) on delete cascade,
  url text not null,
  lat double precision,
  lng double precision,
  department text,
  taken_at timestamptz not null,
  incident_id uuid references incidents(id) on delete set null,
  created_at timestamptz not null default now()
);

create index field_photos_taken_idx on field_photos (taken_at desc);

-- ── Zadaci ───────────────────────────────────────────────────────────────────

create table ranger_tasks (
  id uuid primary key default gen_random_uuid(),
  foreman_id uuid not null references profiles(id) on delete cascade,
  ranger_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  description text,
  department text,
  due_date date,
  status text not null default 'pending' check (status in ('pending', 'done')),
  completed_at timestamptz,
  completed_lat double precision,
  completed_lng double precision,
  created_at timestamptz not null default now()
);

-- ── Obavijesti ───────────────────────────────────────────────────────────────

create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in ('incident', 'photo', 'shift_end', 'alert')),
  title text not null,
  body text not null,
  read boolean not null default false,
  ref_id uuid,
  created_at timestamptz not null default now()
);

create index notifications_recipient_idx on notifications (recipient_id, created_at desc);

-- Automatske obavijesti uzgojnim poslovođama za nove prijave i fotografije.
create or replace function notify_silviculture_incident() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from profiles where role = 'silviculture_foreman' and active loop
    insert into notifications (recipient_id, type, title, body, ref_id)
    values (r.id, 'incident', 'Nova prijava',
            (select full_name from profiles where id = new.ranger_id) || ': ' || new.type,
            new.id);
  end loop;
  return new;
end $$;

create trigger incidents_notify after insert on incidents
  for each row execute function notify_silviculture_incident();

create or replace function notify_silviculture_photo() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from profiles where role = 'silviculture_foreman' and active loop
    insert into notifications (recipient_id, type, title, body, ref_id)
    values (r.id, 'photo', 'Nova fotografija',
            (select full_name from profiles where id = new.ranger_id) ||
            coalesce(' · ' || new.department, ''),
            new.id);
  end loop;
  return new;
end $$;

create trigger field_photos_notify after insert on field_photos
  for each row execute function notify_silviculture_photo();

-- Obavijest poslovođi kada lugar završi radni dan.
create or replace function notify_foreman_shift_end() returns trigger
language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  if new.status = 'finished' then
    select wu.foreman_id into fid
    from profiles p join work_units wu on wu.id = p.work_unit_id
    where p.id = new.ranger_id;
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

create trigger work_shifts_notify after insert or update on work_shifts
  for each row execute function notify_foreman_shift_end();

-- ── Row Level Security ───────────────────────────────────────────────────────

alter table forestries enable row level security;
alter table work_units enable row level security;
alter table profiles enable row level security;
alter table work_shifts enable row level security;
alter table logbook_entries enable row level security;
alter table incidents enable row level security;
alter table field_photos enable row level security;
alter table ranger_tasks enable row level security;
alter table notifications enable row level security;

-- Organizacija: svi prijavljeni čitaju, samo admin piše.
create policy forestries_read on forestries for select to authenticated using (true);
create policy forestries_admin on forestries for all to authenticated
  using (auth_role() = 'admin') with check (auth_role() = 'admin');

create policy work_units_read on work_units for select to authenticated using (true);
create policy work_units_admin on work_units for all to authenticated
  using (auth_role() = 'admin') with check (auth_role() = 'admin');

-- Profili: korisnik vidi sebe; poslovođa svoju RJ; admin sve.
create policy profiles_self on profiles for select to authenticated using (id = auth.uid());
create policy profiles_foreman on profiles for select to authenticated
  using (auth_role() = 'foreman' and work_unit_id = auth_work_unit());
create policy profiles_admin on profiles for all to authenticated
  using (auth_role() = 'admin') with check (auth_role() = 'admin');

-- Radni dani: lugar svoje; poslovođa svoju RJ; admin sve.
create policy shifts_own on work_shifts for all to authenticated
  using (ranger_id = auth.uid()) with check (ranger_id = auth.uid());
create policy shifts_foreman on work_shifts for select to authenticated
  using (
    auth_role() = 'foreman'
    and ranger_id in (select id from profiles where work_unit_id = auth_work_unit())
  );
create policy shifts_admin on work_shifts for select to authenticated
  using (auth_role() = 'admin');

-- Službena knjiga: lugar svoje; poslovođa svoju RJ; admin sve.
create policy logbook_own on logbook_entries for all to authenticated
  using (ranger_id = auth.uid()) with check (ranger_id = auth.uid());
create policy logbook_foreman on logbook_entries for select to authenticated
  using (
    auth_role() = 'foreman'
    and ranger_id in (select id from profiles where work_unit_id = auth_work_unit())
  );
create policy logbook_admin on logbook_entries for select to authenticated
  using (auth_role() = 'admin');

-- Prijave: lugar svoje; uzgojni poslovođa i admin sve; poslovođa svoju RJ.
create policy incidents_own on incidents for all to authenticated
  using (ranger_id = auth.uid()) with check (ranger_id = auth.uid());
create policy incidents_silviculture on incidents for select to authenticated
  using (auth_role() in ('silviculture_foreman', 'admin'));
create policy incidents_foreman on incidents for select to authenticated
  using (
    auth_role() = 'foreman'
    and ranger_id in (select id from profiles where work_unit_id = auth_work_unit())
  );

-- Fotografije: isto kao prijave.
create policy photos_own on field_photos for all to authenticated
  using (ranger_id = auth.uid()) with check (ranger_id = auth.uid());
create policy photos_silviculture on field_photos for select to authenticated
  using (auth_role() in ('silviculture_foreman', 'admin'));
create policy photos_foreman on field_photos for select to authenticated
  using (
    auth_role() = 'foreman'
    and ranger_id in (select id from profiles where work_unit_id = auth_work_unit())
  );

-- Zadaci: poslovođa kreira i vidi svoje; lugar vidi i potvrđuje svoje.
create policy tasks_foreman on ranger_tasks for all to authenticated
  using (foreman_id = auth.uid()) with check (foreman_id = auth.uid());
create policy tasks_ranger_read on ranger_tasks for select to authenticated
  using (ranger_id = auth.uid());
create policy tasks_ranger_complete on ranger_tasks for update to authenticated
  using (ranger_id = auth.uid()) with check (ranger_id = auth.uid());
create policy tasks_admin on ranger_tasks for select to authenticated
  using (auth_role() = 'admin');

-- Obavijesti: primalac čita/označava; sistem (trigeri) ubacuje; klijent može ubaciti za druge.
create policy notifications_own on notifications for select to authenticated
  using (recipient_id = auth.uid());
create policy notifications_update on notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy notifications_insert on notifications for insert to authenticated
  with check (true);

-- ── Storage bucket za fotografije ────────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('field-photos', 'field-photos', true)
on conflict (id) do nothing;

create policy storage_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'field-photos');
create policy storage_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'field-photos');

-- ── Realtime ─────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table notifications;
