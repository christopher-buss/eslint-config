// Minimal ambient types for the subset of `file-entry-cache` v8 the lint
// runner uses. The package ships no type declarations of its own.
declare module "file-entry-cache" {
	interface FileDescriptor {
		key: string;
		changed?: boolean;
		notFound?: boolean;
	}

	interface FileEntryCache {
		getFileDescriptor: (file: string) => FileDescriptor;
		getUpdatedFiles: (files: Array<string>) => Array<string>;
		hasFileChanged: (file: string) => boolean;
	}

	interface FileEntryCacheModule {
		create: (cacheId: string, path?: string, useChecksum?: boolean) => FileEntryCache;
		createFromFile: (filePath: string, useChecksum?: boolean) => FileEntryCache;
	}

	const fileEntryCache: FileEntryCacheModule;
	export default fileEntryCache;
}
