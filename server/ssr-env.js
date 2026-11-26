// Stand-ins so the browser app's drawing code can run outside a browser (the build in Node, the Pages Functions).
// Imported before the app module (server/prerender.js). The app checks __TAMYIZ_BUILD__ and does not start itself.
// Only drawing code runs there: nothing reads real storage, the page or the window.
globalThis.__TAMYIZ_BUILD__ = true;
// localStorage: defined, not read first (Node has its own that warns when touched without a storage file).
Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: () => null, setItem() {}, removeItem() {} },
  configurable: true,
  writable: true,
});
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    readyState: 'complete',
    addEventListener() {},
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };
}
