// End-to-end tests in Chromium (Playwright) against tests/support/server.js and the built-in trainer simulator.
// Run: npm i --no-save playwright && npx playwright install chromium && npm test
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { start } = require("./support/server.js");

const results = [];
async function test(name, fn){
  const t0 = Date.now();
  try{ await fn(); results.push(["ok", name, null, Date.now() - t0]); }catch(e){ results.push(["FAIL", name, e, Date.now() - t0]); }
}
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const srv = await start(), B = srv.url, browser = await chromium.launch(), pageErrors = [];
  /* a fresh browser profile; fake YouTube player that answers volume questions and records commands */
  async function open({ viewport = { width: 1280, height: 860 }, speed = 100, voices = [], settings, mobile = false, locale = "hr-HR" } = {}){
    const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, acceptDownloads: true, locale });
    const p = await ctx.newPage(); p.on("pageerror", e => pageErrors.push(e.message)); p.on("dialog", d => d.accept());
    await p.route("https://www.youtube.com/embed/**", r => r.fulfill({ contentType: "text/html", body: `<body><script>
      let vol = 70; addEventListener("message", e => { const d = JSON.parse(e.data);
        if(d.event === "listening") parent.postMessage(JSON.stringify({ event: "infoDelivery", info: { volume: vol } }), "*");
        if(d.event === "command"){ if(d.func === "setVolume") vol = d.args[0]; parent.postMessage({ rec: d.func + "(" + d.args.join(",") + ")" }, "*"); } });</script></body>` }));
    await p.route("https://i.ytimg.com/**", r => r.fulfill({ body: "" }));
    await p.addInitScript(([vs, st]) => {
      window.__spoken = []; window.__rec = []; addEventListener("message", e => { if(e.data?.rec) __rec.push(e.data.rec); });
      speechSynthesis.getVoices = () => vs.map(([name, lang]) => ({ name, lang, voiceURI: name, localService: true }));
      window.SpeechSynthesisUtterance = function(t){ this.text = t; };
      speechSynthesis.speak = u => { __spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 200); };
      if(st && !localStorage.getItem("pedala.settings")) localStorage.setItem("pedala.settings", JSON.stringify(st));
    }, [voices, settings]);
    await p.goto(`${B}/?simspeed=${speed}`); await p.waitForTimeout(400);
    return p;
  }
  const ride = async (p, secs) => { await p.click('[data-view="ride"]'); await p.click("#btn-start"); await p.waitForTimeout(secs); await p.click("#btn-end"); await p.waitForTimeout(500); };

  await test("soft start: flat road before the start and in pause, ERG ramps up from 40% FTP", async () => {
    const p = await open({ speed: 10 });
    await p.click("#chip-trainer"); await p.click("#c-sim");
    await p.evaluate(() => { const t = __pedala.S.trainer; window.__cmd = []; const sp = t.setPower.bind(t), sg = t.setGrade.bind(t);
      t.setPower = w => { __cmd.push(Math.round(w)); sp(w); }; t.setGrade = g => { __cmd.push("g" + g); sg(g); }; });
    await p.evaluate(() => setWorkout(allWorkouts().find(w => w.id === "b-ss")));
    assert.equal(await p.evaluate(() => __cmd.at(-1)), "g0", "flat road before the start");
    await p.click("#btn-start"); await p.waitForTimeout(2200);
    const erg = await p.evaluate(() => __cmd.filter(x => typeof x === "number"));
    assert.equal(erg[0], 92, "first ERG target is 40% of 230 W"); assert.ok(erg.at(-1) > erg[0] + 10, "then ramps toward the target");
    await p.evaluate(() => { __sim.stopped = true; }); await p.waitForTimeout(900);
    assert.equal(await p.evaluate(() => __cmd.at(-1)), "g0", "flat road when auto-paused");
    await p.context().close();
  });

  await test("intervals.icu: a saved ride is uploaded with the key from Settings", async () => {
    const p = await open();
    await p.click('[data-view="settings"]'); await p.fill("#icu-key", "goodkey"); await p.click("#btn-icu"); await p.waitForTimeout(600);
    assert.match(await p.textContent("#icu-status"), /Test Rider/);
    await p.click("#chip-trainer"); await p.click("#c-sim"); await ride(p, 1500); await p.click("#sum-save"); await p.waitForTimeout(1500);
    const icu = await p.evaluate(async () => (await dbAll())[0].icu);
    assert.equal(icu.status, "done"); assert.match(icu.activityId, /^i9\d\d$/);
    await p.context().close();
  });

  await test("plan: start, ride today's session, it is ticked off; calendar has 42 events with reminders", async () => {
    const p = await open({ speed: 200 });
    const monday = await p.evaluate(() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); });
    await p.evaluate(m => store.set("plan", { id: PLAN.id, start: m, done: {}, skipped: {}, times: { wk: "18:00", sun: "09:00" }, remind: 120 }), monday);
    const max = await p.evaluate(() => Math.max(...PLAN.weeks.flatMap(w => w.slice(0, 2)).map(k => totalDur(PLAN_WO["p-" + k])))); assert.ok(max <= 1800, "weekday sessions are 30 min at most");
    const today = await p.evaluate(() => planSessions().find(s => s.today));
    const ics = await p.evaluate(() => planIcs());
    assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 42); assert.equal((ics.match(/TRIGGER:-PT120M/g) || []).length, 42);
    if(today){
      await p.evaluate(() => rideSession(planSessions().find(s => s.today)));
      await p.click("#chip-trainer"); await p.click("#c-sim"); await p.click("#btn-start");
      await p.waitForFunction(() => document.querySelector("#dlg-summary").open, null, { timeout: 120000 });
      await p.click("#sum-save"); await p.waitForTimeout(800);
      assert.ok(await p.evaluate(id => !!plan().done[id], today.id), "today's session is done");
    }
    await p.context().close();
  });

  await test("sync: a second device gets the ride and plan progress", async () => {
    const a = await open(), b = await open();
    await a.evaluate(() => syncNow()); await b.evaluate(() => syncNow()); await b.waitForTimeout(800);
    assert.ok(await b.evaluate(async () => (await dbAll()).length) >= 1, "rides arrived");
    assert.ok(await b.evaluate(() => !!plan()), "plan arrived");
    await a.context().close(); await b.context().close();
  });

  await test("voice: everything English without a Croatian voice, Croatian with one; YouTube is turned down while speaking", async () => {
    const en = await open({ voices: [["Samsung English", "en-US"]] });
    await en.click('[data-view="settings"]'); await en.click("#btn-voice-test"); await en.waitForTimeout(300);
    assert.equal((await en.evaluate(() => __spoken))[0], "In 10 seconds: 3 minutes at 265 watts, cadence 90 to 100.");
    await en.evaluate(() => setVideo("dQw4w9WgXcQ")); await en.waitForTimeout(800);
    await en.evaluate(() => say("Test.", true)); await en.waitForTimeout(1200);
    assert.deepEqual(await en.evaluate(() => __rec), ["setVolume(18)", "setVolume(70)"]);
    const hr = await open({ voices: [["Google hrvatski", "hr-HR"], ["Samsung English", "en-US"]] });
    await hr.click('[data-view="settings"]'); await hr.click("#btn-voice-test"); await hr.waitForTimeout(300);
    assert.match((await hr.evaluate(() => __spoken))[0], /^Za 10 sekundi: 3 minute na 265 vata/);
    await en.context().close(); await hr.context().close();
  });

  await test("English: a browser in English gets the whole app in English, Croatian stays for Croatian", async () => {
    const p = await open({ locale: "en-US", speed: 200 });
    const croatian = /[čćžšđ]|\b(je|na|ili|se|za|od|nije|treba|nema|vožnj\w*|trening\w*|Postavke|Spoji|Kreni|Tjedan|Zona|Puls|Kadenca|Brzina|Glazba|Snaga|Vrijeme|Još|Sljedeće)\b/i;
    const visible = () => p.evaluate(() => { const out = [], w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for(let n; (n = w.nextNode());){ const e = n.parentElement; if(e.closest("script,style,[data-notr]") || !e.getClientRects().length) continue; const t = n.nodeValue.trim(); if(t) out.push(t); }
      document.querySelectorAll("[placeholder],[aria-label]").forEach(e => out.push(e.getAttribute("placeholder") || e.getAttribute("aria-label")));
      return out; });
    const left = [];
    const check = async where => { for(const t of await visible()) if(croatian.test(t) && !/^(Učka|Sljeme|Biokovo)/.test(t)) left.push(where + ": " + t); };
    await check("ride");
    for(const v of ["plan", "workouts", "history", "progress", "settings"]){ await p.click(`[data-view="${v}"]`); await p.waitForTimeout(300); await check(v); }
    await p.click('[data-view="plan"]'); if(await p.$("#plan-go")) await p.click("#plan-go"); await p.waitForTimeout(300); await check("plan started");   // the plan may have come from the sync test
    await p.click("#chip-trainer"); await check("connect"); await p.click("#c-sim");
    await p.evaluate(() => setWorkout(allWorkouts().find(w => w.id === "d-hilo"))); await p.click("#btn-start"); await p.waitForTimeout(2500); await check("riding");
    await p.click("#btn-end"); await p.waitForTimeout(1200); await check("summary"); await p.click("#sum-save"); await p.waitForTimeout(600);
    await p.click('[data-view="history"]'); await p.waitForTimeout(300); await p.locator("[data-rep]").first().click(); await p.waitForTimeout(1000); await check("report");
    assert.deepEqual(left, []);
    assert.equal(await p.textContent('[data-view="workouts"]'), "Workouts");
    assert.equal(await p.evaluate(async () => (await dbAll()).sort((a, b) => b.start - a.start)[0].name), "High and low cadence", "ride saved under its English name");
    await p.context().close();
    const hr = await open({ locale: "en-US", settings: { ftp: 230 } });
    assert.equal(await hr.textContent('[data-view="workouts"]'), "Treninzi", "a device that already used Pedala stays Croatian");
    await hr.click('[data-view="settings"]'); await hr.selectOption('[name="uiLang"]', "en"); await hr.waitForLoadState("load"); await hr.waitForTimeout(400);
    assert.equal(await hr.textContent('[data-view="workouts"]'), "Workouts", "switching the language in Settings");
    await hr.context().close();
  });

  await test("Zwift Click v2: the two pods are told apart, + and − both work", async () => {
    const p = await open();
    await p.evaluate(() => {
      const mk = id => { const z = new ZwiftClick(() => {}); z.device = { id, gatt: { connected: true } }; z.kind = "ride"; return z; };
      window.__r = mk("podRIGHT"); window.__l = mk("podLEFT1");
      window.__press = z => { z.frame(Uint8Array.from([0x23, 0x08, 0xdf, 0xff, 0x0f]), false); z.frame(Uint8Array.from([0x23, 0x08, 0xff, 0xff, 0x0f]), false); };
      startCalibration(); __press(__r); __press(__l); S.workout = null; S.gear = 10;
    });
    assert.equal(Object.keys(await p.evaluate(() => settings.clickMap)).length, 2);
    await p.evaluate(() => __press(__r)); await wait(300); await p.evaluate(() => __press(__l)); await wait(300); await p.evaluate(() => __press(__l)); await wait(300);
    assert.equal(await p.evaluate(() => S.gear), 9);
    await p.context().close();
  });

  await test("feed: favourite channel videos and own playlist", async () => {
    srv.setEnv({ YOUTUBE_API_KEY: "AIzaSERVER" });
    const p = await open();
    await p.fill("#feed-ch", "https://www.youtube.com/@bikeworld"); await p.click("#feed-ch-form button"); await p.waitForTimeout(800);
    assert.equal(await p.locator("#feed-ch-videos .vcard").count(), 3);
    await p.fill("#feed-pl", "https://www.youtube.com/playlist?list=PLmine123456"); await p.click("#feed-pl-form button"); await p.waitForTimeout(800);
    assert.equal(await p.locator("#feed-pl-PLmine123456 .vcard").count(), 3, "private video skipped");
    srv.setEnv({ YOUTUBE_API_KEY: null }); await p.context().close();
  });

  await test("phone layout: nothing wider than the screen, the ride view does not scroll", async () => {
    for(const viewport of [{ width: 360, height: 640 }, { width: 384, height: 832 }, { width: 832, height: 384 }]){
      const p = await open({ viewport, mobile: true });
      await p.evaluate(() => setVideo("dQw4w9WgXcQ")); await p.click("#chip-trainer"); await p.click("#c-sim"); await p.click("#btn-start"); await p.waitForTimeout(800);
      const m = await p.evaluate(() => ({ wide: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        scroll: document.querySelector("#view-ride").scrollHeight > document.querySelector("#view-ride").clientHeight + 1,
        over: document.querySelector(".hud").scrollHeight - document.querySelector(".hud").clientHeight }));
      assert.deepEqual(m, { wide: false, scroll: false, over: 0 }, `${viewport.width}x${viewport.height}`);
      await p.context().close();
    }
  });

  await browser.close(); await srv.close();
  if(pageErrors.length) results.push(["FAIL", "no JavaScript errors in the page", new Error(pageErrors.join("; ")), 0]);
  for(const [s, n, e, ms] of results) console.log(`${s === "ok" ? "✓" : "✗"} ${n} (${(ms / 1000).toFixed(1)} s)${e ? "\n    " + e.message : ""}`);
  const failed = results.filter(r => r[0] !== "ok").length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
