// Vercel serverless function for Strava. It holds the client secret, so the
// secret never reaches the tablet. The app calls it for OAuth tokens and uploads.
//   GET  /api/strava                                   -> { clientId }
//   POST /api/strava { action: "token", code }         -> Strava token response
//   POST /api/strava { action: "refresh", refresh_token }
//   POST /api/strava { action: "deauthorize", token }
//   POST /api/strava { action: "upload", token, fit (base64), name, description, external_id }
//   POST /api/strava { action: "status", token, uploadId }
const STRAVA = "https://www.strava.com";

module.exports = async (req, res) => {
  const id = process.env.STRAVA_CLIENT_ID, secret = process.env.STRAVA_CLIENT_SECRET;
  res.setHeader("cache-control", "no-store");
  if(!id || !secret) return res.status(500).json({ error: "Na Vercelu nisu postavljeni STRAVA_CLIENT_ID i STRAVA_CLIENT_SECRET" });
  if(req.method === "GET") return res.status(200).json({ clientId: id });
  if(req.method !== "POST") return res.status(405).json({ error: "Dozvoljeni su samo GET i POST" });

  let b = req.body || {};
  if(typeof b === "string"){ try{ b = JSON.parse(b); }catch{ return res.status(400).json({ error: "Neispravan JSON" }); } }
  const auth = { Authorization: `Bearer ${b.token}` };
  try{
    switch(b.action){
      case "token":
        return relay(res, await form("/oauth/token", { client_id: id, client_secret: secret, code: b.code, grant_type: "authorization_code" }));
      case "refresh":
        return relay(res, await form("/oauth/token", { client_id: id, client_secret: secret, refresh_token: b.refresh_token, grant_type: "refresh_token" }));
      case "deauthorize":
        return relay(res, await form("/oauth/deauthorize", { access_token: b.token }));
      case "upload": {
        if(!b.fit) return res.status(400).json({ error: "Nema FIT datoteke" });
        const fd = new FormData();
        fd.append("file", new Blob([Buffer.from(b.fit, "base64")], { type: "application/vnd.ant.fit" }), "pedala.fit");
        fd.append("data_type", "fit");
        fd.append("trainer", "1");
        for(const k of ["name", "description", "external_id"]) if(b[k]) fd.append(k, String(b[k]));
        return relay(res, await fetch(`${STRAVA}/api/v3/uploads`, { method: "POST", headers: auth, body: fd }));
      }
      case "status":
        return relay(res, await fetch(`${STRAVA}/api/v3/uploads/${encodeURIComponent(b.uploadId)}`, { headers: auth }));
      default:
        return res.status(400).json({ error: "Nepoznata akcija" });
    }
  }catch(e){
    return res.status(502).json({ error: "Strava nije dostupna: " + e.message });
  }
};

const form = (path, data) => fetch(STRAVA + path, { method: "POST", body: new URLSearchParams(data) });

/* pass Strava's answer through, with a readable "error" field on failures */
async function relay(res, r){
  let j; try{ j = await r.json(); }catch{ j = {}; }
  if(!r.ok && !j.error) j.error = j.message || `Strava je vratila ${r.status}`;
  return res.status(r.status).json(j);
}
