import dns from 'dns';
import net from 'net';

/**
 * Open Questions / Scope Notes for SSRF Protection:
 * - Basic SSRF protection implemented here (protocol whitelist, literal hostname check, DNS resolution IP check, manual redirect re-validation, 2MB size limit, 10s timeout).
 * - This protection is suitable for a personal-use app; public/multi-tenant deployments would require network-level egress proxies and DNS pinning.
 * - Sending a custom User-Agent ("CookOutAI-Recipe-Import/1.0") helps with some sites, but sites using advanced bot detection beyond header inspection may still block requests.
 */

export class SsrfValidationError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'SsrfValidationError';
  }
}

export class FetchError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode = 502) {
    super(message);
    this.name = 'FetchError';
    this.statusCode = statusCode;
  }
}

/**
 * Validates if an IP address (IPv4 or IPv6) belongs to a private, loopback, link-local, or cloud metadata range.
 */
export function isPrivateIp(ipStr: string): boolean {
  // Normalize IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 or ::ffff:10.0.0.1)
  let ip = ipStr.trim();
  if (ip.toLowerCase().startsWith('::ffff:')) {
    const parts = ip.split(':');
    const possibleIpv4 = parts[parts.length - 1];
    if (net.isIPv4(possibleIpv4)) {
      ip = possibleIpv4;
    }
  }

  const version = net.isIP(ip);
  if (version === 4) {
    const octets = ip.split('.').map(Number);
    if (octets.length !== 4 || octets.some((o) => isNaN(o) || o < 0 || o > 255)) {
      return true; // Treat malformed IP as unsafe
    }

    // 0.0.0.0/8
    if (octets[0] === 0) return true;

    // 127.0.0.0/8 (Loopback)
    if (octets[0] === 127) return true;

    // 10.0.0.0/8 (Private)
    if (octets[0] === 10) return true;

    // 172.16.0.0/12 (Private: 172.16.0.0 - 172.31.255.255)
    if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;

    // 192.168.0.0/16 (Private)
    if (octets[0] === 192 && octets[1] === 168) return true;

    // 169.254.0.0/16 (Link-local / Cloud metadata, e.g. 169.254.169.254)
    if (octets[0] === 169 && octets[1] === 254) return true;

    return false;
  }

  if (version === 6) {
    const lower = ip.toLowerCase();

    // Loopback ::1 or ::
    if (
      lower === '::1' ||
      lower === '::' ||
      lower === '0:0:0:0:0:0:0:1' ||
      lower === '0:0:0:0:0:0:0:0'
    ) {
      return true;
    }

    // Unique local fe80::/10 or fc00::/7
    if (
      lower.startsWith('fe8') ||
      lower.startsWith('fe9') ||
      lower.startsWith('fea') ||
      lower.startsWith('feb') ||
      lower.startsWith('fc') ||
      lower.startsWith('fd')
    ) {
      return true;
    }

    return false;
  }

  return true; // Unknown/invalid IP format treated as unsafe
}

/**
 * Validates a target URL string:
 * 1. Checks protocol (http/https only)
 * 2. Rejects literal "localhost" and "localhost.localdomain" before DNS lookup
 * 3. Resolves DNS hostnames and verifies all returned IPs are non-private
 */
export async function validateUrlAndResolveIp(urlStr: string): Promise<URL> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlStr);
  } catch {
    throw new SsrfValidationError(`Invalid URL string format: "${urlStr}".`);
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new SsrfValidationError(
      `Disallowed URL protocol: "${parsedUrl.protocol}". Only http:// and https:// are supported.`
    );
  }

  const hostname = parsedUrl.hostname.replace(/^\[|\]$/g, '').toLowerCase();

  if (hostname === 'localhost' || hostname === 'localhost.localdomain') {
    throw new SsrfValidationError(`Access to hostname "${parsedUrl.hostname}" is forbidden.`);
  }

  // If hostname is already a literal IP address
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new SsrfValidationError(`Access to private IP address "${hostname}" is forbidden.`);
    }
    return parsedUrl;
  }

  // Perform DNS resolution to check all resolved IPs
  try {
    const addresses = await dns.promises.lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) {
      throw new SsrfValidationError(`Could not resolve hostname "${hostname}".`);
    }

    for (const entry of addresses) {
      const ip = typeof entry === 'string' ? entry : entry.address;
      if (isPrivateIp(ip)) {
        throw new SsrfValidationError(`Access to private IP address "${ip}" is forbidden.`);
      }
    }
  } catch (err: unknown) {
    if (
      err instanceof SsrfValidationError ||
      (err && typeof err === 'object' && 'name' in err && err.name === 'SsrfValidationError')
    ) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new SsrfValidationError(`DNS resolution failed for hostname "${hostname}": ${message}`);
  }

  return parsedUrl;
}

const MAX_REDIRECTS = 5;
const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2MB decompressed size limit
const FETCH_TIMEOUT_MS = 10000; // 10s fetch timeout

/**
 * Fetches HTML from a target URL with manual redirect re-validation, 10s timeout,
 * Content-Type validation, and 2MB decompressed streaming size limit.
 */
export async function fetchRecipeHtml(initialUrl: string): Promise<string> {
  let currentUrlStr = initialUrl;
  let hop = 0;

  while (hop <= MAX_REDIRECTS) {
    // Perform full SSRF validation (protocol, hostname, DNS IP) on current hop
    const validatedUrl = await validateUrlAndResolveIp(currentUrlStr);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(validatedUrl.href, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'CookOutAI-Recipe-Import/1.0',
          Accept: 'text/html,application/xhtml+xml',
        },
      });

      clearTimeout(timer);

      // Handle 3xx Redirects manually
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (hop >= MAX_REDIRECTS) {
          throw new FetchError(`Exceeded maximum redirect limit of ${MAX_REDIRECTS} hops.`, 502);
        }

        const location = response.headers.get('location');
        if (!location) {
          throw new FetchError('Redirect response missing Location header.', 502);
        }

        currentUrlStr = new URL(location, validatedUrl.href).href;
        hop++;
        continue;
      }

      if (!response.ok) {
        throw new FetchError(
          `HTTP ${response.status} from target URL: ${response.statusText}`,
          502
        );
      }

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
        throw new FetchError(
          `Invalid Content-Type "${contentType}". Only text/html and application/xhtml+xml are supported.`,
          502
        );
      }

      // Stream response body and enforce 2MB decompressed size limit incrementally
      if (!response.body) {
        const text = await response.text();
        if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
          throw new FetchError('Decompressed response size exceeds 2MB limit.', 502);
        }
        return text;
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            totalBytes += value.byteLength;
            if (totalBytes > MAX_BODY_BYTES) {
              await reader.cancel();
              throw new FetchError('Decompressed response size exceeds 2MB limit.', 502);
            }
            chunks.push(value);
          }
        }
      } finally {
        reader.releaseLock();
      }

      const combined = Buffer.concat(chunks);
      return combined.toString('utf8');
    } catch (err: unknown) {
      clearTimeout(timer);
      if (err instanceof SsrfValidationError || err instanceof FetchError) {
        throw err;
      }
      if (err instanceof Error && err.name === 'AbortError') {
        throw new FetchError(
          `Fetch request timed out after ${FETCH_TIMEOUT_MS / 1000} seconds.`,
          502
        );
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new FetchError(`Failed to fetch recipe webpage: ${msg}`, 502);
    }
  }

  throw new FetchError(`Exceeded maximum redirect limit of ${MAX_REDIRECTS} hops.`, 502);
}
