import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import 'monaco-editor/esm/vs/basic-languages/sql/sql.contribution.js';
import { loader } from '@monaco-editor/react';

/**
 * By default @monaco-editor/react pulls Monaco from a CDN at runtime. Strapi's admin
 * ships a `script-src 'self'` CSP, which blocks that request and leaves the editor
 * stuck on "Loading…". Bundling Monaco and handing the instance to the loader keeps
 * everything same-origin.
 */
loader.config({ monaco });

/**
 * Monaco spins up a web worker for its editor services. SQL is highlighted by a
 * Monarch tokenizer that runs on the main thread, so no worker is actually needed —
 * and a blob/data-URL worker would be blocked by the same CSP. Hand back an inert
 * worker so Monaco's service never attempts a network fetch.
 */
class InertWorker implements Worker {
  onmessage = null;
  onmessageerror = null;
  onerror = null;
  postMessage() {}
  terminate() {}
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() {
    return false;
  }
}

declare global {
  interface Window {
    MonacoEnvironment?: { getWorker: () => Worker };
  }
}

if (typeof window !== 'undefined' && !window.MonacoEnvironment) {
  window.MonacoEnvironment = { getWorker: () => new InertWorker() };
}
