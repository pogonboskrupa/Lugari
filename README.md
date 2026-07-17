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
— na login ekranu odaberite ulogu (Lugar / Poslovođa / Uzgojni poslovođa / Administrator).

## Supabase postavljanje

1. Kreirati Supabase projekt.
2. U SQL editoru pokrenuti `supabase/migrations/00001_schema.sql`
   (tabele, RLS politike, trigeri za obavijesti, storage bucket).
3. Kreirati korisnike kroz Supabase Auth (invite) i dodati red u `profiles`
   sa odgovarajućom ulogom (`admin`, `foreman`, `silviculture_foreman`, `ranger`).
4. Upisati `VITE_SUPABASE_URL` i `VITE_SUPABASE_ANON_KEY` u `.env`.

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
    foreman/      # dashboard, karta uživo, detalji lugara, izvještaji, pokrivenost, zadaci
    silviculture/ # prijave + fotografije, karta
    admin/        # šumarije, radne jedinice, korisnici
supabase/
  migrations/   # kompletna shema sa RLS politikama
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
- **Obavijesti**: Postgres trigeri pune tabelu `notifications`
  (nova prijava/fotografija → uzgojni poslovođa; kraj smjene → poslovođa);
  klijent sluša Realtime kanal + Web Notifications.
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
