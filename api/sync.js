// Vercel serverless function: keeps rides, the training plan and settings in Vercel Blob so the
// phone and the tablet see the same data. It sits behind the same login as the app (middleware.js).
// Needs BLOB_READ_WRITE_TOKEN, which Vercel adds when a Blob store is connected to the project.
//
//   POST /api/sync { action: "state", sections: { key: { at, data } }, deleted: [rideId] }
//        -> { sections, deleted, rides: [rideId] }   merged state, newest section wins, plan progress is merged
//   POST /api/sync { action: "ride", ride }           -> { ok: true }   stores one ride
//   GET  /api/sync?ride=<id>                           -> ride JSON
//   GET  /api/sync                                     -> { ok: true } when storage is set up, 501 when not
//
// Blobs: state.json, rides/<id>.json. They are private when the store allows it, otherwise public with an
// unguessable name; their URLs never leave this function.
const blob = require("@vercel/blob");

let access = process.env.PEDALA_BLOB_ACCESS || "private";

module.exports = async (req, res) => {
  res.setHeader("cache-control", "no-store");
  if(!process.env.BLOB_READ_WRITE_TOKEN) return res.status(501).json({ error: "noBlob" });
  try{
    if(req.method === "GET"){
      const id = new URL(req.url, "http://x").searchParams.get("ride");
      if(!id) return res.status(200).json({ ok: true });
      const ride = await readJson(`rides/${safeId(id)}.json`);
      return ride ? res.status(200).json(ride) : res.status(404).json({ error: "Nema te vožnje" });
    }
    if(req.method !== "POST") return res.status(405).json({ error: "Dozvoljeni su samo GET i POST" });
    let b = req.body || {};
    if(typeof b === "string"){ try{ b = JSON.parse(b); }catch{ return res.status(400).json({ error: "Neispravan JSON" }); } }

    if(b.action === "ride"){
      const r = b.ride;
      if(!r?.id || !r.m || !Array.isArray(r.samples)) return res.status(400).json({ error: "Neispravna vožnja" });
      await writeJson(`rides/${safeId(r.id)}.json`, r);
      return res.status(200).json({ ok: true });
    }

    if(b.action === "state"){
      const cur = (await readJson("state.json")) || { sections: {}, deleted: [] };
      const merged = mergeState(cur, { sections: b.sections || {}, deleted: b.deleted || [] });
      if(JSON.stringify(merged) !== JSON.stringify(cur)) await writeJson("state.json", merged);
      const ids = await rideIds();
      const gone = ids.filter(id => merged.deleted.includes(id));
      if(gone.length){ const urls = (await Promise.all(gone.map(id => urlsOf(`rides/${id}.json`)))).flat(); if(urls.length) await blob.del(urls); }
      return res.status(200).json({ ...merged, rides: ids.filter(id => !merged.deleted.includes(id)) });
    }
    return res.status(400).json({ error: "Nepoznata akcija" });
  }catch(e){
    return res.status(502).json({ error: "Spremište nije dostupno: " + e.message });
  }
};

/* newest section wins; plan progress (done/skipped) from both sides is kept when it is the same plan */
function mergeState(a, b){
  const out = { sections: { ...a.sections }, deleted: [...new Set([...(a.deleted || []), ...(b.deleted || [])])].slice(-2000) };
  for(const [k, s] of Object.entries(b.sections)){
    if(!s || typeof s.at !== "number") continue;
    const old = out.sections[k];
    const newer = !old || s.at > old.at ? s : old, other = newer === s ? old : s;
    out.sections[k] = k === "plan" && other?.data && newer.data && samePlan(newer.data, other.data)
      ? { at: newer.at, data: { ...newer.data, done: { ...other.data.done, ...newer.data.done }, skipped: { ...other.data.skipped, ...newer.data.skipped } } }
      : newer;
  }
  return out;
}
const samePlan = (x, y) => x.id === y.id && x.start === y.start;
const safeId = id => String(id).replace(/[^\w.-]/g, "").slice(0, 80);

/* --- blob helpers: private when possible, public otherwise --- */
async function withAccess(fn){
  try{ return await fn(access); }
  catch(e){
    if(access === "private" && /access|private|public/i.test(e.message)){ access = "public"; return fn(access); }
    throw e;
  }
}
async function writeJson(pathname, data){
  const body = JSON.stringify(data);
  const put = await withAccess(a => blob.put(pathname, body, { access: a, contentType: "application/json", allowOverwrite: true, addRandomSuffix: a === "public", cacheControlMaxAge: 60 }));
  if(access === "public"){ const old = (await urlsOf(pathname)).filter(u => u !== put.url); if(old.length) await blob.del(old); }   // keep only the newest copy
  return put;
}
async function readJson(pathname){
  if(access === "private"){
    try{
      const r = await blob.get(pathname, { access: "private", useCache: false });
      if(!r || r.statusCode !== 200) return null;
      return JSON.parse(await new Response(r.stream).text());
    }catch(e){ if(!/access|private|public/i.test(e.message)) throw e; access = "public"; }
  }
  const url = await urlOf(pathname); if(!url) return null;
  const r = await fetch(url, { cache: "no-store" }); return r.ok ? r.json() : null;
}
/* every stored copy of a pathname, newest first (public blobs carry a random suffix: rides/<id>-<suffix>.json) */
async function urlsOf(pathname){
  const base = pathname.replace(/\.json$/, ""), suffixed = new RegExp("^" + base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "-[A-Za-z0-9]{20,}\\.json$");
  const found = (await listAll(base)).filter(x => x.pathname === pathname || suffixed.test(x.pathname));
  return found.sort((x, y) => new Date(y.uploadedAt) - new Date(x.uploadedAt)).map(x => x.url);
}
const urlOf = async pathname => (await urlsOf(pathname))[0] || null;
async function listAll(prefix){
  const all = []; let cursor;
  do{ const r = await blob.list({ prefix, cursor, limit: 1000 }); all.push(...r.blobs); cursor = r.hasMore ? r.cursor : null; }while(cursor);
  return all;
}
async function rideIds(){
  const ids = (await listAll("rides/")).map(x => x.pathname.slice(6).replace(/\.json$/, "").replace(/-[A-Za-z0-9]{20,}$/, ""));
  return [...new Set(ids)];
}
