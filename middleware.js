// Vercel Routing Middleware: HTTP Basic Auth in front of the whole site, api/ included.
// Username is PEDALA_USER (default "jspisic"), password is PEDALA_PASSWORD, both set in
// Vercel → Project → Settings → Environment Variables. Without a password nobody gets in.
export const config = { matcher: "/:path*" };

/* Chrome fetches these without the login when it installs the app, and they hold nothing private */
const PUBLIC = /^\/(manifest\.webmanifest|sw\.js|icons\/[\w.-]+\.png)$/;

export default function middleware(request){
  if(PUBLIC.test(new URL(request.url).pathname)) return;
  const user = process.env.PEDALA_USER || "jspisic", pass = process.env.PEDALA_PASSWORD;
  if(!pass) return new Response("Prijava nije postavljena: na Vercelu dodaj PEDALA_PASSWORD i napravi Redeploy.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
  const [scheme, encoded] = (request.headers.get("authorization") || "").split(" ");
  if(scheme === "Basic" && encoded){
    let given = ""; try{ given = new TextDecoder().decode(Uint8Array.from(atob(encoded), c => c.charCodeAt(0))); }catch{}
    if(same(given, `${user}:${pass}`)) return;   // nothing returned: the request continues to the site
  }
  return new Response("Potrebna je prijava.", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Pedala", charset="UTF-8"', "content-type": "text/plain; charset=utf-8" } });
}

/* compare without leaking how many leading characters matched */
function same(a, b){
  let d = a.length ^ b.length;
  for(let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}
