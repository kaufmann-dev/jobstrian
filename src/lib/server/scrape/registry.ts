import type { SourceAdapter } from './types';
import { willhaben } from './sources/willhaben';
import { karriere } from './sources/karriere';
import { hokify } from './sources/hokify';
import { ams } from './sources/ams';

export const ADAPTERS: Record<string, SourceAdapter> = {
	willhaben,
	karriere,
	hokify,
	ams
};

/** Adapters that drive a headless browser (heavier; need Chromium installed). */
export const BROWSER_ADAPTERS = new Set(['hokify', 'ams']);

export function getEnabledAdapters(enabled: string[]): SourceAdapter[] {
	return enabled.map((id) => ADAPTERS[id]).filter((a): a is SourceAdapter => Boolean(a));
}
