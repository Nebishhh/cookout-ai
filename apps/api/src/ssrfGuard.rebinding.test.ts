import dns from 'dns';
import fs from 'fs';
import http from 'http';
import https from 'https';
import net from 'net';
import path from 'path';
import type { AddressInfo } from 'net';
import { fileURLToPath } from 'url';
import { Agent, fetch as undiciFetch, getGlobalDispatcher } from 'undici';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createGuardedAgent,
  createRecipeFetcher,
  fetchRecipeHtml,
  FetchError,
  SsrfValidationError,
} from './ssrfGuard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TLS_CERT = fs.readFileSync(path.join(__dirname, '__fixtures__/tls/tls.test.cert.pem'));
const TLS_KEY = fs.readFileSync(path.join(__dirname, '__fixtures__/tls/tls.test.key.pem'));

// Everything runs against local servers. With the test policy below, 127.0.0.1 plays a public
// host and 127.0.0.2 plays an internal one, so a request can succeed without relaxing the real
// policy (which blocks all of loopback).
const blockOnly127002 = (ip: string) => ip === '127.0.0.2' || ip === '::ffff:127.0.0.2';
const RECIPE_HTML = '<html><body><h1>Pancakes</h1></body></html>';

interface TestServer {
  port: number;
  connections: number;
  openSockets: number;
  requests: string[];
  sni: (string | false)[];
  hosts: (string | undefined)[];
}

const openServers: (http.Server | https.Server)[] = [];

async function startServer(
  host: string,
  handler?: http.RequestListener,
  options: { port?: number; tls?: boolean } = {}
): Promise<TestServer> {
  const state: TestServer = {
    port: 0,
    connections: 0,
    openSockets: 0,
    requests: [],
    sni: [],
    hosts: [],
  };
  const listener: http.RequestListener = (req, res) => {
    state.requests.push(req.url ?? '');
    state.hosts.push(req.headers.host);
    if (handler) return handler(req, res);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(RECIPE_HTML);
  };
  const server = options.tls
    ? https.createServer({ cert: TLS_CERT, key: TLS_KEY }, listener)
    : http.createServer(listener);
  server.on('connection', (socket) => {
    state.connections++;
    state.openSockets++;
    socket.on('close', () => state.openSockets--);
  });
  server.on('secureConnection', (socket) => state.sni.push(socket.servername));
  server.on('tlsClientError', () => {});
  await new Promise<void>((resolve) => server.listen(options.port ?? 0, host, resolve));
  state.port = (server.address() as AddressInfo).port;
  openServers.push(server);
  return state;
}

// Stubs both lookups: dns.promises.lookup is what the validator sees, dns.lookup is what the
// socket connection uses. Unknown hostnames fail, so nothing can reach real DNS.
function stubDns(answers: {
  validator: Record<string, string[]>;
  connect: Record<string, string[]>;
}) {
  const toEntries = (ips: string[]) =>
    ips.map((address) => ({ address, family: net.isIP(address) }));
  const notFound = (host: string) =>
    Object.assign(new Error(`ENOTFOUND ${host}`), { code: 'ENOTFOUND' });

  vi.spyOn(dns.promises, 'lookup').mockImplementation((async (host: string) => {
    if (!answers.validator[host]) throw notFound(host);
    return toEntries(answers.validator[host]);
  }) as never);

  vi.spyOn(dns, 'lookup').mockImplementation(((
    host: string,
    options: dns.LookupOptions | ((...args: unknown[]) => void),
    callback?: (...args: unknown[]) => void
  ) => {
    const cb = (typeof options === 'function' ? options : callback)!;
    const opts = typeof options === 'function' ? {} : options;
    const ips = answers.connect[host];
    if (!ips) return cb(notFound(host));
    const entries = toEntries(ips);
    if (opts.all) return cb(null, entries);
    return cb(null, entries[0].address, entries[0].family);
  }) as never);
}

