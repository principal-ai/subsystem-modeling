import { describe, expect, test } from 'bun:test';
import { PROTOCOL_COLOR, PROTOCOL_COLOR_FALLBACK, protocolColor } from './c4';

describe('protocolColor', () => {
  test('maps a known protocol to its hue', () => {
    expect(protocolColor('HTTP')).toBe(PROTOCOL_COLOR.http);
    expect(protocolColor('RPC')).toBe(PROTOCOL_COLOR.rpc);
    expect(protocolColor('file I/O')).toBe(PROTOCOL_COLOR['file i/o']);
  });

  test('matches a token inside a longer protocol string', () => {
    expect(protocolColor('Electrobun RPC')).toBe(PROTOCOL_COLOR.rpc);
    expect(protocolColor('HTTPS')).toBe(PROTOCOL_COLOR.https);
  });

  test('prefers the longest matching token', () => {
    // `JSON-RPC` must find `json-rpc`, not the shorter `rpc`.
    expect(protocolColor('JSON-RPC')).toBe(PROTOCOL_COLOR['json-rpc']);
  });

  test('falls back for an unknown or missing protocol', () => {
    expect(protocolColor('carrier pigeon')).toBe(PROTOCOL_COLOR_FALLBACK);
    expect(protocolColor(undefined)).toBe(PROTOCOL_COLOR_FALLBACK);
    expect(protocolColor('')).toBe(PROTOCOL_COLOR_FALLBACK);
  });
});
