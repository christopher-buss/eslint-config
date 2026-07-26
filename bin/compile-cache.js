import module from "node:module";

// ESLint's own bin enables this, so its CLI already benefits; a language server
// loading `dist/index.mjs` directly never does. Only the bins call it —
// `enableCompileCache` is a host-process side effect and the package declares
// `"sideEffects": false`. Importing it as a module keeps it ahead of the entry:
// static imports are evaluated before any statement of the importer.
module.enableCompileCache();
