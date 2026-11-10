# Pedala

**Indoor cycling in the browser.** Connect your smart trainer, heart rate strap and Zwift Click over Bluetooth, ride ERG workouts, pedal drills or real climbs, and watch YouTube while you ride. No app store, no subscription: one web page you deploy yourself, installable as an app on Android and desktop.

*[Hrvatski](README.hr.md)*

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fjspisi88%2FPedala&project-name=pedala&repository-name=pedala&env=PEDALA_PASSWORD&envDescription=Password%20for%20logging%20in%20to%20your%20Pedala&envLink=https%3A%2F%2Fgithub.com%2Fjspisi88%2FPedala%23environment-variables)

> The interface is in Croatian for now; an English translation is on its way. Voice announcements already speak English.

## Features

**Riding**
- **Bluetooth devices:** FTMS smart trainers (e.g. Elite Direto XR-T), heart rate straps and Zwift Click v1/v2. Devices you connected once reconnect by themselves as soon as they are switched on.
- **ERG workouts:** built-in workouts (endurance, sweet spot, VO2max, threshold, ramp test) and `.zwo` import from Zwift, including cadence targets.
- **Pedal drills** with cadence targets and cues: spin-ups, high/low cadence, low-cadence torque, cadence pyramid, single leg.
- **Heart-rate workouts:** power is steered to keep your heart rate in Zone 2.
- **Free ride and GPX routes** with 24 virtual gears (Zwift ratios); the trainer follows the gradient.
- **Built-in climbs:** Alpe d'Huez, Mont Ventoux, Passo dello Stelvio, and Sljeme, Učka and Biokovo in Croatia (profiles built from published gradients).
- **Soft start:** flat road before the start and while paused, then power or gradient ramps back up, so the trainer never locks you into a heavy gear.

**Screen**
- **YouTube while riding**, full screen with your numbers on top and a Zwift-style workout profile with a heart-rate line behind them.
- **A video feed of your own:** newest videos from favourite channels, your own playlists and a ride theme of the day (YouTube offers apps no personal recommendations).
- **Music from YouTube Music** in a small player with ⏮ ⏯ ⏭, or **no video at all:** a large workout profile instead.
- **Voice announcements** in Croatian or English ("In 10 seconds: 3 minutes at 265 watts"); YouTube is turned down while the voice speaks.
- **Heart-rate zones**, interval scoring and a phone layout that never scrolls while you ride.

**After the ride**
- **Ride report** like Zwift's: power by zone with heart rate, interval scores, power distribution, time in HR zones, power curve against the last 90 days.
- **Progress:** fitness/fatigue/form (CTL/ATL/TSB), weekly volume, best powers, FTP over time.
- **14-week training plan** (short weekday sessions, long Sunday Zone 2 ride) with progress tracking and a calendar file with reminders.
- **intervals.icu upload** of every ride, `.FIT` export for Strava, GoldenCheetah and others.
- **Sync between phone and tablet** through Vercel Blob; backup and restore as a single `.json` file.

## Requirements

Web Bluetooth works in **Chrome or Edge on Android, Windows, macOS, Linux and ChromeOS**, over `https://` or on `localhost`. Safari and iOS do not support it.

## Deploy your own

1. Click **Deploy with Vercel** above. Vercel copies the repository to your GitHub account and asks for `PEDALA_PASSWORD`.
2. Optional, in **Project → Settings → Environment Variables** (then **Redeploy**):

### Environment variables

| Variable | What for |
|---|---|
| `PEDALA_PASSWORD` | Password for the login page (required: without it nobody gets in) |
| `PEDALA_USER` | Login name (default `pedala`) |
| `YOUTUBE_API_KEY` | YouTube Data API v3 key for searching videos, channels and playlists. In Google Cloud set *Application restrictions: None* and *API restrictions: YouTube Data API v3* (the key is used by the server, not the browser). |
| `INTERVALS_API_KEY` | intervals.icu API key (*Settings → Developer Settings* on intervals.icu) |
| `BLOB_READ_WRITE_TOKEN` | Added by Vercel when you create a Blob store: **Storage → Create → Blob**, *Private*, tick *Add a read-write token*. Enables sync between devices. |

Every deploy is private to its owner: rides, plans and keys stay in your browser and your Vercel project.

3. Open your site in Chrome, log in, then **⋮ → Add to Home screen → Install** to use it as an app.

### Automatic reconnection

Chrome only remembers Bluetooth devices with `chrome://flags/#enable-web-bluetooth-new-permissions-backend` set to **Enabled**. Restart Chrome, connect the devices once by hand, and from then on they connect by themselves. *Settings → Automatic connection* shows what is going on.

### Voice

Croatian announcements need a Croatian text-to-speech voice (Android: *Text-to-speech → Speech Services by Google → Install voice data → Croatian*). Without one, everything is spoken in English, or pick English under *Settings → Announcement language*.

## Development

The app is a single `index.html` with no build step. The server side is four small files: `middleware.js` (login), `api/sync.js` (Vercel Blob), `api/intervals.js` and `api/youtube.js` (proxies that keep keys on the server).

```bash
npm install
npm run dev            # local server on http://localhost:8765 with fake intervals.icu, YouTube and Blob
```

Without a trainer use **Connect trainer → Simulator**; `?simspeed=20` runs the simulator 20× faster.

Tests (Node 20+):

```bash
npm i --no-save playwright && npx playwright install chromium
npm test               # unit tests (login, sync) and end-to-end tests in Chromium
```

| Part | What it does |
|---|---|
| `BleTrainer`, `SimTrainer`, `BleHR`, `ZwiftClick`, `autoConnect` | Bluetooth devices, simulator, automatic reconnection |
| `BUILTIN`, `parseZwo`, `PLAN`, `PLAN_WO` | Workouts, drills, training plan |
| `parseGpx`, `CLIMBS`, `trainerGrade` | Routes, built-in climbs, virtual gears |
| `tick`, `applyControl`, `softStep`, `steerHr` | Ride loop, soft start, heart-rate control |
| `metrics`, `renderReport`, `drawProgress` | Metrics, ride report, progress |
| `encodeFit` | FIT export |
| `say`, `duckStart` | Voice announcements, turning YouTube down |
| `syncNow`, `syncIcu` | Sync between devices, intervals.icu upload |

Ride samples are `[t, power W, cadence, heart rate, speed cm/s, distance m]`, plus `lat, lon, elevation` on routes.

Issues and pull requests are welcome.

## Credits and trademarks

- Zwift Click protocol notes from [qdomyos-zwift](https://github.com/cagnulein/qdomyos-zwift) (QZ) and Torqa, used as documentation; no code was copied.
- Pedal drills are inspired by Zwift's *Pedalling drills* and GC Coaching cadence sessions.
- Zwift, Zwift Click, Elite Direto, Strava, intervals.icu, YouTube and YouTube Music are trademarks of their owners. Pedala is an independent project and is not affiliated with or endorsed by any of them.

## License

[MIT](LICENSE)
