import cf from 'cloudfront';
import crypto from 'crypto';

const kvs = cf.kvs();

const deny = (code, msg) => ({
    statusCode: code,
    statusDescription: msg,
    headers: {
        'content-type': { value: 'application/json' },
        'cache-control': { value: 'no-store' },
    },
    body: JSON.stringify({ error: msg }),
});

async function handler(event) {
    const req = event.request;

    // Only protect the articles route; health stays public
    if (!req.uri.startsWith('/api/v1/articles')) return req;

    const h = req.headers['x-api-key'];
    if (!h || !h.value) return deny(401, 'Missing API key');

    const hash = crypto.createHash('sha256').update(h.value).digest('hex');

    let ok = false;
    try {
        ok = await kvs.exists(hash);
    } catch (e) {
        return deny(503, 'Auth unavailable'); 
    }
    if (!ok) return deny(401, 'Invalid API key');

    delete req.headers['x-api-key']; 
    return req;
}
