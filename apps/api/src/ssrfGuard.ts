import dns from 'dns';
import net from 'net';
import ipaddr from 'ipaddr.js';
import { Agent, buildConnector, fetch } from 'undici';

/**
 * Open Questions / Scope Notes for SSRF Protection:
 * - SSRF protection implemented here: protocol whitelist, literal hostname check, DNS resolution IP check, connect-time IP check on every socket (DNS rebinding), manual redirect re-validation, 2MB size limit, 10s timeout.
 * - A network-level egress proxy would still be a stronger boundary for a public/multi-tenant deployment.
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
 * Ranges ipaddr.js classifies as 'unicast' that must still be blocked. Every exception to the
 * "public unicast only" policy lives here, each with the reason it's needed.
 */
const EXTRA_BLOCKED_RANGES: Array<{ cidr: [ipaddr.IPv6, number]; reason: string }> = [
  {
    // e.g. ::7f00:1 embeds 127.0.0.1. ipaddr.js reports the whole deprecated range as 'unicast',
    // but some network stacks route these to the embedded IPv4 host.
    cidr: ipaddr.IPv6.parseCIDR('::/96'),
    reason: 'IPv4-compatible IPv6 (deprecated, RFC 4291 §2.5.5.1)',
  },
];

/**
 * True unless the address is public unicast. Applied identically to IP literals in a URL
 * (after Node's URL parser has normalized them) and to every address DNS returns.
 * IPv4-mapped IPv6 (::ffff:a.b.c.d, in any notation) is judged as the IPv4 address it carries.
 * Anything Node doesn't accept as a strict IPv4/IPv6 literal is blocked — ipaddr.js alone would
 * also accept legacy forms like "1.2.3" or "0x7f.1".
 */
export function isBlockedIp(ipStr: string): boolean {
  const ip = ipStr.trim();
  if (net.isIP(ip) === 0) {
    return true;
  }

  let address = ipaddr.parse(ip);
  if (address instanceof ipaddr.IPv6 && address.isIPv4MappedAddress()) {
    address = address.toIPv4Address();
  }

  if (address instanceof ipaddr.IPv6) {
    const ipv6 = address;
    if (EXTRA_BLOCKED_RANGES.some(({ cidr }) => ipv6.match(cidr))) {
      return true;
    }
  }

  return address.range() !== 'unicast';
}

/**
 * Validates a target URL string:
 * 1. Checks protocol (http/https only)
 * 2. Rejects literal "localhost" and "localhost.localdomain" before DNS lookup
 * 3. Resolves DNS hostnames and verifies all returned IPs are non-private
 */
export async function validateUrlAndResolveIp(urlStr: string): Promise<URL> {
  return validateUrl(urlStr, isBlockedIp);
}

