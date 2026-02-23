// Stub replacement for thread-stream package to avoid bundling unnecessary
// Node-specific code and tests. Used via webpack alias mapping.

// Provide a minimal interface expected by any consumer. If consumers only
// check for existence of the module or call methods that aren't used in
// browser, this empty stub will be safe.
module.exports = {};
