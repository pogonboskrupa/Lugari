# Lugari — ŠPD Unsko-sanske šume

Profesionalna PWA aplikacija za praćenje rada lugara (čuvara šuma): GPS tragovi,
službena knjiga, prijave bespravne sječe, fotografije s terena, izvještaji i
administracija — optimizovana za Android telefone i rad bez interneta.

## Tehnologije

- **React 19 + TypeScript + Vite** — brz, moderan frontend
- **Leaflet + GeoJSON** — karta odjela, GPS tragovi, heatmap, replay
- **IndexedDB (idb)** — offline-first pohrana i sync queue
- **Firebase** — Auth, Firestore, Storage, Cloud Functions (2nd gen)
- **TailwindCSS 4 + Shadcn-style UI** — tamna/svijetla tema, velike kartice
- **vite-plugin-pwa** — instalabilna aplikacija, keširanje OSM pločica i GeoJSON-a

## Pokretanje

```bash
npm install
cp .env.example .env   # upisati Firebase konfiguraciju web aplikacije
npm run dev
```

Bez `.env` konfiguracije aplikacija radi u **demo režimu** (offline, IndexedDB)
— na login ekranu odaberite ulogu (Lugar / Poslovođa uzgoja / Administrator).

## Firebase postavljanje

1. Kreirati Firebase projekt na [console.firebase.google.com](https://console.firebase.google.com)
   i nadograditi na **Blaze** plan (potreban za Cloud Functions — obavijesti
   i kreiranje lugara rade preko funkcija).
2. **Authentication → Sign-in method** → uključiti Email/Password.
3. **Firestore Database** → kreirati bazu (production mode).
4. **Storage** → kreirati bucket (default).
5. Instalirati Firebase CLI i prijaviti se:
   ```bash
   npm install -g firebase-tools
   firebase login
   ```
6. U `.firebaserc` upisati pravi `projectId` umjesto `your-firebase-project-id`.
7. Deployati Firestore/Storage pravila, indekse i Cloud Functions:
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes,storage,functions
   ```
   (`functions/` je zaseban npm paket — `firebase deploy` sam pokreće njegov
   `npm install`/build preko `predeploy` hook-a iz `firebase.json`.)
8. **Project settings → General → Your apps** → dodati Web app i prekopirati
   konfiguraciju u `.env` (`VITE_FIREBASE_*` varijable, vidi `.env.example`).
9. Kreirati **prvog administratora** ručno (jednokratno, samo za bootstrap):
   Firebase Console → Authentication → Add user (email + šifra), zatim u
   Firestore konzoli kreirati dokument `profiles/<uid>` (uid iz Authentication
   taba) sa poljima:
   ```json
   {
     "full_name": "Ime Prezime",
     "role": "admin",
     "active": true,
     "work_unit_id": null,
     "forestry_id": null,
     "phone": null,
     "username": null,
     "supervisor_id": null,
     "created_at": "2026-01-01T00:00:00.000Z"
   }
   ```

### Struktura Firebase backenda

```
firestore.rules            # sigurnosna pravila (zamjena za Postgres RLS)
firestore.indexes.json     # kompozitni indeksi za upite u dataService.ts
storage.rules               # pristup Storage bucketu za terenske fotografije
functions/
  src/index.ts              # createRanger, resolveLoginEmail (callable)
                             # + Firestore trigeri za automatske obavijesti
                             # (zamjena za Postgres trigere)
```

Kolekcije u Firestore-u (ravna struktura, bez šema): `forestries`, `work_units`,
`profiles` (id = Firebase Auth uid), `work_shifts`, `logbook_entries`,
`incidents`, `field_photos`, `ranger_tasks`, `notifications`.

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
  lib/          # firebase klijent, IndexedDB (idb), pomoćne funkcije
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
firestore.rules, firestore.indexes.json, storage.rules
functions/
  src/index.ts    # createRanger, resolveLoginEmail (callable) + Firestore
                  # trigeri za automatske obavijesti
```

### Ključni tokovi

- **GPS tracking** (`trackingService`): tačka svakih 30 s ili 20 m
  (vrijeme, lat, lng, brzina, tačnost), upis odmah u IndexedDB (otporno na
  gašenje aplikacije), screen wake-lock, nastavak trage nakon restarta.
- **Offline sync** (`syncService`): svi upisi idu u IndexedDB + sync queue;
  pri povratku mreže queue se automatski prazni prema Firestore (tragovi,
  knjiga, prijave, fotografije u Storage, potvrde zadataka).
- **Geo-analiza** (`geoService`/`analyticsService`): point-in-polygon (Turf)
  za status *U odjelu / Na lageru / Van odjela*, kilometraža (Haversine +
  filtriranje GPS šuma), prosjek/maks brzina, raspodjela vremena, GPS-prekid
  upozorenja, heatmap grid, pokrivenost odjela.
- **Geofencing** (`geofencingService`): automatski upis ulaska/izlaska iz
  odjela u službenu knjigu tokom smjene.
- **Obavijesti**: Cloud Functions trigeri (`functions/src/index.ts`) pune
  kolekciju `notifications` (nova prijava/fotografija/kraj smjene → direktno
  poslovođi lugara preko `profiles.supervisor_id`); klijent sluša Firestore
  `onSnapshot` listener + Web Notifications.
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
