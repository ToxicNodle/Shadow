/**
 * WrapOS REST API client for MCP server.
 * Handles auth (JWT), base URL, and typed request/response helpers.
 */

export interface WrapOSConfig {
  baseUrl: string;
  token: string;
}

export class WrapOSClient {
  private baseUrl: string;
  private token: string;

  constructor(config: WrapOSConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.token = config.token;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };

    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      const msg = (data as Record<string, string>)?.error ?? (data as Record<string, string>)?.message ?? text;
      throw new Error(`WrapOS API ${res.status}: ${msg}`);
    }

    return data as T;
  }

  get<T>(path: string) { return this.request<T>('GET', path); }
  post<T>(path: string, body?: unknown) { return this.request<T>('POST', path, body); }
  put<T>(path: string, body?: unknown) { return this.request<T>('PUT', path, body); }
  patch<T>(path: string, body?: unknown) { return this.request<T>('PATCH', path, body); }
  delete<T>(path: string) { return this.request<T>('DELETE', path); }
}

/** Build client from environment variables */
export function clientFromEnv(): WrapOSClient {
  const baseUrl = process.env.WRAPOS_BASE_URL ?? 'http://localhost:3001';
  const token = process.env.WRAPOS_TOKEN ?? '';
  if (!token) {
    throw new Error(
      'WRAPOS_TOKEN is required. Set it to a valid WrapOS JWT.\n' +
      'Tip: Log into WrapOS in a browser, open DevTools → Application → localStorage → wl_token'
    );
  }
  return new WrapOSClient({ baseUrl, token });
}
