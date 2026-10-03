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

// How long the API is given to answer — the first byte of its answer, headers and all —
// before the call is given up on. A hung backend is the one failure that would otherwise
// hang the page with it, since the browser waits on this Function exactly as long as the
// Function waits on the API; with the limit in place a stalled API becomes an answer of its
// own, in the shape the pages' status lines already read "the api could not be reached" from.
// 15 seconds is far past anything a healthy call to this API takes (the slowest live read,
// the students table, answers in well under a second), short enough that an admin is not
// left watching a spinner, and — this is why it is 15 and not 20 — comfortably inside the
// edge's own patience: a backend that stopped answering altogether was seen during an
// outage on 2026-10-03 to be cut off by Cloudflare at around 20 seconds with a plain-text
// "error code: 504" that no page can read anything out of. Ending the wait first is what
// makes the sentence below the thing that gets shown.
const API_TIMEOUT_MS = 15000;

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

    // The call is given a limit (API_TIMEOUT_MS): the timer is started before the fetch and
    // stopped the moment the API's answer is in hand, so it covers a backend that never
    // answers without ever cutting short a response that has already begun.
    const controller = new AbortController();
    const giveUp = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    let answer;

    try {
        answer = await fetch(target, { ...call, signal: controller.signal });
    } catch (error) {
        // The API did not answer: a DNS or TLS failure, a refused connection, or the limit
        // above running out (which is a 504 rather than a 502, the two ways a gateway can
        // fail to get an answer). Either one is said in the shape the pages already read
        // best — a JSON body with a `detail` string, which their error lines show exactly as
        // they show the API's own refusals.
        const detail = controller.signal.aborted
            ? `the api at ${API_ORIGIN} did not answer within ${API_TIMEOUT_MS / 1000} seconds`
            : `the api at ${API_ORIGIN} could not be reached (${error.message})`;

        return new Response(JSON.stringify({ detail }), {
            status: controller.signal.aborted ? 504 : 502,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    clearTimeout(giveUp);

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
