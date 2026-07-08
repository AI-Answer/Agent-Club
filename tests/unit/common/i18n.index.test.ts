/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { SUPPORTED_LANGUAGES, normalizeLanguageCode } from '@/common/config/i18n';

// Agent Club currently ships English-only in the language picker — see
// i18n-config.test.ts for why (other locale dirs still exist on disk).
describe('common i18n config module', () => {
  it('falls back unsupported locales (e.g. uk-UA) to the default language', () => {
    expect(normalizeLanguageCode('uk')).toBe('en-US');
    expect(normalizeLanguageCode('uk-UA')).toBe('en-US');
    expect(normalizeLanguageCode('UK-UA')).toBe('en-US');
  });

  it('normalizes en-US as itself', () => {
    expect(normalizeLanguageCode('en-US')).toBe('en-US');
    expect(normalizeLanguageCode('en_US')).toBe('en-US');
  });

  it('has exactly the currently-supported languages', () => {
    expect(SUPPORTED_LANGUAGES).toEqual(['en-US']);
  });
});
