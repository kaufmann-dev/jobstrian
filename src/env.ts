import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (input: string | undefined) => input;

export const variables = defineEnvVars({
	DATABASE_URL: { description: 'PostgreSQL connection string', schema: optional },
	NODE_ENV: { schema: optional },
	GEOAPIFY_API_KEY: { description: 'Geoapify API key for location suggestions', schema: optional },
	ORIGIN: { description: 'Public URL of the deployed app', schema: optional },
	BETTER_AUTH_SECRET: {
		description: 'Secret signing Better Auth session cookies',
		schema: optional
	},
	OIDC_ISSUER: { description: 'OIDC issuer URL', schema: optional },
	OIDC_CLIENT_ID: { description: 'OIDC client ID', schema: optional },
	OIDC_CLIENT_SECRET: { description: 'OIDC client secret', schema: optional }
});
