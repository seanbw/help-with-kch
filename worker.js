function restrictedResponse() {
    return new Response(
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Access restricted</title></head><body><main><h1>Access restricted</h1><p>This website is not available to visitors connecting from the United States.</p></main></body></html>',
        {
            status: 403,
            headers: {
                'Cache-Control': 'private, no-store',
                'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
                'Content-Type': 'text/html; charset=utf-8',
                'X-Content-Type-Options': 'nosniff'
            }
        }
    );
}

export default {
    async fetch(request, env) {
        if (request.cf?.country === 'US') {
            return restrictedResponse();
        }

        return env.ASSETS.fetch(request);
    }
};
