// node --experimental-strip-types scripts/check-cn.ts
import assert from "node:assert/strict";
import { cn } from "../lib/utils.ts";

// A className passed by a caller must win over the component's own class.
assert.equal(cn("shadow-sm", "shadow-card"), "shadow-card");
assert.equal(cn("shadow-card", "shadow-pop"), "shadow-pop");
assert.equal(cn("shadow-pop", "shadow-none"), "shadow-none");
assert.equal(cn("animate-fade-in", "animate-spin"), "animate-spin");
// The usual groups still merge, and unrelated classes are left alone.
assert.equal(cn("h-9", "h-11"), "h-11");
assert.equal(cn("rounded-lg", "rounded-2xl"), "rounded-2xl");
assert.equal(cn("shadow-card", "bg-muted"), "shadow-card bg-muted");
console.log("✓ cn");
