/* global describe, test, expect */
import { calculateProfileData, calculateGirth } from "./geometry";

describe("geometry helpers", () => {
  test("calculateGirth sums lengths", () => {
    expect(calculateGirth([{ length: 100 }, { length: 200 }])).toBe(300);
  });

  test("straight-line profile", () => {
    // both segments pointing in the same direction
    const folds = [
      { length: 100, angle: 0 },
      { length: 50, angle: 0 },
    ];
    const { points, directions } = calculateProfileData(folds);
    expect(points).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 150, y: 0 },
    ]);
    expect(directions).toEqual([0, 0]);
  });

  test("right-angle bend", () => {
    // first segment east, second north
    const folds = [
      { length: 100, angle: 0 },
      { length: 50, angle: 90 },
    ];
    const { points, directions } = calculateProfileData(folds);
    expect(Math.round(points[1].x)).toBe(100);
    expect(Math.round(points[1].y)).toBe(0);
    expect(Math.round(points[2].x)).toBe(100);
    expect(Math.round(points[2].y)).toBe(50);
    expect(directions).toEqual([0, 90]);
  });
});
