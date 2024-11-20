const { neon } = require('@neondatabase/serverless');
const assert = require('assert');

// Retry generation of short URL up to 10 times
const RETRY_LIMIT = 10;

function createResponse(body, status, headerOverrides = {}) {
  const respHeaders = new Headers();
  respHeaders.set('Access-Control-Allow-Origin', '*');
  respHeaders.set('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  respHeaders.set('Access-Control-Allow-Headers', '*');
  respHeaders.set('Allow', 'GET, PUT, OPTIONS');
  respHeaders.set('Content-Type', 'application/json');
  for (const [key, value] of Object.entries(headerOverrides)) {
    respHeaders.set(key, value);
  }
  const bodyStr = body === null ? null : JSON.stringify(body);
  return new Response(bodyStr, { status, headers: respHeaders });
}

function createShortUrl() {
  return Math.floor(Math.random() * (36 ** 6)).toString(36);
}

function getAbsolutePath(shortUrl) {
  return `https://shorten.nusmods.com?shortUrl=${shortUrl}`;
}

export default {
  async fetch(request, env, _) {
    if (request.method === "OPTIONS") {
      return createResponse(null, 204);
    }

    if (!["GET", "PUT"].includes(request.method)) {
      return createResponse({ error: "Method not allowed" }, 405);
    }

    const sql = neon(env.DATABASE_URL);

    try {
      if (request.method === "GET") {
        const params = new URL(request.url).searchParams;
        const shortUrl = params.get("shortUrl");
        if (shortUrl === null) {
          const error = {
            error: "Missing shortUrl parameter"
          };
          return createResponse(error, 400);
        }
        const rows = await sql`SELECT long_url FROM url WHERE short_url = ${shortUrl}`;
        if (rows.length === 0) {
          return createResponse({ error: "Long URL not found" }, 404);
        }
        assert(rows.length === 1);
        return Response.redirect(`https://nusmods.com${rows[0].long_url}`);
      } else if (request.method === "PUT") {
        const body = await request.json();
        if (body === null || body.longUrl === undefined) {
          return createResponse({ error: "Long URL not found in request body" }, 400);
        }
        const { longUrl } = body;
        const rows = await sql`SELECT short_url FROM url WHERE long_url = ${longUrl}`;
        if (rows.length === 1) {
          return createResponse({ shortUrl: getAbsolutePath(rows[0].short_url) }, 200);
        }
        assert(rows.length === 0);
        for (let i = 0; i < RETRY_LIMIT; ++i) {
          const shortUrl = createShortUrl();
          try {
            await sql`INSERT INTO url (short_url, long_url) VALUES (${shortUrl}, ${longUrl})`;
            return createResponse({ shortUrl: getAbsolutePath(shortUrl) }, 201, { 'Cache-Control': 'public,max-age=86400' });
          } catch (e) {
            // Do nothing. We handle the rare error by retrying with a new random short url.
          }
        }
        return createResponse({ error: "Failed to generate short URL" }, 500);
      }
    } catch (e) {
      return createResponse({ error: e.message }, 500);
    }
  }
}
