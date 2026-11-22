import { describe, expect, it } from 'vitest';
import { isRequestAllowed } from './offlinePolicy';

describe('isRequestAllowed', () => {
  const dev = ['http://localhost:5173'];

  it('allows local app resources', () => {
    expect(isRequestAllowed('file:///C:/app/index.html', [])).toBe(true);
    expect(isRequestAllowed('data:image/png;base64,AAAA', [])).toBe(true);
    expect(isRequestAllowed('devtools://devtools/bundled/inspector.html', [])).toBe(true);
  });

  it('allows the Vite dev server and its hot-reload websocket only in development', () => {
    expect(isRequestAllowed('http://localhost:5173/src/main.tsx', dev)).toBe(true);
    expect(isRequestAllowed('ws://localhost:5173/', dev)).toBe(true);
    expect(isRequestAllowed('http://localhost:5173/src/main.tsx', [])).toBe(false);
  });

  it('blocks everything remote', () => {
    expect(isRequestAllowed('https://fonts.googleapis.com/css2?family=Inter', dev)).toBe(false);
    expect(isRequestAllowed('https://cdn.example.com/lib.js', dev)).toBe(false);
    expect(isRequestAllowed('http://localhost:9999/', dev)).toBe(false);
    expect(isRequestAllowed('not a url', dev)).toBe(false);
  });
});
