import { afterEach } from 'vitest';

// jsdom doesn't implement matchMedia — useTheme() reads it to detect the
// OS color-scheme preference, so tests need a polyfill or every component
// tree that renders <Navigation> throws.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// App.tsx persists the query client to localStorage (see App.tsx's offline mutation
// persister). jsdom's localStorage survives across tests within the same file, so without
// this, one test's cached query results leak into the next test's freshly-rendered <App />
// and mask its own mocked API responses.
afterEach(() => {
  window.localStorage.clear();
});
