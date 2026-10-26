# Test-only TLS fixture

`tls.test.cert.pem` and `tls.test.key.pem` are a **test-only, self-signed** certificate and private key for the hostname `tls.test` (EC P-256, valid until 2126). They protect nothing and are not used outside the test suite.

They are used by `apps/api/src/ssrfGuard.rebinding.test.ts` to run a local HTTPS server and check that the guarded SSRF fetch keeps SNI and the Host header set to the hostname, and that certificate verification stays on (the untrusted certificate is rejected unless the test explicitly trusts it as a CA).
