import { describe, expect, it } from 'vitest';
import { DOMAIN_PACKAGE_NAME } from './index.js';

describe('Domain Package Baseline', () => {
  it('exports package name correctly', () => {
    expect(DOMAIN_PACKAGE_NAME).toBe('@cookout-ai/domain');
  });
});
