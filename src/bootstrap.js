import { DOMParser } from 'linkedom';

// Browser APIs used by existing scrapers, provided safely for Node/Vercel.
globalThis.DOMParser = globalThis.DOMParser || DOMParser;

globalThis.window = globalThis.window || globalThis;

globalThis.atob =
  globalThis.atob ||
  ((s) => Buffer.from(s, 'base64').toString('binary'));

globalThis.btoa =
  globalThis.btoa ||
  ((s) => Buffer.from(s, 'binary').toString('base64'));