async function validateUrl(urlStr: string, isBlocked: (ip: string) => boolean): Promise<URL> {
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
    if (isBlocked(hostname)) {
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
      if (isBlocked(ip)) {
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
 * An undici Agent that re-checks the address every socket actually connects to, closing the
 * window between validateUrl's own DNS lookup and the connection's lookup (DNS rebinding):
 * - lookup: resolves with every address family and refuses the connection, before any TCP
 *   connect, if any answer is blocked (one bad answer rejects the whole set);
 * - post-connect: checks the connected address and destroys the socket before a request is
 *   written — the backstop for paths that skip lookup, e.g. IP-literal hosts.
 * TLS verification is untouched; tlsOptions exists only so tests can trust a test CA.
 *
 * Exported for tests only (ssrfGuard.rebinding.test.ts). Application code must call
 * fetchRecipeHtml, which builds a fresh one of these per request with the real policy.
 */
export function createGuardedAgent(
  isBlocked: (ip: string) => boolean,
  tlsOptions: { ca?: string | Buffer } = {}
): Agent {
  // Hostnames whose every resolved address this Agent's own lookup has checked and allowed.
  const approvedHostnames = new Set<string>();

  const lookup: net.LookupFunction = (hostname, options, callback) => {
    dns.lookup(hostname, { ...options, all: true }, (err, result) => {
      if (err) {
        return callback(err, '');
      }
      const addresses = result as unknown as dns.LookupAddress[];
      if (addresses.length === 0) {
        return callback(new SsrfValidationError(`Could not resolve hostname "${hostname}".`), '');
      }
      const blocked = addresses.find(({ address }) => isBlocked(address));
      if (blocked) {
        return callback(
          new SsrfValidationError(
            `Access to private IP address "${blocked.address}" is forbidden.`
          ),
          ''
        );
      }
      approvedHostnames.add(hostname);
      if (options.all) {
        return callback(null, addresses);
      }
      return callback(null, addresses[0].address, addresses[0].family);
    });
  };

  // Node 22.14 reports an empty socket.remoteAddress for hostname connections once
  // setNoDelay/setKeepAlive ran before connect — which undici always does (22.23.4 is fine).
  // So when the socket can't say where it connected: an IP-literal host is judged by the literal
  // itself, and a hostname is only allowed if this Agent's lookup approved every address it
  // could have connected to. Anything else is refused.
  function isConnectionAllowed(hostname: string, remoteAddress: string | undefined): boolean {
    if (remoteAddress) {
      return !isBlocked(remoteAddress);
    }
    const host = hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(host)) {
      return !isBlocked(host);
    }
    return approvedHostnames.has(host);
  }

  const connector = buildConnector({ ...tlsOptions, lookup });

  return new Agent({
    connect(options, callback) {
      connector(options, (...args) => {
        if (args[0]) {
          return callback(args[0], null);
        }
        const socket = args[1];
        const remoteAddress = socket.remoteAddress;
        if (!isConnectionAllowed(options.hostname, remoteAddress)) {
          socket.destroy();
          return callback(
            new SsrfValidationError(
              `Access to private IP address "${remoteAddress || options.hostname}" is forbidden.`
            ),
            null
          );
        }
        return callback(null, socket);
      });
    },
  });
}

/**
 * Builds the fetcher behind fetchRecipeHtml for a given IP policy. Exported for tests only
 * (ssrfGuard.rebinding.test.ts), which need a policy under which a local server can stand in
 * for a public host. Application code must use fetchRecipeHtml, which fixes the policy to
 * isBlockedIp.
 *
 * Fetches HTML from a target URL with manual redirect re-validation, a per-hop timeout,
 * Content-Type validation, and a 2MB decompressed streaming size limit. Every connection goes
 * through a request-scoped guarded Agent; there is no unguarded fallback.
 */
export function createRecipeFetcher(
  isBlocked: (ip: string) => boolean,
  { timeoutMs = FETCH_TIMEOUT_MS }: { timeoutMs?: number } = {}
) {
  return async function fetchHtml(initialUrl: string): Promise<string> {
    const agent = createGuardedAgent(isBlocked);
    try {
      return await fetchWithAgent(initialUrl, agent);
    } finally {
      await agent.destroy();
    }
  };

  async function fetchWithAgent(initialUrl: string, agent: Agent): Promise<string> {
    let currentUrlStr = initialUrl;
    let hop = 0;

    while (hop <= MAX_REDIRECTS) {
      // Perform full SSRF validation (protocol, hostname, DNS IP) on current hop
      const validatedUrl = await validateUrl(currentUrlStr, isBlocked);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(validatedUrl.href, {
          method: 'GET',
          redirect: 'manual',
          dispatcher: agent,
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

          // Release the unread redirect body so the connection isn't held for the rest of the chain.
          await response.body?.cancel();
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
        // undici reports a connection refused by the guarded Agent as TypeError("fetch failed")
        // with the SsrfValidationError as its cause.
        if (err instanceof Error && err.cause instanceof SsrfValidationError) {
          throw err.cause;
        }
        if (err instanceof Error && err.name === 'AbortError') {
          throw new FetchError(`Fetch request timed out after ${timeoutMs / 1000} seconds.`, 502);
        }
        const msg = err instanceof Error ? err.message : String(err);
        throw new FetchError(`Failed to fetch recipe webpage: ${msg}`, 502);
      }
    }

    throw new FetchError(`Exceeded maximum redirect limit of ${MAX_REDIRECTS} hops.`, 502);
  }
}

export const fetchRecipeHtml = createRecipeFetcher(isBlockedIp);
