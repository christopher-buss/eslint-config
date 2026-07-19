// Minimal ambient types for the subset of `file-entry-cache` v8 the lint
// runner uses. The package ships no type declarations of its own.
declare module "file-entry-cache" {
	interface FileDescriptor {
		key: string;
		changed?: boolean;
		notFound?: boolean;
	}

	// The underlying `flat-cache` store. Exposed so the runner can remove
	// individual entries and persist them without pruning the (unvisited)
	// remainder of the cache.
	interface FlatCache {
		keys: () => Array<string>;
		removeKey: (key: string) => void;
		save: (noPrune?: boolean) => void;
	}

	interface FileEntryCache {
		cache: FlatCache;
		getFileDescriptor: (file: string) => FileDescriptor;
		getUpdatedFiles: (files: Array<string>) => Array<string>;
		hasFileChanged: (file: string) => boolean;
		reconcile: (noPrune?: boolean) => void;
		removeEntry: (entryName: string) => void;
	}

	interface FileEntryCacheModule {
		create: (cacheId: string, path?: string, useChecksum?: boolean) => FileEntryCache;
		createFromFile: (filePath: string, useChecksum?: boolean) => FileEntryCache;
	}

	const fileEntryCache: FileEntryCacheModule;
	export default fileEntryCache;
}
