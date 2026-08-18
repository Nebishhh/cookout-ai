import { describe, it, expect } from 'vitest';
import {
  formatClockTime,
  formatDuration,
  formatTemperature,
  formatTotalMinutes,
} from './formatStepTiming';

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

describe('formatClockTime', () => {
  it('formats afternoon and evening times', () => {
    expect(formatClockTime(18 * 60)).toBe('6:00 PM');
    expect(formatClockTime(15 * 60 + 30)).toBe('3:30 PM');
  });

  it('formats morning times', () => {
    expect(formatClockTime(9 * 60 + 5)).toBe('9:05 AM');
  });

  it('formats the 12-hour boundaries correctly', () => {
    expect(formatClockTime(0)).toBe('12:00 AM'); // midnight, not 0:00
    expect(formatClockTime(12 * 60)).toBe('12:00 PM'); // noon, not 0:00 PM
    expect(formatClockTime(23 * 60 + 59)).toBe('11:59 PM');
  });

  it('wraps a negative time into the previous day rather than showing a negative clock', () => {
    // 2h before midnight = 10pm the day before — a real case for a long overnight cook.
    expect(formatClockTime(-120)).toBe('10:00 PM (prev. day)');
  });

  it('reports how many days earlier for a very long cook', () => {
    expect(formatClockTime(-(24 * 60) - 120)).toBe('10:00 PM (2 days earlier)');
  });
});

describe('formatTotalMinutes', () => {
  it('formats sub-hour durations', () => {
    expect(formatTotalMinutes(45)).toBe('45 min');
  });

  it('formats whole hours without a stray minute component', () => {
    expect(formatTotalMinutes(120)).toBe('2 hr');
  });

  it('formats mixed hours and minutes', () => {
    expect(formatTotalMinutes(135)).toBe('2 hr 15 min');
  });

  it('renders zero and negative totals as 0 min', () => {
    expect(formatTotalMinutes(0)).toBe('0 min');
    expect(formatTotalMinutes(-5)).toBe('0 min');
  });
});
