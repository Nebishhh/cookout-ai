import dns from 'dns';
import net from 'net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isBlockedIp, validateUrlAndResolveIp, SsrfValidationError } from './ssrfGuard.js';

// Hosts exactly as they'd appear in a user-supplied URL. Several only show the bug after Node's
// WHATWG URL parser normalizes them (e.g. [::ffff:127.0.0.1] becomes ::ffff:7f00:1).
const BLOCKED_HOSTS = [
  '[::ffff:127.0.0.1]', // IPv4-mapped loopback
  '[::ffff:7f00:1]', // same, already in hex form
  '[::ffff:a9fe:a9fe]', // IPv4-mapped 169.254.169.254 (cloud metadata)
  '[::ffff:10.0.0.1]', // IPv4-mapped private
  '[::7f00:1]', // IPv4-compatible loopback (deprecated ::/96)
  '100.64.0.1', // carrier-grade NAT
  '198.18.0.1', // benchmarking
  '224.0.0.1', // multicast
  '255.255.255.255', // broadcast
  '0.0.0.0', // unspecified
  '[::1]', // IPv6 loopback
  '[fc00::1]', // IPv6 unique local
  '[fe80::1]', // IPv6 link-local
];

function parserHostname(host: string): string {
  return new URL(`http://${host}/`).hostname.replace(/^\[|\]$/g, '');
}

describe('SSRF IP classification', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe.each(BLOCKED_HOSTS)('%s', (host) => {
    it('is blocked by the classifier, as the URL parser normalizes it', () => {
      expect(isBlockedIp(parserHostname(host))).toBe(true);
    });

    it('is rejected as an IP literal in the URL, without a DNS lookup', async () => {
      const lookupSpy = vi.spyOn(dns.promises, 'lookup');
      await expect(validateUrlAndResolveIp(`http://${host}/recipe`)).rejects.toBeInstanceOf(
        SsrfValidationError
      );
      expect(lookupSpy).not.toHaveBeenCalled();
    });

    it('is rejected when DNS returns it for an ordinary hostname', async () => {
      const ip = parserHostname(host);
      vi.spyOn(dns.promises, 'lookup').mockResolvedValue([
        { address: ip, family: net.isIP(ip) },
      ] as never);
      await expect(
        validateUrlAndResolveIp('http://recipes.example.test/recipe')
      ).rejects.toBeInstanceOf(SsrfValidationError);
    });
  });

  it.each(['8.8.8.8', '2606:4700::1111'])('allows public unicast address %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(false);
  });

  it.each(['', 'not-an-ip', '999.1.1.1', '1.2.3.4.5', 'fe80::1::2'])(
    'treats unparseable address %j as blocked',
    (ip) => {
      expect(isBlockedIp(ip)).toBe(true);
    }
  );
});
