import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Runs against a real, migrated PostgreSQL database and creates/deletes its own people.
 * Skipped unless TEST_DATABASE_URL is set AND DATABASE_URL points at the same database, so it
 * can never run against a database by accident:
 *   U=postgres://… TEST_DATABASE_URL=$U DATABASE_URL=$U pnpm exec vitest run --project server service.db
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl) && process.env.DATABASE_URL === databaseUrl;

describe.skipIf(!enabled)('applications service (database)', () => {
	let service: typeof import('./service');
	let people: typeof import('../people');
	let dbModule: typeof import('../db');
	let schema: typeof import('../db/schema');
	const created: number[] = [];
	let ana = 0;
	let ben = 0;

	beforeAll(async () => {
		service = await import('./service');
		people = await import('../people');
		dbModule = await import('../db');
		schema = await import('../db/schema');
		const suffix = Date.now().toString(36);
		ana = (await people.createPerson({ name: `Ana ${suffix}` })).id;
		ben = (await people.createPerson({ name: `Ben ${suffix}` })).id;
		created.push(ana, ben);
	});

	afterAll(async () => {
		for (const id of created) await people.deletePerson(id);
	});

	const input = (companyName: string, patch = {}) =>
		({
			companyName,
			positionTitle: '',
			url: '',
			location: '',
			contactName: '',
			contactEmail: '',
			contactPhone: '',
			channel: 'email',
			status: 'applied',
			appliedOn: null,
			nextStepOn: null,
			nextStepNote: '',
			notes: '',
			...patch
		}) as Parameters<typeof service.createApplication>[1];

	it('starts the first search automatically and allows only one running search', async () => {
		const first = await service.createApplication(ana, input('Café Central'));
		const searches = await service.listSearches(ana);
		expect(searches).toHaveLength(1);
		expect(searches[0].status).toBe('searching');
		expect(first.searchId).toBe(searches[0].id);

		await expect(
			service.createSearch(ana, { title: 'Zweite', goal: '', notes: '' })
		).rejects.toMatchObject({ status: 409 });
	});

	it('keeps people strictly separated', async () => {
		const [own] = (await service.listApplications({ personId: ana })).items;
		await expect(service.getApplication(ben, own.id)).rejects.toMatchObject({ status: 404 });
		await expect(service.deleteApplication(ben, own.id)).rejects.toMatchObject({ status: 404 });
		await expect(
			service.setApplicationStatus(ben, own.id, { status: 'interview', note: '' })
		).rejects.toMatchObject({ status: 404 });
		expect((await service.listApplications({ personId: ben })).items).toHaveLength(0);
	});

	it('stamps the first reaction and only shows real replies in the responded bucket', async () => {
		const ghost = await service.createApplication(
			ana,
			input('Ghost GmbH', { appliedOn: '2020-01-01' })
		);
		const reply = await service.createApplication(ana, input('Antwort AG'));
		expect(ghost.bucket).toBe('ghosted');
		expect(reply.bucket).toBe('waiting');
		expect(reply.respondedAt).toBeNull();

		const interview = await service.setApplicationStatus(ana, reply.id, {
			status: 'interview',
			note: 'Telefonat',
			nextStepOn: '2030-01-01'
		});
		expect(interview.bucket).toBe('responded');
		expect(interview.respondedAt).not.toBeNull();

		const responded = await service.listApplications({ personId: ana, bucket: 'responded' });
		expect(responded.items.map((item) => item.companyName)).toEqual(['Antwort AG']);
		expect(responded.bucketCounts.ghosted).toBeGreaterThanOrEqual(1);

		const { events } = await service.getApplication(ana, reply.id);
		expect(events.map((event) => event.status)).toEqual(['interview', 'applied']);
	});

	it('closes the search when a job is accepted and then allows a new one', async () => {
		const [open] = (await service.listApplications({ personId: ana, bucket: 'responded' })).items;
		await service.setApplicationStatus(ana, open.id, { status: 'accepted', note: 'Vertrag!' });

		const [search] = await service.listSearches(ana);
		expect(search.status).toBe('found');
		expect(search.endedOn).not.toBeNull();
		expect(search.acceptedCompany).toBe('Antwort AG');

		const next = await service.createSearch(ana, { title: 'Jobsuche später', goal: '', notes: '' });
		expect(next.status).toBe('searching');
		expect(await service.listSearches(ana)).toHaveLength(2);
	});

	it('records an application per Betrieb exactly once', async () => {
		const { db } = dbModule;
		const [row] = await db
			.insert(schema.lead)
			.values({
				personId: ben,
				osmId: `node/${Date.now()}`,
				name: 'Bäckerei Test',
				lat: 1,
				lon: 1,
				distanceMeters: 10,
				email: 'info@baeckerei.test'
			})
			.returning();
		const first = await service.ensureApplicationForLead(row.id);
		const again = await service.ensureApplicationForLead(row.id);
		expect(again.id).toBe(first.id);
		expect(first).toMatchObject({
			personId: ben,
			companyName: 'Bäckerei Test',
			status: 'applied',
			source: 'lead',
			channel: 'email'
		});
	});

	it('summarises each person without counting sent applications as progress', async () => {
		const [summary] = await service.overview(ben);
		expect(summary.person.id).toBe(ben);
		expect(summary.bucketCounts.responded).toBe(0);
		expect(summary.sent).toBe(1);
	});
});
