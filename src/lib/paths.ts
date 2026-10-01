import { resolve } from '$app/paths';
import type { ResolvedPathname } from '$app/types';

/** Resolve a dynamic app pathname (e.g. `/jobs?page=2`); `resolve` only types literal paths. */
export function resolveHref(pathname: string): ResolvedPathname {
	return (resolve as unknown as (path: string) => ResolvedPathname)(pathname.replace(/^\//, ''));
}
