import { describe, it, expect } from 'vitest';
import { formatDuration, formatTemperature } from './formatStepTiming';

describe('formatDuration', () => {
  it('formats whole minutes', () => {
    expect(formatDuration(25, 'minutes')).toBe('25 min');
  });

  it('formats a single hour as "hr" (singular)', () => {
    expect(formatDuration(1, 'hours')).toBe('1 hr');
  });

  it('formats multiple hours as "hrs" (plural)', () => {
    expect(formatDuration(2, 'hours')).toBe('2 hrs');
  });

  it('rounds a non-clean decimal to 2 places', () => {
    expect(formatDuration(1.5, 'hours')).toBe('1.5 hrs');
  });
});

describe('formatTemperature', () => {
  it('formats Fahrenheit', () => {
    expect(formatTemperature(350, 'F')).toBe('350°F');
  });

  it('formats Celsius', () => {
    expect(formatTemperature(175, 'C')).toBe('175°C');
  });

  it('formats a negative temperature', () => {
    expect(formatTemperature(-18, 'C')).toBe('-18°C');
  });
});
