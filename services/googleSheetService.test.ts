import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadFromGoogleSheet, saveToGoogleSheet } from './googleSheetService';
const data = { transactions: [], categories: [], budget: 0, cardBanks: [], cardSettings: {} };
afterEach(() => vi.unstubAllGlobals());
describe('cloud protocol with a fake transport', () => {
  it('preserves existing query parameters, disables cache and validates downloaded data', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ success: true, data })));
    vi.stubGlobal('fetch', fetch);
    expect(await loadFromGoogleSheet('https://example.test/cloud?account=test')).toMatchObject(data);
    expect(fetch).toHaveBeenCalledWith('https://example.test/cloud?account=test&action=load', expect.objectContaining({ cache: 'no-store' }));
  });
  it('rejects corrupt downloads and false success acknowledgements', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { transactions: 'bad' } }))).mockResolvedValueOnce(new Response(JSON.stringify({ success: false })));
    vi.stubGlobal('fetch', fetch);
    await expect(loadFromGoogleSheet('https://example.test/cloud')).rejects.toThrow();
    await expect(saveToGoogleSheet('https://example.test/cloud', data)).rejects.toThrow('未確認');
  });
  it('passes cancellation to fetch and retains unknown fields through chunk assembly', async () => {
    const extended = { ...data, extra: { retained: true } };
    const json = JSON.stringify(extended);
    const fetch = vi.fn(async () => new Response(JSON.stringify({ success: true, chunks: [json.slice(0, 20), json.slice(20)] })));
    vi.stubGlobal('fetch', fetch);
    const abort = new AbortController();
    expect(await loadFromGoogleSheet('https://example.test/cloud', abort.signal)).toMatchObject(extended);
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal: abort.signal }));
  });
});
