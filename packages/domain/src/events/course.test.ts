import { describe, expect, it } from 'vitest';
import { Course, COURSE_ORDER, isCourse } from './course.js';

describe('Course', () => {
  it('COURSE_ORDER contains every Course value exactly once', () => {
    const values = Object.values(Course);
    expect([...COURSE_ORDER].sort()).toEqual([...values].sort());
    expect(new Set(COURSE_ORDER).size).toBe(COURSE_ORDER.length);
  });

  it('orders courses the way a meal is served, with Other last', () => {
    expect(COURSE_ORDER).toEqual([
      Course.Main,
      Course.Side,
      Course.Dessert,
      Course.Drink,
      Course.Other,
    ]);
  });

  it('isCourse accepts exactly the Course values', () => {
    for (const course of COURSE_ORDER) expect(isCourse(course)).toBe(true);
    for (const bad of ['main', 'Starter', '', null, undefined, 3, {}]) {
      expect(isCourse(bad)).toBe(false);
    }
  });
});
