// The one route the pages do not ask of api.rongrongwu.com directly: /api/<route>, on the
// site's own origin. It is a Cloudflare Pages Function — Cloudflare Pages looks for a
// functions/ directory beside the pages and serves every file in it as a route — so this
// file, at functions/api/[[path]].js, answers each /api/... call a page script makes, at
// whatever hostname the project is being served from, and hands it on to the API.
//
// Why it is here — the session cookie, and the site the browser believes it is on:
//
//   POST /login answers with
//       set-cookie: session_id=...; HttpOnly; SameSite=lax; Secure
//   (read live; POST /logout shows the same cookie being cleared with Max-Age=0). The cookie
//   carries no Domain and so is host-only on api.rongrongwu.com, and SameSite=lax means a
//   browser stores it, and sends it back, only when the page asking is on the same *site* as
//   the API — rongrongwu.com. Served from mis.rongrongwu.com or rongrongwu.com the app was
//   therefore fine; served from www.bonurabank.ca it was not, because bonurabank.ca and
//   rongrongwu.com are different sites: the login's Set-Cookie was refused as third-party
//   and every protected read answered 401 {"detail": "Not logged in"} — the admin could see
//   session_id in the browser's cookie list, yet no request from the page carried it.
//
//   So the pages ask for the API on their own origin, and this Function passes the call on:
//   /api/<route> is fetched from https://api.rongrongwu.com/<route> with the same method,
//   the same headers (the browser's own Cookie among them) and the same body, and the API's
//   answer is returned as it stands — status, headers and Set-Cookie included. Seen from the
//   browser the whole exchange is first-party: the cookie is stored for the page's hostname
//   and rides on every /api call, while the API still receives exactly the requests it
//   received before, nothing but the hostname in front of it having changed. The API's own
//   CORS answers are no longer involved either: same-origin requests are never preflighted
//   and raise no Access-Control-* question.
//
//   apibase.js is the other half of this: it is the API_ORIGIN every page script builds its
//   route from — '/api' on the deployed site, and the API itself only when the page was
//   opened from disk or from a local server, where no Function stands in front of anything.
//
// Nothing else about a call is touched — route, query string, method, headers and body all
// travel as they were sent — so the pages' own descriptions of them (every "POST /remove",
// "GET /gettransactions?student=" comment in the scripts) still name the request that is
// really made of the API.
const API_ORIGIN = 'https://api.rongrongwu.com';

// Headers that describe the one hop between the browser and this Function, and so must not
// be carried into the next one: a connection and its keep-alive, a transfer encoding, a
// trailer, an upgrade, a proxy's credentials. `host` is here for the other direction of the
// same reason — the runtime writes it from the URL being fetched, and a forwarded one would
// name this site instead of the API.
const HOP_BY_HOP_HEADERS = [
    'host',
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade'
];

// The response headers that need more care than the rest. Set-Cookie is the one header a
// Headers object cannot hand back as a single line, because the several cookies it may carry
// have to stay apart — and because a cookie's own Expires carries the commas a joined line
// would be split on. So the cookies are read with the runtime's own accessor, getAll(), the
// method the Workers Headers object keeps precisely for this header, with the standard
// getSetCookie() as the fallback where that spelling is the one available — and any
// Set-Cookie the plain iteration below has already brought along is skipped, so the login's
// session cookie is handed over exactly once, and never as one comma-joined line.
function cookiesIn(headers) {
    if (typeof headers.getAll === 'function') {
        return headers.getAll('Set-Cookie');
    }

    return typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
}

export async function onRequest(context) {
    const { request, params } = context;

    // /api/remove -> https://api.rongrongwu.com/remove, /api/reasons/job-salaries ->
    // /reasons/job-salaries, and the query string with them: every route the app asks for is
    // one the API already answers, so the path is passed on as it arrived, segment by
    // segment (a segment that arrived escaped is escaped again).
    const route = (params.path ?? []).map((segment) => encodeURIComponent(segment)).join('/');
    const target = new URL(route ? `${API_ORIGIN}/${route}` : `${API_ORIGIN}/`);
    target.search = new URL(request.url).search;

    const headers = new Headers(request.headers);

    for (const name of HOP_BY_HOP_HEADERS) {
        headers.delete(name);
    }

    const call = {
        method: request.method,
        headers,
        // A redirect of the API's own (it has one on /docs) is an answer like any other, so
        // it is handed back rather than followed from here.
        redirect: 'manual'
    };

    // GET and HEAD cannot carry a body, and handing one over is an error rather than a
    // no-op. Everything else travels just as the browser sent it — FormData and JSON both,
    // read as the stream it arrived as, so a large body is never held here in memory.
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        call.body = request.body;
    }

    let answer;

    try {
        answer = await fetch(target, call);
    } catch (error) {
        // The API could not be reached at all — a DNS or TLS failure, a refused connection.
        // That is the one failure this Function can add a sentence of its own to, and it is
        // said in the shape the pages already read best: a JSON body with a `detail` string,
        // which their error lines show as they show the API's own refusals.
        return new Response(JSON.stringify({ detail: `the api at ${API_ORIGIN} could not be reached (${error.message})` }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const answerHeaders = new Headers();

    for (const [name, value] of answer.headers) {
        if (name.toLowerCase() !== 'set-cookie') {
            answerHeaders.append(name, value);
        }
    }

    for (const cookie of cookiesIn(answer.headers)) {
        answerHeaders.append('Set-Cookie', cookie);
    }

    // The body is passed on as the stream it arrived as, untouched, so nothing here decodes
    // or re-encodes it and no answer is buffered on the way through.
    return new Response(answer.body, {
        status: answer.status,
        statusText: answer.statusText,
        headers: answerHeaders
    });
}
