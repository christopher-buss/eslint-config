// Minimal ambient types for the subset of `file-entry-cache` v8 the lint
// runner uses. The package ships no type declarations of its own.
declare module "file-entry-cache" {
	// What ESLint stores beside each entry's size/mtime: the lint result it
	// replays for an unchanged file. Only `messages` matters to the runner --
	// a non-empty list is a file the last check run had something to say about.
	interface FileEntryMeta {
		results?: { messages?: Array<unknown> };
	}

	interface FileDescriptor {
		key: string;
		changed?: boolean;
		meta: FileEntryMeta;
		notFound?: boolean;
	}

	// The underlying `flat-cache` store. Exposed so the runner can remove
	// individual entries and persist them without pruning the (unvisited)
	// remainder of the cache.
	interface FlatCache {
		getKey: (key: string) => FileEntryMeta | undefined;
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
