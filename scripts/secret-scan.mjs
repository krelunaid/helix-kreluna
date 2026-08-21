#!/usr/bin/env node

// Backward-compatible entry point. Keep one detector implementation only.
if (!process.argv.includes("--worktree-only")) process.argv.push("--worktree-only");
await import("./secret-history-scan.mjs");
