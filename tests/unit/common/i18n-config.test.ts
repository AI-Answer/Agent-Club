/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { SUPPORTED_LANGUAGES } from '@/common/config/i18n';

describe('i18n config', () => {
  // Agent Club currently ships English-only in the language picker — the
  // other locale directories on disk (zh-CN, ja-JP, uk-UA, ...) still have
  // real translations and can be re-enabled by widening this list, but
  // aren't currently exposed.
  it('supports only en-US for now', () => {
    expect(SUPPORTED_LANGUAGES).toEqual(['en-US']);
  });
});
