# Pedala

**Vožnja na trenažeru u pregledniku.** Spoji trenažer, pulsmetar i Zwift Click preko Bluetootha, vozi ERG treninge, pedal drills ili prave uspone i gledaj YouTube dok voziš. Bez trgovine aplikacija i bez pretplate: jedna web stranica koju sam postaviš, a na Androidu i računalu se instalira kao aplikacija.

*[English](README.md)*

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fjspisi88%2FPedala&project-name=pedala&repository-name=pedala&env=PEDALA_PASSWORD&envDescription=Password%20for%20logging%20in%20to%20your%20Pedala&envLink=https%3A%2F%2Fgithub.com%2Fjspisi88%2FPedala%23environment-variables)

## Što radi

**Vožnja**
- **Bluetooth uređaji:** FTMS trenažeri (npr. Elite Direto XR-T), pulsmetri i Zwift Click v1/v2. Jednom spojeni uređaji sami se spajaju čim se upale.
- **ERG treninzi:** ugrađeni treninzi (izdržljivost, sweet spot, VO2max, prag, ramp test) i uvoz `.zwo` datoteka iz Zwifta, s ciljanom kadencom.
- **Pedal drills** s ciljanom kadencom i uputama: spin-ups, visoka i niska kadenca, snaga na niskoj kadenci, kadencna piramida, jedna noga.
- **Trening po pulsu:** snaga se sama namješta da puls ostane u zoni 2.
- **Slobodna vožnja i GPX rute** s 24 virtualne brzine (Zwiftovi omjeri); trenažer prati nagib.
- **Ugrađeni usponi:** Sljeme, Učka, Biokovo, Alpe d'Huez, Mont Ventoux i Stelvio, s profilima iz objavljenih nagiba.
- **Lagani start:**
  - prije starta i u pauzi trenažer je na ravnoj cesti;
  - zatim se snaga ili nagib postupno vraćaju, pa te trenažer nikad ne „zakuca“ u tešku brzinu.

**Ekran**
- **YouTube uz vožnju** preko cijelog zaslona, s brojkama i profilom treninga kao u Zwiftu (s crtom pulsa).
- **Feed videa:** najnoviji videi omiljenih kanala, tvoje playliste i tema dana.
- **Glazba s YouTube Musica** u malom playeru s ⏮ ⏯ ⏭, ili **bez videa**: velik profil treninga.
- **Hrvatski i engleski:** aplikacija prati jezik preglednika, a mijenja se u *Postavke → Jezik*.
- **Glasovne najave** na hrvatskom ili engleskom. Dok glas govori, YouTube se stiša.
- **Zone pulsa**, ocjena intervala i raspored za mobitel koji se ne pomiče dok voziš.

**Nakon vožnje**
- **Izvještaj vožnje** kao u Zwiftu: snaga po zonama s pulsom, intervali, raspodjela snage, zone pulsa, krivulja snage.
- **Napredak:** forma (CTL/ATL/TSB), tjedni volumen, najbolje snage, FTP kroz vrijeme.
- **Plan od 14 tjedana:**
  - kratki treninzi preko tjedna, duga nedjeljna vožnja u zoni 2;
  - praćenje napretka i kalendar (`.ics`) s podsjetnicima.
- **Slanje na intervals.icu** nakon svake vožnje i izvoz u `.FIT`.
- **Sinkronizacija mobitela i tableta** preko Vercel Blob spremišta, uz sigurnosnu kopiju u `.json`.

## Što treba

Web Bluetooth radi u **Chromeu ili Edgeu na Androidu, Windowsima, macOS-u, Linuxu i ChromeOS-u**, preko `https://` ili na `localhost`-u. Safari i iOS ga nemaju.

## Postavljanje

1. Klikni **Deploy with Vercel** iznad. Vercel kopira repozitorij na tvoj GitHub i traži `PEDALA_PASSWORD`.
2. Po želji, u **Project → Settings → Environment Variables** (pa **Redeploy**):

| Varijabla | Za što |
|---|---|
| `PEDALA_PASSWORD` | Lozinka za prijavu (obavezno: bez nje nitko ne ulazi) |
| `PEDALA_USER` | Korisničko ime (zadano `pedala`) |
| `YOUTUBE_API_KEY` | YouTube Data API v3 ključ za pretragu videa, kanala i playlista. U Google Cloudu postavi *Application restrictions: None* i *API restrictions: YouTube Data API v3*, jer ključ koristi server, a ne preglednik. |
| `INTERVALS_API_KEY` | intervals.icu API ključ (na intervals.icu: *Settings → Developer Settings*) |
| `BLOB_READ_WRITE_TOKEN` | Doda ga Vercel kad napraviš Blob spremište: **Storage → Create → Blob**, *Private*, kvačica *Add a read-write token*. Uključuje sinkronizaciju uređaja. |

3. Otvori stranicu u Chromeu, prijavi se, pa **⋮ → Dodaj na početni zaslon → Instaliraj**.

Svaki deploy je samo vlasnikov: vožnje, plan i ključevi ostaju u tvom pregledniku i tvom Vercel projektu.

**Automatsko spajanje:**
1. Uključi `chrome://flags/#enable-web-bluetooth-new-permissions-backend` (**Enabled**).
2. Ponovno pokreni Chrome i jednom ručno spoji uređaje.
3. Od tada se spajaju sami. Stanje vidiš u *Postavke → Automatsko spajanje*.

**Glas:** za hrvatske najave treba hrvatski glas (Android: *Pretvaranje teksta u govor → Govorne usluge Googlea → Instaliraj glasovne podatke → Hrvatski*; na Samsungu potraži *Tekst u govor*). Bez njega najave idu na engleskom.

**Zwift Click v2:** dva dijela se postavljaju u *Postavke → Zwift Click → Postavi tipke ispočetka*: + na jednom dijelu, − na drugom.

## Razvoj

Aplikacija je jedna datoteka `index.html`, bez builda. Na serveru su četiri male datoteke:
- `middleware.js`: prijava;
- `api/sync.js`: Vercel Blob;
- `api/intervals.js` i `api/youtube.js`: posrednici koji ključeve drže na serveru.

```bash
npm install
npm run dev            # lokalni server na http://localhost:8765 s lažnim intervals.icu, YouTubeom i Blobom
npm i --no-save playwright && npx playwright install chromium
npm test               # testovi prijave i sinkronizacije te cijele aplikacije u Chromiumu
```

Bez trenažera koristi **Spoji trenažer → Simulator**; `?simspeed=20` ga ubrzava 20 puta.

## Zahvale i zaštićena imena

- Opis Zwift Click protokola iz [qdomyos-zwift](https://github.com/cagnulein/qdomyos-zwift) (QZ) i Torqe, korišten kao dokumentacija; kod nije preuzet.
- Pedal drills su po uzoru na Zwiftove *Pedalling drills* i GC Coaching treninge kadence.
- Zwift, Zwift Click, Elite Direto, Strava, intervals.icu, YouTube i YouTube Music zaštićena su imena svojih vlasnika. Pedala je neovisan projekt i nije povezana ni s jednim od njih.

## Licenca

[MIT](LICENSE)
