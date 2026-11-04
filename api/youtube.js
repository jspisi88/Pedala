// Vercel serverless function for YouTube, so the API key stays on Vercel (YOUTUBE_API_KEY) and never
// reaches the tablet.
//   GET /api/youtube?q=Stelvio&long=1      -> { items: [{ id, title, channel, thumb, dur }] }      search (100 units)
//   GET /api/youtube?q=techno&music=1      -> same, music videos only
//   GET /api/youtube?channel=<link|@name>  -> { id, title, thumb, uploads }                          (1 unit, a name without @ costs 100)
//   GET /api/youtube?playlist=<link|id>    -> { id, title, items: [{ id, title, channel, thumb, dur, published }] }   (3 units)
//   501 { error: "noKey" } when YOUTUBE_API_KEY is not set
const YT = "https://www.googleapis.com/youtube/v3";

module.exports = async (req, res) => {
  res.setHeader("cache-control", "no-store");
  const key = process.env.YOUTUBE_API_KEY;
  if(!key) return res.status(501).json({ error: "noKey" });
  const p = new URL(req.url, "http://x").searchParams, q = (p.get("q") || "").trim().slice(0, 200);
  const api = async (path, params) => {
    const u = new URL(YT + path); Object.entries({ ...params, key }).forEach(([k, v]) => u.searchParams.set(k, v));
    const r = await fetch(u), j = await r.json();
    if(!r.ok){ const e = new Error([j.error?.errors?.[0]?.reason, j.error?.message].filter(Boolean).join(": ") || String(r.status)); e.status = r.status; throw e; }
    return j;
  };
  const durations = async ids => { const d = {}; if(ids.length) try{ (await api("/videos", { part: "contentDetails", id: ids.join(",") })).items?.forEach(x => d[x.id] = isoDur(x.contentDetails?.duration)); }catch{} return d; };
  try{
    if(p.get("channel")){
      const c = await resolveChannel(api, p.get("channel").trim());
      return c ? res.status(200).json(c) : res.status(404).json({ error: "Kanal nije pronađen" });
    }
    if(p.get("playlist")){
      const t = p.get("playlist").trim(), id = (t.match(/[?&]list=([\w-]+)/) || t.match(/^([\w-]{10,})$/) || [])[1];
      if(!id) return res.status(400).json({ error: "To nije link playliste" });
      const [info, list] = await Promise.all([
        id.startsWith("UU") ? Promise.resolve(null) : api("/playlists", { part: "snippet", id }),
        api("/playlistItems", { part: "snippet,contentDetails", playlistId: id, maxResults: 25 })]);
      if(info && !info.items?.length) return res.status(404).json({ error: "Playlista nije pronađena ili je privatna" });
      const items = (list.items || []).filter(i => i.contentDetails?.videoId && !/^(Private|Deleted) video$/.test(i.snippet?.title));
      const d = await durations(items.map(i => i.contentDetails.videoId));
      return res.status(200).json({ id, title: info?.items[0].snippet.title || "", items: items.map(i => ({ id: i.contentDetails.videoId, title: i.snippet.title,
        channel: i.snippet.videoOwnerChannelTitle || "", thumb: i.snippet.thumbnails?.medium?.url, dur: d[i.contentDetails.videoId] || 0,
        published: i.contentDetails.videoPublishedAt || i.snippet.publishedAt })) });
    }
    if(!q) return res.status(400).json({ error: "Nema pojma za pretragu" });
    const params = { part: "snippet", type: "video", maxResults: 24, videoEmbeddable: "true", q };
    if(p.get("long") === "1") params.videoDuration = "long";
    if(p.get("music") === "1") params.videoCategoryId = "10";   // Music
    const items = ((await api("/search", params)).items || []).filter(i => i.id?.videoId), d = await durations(items.map(i => i.id.videoId));
    return res.status(200).json({ items: items.map(i => ({ id: i.id.videoId, title: i.snippet.title, channel: i.snippet.channelTitle,
      thumb: i.snippet.thumbnails?.medium?.url, dur: d[i.id.videoId] || 0 })) });
  }catch(e){
    return res.status(e.status && e.status < 500 ? e.status : 502).json({ error: e.status ? e.message : "Failed to fetch: " + e.message });
  }
};

/* channel link (/channel/UC…, /@handle, /user/name, /c/name), @handle, UC id or a plain name */
async function resolveChannel(api, t){
  const byId = t.match(/(UC[\w-]{22})/), handle = t.match(/@([\w.-]+)/), user = t.match(/\/user\/([\w.-]+)/);
  let params;
  if(byId) params = { id: byId[1] };
  else if(handle) params = { forHandle: "@" + handle[1] };
  else if(user) params = { forUsername: user[1] };
  else{
    const name = (t.match(/\/c\/([^/?#]+)/) || [, t])[1];
    const found = (await api("/search", { part: "snippet", type: "channel", maxResults: 1, q: decodeURIComponent(name) })).items?.[0];
    if(!found) return null;
    params = { id: found.id.channelId };
  }
  const c = (await api("/channels", { part: "snippet,contentDetails", ...params })).items?.[0];
  return c ? { id: c.id, title: c.snippet.title, thumb: c.snippet.thumbnails?.default?.url, uploads: c.contentDetails?.relatedPlaylists?.uploads } : null;
}

function isoDur(d){ const m = String(d).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/); return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0; }
