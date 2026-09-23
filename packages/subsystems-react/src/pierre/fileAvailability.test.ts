import { describe, expect, test } from 'bun:test';
import { fileUnavailableNotice, isFileUnavailableError } from './fileAvailability';

describe('isFileUnavailableError', () => {
  test('matches the host "no local checkout" family', () => {
    expect(
      isFileUnavailableError(
        'file not found in graph repos: packages/subsystems-studio/src/bun/subsystem-model-runs.ts',
      ),
    ).toBe(true);
    expect(isFileUnavailableError('graph has no local root for this file')).toBe(
      true,
    );
    expect(isFileUnavailableError('no local checkout for this repo')).toBe(true);
  });

  test('leaves genuine I/O errors alone', () => {
    expect(isFileUnavailableError('EACCES: permission denied')).toBe(false);
    expect(isFileUnavailableError('')).toBe(false);
    expect(isFileUnavailableError(null)).toBe(false);
    expect(isFileUnavailableError(undefined)).toBe(false);
  });
});

describe('fileUnavailableNotice', () => {
  test('names proposed work as planned, not missing', () => {
    expect(
      fileUnavailableNotice('src/a.ts', true),
    ).toBe("Proposed — src/a.ts isn't in the local checkout yet.");
  });

  test('falls back to a plain not-in-checkout notice', () => {
    expect(fileUnavailableNotice('src/a.ts')).toBe(
      'Not in the local checkout: src/a.ts',
    );
    expect(fileUnavailableNotice('src/a.ts', false)).toBe(
      'Not in the local checkout: src/a.ts',
    );
  });
});
