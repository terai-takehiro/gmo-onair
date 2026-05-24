import axios from 'axios';

interface TokenCache {
  token: string;
  expiresAt: number;
}

const cache = new Map<string, TokenCache>();
const inflight = new Map<string, Promise<string>>();

export async function getZoomToken(
  clientId: string,
  clientSecret: string,
  accountId: string,
): Promise<string> {
  const cached = cache.get(accountId);
  if (cached && Date.now() < cached.expiresAt) return cached.token;

  const existing = inflight.get(accountId);
  if (existing) return existing;

  const promise = (async () => {
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await axios.post(
      'https://zoom.us/oauth/token',
      new URLSearchParams({ grant_type: 'account_credentials', account_id: accountId }),
      {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 10000,
      },
    );
    const token: string = res.data.access_token;
    const ttl: number = (res.data.expires_in ?? 3600) - 120;
    cache.set(accountId, { token, expiresAt: Date.now() + ttl * 1000 });
    return token;
  })();

  inflight.set(accountId, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(accountId);
  }
}
