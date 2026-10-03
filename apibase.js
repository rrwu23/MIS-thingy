// Where every API call this app makes is asked of.
//
// The session cookie is the whole reason this file exists. POST /login answers with
//     set-cookie: session_id=...; HttpOnly; SameSite=lax; Secure
// (read live off the API; POST /logout shows that very cookie being cleared:
// session_id=""; expires=now; HttpOnly; Max-Age=0; Path=/; SameSite=lax; Secure). It
// carries no Domain, so it is host-only on api.rongrongwu.com, and SameSite=lax means a
// browser stores it, and sends it back, only for a page asking from the same *site* as the
// API — the registrable domain rongrongwu.com, and nothing else. Served from
// mis.rongrongwu.com or rongrongwu.com the app therefore worked; served from
// www.bonurabank.ca it did not, because bonurabank.ca and rongrongwu.com are two different
// sites: the browser refused the login's third-party Set-Cookie, and every protected read
// came back 401 {"detail": "Not logged in"} — the admin could see session_id in the
// browser's cookie list, and no request from the page ever carried it.
//
// So the pages ask for the API on their own origin instead. API_ORIGIN below is '/api', and
// every route in every page script is written `${API_ORIGIN}/getuser`, `${API_ORIGIN}/remove`
// and so on — the path after it being the API's own route, unchanged.
// functions/api/[[path]].js is what stands at the other end: a Cloudflare Pages Function,
// deployed with the site, which fetches the same route from https://api.rongrongwu.com and
// hands the answer straight back, Set-Cookie and all. The cookie therefore belongs to the
// page's own hostname (www.bonurabank.ca, or mis-thingy.pages.dev, or whichever hostname of
// this project is in use) and rides on every call, and the whole exchange is first-party:
// nothing for the browser to refuse as third-party, and no CORS to satisfy. apibase.js is
// loaded first on every page, before the script that builds its routes, so no route is ever
// built before the origin it is built from is known.
//
// A page opened from disk (file://) or from a local server is the one case with no Function
// standing in front of anything, so there the API is asked directly, by its own hostname,
// exactly as every call was made before. Its routes can be read that way — they answer
// without a session — but its session cannot be held, because that page is on a third-party
// site to the API: which is the very problem this file solves, not a fault of the fallback.
// `wrangler pages dev` in this directory runs the pages and the Function together on
// localhost and follows the /api route like the deployed site does.
const API_ORIGIN = (function () {
    const host = window.location.hostname;

    const localPage = window.location.protocol === 'file:'
        || host === 'localhost'
        || host === '127.0.0.1'
        || host === '';

    return localPage ? 'https://api.rongrongwu.com' : '/api';
})();
