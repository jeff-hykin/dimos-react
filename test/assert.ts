// The few @std/assert helpers the tests use, on vitest's expect
import { expect } from "vitest"

export function assert(condition: unknown, message?: string): asserts condition {
    if (!condition) {
        throw new Error(message ?? "assertion failed")
    }
}

export function assertEquals<T>(actual: T, expected: T, message?: string): void {
    expect(actual, message).toEqual(expected)
}

export function assertAlmostEquals(actual: number, expected: number, tolerance = 1e-7, message?: string): void {
    expect(Math.abs(actual - expected) <= tolerance, `${message ?? ""} ${actual} ≉ ${expected} (±${tolerance})`).toBe(
        true,
    )
}
