// Tests install happy-dom's Window (and a few React flags) onto globalThis; happy-dom's types aren't lib.dom's, so
// this is the one place that loosens globalThis to a plain bag of names.
export const testGlobals = globalThis as unknown as Record<string, unknown>
