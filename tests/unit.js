// Unit tests for the server parts: login middleware and api/sync.js (with an in-memory Vercel Blob).
// Run: npm test   (or: node tests/unit.js)
const assert = require("node:assert/strict");
const path = require("path");
const { pathToFileURL } = require("url");

const results = [];
async function test(name, fn){ try{ await fn(); results.push(["ok", name]); }catch(e){ results.push(["FAIL", name, e]); } }

(async () => {
  /* ---------- middleware.js ---------- */
  const { default: mw } = await import(pathToFileURL(path.join(__dirname, "..", "middleware.js")).href);
  const req = (p, init = {}) => new Request("https://pedala.example" + p, init);
  process.env.PEDALA_USER = "rider"; process.env.PEDALA_PASSWORD = "Tajna-šifra 1";

  await test("middleware: install files are public", async () => {
    for(const p of ["/manifest.webmanifest", "/sw.js", "/icons/icon-192.png"]) assert.equal(await mw(req(p)), undefined, p);
  });
  await test("middleware: pages show the login form, api answers 401", async () => {
    const page = await mw(req("/", { headers: { accept: "text/html" } }));
    assert.equal(page.status, 200); assert.match(await page.text(), /action="\/__login"/);
    assert.equal((await mw(req("/api/intervals"))).status, 401);
    assert.equal((await mw(req("/icons/../index.html", { headers: { accept: "text/html" } }))).status, 200);   // normalized to /index.html: login form
  });
  let cookie;
  await test("middleware: wrong password is refused, right one sets a year-long cookie", async () => {
    const post = body => mw(req("/__login", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body }));
    assert.match((await post("user=rider&password=nope&next=/")).headers.get("location"), /e=1/);
    const ok = await post("user=rider&password=" + encodeURIComponent("Tajna-šifra 1") + "&next=/plan");
    assert.equal(ok.headers.get("location"), "/plan");
    cookie = ok.headers.get("set-cookie"); assert.match(cookie, /Max-Age=31536000/); assert.match(cookie, /HttpOnly/);
    assert.equal((await post("user=rider&password=" + encodeURIComponent("Tajna-šifra 1") + "&next=//evil.example")).headers.get("location"), "/");
  });
  await test("middleware: the cookie lets requests through until the password changes", async () => {
    const withCookie = () => mw(req("/api/sync", { headers: { cookie: cookie.split(";")[0] } }));
    assert.equal(await withCookie(), undefined);
    process.env.PEDALA_PASSWORD = "nova"; assert.equal((await withCookie()).status, 401);
    process.env.PEDALA_PASSWORD = "Tajna-šifra 1";
  });
  await test("middleware: without PEDALA_PASSWORD nobody gets in", async () => {
    const saved = process.env.PEDALA_PASSWORD; delete process.env.PEDALA_PASSWORD;
    assert.equal((await mw(req("/"))).status, 503); process.env.PEDALA_PASSWORD = saved;
  });

  /* ---------- api/sync.js ---------- */
  const blob = require("@vercel/blob"), store = new Map();
  blob.put = async (p, body) => { store.set(p, { url: "mem://" + p, pathname: p, body, uploadedAt: new Date() }); return { url: "mem://" + p }; };
  blob.get = async p => store.has(p) ? { statusCode: 200, stream: new Response(store.get(p).body).body } : null;
  blob.list = async ({ prefix }) => ({ blobs: [...store.values()].filter(b => b.pathname.startsWith(prefix)), hasMore: false });
  blob.del = async urls => { for(const u of [].concat(urls)) store.delete(String(u).replace("mem://", "")); };
  process.env.BLOB_READ_WRITE_TOKEN = "test";
  const sync = require("../api/sync.js");
  const call = async (method, url, body) => { let out; await sync({ method, url, body }, { setHeader(){}, status(c){ this.c = c; return this; }, json(o){ out = { status: this.c, body: o }; } }); return out; };
  const ride = id => ({ id, start: 1, name: "X", m: { tss: 1 }, samples: [[1, 100]] });

  await test("sync: rides go up and come back", async () => {
    assert.equal((await call("POST", "/api/sync", { action: "ride", ride: ride("r-1") })).status, 200);
    assert.equal((await call("POST", "/api/sync", { action: "ride", ride: ride("r-2") })).status, 200);
    assert.equal((await call("GET", "/api/sync?ride=r-1")).body.id, "r-1");
    assert.equal((await call("GET", "/api/sync?ride=none")).status, 404);
  });
  await test("sync: plan progress from two devices is merged, newer settings win", async () => {
    const plan = (at, done) => ({ at, data: { id: "odrzivi14", start: "2026-11-09", done, skipped: {} } });
    await call("POST", "/api/sync", { action: "state", sections: { plan: plan(100, { "w1-tue": "r-1" }), settings: { at: 100, data: { ftp: 160 } } } });
    const m = (await call("POST", "/api/sync", { action: "state", sections: { plan: plan(200, { "w1-thu": "r-2" }), settings: { at: 300, data: { ftp: 165 } } } })).body;
    assert.deepEqual(Object.keys(m.sections.plan.data.done).sort(), ["w1-thu", "w1-tue"]);
    assert.equal(m.sections.settings.data.ftp, 165);
    const stale = (await call("POST", "/api/sync", { action: "state", sections: { settings: { at: 50, data: { ftp: 999 } } } })).body;
    assert.equal(stale.sections.settings.data.ftp, 165);
  });
  await test("sync: a deleted ride is removed everywhere", async () => {
    const m = (await call("POST", "/api/sync", { action: "state", sections: {}, deleted: ["r-2"] })).body;
    assert.deepEqual(m.rides, ["r-1"]); assert.ok(!store.has("rides/r-2.json"));
  });
  await test("sync: without a Blob token it reports 501", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN; assert.equal((await call("GET", "/api/sync")).status, 501); process.env.BLOB_READ_WRITE_TOKEN = "test";
  });

  for(const [s, n, e] of results) console.log(`${s === "ok" ? "✓" : "✗"} ${n}${e ? "\n    " + e.message : ""}`);
  const failed = results.filter(r => r[0] !== "ok").length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
