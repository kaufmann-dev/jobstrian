import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { env } from '$env/dynamic/private';
import { db } from './db';
import * as schema from './db/schema';

// During `vite build` no runtime env is injected, so fall back to placeholders
// that are only ever used at build time (no requests are served then). Real
// values come from the environment at dev/runtime.
const secret = env.BETTER_AUTH_SECRET || 'build-time-placeholder-secret-not-used-at-runtime';
const baseURL = env.ORIGIN || 'http://localhost:5173';

export const auth = betterAuth({
	secret,
	baseURL,
	database: drizzleAdapter(db, {
		provider: 'pg',
		schema: {
			user: schema.user,
			session: schema.session,
			account: schema.account,
			verification: schema.verification
		}
	}),
	emailAndPassword: {
		enabled: true,
		// Single-user personal tool — no public sign-up flow or email verification.
		requireEmailVerification: false
	},
	plugins: [sveltekitCookies(getRequestEvent)]
});

export type AuthSession = typeof auth.$Infer.Session;
