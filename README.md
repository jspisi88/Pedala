# Pedala

Aplikacija za vožnju na trenažeru u pregledniku, bez instalacije. Cijela aplikacija je jedna datoteka `index.html`. Jedini dio na serveru je mala Vercel funkcija `api/strava.js`, koja služi samo za slanje vožnji na Stravu.

## Što radi

- **Spajanje opreme preko Web Bluetootha:** trenažer (FTMS, npr. Direto XR-T), pulsmetar i Zwift Click (v1 i v2). Uređaje koje si jednom spojio aplikacija sama spaja kad se upale.
- **ERG treninzi:** ugrađeni treninzi (izdržljivost, sweet spot, VO2max, prag, ramp test) i uvoz `.zwo` datoteka iz Zwifta. Snaga se računa iz FTP-a, a intenzitet se mijenja s − i +.
- **Slobodna vožnja i GPX rute:** 24 virtualne brzine sa Zwiftovim omjerima. Kod GPX rute trenažer prati nagib terena.
- **YouTube video** uz vožnju: pretraga (uz besplatni API ključ) ili zalijepljen link.
- **Povijest:** metrike svake vožnje (NP, IF, TSS, kJ, najbolje snage) i izvoz u `.FIT` za Stravu, intervals.icu ili GoldenCheetah.
- **Strava:** svaka spremljena vožnja automatski ide na Stravu. Ako tablet nije na internetu, vožnja čeka i pošalje se kad se veza vrati.
- **Napredak:** forma (CTL/ATL/TSB), tjedni volumen, najbolje snage i kretanje FTP-a.
- **Sigurnosna kopija:** sve vožnje, treninzi, rute i postavke u jednoj `.json` datoteci.

## Pokretanje

Web Bluetooth radi samo u Chromeu ili Edgeu (laptop ili Android) i samo preko `https://` ili `localhost`. Safari i iOS ga nemaju.

Lokalno:

```bash
python3 -m http.server 8000
# otvori http://localhost:8000
```

Bez trenažera možeš isprobati aplikaciju preko **Spoji trenažer → Simulator**. S parametrom `?simspeed=20` simulator radi 20 puta brže.

## Deploy na Vercel

Ne treba build ni `vercel.json`. Vercel sam poslužuje `index.html`, a `api/strava.js` pokreće kao serverless funkciju.

1. Na vercel.com odaberi **Add New → Project** i uvezi repozitorij `Pedala`.
2. Framework Preset ostavi na **Other**, a Build Command i Output Directory ostavi prazne.
3. Klikni **Deploy**. Vercel automatski daje `https://` adresu, pa Bluetooth radi.

Svaki push na `main` automatski se ponovno deploya.

## Strava

Postavlja se jednom:

1. Na <https://www.strava.com/settings/api> napravi aplikaciju:
   - **Application Name:** npr. `Pedala`
   - **Category:** Training
   - **Website:** adresa tvog deploya, npr. `https://pedala.vercel.app`
   - **Authorization Callback Domain:** samo domena, bez `https://`, npr. `pedala.vercel.app`
2. Sa iste stranice prepiši **Client ID** i **Client Secret**.
3. Na Vercelu otvori **Project → Settings → Environment Variables** i dodaj:
   - `STRAVA_CLIENT_ID` = Client ID
   - `STRAVA_CLIENT_SECRET` = Client Secret
4. Pokreni **Redeploy**, jer se nove varijable vide tek u novom deployu.
5. Na tabletu otvori **Postavke → Strava → Poveži Stravu** i odobri pristup. Kvačica za učitavanje aktivnosti mora ostati uključena.

Kako radi:

- Client Secret je samo na Vercelu i nikad ne dolazi na tablet. Na tabletu (`localStorage`, ključ `pedala.strava`) je samo pristupni token, koji se automatski obnavlja svakih 6 sati.
- Nakon spremanja vožnje Pedala napravi `.FIT` i pošalje ga preko `api/strava.js` na Stravu. Vožnja se označi kao vožnja na trenažeru, a vožnja po GPX ruti kao virtualna vožnja.
- Ako nema interneta, vožnja čeka u redu. Pošalje se kad se veza vrati, kad ponovno otvoriš aplikaciju ili nakon sljedećeg spremanja.
- U Povijesti svaka vožnja ima gumb **Na Stravu**, **Šaljem…**, **Na Stravi ↗** (otvara aktivnost) ili **Ponovi Stravu** (kad je slanje palo). Tako se mogu poslati i starije vožnje.
- Ako je vožnja već na Stravi, Strava je odbije kao duplikat, a Pedala je samo poveže s postojećom aktivnošću.
- Automatsko slanje se isključuje u Postavkama. Tada ostaje ručni gumb u Povijesti.
- Nova Strava aplikacija radi samo za račun koji ju je napravio („single player mode“), što je za osobnu upotrebu dovoljno.

