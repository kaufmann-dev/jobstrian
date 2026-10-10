import { llmStatusFor } from '#lib/server/llm/connections.js';
import { toPersonSummary } from '#lib/server/people.js';
import { requirePerson } from '#lib/server/request-person.js';
import { hasSavedHomeLocation } from '#lib/server/settings-status.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ params, depends }) => {
	depends('app:settings-status');
	const person = await requirePerson(params);
	const llm = await llmStatusFor(person);
	return {
		person: toPersonSummary(person),
		configured: llm.verified,
		hasHome: hasSavedHomeLocation(person),
		hasSearchConfig: person.jobSearchKeywords.length > 0 && person.businessOsmTags.length > 0
	};
};
