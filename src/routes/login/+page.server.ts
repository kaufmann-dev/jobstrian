import { safeReturnTo } from '#lib/oidc-policy.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => ({
	providerError: url.searchParams.has('error'),
	returnTo: safeReturnTo(url.searchParams.get('returnTo'))
});
