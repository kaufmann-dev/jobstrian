import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

const databaseUrl =
	env.DATABASE_URL ??
	(env.NODE_ENV === 'test' ? 'postgres://test:test@127.0.0.1:1/jobstrian_test' : undefined);
if (!databaseUrl) throw new Error('DATABASE_URL ist nicht gesetzt.');

const client = postgres(databaseUrl);

export const db = drizzle(client, { schema });
