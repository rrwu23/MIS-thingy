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

// The session cookie the API hands out, and the two names this app keeps in the browser so that
// one browser can be signed in as an admin and as a student at the same time.
//
// The API names its one session cookie `session_id` on both doors: POST /login (the admin's) and
// POST /student-login (the student's) each answer with
//     set-cookie: session_id=...; HttpOnly; SameSite=lax; Secure
// Because it is one name, the second sign-in overwrote the first — a browser signed in as an
// admin and then as a student held only the student's session and every admin page fell back to
// 401 Not logged in, and the other way round. So this Function, which already stands on every
// call the pages make, keeps the student's session under a name of its own: `student_session_id`,
// apart from the admin's `session_id`, and hands each one back to the API under the one name it
// knows. A browser can then hold both at once and each flow finds the session it belongs to.
//
// Which of the two a call is about is decided by the route: the routes below are the student
// flow's own and everything else is the admin's. The one route both flows post — /logout — cannot
// be told apart by its name, so a page may say which session it means with SESSION_ROLE_HEADER
// below; the student hub's Sign out sends it, and every other sign-out is the admin's.
const ADMIN_SESSION_COOKIE = 'session_id';
const STUDENT_SESSION_COOKIE = 'student_session_id';

// The API routes the student flow asks for and no admin page does. A call to one of these is
// answered with the student's session; every other route is answered with the admin's.
const STUDENT_ROUTES = new Set([
    'student-login',
    'current-student',
    'add-transaction-submit',
    'transaction-student-history'
]);

// The request header a page uses to say which session a call is about when the route cannot:
// `student` means the student's, anything else (or no header at all) means the admin's. It only
// ever says what the route already says, except on the shared /logout, and it never reaches the
// API — like the hop-by-hop headers above, it describes the one hop into this Function and is
// taken off before the call is passed on.
const SESSION_ROLE_HEADER = 'X-Session-Role';

// Input: route — the API path this call is for, as this Function built it (no leading slash:
//   'logout', 'student-login', 'reasons/bonus-bucks'); request — the browser's own request, read
//   only for the SESSION_ROLE_HEADER hint.
// Output: 'student' when this call belongs to the student flow, 'admin' otherwise.
// Action: answers 'student' for a route in STUDENT_ROUTES, or for any route a request marks as
//   the student's with SESSION_ROLE_HEADER; everything else is 'admin'.
// Role: the one decision the two session cookies hang on — which cookie is handed to the API for
//   this call, and which of the two a Set-Cookie the API answers with is written back as.
function sessionRole(route, request) {
    if (STUDENT_ROUTES.has(route)) {
        return 'student';
    }

    const hint = (request.headers.get(SESSION_ROLE_HEADER) || '').trim().toLowerCase();

    return hint === 'student' ? 'student' : 'admin';
}

// Input: cookieHeader — the browser's Cookie header as it arrived; role — 'student' or 'admin',
//   from sessionRole().
// Output: the Cookie header to send on to the API: the same cookies, with whichever of the two
//   session cookies belongs to this call renamed to the API's own `session_id`, and the other
//   left out.
// Action: splits the header into name=value pairs, keeps every cookie but the two session ones,
//   and appends the session named by role under the name session_id when the browser holds it.
// Role: this is what lets the one API keep reading `session_id` unchanged — a student route
//   arrives with the student's cookie, an admin route with the admin's, and the API never learns
//   that the browser was keeping two.
function sessionCookieHeader(cookieHeader, role) {
    const wanted = role === 'student' ? STUDENT_SESSION_COOKIE : ADMIN_SESSION_COOKIE;
    const kept = [];
    let sessionValue = null;

    for (const part of cookieHeader.split(';')) {
        const pair = part.trim();

        if (!pair) {
            continue;
        }

        const cut = pair.indexOf('=');

        if (cut === -1) {
            continue;
        }

        const name = pair.slice(0, cut).trim();

        if (name === STUDENT_SESSION_COOKIE || name === ADMIN_SESSION_COOKIE) {
            if (name === wanted) {
                sessionValue = pair.slice(cut + 1).trim();
            }

            continue;
        }

        kept.push(pair);
    }

    if (sessionValue !== null) {
        kept.push(`${ADMIN_SESSION_COOKIE}=${sessionValue}`);
    }

    return kept.join('; ');
}

// Input: setCookie — one Set-Cookie line from the API's answer; role — 'student' or 'admin'.
// Output: the same line, with the cookie's own name changed to the one the browser is keeping:
//   the student's `student_session_id` for a student call, or the API's own `session_id`
//   unchanged for an admin call.
// Action: renames the leading `session_id=` to the student cookie's name when role is 'student',
//   and answers the line as it stands otherwise — so a sign-in's Set-Cookie stores the student
//   session under its own name, and a sign-out's Max-Age=0 line clears that same one.
// Role: the other half of sessionCookieHeader() — the API answers in `session_id` and the browser
//   is told it in the name it is keeping, so the two sessions stay apart in the browser while
//   never being anything but one name to the API.
function namedSessionCookie(setCookie, role) {
    if (role !== 'student') {
        return setCookie;
    }

    return setCookie.replace(/^\s*session_id\s*=/, `${STUDENT_SESSION_COOKIE}=`);
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

    // Which of the browser's two sessions this call is about, decided by the route and, where the
    // route cannot say (the shared /logout), by the page's own SESSION_ROLE_HEADER hint.
    const role = sessionRole(route, request);

    // The hint describes this one hop and never travels: like the headers above it is taken off
    // before the call is passed on.
    headers.delete(SESSION_ROLE_HEADER);

    // The browser keeps the admin's session and the student's under two names; the API knows only
    // its own `session_id`. So whichever of the two this call is about is handed to the API under
    // that name and the other is left out — the student's pages never carry the admin's session
    // and the admin's never carry the student's. A call with neither (an admin route before anyone
    // has signed in, say) is sent on with no Cookie header at all, exactly as before.
    const sentCookies = headers.get('Cookie');

    if (sentCookies !== null) {
        const sessionCookies = sessionCookieHeader(sentCookies, role);

        if (sessionCookies) {
            headers.set('Cookie', sessionCookies);
        } else {
            headers.delete('Cookie');
        }
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

    // Each Set-Cookie the API answered with is written back under the name the browser keeps it
    // as: the student's own `student_session_id` for a call this Function decided was the
    // student's (a sign-in stores it there, a sign-out clears it there), and the API's own
    // `session_id` for the admin's — so the two sessions never collide in the browser even though
    // the API only ever named one.
    for (const cookie of cookiesIn(answer.headers)) {
        answerHeaders.append('Set-Cookie', namedSessionCookie(cookie, role));
    }

    // The body is passed on as the stream it arrived as, untouched, so nothing here decodes
    // or re-encodes it and no answer is buffered on the way through.
    return new Response(answer.body, {
        status: answer.status,
        statusText: answer.statusText,
        headers: answerHeaders
    });
}
