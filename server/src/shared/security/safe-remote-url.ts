import dns from 'dns';
import https from 'https';
import net from 'net';

/**
 * Reject addresses that must never be reachable through a user-configured URL.
 * This includes loopback/link-local/private ranges, IPv4-mapped IPv6 addresses,
 * and non-unicast IPv6 ranges. Public DNS is resolved again by the request agent
 * so a DNS-rebinding response cannot bypass the check performed at registration.
 */
export function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0];
  if (net.isIPv4(normalized)) {
    const [a, b] = normalized.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && normalized.startsWith('192.0.2.')) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && normalized.startsWith('198.51.100.')) ||
      (a === 203 && b === 0 && normalized.startsWith('203.0.113.')) ||
      a >= 224;
  }
  if (!net.isIPv6(normalized)) return true;

  if (normalized === '::' || normalized === '::1') return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
  if (mapped) return isPrivateAddress(mapped[1]);
  return normalized.startsWith('fc') || normalized.startsWith('fd') ||
    /^fe[89ab]/.test(normalized) || normalized.startsWith('ff') ||
    normalized.startsWith('2001:db8:');
}

export function assertSafeHttpsUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('有効な URL ではありません');
  }
  if (url.protocol !== 'https:') throw new Error('https の URL のみ購読できます');
  if (!url.hostname || url.hostname.toLowerCase() === 'localhost') {
    throw new Error('ローカルアドレスは購読できません');
  }
  const literal = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(literal) && isPrivateAddress(literal)) {
    throw new Error('プライベートアドレスは購読できません');
  }
  return url;
}

/** HTTPS agent whose DNS lookup fails closed unless at least one public address exists. */
export const publicHttpsAgent = new https.Agent({
  lookup(hostname, options, callback) {
    const lookupOptions = typeof options === 'object' ? options : {};
    dns.lookup(hostname, { ...lookupOptions, all: true }, (error, addresses) => {
      if (error) { callback(error, '', 4); return; }
      const publicAddress = addresses.find(({ address }) => !isPrivateAddress(address));
      if (!publicAddress) {
        callback(new Error('Remote host resolves to a private or reserved address'), '', 4);
        return;
      }
      callback(null, publicAddress.address, publicAddress.family);
    });
  },
});