describe('SSRF connect-time protection (DNS rebinding)', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(
      openServers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.closeAllConnections();
            server.close(() => resolve());
          })
      )
    );
  });

  it('1. rebinding: validator sees a public IP, the connection lookup returns 127.0.0.1 — no connection is made', async () => {
    const server = await startServer('127.0.0.1');
    stubDns({
      validator: { 'rebind.test': ['93.184.216.34'] },
      connect: { 'rebind.test': ['127.0.0.1'] },
    });

    await expect(fetchRecipeHtml(`http://rebind.test:${server.port}/`)).rejects.toBeInstanceOf(
      SsrfValidationError
    );
    expect(server.connections).toBe(0);
    expect(server.requests).toEqual([]);
  });

  it('2. rebinding on a redirect hop: the internal server is never connected to', async () => {
    const internal = await startServer('127.0.0.2');
    const publicHost = await startServer('127.0.0.1', (_req, res) => {
      res.writeHead(302, { Location: `http://rebind.test:${internal.port}/secret` });
      res.end();
    });
    stubDns({
      validator: { 'public.test': ['127.0.0.1'], 'rebind.test': ['127.0.0.1'] },
      connect: { 'public.test': ['127.0.0.1'], 'rebind.test': ['127.0.0.2'] },
    });

    await expect(
      createRecipeFetcher(blockOnly127002)(`http://public.test:${publicHost.port}/start`)
    ).rejects.toBeInstanceOf(SsrfValidationError);
    expect(publicHost.requests).toEqual(['/start']);
    expect(publicHost.connections).toBe(1);
    expect(internal.connections).toBe(0);
    expect(internal.requests).toEqual([]);
  });

  it('3. positive control: an allowed host returns its HTML with exactly one request', async () => {
    const publicHost = await startServer('127.0.0.1');
    stubDns({
      validator: { 'public.test': ['127.0.0.1'] },
      connect: { 'public.test': ['127.0.0.1'] },
    });

    const html = await createRecipeFetcher(blockOnly127002)(
      `http://public.test:${publicHost.port}/recipe`
    );

    expect(html).toBe(RECIPE_HTML);
    expect(publicHost.requests).toEqual(['/recipe']);
  });

  it('3b. the exported fetchRecipeHtml uses the real isBlockedIp policy, not the test one', async () => {
    const publicHost = await startServer('127.0.0.1');
    stubDns({
      validator: { 'public.test': ['93.184.216.34'] },
      connect: { 'public.test': ['127.0.0.1'] },
    });

    // The test policy above allows 127.0.0.1; the real policy blocks all of loopback.
    await expect(fetchRecipeHtml(`http://public.test:${publicHost.port}/`)).rejects.toBeInstanceOf(
      SsrfValidationError
    );
    expect(publicHost.connections).toBe(0);
  });

  it('4. an IP literal skips DNS, and the post-connect check stops it before any request is written', async () => {
    const internal = await startServer('127.0.0.2');
    const lookupSpy = vi.spyOn(dns, 'lookup');
    const agent = createGuardedAgent(blockOnly127002);

    await expect(
      undiciFetch(`http://127.0.0.2:${internal.port}/`, { dispatcher: agent })
    ).rejects.toMatchObject({ cause: expect.any(SsrfValidationError) });
    expect(lookupSpy).not.toHaveBeenCalled();
    expect(internal.requests).toEqual([]);
    await agent.destroy();
  });

  it('5. a mixed DNS answer [allowed, blocked] rejects the whole request with no connections', async () => {
    const publicHost = await startServer('127.0.0.1');
    const internal = await startServer('127.0.0.2', undefined, { port: publicHost.port });
    stubDns({
      validator: { 'mixed.test': ['127.0.0.1'] },
      connect: { 'mixed.test': ['127.0.0.1', '127.0.0.2'] },
    });

    await expect(
      createRecipeFetcher(blockOnly127002)(`http://mixed.test:${publicHost.port}/`)
    ).rejects.toBeInstanceOf(SsrfValidationError);
    expect(publicHost.connections).toBe(0);
    expect(internal.connections).toBe(0);
  });

  it('6. HTTPS keeps SNI and Host as the hostname, and certificate verification stays on', async () => {
    const tlsHost = await startServer('127.0.0.1', undefined, { tls: true });
    stubDns({ validator: {}, connect: { 'tls.test': ['127.0.0.1'] } });

    const trusting = createGuardedAgent(blockOnly127002, { ca: TLS_CERT });
    const res = await undiciFetch(`https://tls.test:${tlsHost.port}/`, { dispatcher: trusting });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(RECIPE_HTML);
    expect(tlsHost.sni).toEqual(['tls.test']);
    expect(tlsHost.hosts).toEqual([`tls.test:${tlsHost.port}`]);
    await trusting.destroy();

    const defaultTrust = createGuardedAgent(blockOnly127002);
    await expect(
      undiciFetch(`https://tls.test:${tlsHost.port}/`, { dispatcher: defaultTrust })
    ).rejects.toMatchObject({ cause: { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' } });
    expect(tlsHost.requests).toHaveLength(1);
    await defaultTrust.destroy();
  });

  it('7. the request-scoped Agent is destroyed after success, rejection, and abort', async () => {
    const destroySpy = vi.spyOn(Agent.prototype, 'destroy');
    const publicHost = await startServer('127.0.0.1');
    const hanging = await startServer('127.0.0.1', () => {
      // never responds
    });
    stubDns({
      validator: {
        'public.test': ['127.0.0.1'],
        'hang.test': ['127.0.0.1'],
        'rebind.test': ['127.0.0.1'],
      },
      connect: {
        'public.test': ['127.0.0.1'],
        'hang.test': ['127.0.0.1'],
        'rebind.test': ['127.0.0.2'],
      },
    });
    const fetchHtml = createRecipeFetcher(blockOnly127002, { timeoutMs: 300 });

    await expect(fetchHtml(`http://public.test:${publicHost.port}/`)).resolves.toBe(RECIPE_HTML);
    await expect(fetchHtml(`http://rebind.test:${publicHost.port}/`)).rejects.toBeInstanceOf(
      SsrfValidationError
    );
    await expect(fetchHtml(`http://hang.test:${hanging.port}/`)).rejects.toThrow(/timed out/);

    // undici's promise-form destroy() re-invokes destroy(err, callback) on the same Agent, so
    // count distinct Agents rather than calls: one per request, each fully destroyed.
    const agents = new Set(destroySpy.mock.contexts as Agent[]);
    expect(agents.size).toBe(3);
    for (const agent of agents) {
      expect(agent.destroyed).toBe(true);
    }
  });

  it('8. never changes the global dispatcher', async () => {
    const before = getGlobalDispatcher();
    const publicHost = await startServer('127.0.0.1');
    stubDns({
      validator: { 'public.test': ['127.0.0.1'] },
      connect: { 'public.test': ['127.0.0.1'] },
    });

    await createRecipeFetcher(blockOnly127002)(`http://public.test:${publicHost.port}/`);

    expect(getGlobalDispatcher()).toBe(before);
  });

  it('9a. the 5-hop redirect limit still applies', async () => {
    const publicHost = await startServer('127.0.0.1', (req, res) => {
      const n = Number(new URL(req.url ?? '/', 'http://x').searchParams.get('n') ?? 0);
      res.writeHead(302, { Location: `/hop?n=${n + 1}` });
      res.end();
    });
    stubDns({
      validator: { 'public.test': ['127.0.0.1'] },
      connect: { 'public.test': ['127.0.0.1'] },
    });

    const attempt = createRecipeFetcher(blockOnly127002)(
      `http://public.test:${publicHost.port}/hop?n=0`
    );
    await expect(attempt).rejects.toBeInstanceOf(FetchError);
    await expect(attempt).rejects.toThrow('Exceeded maximum redirect limit of 5 hops');
    expect(publicHost.requests).toHaveLength(6);
  });

  it('9b. each redirect hop is validated before connecting (redirect to a blocked IP literal)', async () => {
    const internal = await startServer('127.0.0.2');
    const publicHost = await startServer('127.0.0.1', (_req, res) => {
      res.writeHead(302, { Location: `http://127.0.0.2:${internal.port}/admin` });
      res.end();
    });
    stubDns({
      validator: { 'public.test': ['127.0.0.1'] },
      connect: { 'public.test': ['127.0.0.1'] },
    });

    await expect(
      createRecipeFetcher(blockOnly127002)(`http://public.test:${publicHost.port}/`)
    ).rejects.toBeInstanceOf(SsrfValidationError);
    expect(internal.connections).toBe(0);
  });
});

describe('SSRF fetch timeout', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(
      openServers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.closeAllConnections();
            server.close(() => resolve());
          })
      )
    );
  });

  const waitFor = async (condition: () => boolean, ms = 1000) => {
    const deadline = Date.now() + ms;
    while (!condition() && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  };

  it('aborts a body that keeps dripping past the deadline, and leaves no open sockets', async () => {
    const drips: NodeJS.Timeout[] = [];
    const dripping = await startServer('127.0.0.1', (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.write('<p>');
      // 30 chunks, 100ms apart: the body takes ~3s, far past the 400ms deadline below.
      let sent = 0;
      const timer = setInterval(() => {
        res.write('drip ');
        if (++sent === 30) {
          clearInterval(timer);
          res.end('</p>');
        }
      }, 100);
      drips.push(timer);
      res.on('close', () => clearInterval(timer));
    });
    stubDns({
      validator: { 'drip.test': ['127.0.0.1'] },
      connect: { 'drip.test': ['127.0.0.1'] },
    });

    const started = Date.now();
    const attempt = createRecipeFetcher(blockOnly127002, { timeoutMs: 400 })(
      `http://drip.test:${dripping.port}/`
    );

    await expect(attempt).rejects.toThrow(/timed out/);
    expect(Date.now() - started).toBeLessThan(1500);
    await waitFor(() => dripping.openSockets === 0);
    expect(dripping.openSockets).toBe(0);
    drips.forEach(clearInterval);
  });

  it("covers the validator's DNS lookup: a lookup that never resolves still times out on time", async () => {
    vi.spyOn(dns.promises, 'lookup').mockImplementation(
      (() => new Promise(() => {})) as unknown as typeof dns.promises.lookup
    );

    const started = Date.now();
    const attempt = createRecipeFetcher(blockOnly127002, { timeoutMs: 300 })(
      'http://never-resolves.test/'
    );
    // Without the fix the attempt never settles; race a guard so the test fails cleanly
    // instead of hanging until Vitest's own timeout.
    const guard = new Promise<string>((resolve) =>
      setTimeout(() => resolve('still pending'), 3000)
    );

    await expect(Promise.race([attempt, guard])).rejects.toThrow(/timed out/);
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it('counts the deadline across redirect hops, not per hop', async () => {
    // Each hop answers after 250ms: every single hop beats the 600ms deadline, the chain doesn't.
    const slow = await startServer('127.0.0.1', (req, res) => {
      setTimeout(() => {
        if (req.url === '/final') {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          return res.end(RECIPE_HTML);
        }
        res.writeHead(302, { Location: req.url === '/r1' ? '/r2' : '/final' });
        res.end();
      }, 250);
    });
    stubDns({
      validator: { 'slow.test': ['127.0.0.1'] },
      connect: { 'slow.test': ['127.0.0.1'] },
    });

    await expect(
      createRecipeFetcher(blockOnly127002, { timeoutMs: 600 })(`http://slow.test:${slow.port}/r1`)
    ).rejects.toThrow(/timed out/);
    await waitFor(() => slow.openSockets === 0);
    expect(slow.openSockets).toBe(0);
  });
});
