# Lugari — ŠPD Unsko-sanske šume

Profesionalna PWA aplikacija za praćenje rada lugara (čuvara šuma): GPS tragovi,
službena knjiga, prijave bespravne sječe, fotografije s terena, izvještaji i
administracija — optimizovana za Android telefone i rad bez interneta.

## Tehnologije

- **React 19 + TypeScript + Vite** — brz, moderan frontend
- **Leaflet + GeoJSON** — karta odjela, GPS tragovi, heatmap, replay
- **IndexedDB (idb)** — offline-first pohrana i sync queue
- **Supabase** — Auth, Postgres sa RLS, Storage, Realtime obavijesti
- **TailwindCSS 4 + Shadcn-style UI** — tamna/svijetla tema, velike kartice
- **vite-plugin-pwa** — instalabilna aplikacija, keširanje OSM pločica i GeoJSON-a

## Pokretanje

```bash
npm install
cp .env.example .env   # upisati Supabase URL i anon ključ
npm run dev
```

Bez `.env` konfiguracije aplikacija radi u **demo režimu** (offline, IndexedDB)
— na login ekranu odaberite ulogu (Lugar / Poslovođa uzgoja / Administrator).

## Supabase postavljanje

1. Kreirati Supabase projekt.
2. U SQL editoru pokrenuti redom `supabase/migrations/00001_schema.sql` pa
   `00002_user_management.sql` (tabele, RLS politike, trigeri za obavijesti,
   storage bucket, trigger za automatsko kreiranje profila, RPC za prijavu
   korisničkim imenom).
3. U **Authentication → Settings** isključiti "Confirm email" — aplikacija
   već ima vlastiti gate za odobrenje poslovođe (`profiles.active`), pa
   dodatna email potvrda samo komplikuje tok bez sigurnosne koristi.
4. Deployati Edge funkciju koja poslovođama omogućava kreiranje lugara:
   ```bash
   supabase functions deploy create-ranger
   ```
5. Upisati `VITE_SUPABASE_URL` i `VITE_SUPABASE_ANON_KEY` u `.env`.
6. Kreirati **prvog administratora** ručno (jednokratno, samo za bootstrap):
   Supabase Dashboard → Authentication → Add user (email + šifra), zatim u
   SQL editoru:
   ```sql
   update profiles set role = 'admin', active = true where id = '<user-id>';
   ```

### Tok kreiranja korisnika (bez daljeg ručnog rada admina)

- **Poslovođa uzgoja** se sam registruje na `/registracija` (ime, email,
  šifra). Nalog ostaje neaktivan dok ga administrator ne odobri na
  ekranu Administracija → "Zahtjevi za odobrenje".
- **Lugar** nema email — poslovođa ga dodaje iz svog dashboarda ("Dodaj
  lugara": ime, korisničko ime, početna šifra). Lugar se prijavljuje samo
  korisničkim imenom i kasnije može promijeniti šifru (ikona postavki u
  zaglavlju).
- **Premještanje lugara kod drugog poslovođe**: administrator to radi u
  Administracija → uredi korisnika → padajući meni "Poslovođa".

## GeoJSON odjela

Karta učitava `public/geojson/odjeli.geojson`. Svaki poligon nosi atribute:

```json
{ "sumarija": "Bosanska Krupa", "gospodarska_jedinica": "Risovac", "odjel": "15/1" }
```

Poligoni lagera imaju dodatno `"lager": true` — koriste se za prepoznavanje
statusa **Na lageru**. Uključeni fajl je primjer; zamijeniti ga stvarnim
podacima ŠPD-a (isti atributi).

## Arhitektura

```
src/
  lib/          # supabase klijent, IndexedDB (idb), pomoćne funkcije
  types/        # svi TypeScript domenski tipovi
  services/     # servisni sloj: tracking, geo, sync, analytics, reports…
  store/        # Zustand: auth i GPS tracking stanje
  hooks/        # useOnline, useTheme
  components/
    ui/         # Shadcn-style primitivi (Button, Card, Dialog, Table…)
    map/        # Leaflet: MapView, TrackLayer, Heatmap, Replay, PhotoMarkers
    layout/     # AppShell (header + bottom nav), FAB
  pages/
    ranger/       # radni dan, službena knjiga, prijave, foto, zadaci
    foreman/      # dashboard (+ dodavanje lugara), karta uživo, detalji lugara,
                  # izvještaji, pokrivenost, zadaci
    silviculture/ # prijave + fotografije (rute pod poslovođom uzgoja), karta
    admin/        # šumarije, radne jedinice, korisnici, odobravanje poslovođa
supabase/
  migrations/   # kompletna shema sa RLS politikama
  functions/
    create-ranger/  # Edge funkcija: poslovođa kreira nalog lugara
```

### Ključni tokovi

- **GPS tracking** (`trackingService`): tačka svakih 30 s ili 20 m
  (vrijeme, lat, lng, brzina, tačnost), upis odmah u IndexedDB (otporno na
  gašenje aplikacije), screen wake-lock, nastavak trage nakon restarta.
- **Offline sync** (`syncService`): svi upisi idu u IndexedDB + sync queue;
  pri povratku mreže queue se automatski prazni prema Supabase (tragovi,
  knjiga, prijave, fotografije u Storage, potvrde zadataka).
- **Geo-analiza** (`geoService`/`analyticsService`): point-in-polygon (Turf)
  za status *U odjelu / Na lageru / Van odjela*, kilometraža (Haversine +
  filtriranje GPS šuma), prosjek/maks brzina, raspodjela vremena, GPS-prekid
  upozorenja, heatmap grid, pokrivenost odjela.
- **Geofencing** (`geofencingService`): automatski upis ulaska/izlaska iz
  odjela u službenu knjigu tokom smjene.
- **Obavijesti**: Postgres trigeri pune tabelu `notifications` (nova
  prijava/fotografija/kraj smjene → direktno poslovođi lugara preko
  `profiles.supervisor_id`); klijent sluša Realtime kanal + Web Notifications.
- **Izvještaji** (`reportService`): PDF (jsPDF) i Excel (SheetJS) export sa
  filterima po datumu, šumariji, radnoj jedinici, lugaru i odjelu.

## Napomena o pozadinskom GPS-u

Web platforma ne dozvoljava GPS u potpunosti ugašenog ekrana; aplikacija koristi
Screen Wake Lock da ekran ostane aktivan tokom smjene i nastavlja trag nakon
svakog povratka u prvi plan. Za praćenje sa zaključanim ekranom preporučuje se
pakovanje u Capacitor/TWA sa foreground service dozvolom — servisni sloj je
spreman za tu nadogradnju (točke se dodaju kroz isti `trackingService`).

## Ikone

`public/icons/*.png` su generisani privremeni simboli — zamijeniti zvaničnim
logotipom ŠPD-a prije produkcije.
