/**
 * WrapOS REST API client for MCP server.
 * Handles auth (JWT), base URL, and typed request/response helpers.
 */
export class WrapOSClient {
    baseUrl;
    token;
    constructor(config) {
        this.baseUrl = config.baseUrl.replace(/\/$/, '');
        this.token = config.token;
    }
    async request(method, path, body) {
        const url = `${this.baseUrl}${path}`;
        const headers = {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json',
        };
        const res = await fetch(url, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        const text = await res.text();
        let data;
        try {
            data = JSON.parse(text);
        }
        catch {
            data = { raw: text };
        }
        if (!res.ok) {
            const msg = data?.error ?? data?.message ?? text;
            throw new Error(`WrapOS API ${res.status}: ${msg}`);
        }
        return data;
    }
    get(path) { return this.request('GET', path); }
    post(path, body) { return this.request('POST', path, body); }
    put(path, body) { return this.request('PUT', path, body); }
    patch(path, body) { return this.request('PATCH', path, body); }
    delete(path) { return this.request('DELETE', path); }
}
/** Build client from environment variables */
export function clientFromEnv() {
    const baseUrl = process.env.WRAPOS_BASE_URL ?? 'http://localhost:3001';
    const token = process.env.WRAPOS_TOKEN ?? '';
    if (!token) {
        throw new Error('WRAPOS_TOKEN is required. Set it to a valid WrapOS JWT.\n' +
            'Tip: Log into WrapOS in a browser, open DevTools → Application → localStorage → wl_token');
    }
    return new WrapOSClient({ baseUrl, token });
}
//# sourceMappingURL=client.js.map