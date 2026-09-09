import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

function worker() {
  const handlers: Record<string, (event: any) => void> = {};
  const cache = { put: vi.fn(), match: vi.fn() };
  const caches = { keys: vi.fn(async () => ['hs-finance-v1', 'unrelated-app-cache', 'hs-finance-static-v0']), delete: vi.fn(async (_name: string) => true), open: vi.fn(async () => cache) };
  const response = { ok: true, type: 'basic', clone: vi.fn(() => ({ cloned: true })) };
  const fetch = vi.fn(async () => response);
  runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), {
    self: { registration: { scope: 'https://app.test/finance/' }, addEventListener: (name: string, handler: any) => { handlers[name] = handler; }, skipWaiting: vi.fn(), clients: { claim: vi.fn() } },
    caches, fetch, URL,
  });
  return { handlers, caches, cache, fetch, response };
}
describe('service worker cache boundaries', () => {
  it('does not intercept cloud requests, API traffic, POST or another application', () => {
    const { handlers, caches, fetch } = worker();
    for (const [url, method] of [['https://example.test/cloud?action=load', 'GET'], ['https://app.test/finance/api/data', 'GET'], ['https://app.test/finance/index.html', 'POST'], ['https://app.test/another/index.html', 'GET'], ['https://app.test/finance/another/index.html', 'GET']]) {
      const event = { request: { url, method }, respondWith: vi.fn() };
      handlers.fetch(event);
      expect(event.respondWith).not.toHaveBeenCalled();
    }
    expect(caches.open).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('deletes only caches owned by this app', async () => {
    const { handlers, caches } = worker();
    let work!: Promise<void>;
    handlers.activate({ waitUntil: (promise: Promise<void>) => { work = promise; } });
    await work;
    expect(caches.delete.mock.calls.map(([name]) => name)).toEqual(['hs-finance-v1', 'hs-finance-static-v0']);
  });
  it('returns a valid network response even when static caching fails', async () => {
    const { handlers, cache, response } = worker();
    cache.put.mockRejectedValue(new Error('quota'));
    let work!: Promise<unknown>;
    handlers.fetch({ request: { url: 'https://app.test/finance/assets/main.js', method: 'GET' }, respondWith: (promise: Promise<unknown>) => { work = promise; } });
    expect(await work).toBe(response);
  });
});
