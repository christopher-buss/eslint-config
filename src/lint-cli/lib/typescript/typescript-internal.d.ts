// cspell:words buildinfo
import type { System } from "typescript";

// One TypeScript export the compiler's public `.d.ts` does not declare, used by
// `buildinfo.ts`. It has to be reached somehow: it is the exact function that
// produced the `fileInfos[].version` hashes in a `.tsbuildinfo`, and writing
// the hash out again locally would mean tracking the compiler's
// inline-source-map stripping and hash choice — drifting silently, since a
// wrong hash only ever means "never matches" and so degrades into never taking
// the fast path.
//
// Typed as possibly-undefined, which is the honest shape for an undeclared
// export: the runtime check that guards it is then a real check rather than
// something the type system has been told to ignore.
declare module "typescript" {
	// eslint-disable-next-line id-length -- The compiler owns this name.
	const getSourceFileVersionAsHashFromText: ((host: System, text: string) => string) | undefined;
}
