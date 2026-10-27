// Vercel serverless function that forwards requests to intervals.icu, so the app does not
// depend on intervals.icu allowing cross-origin calls from the browser.
// The API key is INTERVALS_API_KEY on Vercel when set, otherwise the one the app sends from Settings.
//   GET  /api/intervals                              -> { serverKey: true | false }
//   POST /api/intervals { action: "athlete", key }  -> { id, name }
//   POST /api/intervals { action: "upload", key, fit (base64), name, description, external_id }  -> { id, created }
const ICU = "https://intervals.icu/api/v1/athlete/0";   // 0 = the athlete who owns the key

module.exports = async (req, res) => {
  res.setHeader("cache-control", "no-store");
  const serverKey = process.env.INTERVALS_API_KEY;
  if(req.method === "GET") return res.status(200).json({ serverKey: !!serverKey });
  if(req.method !== "POST") return res.status(405).json({ error: "Dozvoljeni su samo GET i POST" });
  let b = req.body || {};
  if(typeof b === "string"){ try{ b = JSON.parse(b); }catch{ return res.status(400).json({ error: "Neispravan JSON" }); } }
  const key = serverKey || b.key;
  if(!key) return res.status(401).json({ error: "Nema API ključa" });
  const auth = { Authorization: "Basic " + Buffer.from("API_KEY:" + key).toString("base64") };
  try{
    if(b.action === "athlete"){
      const r = await fetch(ICU, { headers: auth }), j = await body(r);
      if(!r.ok) return fail(res, r, j);
      return res.status(200).json({ id: j.id, name: j.name || [j.firstname, j.lastname].filter(Boolean).join(" ") });
    }
    if(b.action === "upload"){
      if(!b.fit) return res.status(400).json({ error: "Nema FIT datoteke" });
      const u = new URL(ICU + "/activities");
      for(const k of ["name", "description", "external_id"]) if(b[k]) u.searchParams.set(k, String(b[k]));
      const fd = new FormData();
      fd.append("file", new Blob([Buffer.from(b.fit, "base64")], { type: "application/vnd.ant.fit" }), "pedala.fit");
      const r = await fetch(u, { method: "POST", headers: auth, body: fd }), j = await body(r);
      if(!r.ok) return fail(res, r, j);
      // 201 = created, 200 = same file was already there; both answer with [{ icu_athlete_id, id }]
      const a = Array.isArray(j) ? j[0] : j.activities?.[0] || j;
      return res.status(200).json({ id: a?.id ?? null, created: r.status === 201 });
    }
    return res.status(400).json({ error: "Nepoznata akcija" });
  }catch(e){
    return res.status(502).json({ error: "intervals.icu nije dostupan: " + e.message });
  }
};

async function body(r){ const t = await r.text(); try{ return JSON.parse(t); }catch{ return { error: t.slice(0, 200) }; } }
const fail = (res, r, j) => res.status(r.status).json({ error: j.error || j.message || `intervals.icu je vratio ${r.status}` });
