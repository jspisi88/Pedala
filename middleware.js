// Vercel Routing Middleware: a login in front of the whole site, api/ included.
// Username is PEDALA_USER (default "jspisic"), password is PEDALA_PASSWORD, both set in
// Vercel → Project → Settings → Environment Variables. Without a password nobody gets in.
// A successful login leaves a signed cookie for a year, so the installed app does not ask again
// after it is closed. Changing PEDALA_PASSWORD logs every device out.
export const config = { matcher: "/:path*" };

/* Chrome fetches these without the login when it installs the app, and they hold nothing private */
const PUBLIC = /^\/(manifest\.webmanifest|sw\.js|icons\/[\w.-]+\.png)$/;
const COOKIE = "pedala_session", YEAR = 365 * 24 * 3600;

export default async function middleware(request){
  const url = new URL(request.url);
  if(PUBLIC.test(url.pathname)) return;
  const user = process.env.PEDALA_USER || "jspisic", pass = process.env.PEDALA_PASSWORD;
  if(!pass) return text("Prijava nije postavljena: na Vercelu dodaj PEDALA_PASSWORD i napravi Redeploy.", 503);
  const token = await sign(user, pass);

  if(url.pathname === "/__login" && request.method === "POST"){
    let f; try{ f = await request.formData(); }catch{ f = new FormData(); }
    const next = safePath(f.get("next")), okUser = same(String(f.get("user") || "").trim(), user), okPass = same(String(f.get("password") || ""), pass);
    if(okUser && okPass) return redirect(next, `${COOKIE}=${token}; Path=/; Max-Age=${YEAR}; HttpOnly; Secure; SameSite=Lax`);
    return redirect(`/__login?e=1&next=${encodeURIComponent(next)}`);
  }
  if(url.pathname === "/__logout") return redirect("/", `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);

  if(same(cookie(request, COOKIE), token)) return url.pathname === "/__login" ? redirect("/") : undefined;   // undefined: carry on to the site

  if(request.method === "GET" && (request.headers.get("accept") || "").includes("text/html")){
    const login = url.pathname === "/__login";
    return loginPage(login ? safePath(url.searchParams.get("next")) : url.pathname + url.search, login && url.searchParams.get("e") === "1");
  }
  return new Response(JSON.stringify({ error: "Potrebna je prijava" }), { status: 401, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

/* session token: HMAC of the username keyed by the password, so a new password invalidates it */
async function sign(user, pass){
  const enc = new TextEncoder(), key = await crypto.subtle.importKey("raw", enc.encode(pass), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode("pedala-session:" + user)));
  return btoa(String.fromCharCode(...mac)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function cookie(request, name){
  for(const part of (request.headers.get("cookie") || "").split(/;\s*/)){ const i = part.indexOf("="); if(part.slice(0, i) === name) return part.slice(i + 1); }
  return "";
}
const safePath = p => typeof p === "string" && p.startsWith("/") && !p.startsWith("//") && !p.startsWith("/__") ? p : "/";
const redirect = (location, setCookie) => new Response(null, { status: 303, headers: { location, "cache-control": "no-store", ...(setCookie ? { "set-cookie": setCookie } : {}) } });
const text = (body, status) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/* compare without leaking how many leading characters matched */
function same(a, b){
  let d = a.length ^ b.length;
  for(let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}

function loginPage(next, failed){
  return new Response(`<!doctype html>
<html lang="hr" translate="no"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#151b26"><title>Pedala · prijava</title>
<link rel="manifest" href="/manifest.webmanifest"><link rel="icon" type="image/png" href="/icons/icon-192.png">
<style>
:root{--bg:#151b26;--panel:#1f2735;--line:#2f3a4d;--text:#e9edf3;--muted:#8b97aa;--z3:#2fbf71;--z6:#e5484d}
*{box-sizing:border-box} html,body{margin:0;height:100%;background:var(--bg);color:var(--text);font:400 16px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
body{display:grid;place-items:center;padding:16px}
form{width:min(360px,100%);background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:24px 22px}
img{width:56px;height:56px;border-radius:14px;display:block;margin-bottom:12px}
h1{font-size:26px;margin:0 0 4px} p{margin:0 0 18px;color:var(--muted)}
label{display:block;font-size:14px;color:var(--muted);margin-bottom:12px}
input{display:block;width:100%;margin-top:5px;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:11px 12px;color:var(--text);font:inherit}
input:focus{outline:2px solid #3d8bfd;outline-offset:1px}
button{width:100%;margin-top:6px;border:0;border-radius:12px;padding:12px;background:var(--text);color:var(--bg);font-family:inherit;font-size:16px;font-weight:600;cursor:pointer}
.err{color:var(--z6);margin:-6px 0 12px;font-size:14px}
</style></head><body>
<form method="post" action="/__login">
  <img src="/icons/icon-192.png" alt="">
  <h1>Pedala</h1><p>Prijavi se. Ovaj uređaj ostaje prijavljen godinu dana.</p>
  ${failed ? '<div class="err" role="alert">Krivo ime ili lozinka.</div>' : ""}
  <input type="hidden" name="next" value="${esc(next)}">
  <label>Korisničko ime<input name="user" autocomplete="username" autocapitalize="none" spellcheck="false" required autofocus></label>
  <label>Lozinka<input name="password" type="password" autocomplete="current-password" required></label>
  <button type="submit">Prijava</button>
</form></body></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
