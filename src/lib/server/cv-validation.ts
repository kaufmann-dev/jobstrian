const ALLOWED_MIME_TYPES = new Set(['application/pdf']);
const ALLOWED_EXTENSIONS = new Set(['.pdf']);
const GENERIC_MIME_TYPES = new Set(['', 'application/octet-stream']);

function extension(name: string): string {
	const index = name.lastIndexOf('.');
	return index === -1 ? '' : name.slice(index).toLowerCase();
}

export function isAllowedCvFile(file: File): boolean {
	const ext = extension(file.name);
	if (!ALLOWED_EXTENSIONS.has(ext)) return false;
	return ALLOWED_MIME_TYPES.has(file.type) || GENERIC_MIME_TYPES.has(file.type);
}
