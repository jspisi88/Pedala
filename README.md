# Pedala

Aplikacija za vožnju na trenažeru u pregledniku, bez instalacije. Cijela aplikacija je jedna datoteka `index.html`. Jedini dio na serveru je mala Vercel funkcija `api/intervals.js`, koja služi samo za slanje vožnji na intervals.icu.

## Što radi

- **Spajanje opreme preko Web Bluetootha:** trenažer (FTMS, npr. Direto XR-T), pulsmetar i Zwift Click (v1 i v2). Uređaje koje si jednom spojio aplikacija sama spaja kad se upale.
- **ERG treninzi:** ugrađeni treninzi (izdržljivost, sweet spot, VO2max, prag, ramp test) i uvoz `.zwo` datoteka iz Zwifta. Snaga se računa iz FTP-a, a intenzitet se mijenja s − i +.
- **Slobodna vožnja i GPX rute:** 24 virtualne brzine sa Zwiftovim omjerima. Kod GPX rute trenažer prati nagib terena.
- **YouTube video** uz vožnju: pretraga (uz besplatni API ključ) ili zalijepljen link. Gumb **Cijeli zaslon** prikazuje video preko cijelog ekrana sa snagom, ciljem ili nagibom, intervalom, kadencom, pulsom, vremenom i brzinom preko slike. YouTubeov vlastiti gumb za cijeli zaslon je isključen jer bi sakrio te podatke.
- **Povijest:** metrike svake vožnje (NP, IF, TSS, kJ, najbolje snage) i izvoz u `.FIT` za Stravu, intervals.icu ili GoldenCheetah.
- **intervals.icu:** svaka spremljena vožnja automatski ide na intervals.icu. Ako tablet nije na internetu, vožnja čeka i pošalje se kad se veza vrati.
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

Ne treba build ni `vercel.json`. Vercel sam poslužuje `index.html`, a `api/intervals.js` pokreće kao serverless funkciju.

1. Na vercel.com odaberi **Add New → Project** i uvezi repozitorij `Pedala`.
2. Framework Preset ostavi na **Other**, a Build Command i Output Directory ostavi prazne.
3. Klikni **Deploy**. Vercel automatski daje `https://` adresu, pa Bluetooth radi.

Svaki push na `main` automatski se ponovno deploya.

## Prijava

Cijela stranica, uključujući `api/intervals.js`, zaključana je HTTP Basic Auth prijavom (`middleware.js`). Bez prijave nitko ne može otvoriti aplikaciju ni koristiti funkciju za slanje.

Na Vercelu, u **Project → Settings → Environment Variables**, dodaj:

| Varijabla | Vrijednost |
|---|---|
| `PEDALA_PASSWORD` | tvoja šifra (obavezno) |
| `PEDALA_USER` | korisničko ime, ako ne želiš zadano `jspisic` |

Zatim pokreni **Redeploy**. Dok `PEDALA_PASSWORD` nije postavljen, stranica nikoga ne pušta unutra.

Preglednik pri prvom otvaranju pita za ime i šifru. Chrome ih može zapamtiti, pa ih ne moraš stalno upisivati.

API ključevi (YouTube, intervals.icu) ionako nisu u kodu ni na serveru. Spremljeni su samo u pregledniku na tvom tabletu, pa ih drugi posjetitelji ne bi vidjeli ni bez prijave.

## intervals.icu

[intervals.icu](https://intervals.icu) je besplatan servis za analizu treninga (forma, krivulja snage, zone). Postavlja se jednom:

1. Na intervals.icu otvori **Settings → Developer Settings** i stvori **API key**.
2. Na tabletu otvori **Postavke → intervals.icu**, zalijepi ključ i klikni **Spremi i provjeri**. Ako je ključ ispravan, piše „Povezano: tvoje ime“.

Na Vercelu ne treba postavljati ništa.

Kako radi:

- Nakon spremanja vožnje Pedala napravi `.FIT` i pošalje ga preko `api/intervals.js` na intervals.icu. Funkcija samo prosljeđuje zahtjev, da aplikacija ne ovisi o tome dopušta li intervals.icu pozive izravno iz preglednika.
- API ključ je spremljen na tabletu, u postavkama (`localStorage`, `pedala.settings`). Ulazi i u sigurnosnu kopiju, pa tu datoteku ne dijeli s drugima.
- Ako nema interneta, vožnja čeka u redu. Pošalje se kad se veza vrati, kad ponovno otvoriš aplikaciju ili nakon sljedećeg spremanja. Isto vrijedi ako ključ prestane vrijediti: vožnje čekaju dok ne upišeš novi.
- U Povijesti svaka vožnja ima gumb **Na intervals.icu**, **Šaljem…**, **intervals.icu ↗** (otvara aktivnost) ili **Ponovi slanje** (kad je slanje palo). Tako se mogu poslati i starije vožnje.
- intervals.icu ne stvara duplikate: ista datoteka poslana dvaput vraća postojeću aktivnost.
- Automatsko slanje se isključuje u Postavkama. Tada ostaje ručni gumb u Povijesti.

Na `localhost`-u slanje ne radi bez Vercela. Za lokalni test s funkcijom pokreni `npx vercel dev`.

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

1. **intervals.icu** (već ugrađeno): vožnje se automatski šalju nakon spremanja, a analizu radi intervals.icu. Strava API je za nove aplikacije postao dostupan samo uz pretplatu, pa ga Pedala ne koristi. `.FIT` se u Stravu i dalje može uvesti ručno.
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
| `icuSaveKey`, `syncIcu`, `icuUpload` | Povezivanje s intervals.icu i red slanja |
| `api/intervals.js` | Vercel funkcija koja prosljeđuje upload na intervals.icu |
| `middleware.js` | Prijava (Basic Auth) ispred cijele stranice |

Format uzorka u `ride.samples`: `[t, snaga W, kadenca, puls, brzina cm/s, udaljenost m]`, a za rute još `lat, lon, visina`.
