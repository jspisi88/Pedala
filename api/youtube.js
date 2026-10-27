// Vercel serverless function for YouTube video search, so the API key stays on Vercel
// (YOUTUBE_API_KEY) and never reaches the tablet.
//   GET /api/youtube?q=Stelvio&long=1  -> { items: [{ id, title, channel, thumb, dur }] }
//   501 { error: "noKey" } when YOUTUBE_API_KEY is not set
const YT = "https://www.googleapis.com/youtube/v3";

module.exports = async (req, res) => {
  res.setHeader("cache-control", "no-store");
  const key = process.env.YOUTUBE_API_KEY;
  if(!key) return res.status(501).json({ error: "noKey" });
  const p = new URL(req.url, "http://x").searchParams, q = (p.get("q") || "").trim().slice(0, 200);
  if(!q) return res.status(400).json({ error: "Nema pojma za pretragu" });
  try{
    const s = new URL(YT + "/search");
    Object.entries({ part: "snippet", type: "video", maxResults: 24, videoEmbeddable: "true", q, key }).forEach(([k, v]) => s.searchParams.set(k, v));
    if(p.get("long") === "1") s.searchParams.set("videoDuration", "long");
    const r = await fetch(s), j = await r.json();
    if(!r.ok) return res.status(r.status).json({ error: [j.error?.errors?.[0]?.reason, j.error?.message].filter(Boolean).join(": ") || String(r.status) });
    const items = (j.items || []).filter(i => i.id?.videoId), durs = {};
    if(items.length){
      const v = new URL(YT + "/videos");
      v.searchParams.set("part", "contentDetails"); v.searchParams.set("id", items.map(i => i.id.videoId).join(",")); v.searchParams.set("key", key);
      try{ const jr = await (await fetch(v)).json(); (jr.items || []).forEach(x => durs[x.id] = isoDur(x.contentDetails?.duration)); }catch{}
    }
    return res.status(200).json({ items: items.map(i => ({ id: i.id.videoId, title: i.snippet.title, channel: i.snippet.channelTitle,
      thumb: i.snippet.thumbnails?.medium?.url, dur: durs[i.id.videoId] || 0 })) });
  }catch(e){
    return res.status(502).json({ error: "Failed to fetch: " + e.message });
  }
};

function isoDur(d){ const m = String(d).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/); return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0; }