Na `localhost`-u Strava ne radi bez Vercela. Za lokalni test s funkcijom pokreni `npx vercel dev` (varijable u `.env.local`). Strava kao callback domenu uvijek dopušta i `localhost`.

## Gdje se spremaju podaci

**Vercel ne sprema nikakve podatke.** On samo poslužuje `index.html`. Sve se sprema u preglednik na uređaju na kojem voziš:

| Podatak | Gdje |
|---|---|
| Vožnje (sekundni zapis i metrike) | IndexedDB, baza `pedala`, spremište `rides` |
| Postavke, uvezeni treninzi, rute, uređaji, nedavni videi | `localStorage`, ključevi `pedala.*` |

Posljedice:

- Podaci se **ne sinkroniziraju** između uređaja. Vožnje s laptopa ne vidiš na mobitelu.
- Brisanje podataka preglednika ili deinstalacija Chromea **briše sve vožnje**.
- Podaci su vezani uz adresu stranice. Vožnje spremljene na `localhost` ne vide se na `pedala.vercel.app`, a ni na drugoj Vercel domeni ili adresi preview deploya.
- Pri prvom spremanju vožnje aplikacija traži trajnu pohranu (`navigator.storage.persist()`), da Chrome ne obriše podatke kad ponestane mjesta.

Zato redovito koristi **Povijest → Izvezi sigurnosnu kopiju**. Kopiju možeš uvesti na drugom uređaju ili adresi preko **Uvezi kopiju**. Uvoz ne stvara duplikate. Možeš i skidati `.FIT` u Stravu ili intervals.icu, koji onda služe kao vanjska arhiva.

## Analitika (kartica Napredak)

Sve se računa u pregledniku iz spremljenih vožnji:

- **Zadnjih 30 dana:** broj vožnji, vrijeme, kilometri, TSS i kJ, uz postotnu promjenu prema prethodnih 30 dana.
- **Forma:** kondicija (CTL, eksponencijalni prosjek dnevnog TSS-a kroz 42 dana), umor (ATL, kroz 7 dana) i forma (TSB = CTL − ATL od prethodnog dana). Graf prikazuje zadnjih 120 dana.
- **Tjedni volumen:** sati po tjednu (tjedan počinje u ponedjeljak) za zadnjih 12 tjedana, s TSS-om iznad stupca.
- **Najbolje snage:** 5 s, 1 min, 5 min i 20 min, ikad i u zadnjih 6 tjedana.
- **FTP:** FTP iz postavki u trenutku svake vožnje, uz procjenu iz najboljih 20 minuta × 0,95.

TSS i ostale metrike računaju se iz FTP-a koji je bio postavljen u trenutku vožnje.

## Mogućnosti za sinkronizaciju u oblaku

Ako želiš vidjeti iste podatke na više uređaja, to su opcije, od najjednostavnije prema najmoćnijoj:

1. **intervals.icu ili Strava:** šalješ `.FIT` nakon vožnje, ručno ili preko njihovog API-ja. Odmah dobiješ vrlo dobru analitiku, a ne trebaš svoj backend.
2. **Vercel Blob:** jedna serverless funkcija (`api/rides.js`) sprema JSON kopiju. Jednostavno je, ali bez upita nad podacima.
3. **Neon Postgres (Vercel Marketplace) ili Supabase:** tablice `rides` (metrike, a sekundni zapis kao JSONB ili u Blobu) i serverless API. Ovo je najbolje ako želiš analitiku kroz SQL i više korisnika. Treba dodati prijavu, npr. Supabase Auth ili tajni token u Vercel Environment Variables.

U svim slučajevima IndexedDB ostaje lokalna baza, pa aplikacija radi i bez interneta, a sinkronizacija se samo dodaje nakon spremanja vožnje.

## Struktura koda (`index.html`)

| Dio | Što radi |
|---|---|
| `BleTrainer`, `SimTrainer`, `BleHR`, `ZwiftClick` | Bluetooth uređaji i simulator |
| `BUILTIN`, `parseZwo` | Treninzi |
| `parseGpx`, `gradeAt`, `trainerGrade` | GPX rute i virtualne brzine |
| `tick`, `start`, `pause` | Petlja vožnje (1 uzorak u sekundi) |
| `metrics` | NP, IF, TSS i najbolje snage |
| `encodeFit` | Izvoz u FIT |
| `dbAll`, `dbPut`, `dbDel` | IndexedDB |
| `pmc`, `drawProgress` | Kartica Napredak |
| `exportBackup`, `importBackup` | Sigurnosna kopija |
| `stravaConnect`, `syncStrava`, `stravaUpload` | Povezivanje sa Stravom i red slanja |
| `api/strava.js` | Vercel funkcija: OAuth tokeni i upload na Stravu |

Format uzorka u `ride.samples`: `[t, snaga W, kadenca, puls, brzina cm/s, udaljenost m]`, a za rute još `lat, lon, visina`.
