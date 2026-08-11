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
