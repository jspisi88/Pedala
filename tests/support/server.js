// Local stand-in for Vercel used by the tests: serves the app and runs the real api/*.js functions,
// with intervals.icu, the YouTube Data API and Vercel Blob replaced by small in-memory fakes.
const http = require("http"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", "..");

const log = [];
let uploads = 0; const seenFit = new Map();
const GOOD_ICU = "Basic " + Buffer.from("API_KEY:goodkey").toString("base64");
const realFetch = global.fetch;
const J = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

global.fetch = async (url, opt = {}) => {
  url = String(url);
  if(url.startsWith("https://www.googleapis.com")) return fakeYouTube(new URL(url));
  if(url.startsWith("https://intervals.icu")) return fakeIntervals(new URL(url), opt);
  return realFetch(url, opt);
};

function fakeYouTube(u){
  const P = u.pathname, q = k => u.searchParams.get(k);
  log.push(`yt ${P} cat=${q("videoCategoryId")}`);
  if(q("key") !== "AIzaSERVER") return J({ error: { errors: [{ reason: "keyInvalid" }], message: "API key not valid" } }, 400);
  if(P.endsWith("/search") && q("type") === "channel") return J({ items: [{ id: { channelId: "UCxxxxxxxxxxxxxxxxxxxxx2" } }] });
  if(P.endsWith("/channels")){
    const id = q("id") || (q("forHandle") === "@bikeworld" ? "UCxxxxxxxxxxxxxxxxxxxxx1" : null);
    if(!id) return J({ items: [] });
    return J({ items: [{ id, snippet: { title: id.endsWith("1") ? "Bike World" : "Ride Channel", thumbnails: { default: { url: "" } } }, contentDetails: { relatedPlaylists: { uploads: "UU" + id.slice(2) } } }] });
  }
  if(P.endsWith("/playlists")) return J({ items: q("id") === "PLmine123456" ? [{ snippet: { title: "Indoor rides" } }] : [] });
  if(P.endsWith("/playlistItems")){
    const pl = q("playlistId");
    return J({ items: [1, 2, 3, 4].map(i => ({ snippet: { title: i === 4 ? "Private video" : `${pl} video ${i}`, videoOwnerChannelTitle: "Owner", thumbnails: { medium: { url: "" } } },
      contentDetails: { videoId: (pl + "v" + i).slice(-11).padStart(11, "x"), videoPublishedAt: `2026-1${pl.endsWith("1") ? 0 : 1}-0${i}T10:00:00Z` } })) });
  }
  if(P.endsWith("/search")) return J({ items: [1, 2, 3].map(i => ({ id: { videoId: "vid0000000" + i }, snippet: { title: "Stelvio ride " + i, channelTitle: "Channel", thumbnails: { medium: { url: "" } } } })) });
  return J({ items: [1, 2, 3].map(i => ({ id: "vid0000000" + i, contentDetails: { duration: "PT1H2M" } })) });
}

async function fakeIntervals(u, opt){
  if((opt.headers || {}).Authorization !== GOOD_ICU) return new Response("Access denied", { status: 403 });
  if(u.pathname === "/api/v1/athlete/0" && !opt.method) return J({ id: "i12345", name: "Test Rider" });
  if(u.pathname === "/api/v1/athlete/0/activities" && opt.method === "POST"){
    const buf = new Uint8Array(await opt.body.get("file").arrayBuffer());
    if(String.fromCharCode(...buf.slice(8, 12)) !== ".FIT") return J({ error: "bad file" }, 422);
    const h = Buffer.from(buf).toString("base64");
    log.push(`upload ${u.searchParams.get("name")} ${buf.length} B`);
    if(seenFit.has(h)) return J([{ icu_athlete_id: "i12345", id: seenFit.get(h) }], 200);
    const id = "i" + (900 + ++uploads); seenFit.set(h, id); return J([{ icu_athlete_id: "i12345", id }], 201);
  }
  return J({ error: "not found" }, 404);
}

/* Vercel Blob, private store, in memory */
const blob = require("@vercel/blob"), blobs = new Map();
blob.put = async (pathname, body) => { blobs.set(pathname, { url: "mem://" + pathname, pathname, body, uploadedAt: new Date() }); return { url: "mem://" + pathname, pathname }; };
blob.get = async p => blobs.has(p) ? { statusCode: 200, stream: new Response(blobs.get(p).body).body } : null;
blob.list = async ({ prefix }) => ({ blobs: [...blobs.values()].filter(b => b.pathname.startsWith(prefix)), hasMore: false });
blob.del = async urls => { for(const u of [].concat(urls)) blobs.delete(String(u).replace("mem://", "")); };
process.env.BLOB_READ_WRITE_TOKEN = "test";

const api = { intervals: require("../../api/intervals.js"), youtube: require("../../api/youtube.js"), sync: require("../../api/sync.js") };
const TYPES = { ".png": "image/png", ".js": "text/javascript", ".webmanifest": "application/manifest+json", ".html": "text/html; charset=utf-8" };

function start(port = 0){
  const server = http.createServer(async (req, res) => {
    res.status = c => { res.statusCode = c; return res; };
    res.json = o => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(o)); return res; };
    const name = req.url.match(/^\/api\/(\w+)/)?.[1];
    if(name && api[name]){
      let raw = ""; for await (const c of req) raw += c;
      req.body = (req.headers["content-type"] || "").includes("json") && raw ? JSON.parse(raw) : raw;
      return api[name](req, res);
    }
    if(req.url.startsWith("/api/")){ res.statusCode = 404; return res.end("not found"); }
    const file = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
    if(req.url !== "/" && file.startsWith(ROOT + path.sep) && !file.includes("node_modules") && fs.existsSync(file) && fs.statSync(file).isFile()){
      res.setHeader("content-type", TYPES[path.extname(file)] || "application/octet-stream"); return res.end(fs.readFileSync(file));
    }
    res.setHeader("content-type", TYPES[".html"]); res.end(fs.readFileSync(path.join(ROOT, "index.html")));
  });
  return new Promise(resolve => server.listen(port, () => resolve({
    url: `http://localhost:${server.address().port}`, log, blobs,
    setEnv(vars){ for(const [k, v] of Object.entries(vars)) v == null ? delete process.env[k] : process.env[k] = v; },
    close: () => new Promise(r => server.close(r)),
  })));
}
module.exports = { start };
if(require.main === module) start(+process.env.PORT || 8765).then(s => console.log("Pedala test server on " + s.url));
