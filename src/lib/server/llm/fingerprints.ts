import { createHash } from 'node:crypto';
import type { Lead, Listing, Settings } from '../db/schema';
import type { RawListing } from '../scrape/types';
import type { LlmConfig } from './client';
import { DRAFT_PROMPT_VERSION } from './draft-email';
import { profileBlock, RANK_PROMPT_VERSION } from './rank';

type ListingFingerprintInput = Pick<
	Listing,
	| 'source'
	| 'externalId'
	| 'title'
	| 'company'
	| 'location'
	| 'salary'
	| 'postedAt'
	| 'description'
	| 'url'
>;

type LeadFingerprintInput = Pick<
	Lead,
	'name' | 'category' | 'address' | 'distanceMeters' | 'website' | 'email'
>;

function canonical(value: unknown): string {
	return JSON.stringify(value, (_key, current) => {
		if (current instanceof Date) return current.toISOString();
		if (current === undefined) return null;
		return current;
	});
}

function hash(value: unknown): string {
	return createHash('sha256').update(canonical(value)).digest('hex');
}

function dateValue(value: Date | string | null | undefined): string | null {
	if (!value) return null;
	if (value instanceof Date) return value.toISOString();
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

export function listingContentHash(input: ListingFingerprintInput): string {
	return hash({
		source: input.source,
		externalId: input.externalId,
		title: input.title,
		company: input.company ?? null,
		location: input.location ?? null,
		salary: input.salary ?? null,
		postedAt: dateValue(input.postedAt),
		description: input.description ?? null,
		url: input.url
	});
}

export function rawListingContentHash(source: string, input: RawListing): string {
	return listingContentHash({
		source,
		externalId: input.externalId,
		title: input.title,
		company: input.company ?? null,
		location: input.location ?? null,
		salary: input.salary ?? null,
		postedAt: input.postedAt ?? null,
		description: input.description ?? null,
		url: input.url
	});
}

export function leadContentHash(input: LeadFingerprintInput): string {
	return hash({
		name: input.name,
		category: input.category ?? null,
		address: input.address ?? null,
		distanceMeters: input.distanceMeters,
		website: input.website ?? null,
		email: input.email ?? null
	});
}

export function rankingContextHash(settings: Settings, cfg: LlmConfig): string {
	return hash({
		promptVersion: RANK_PROMPT_VERSION,
		profile: profileBlock(settings),
		rankingNotes: settings.rankingNotes,
		baseUrl: cfg.baseUrl,
		model: cfg.model
	});
}

export function draftContextHash(settings: Settings, cfg: LlmConfig): string {
	return hash({
		promptVersion: DRAFT_PROMPT_VERSION,
		profile: profileBlock(settings),
		rankingNotes: settings.rankingNotes,
		baseUrl: cfg.baseUrl,
		model: cfg.model
	});
}

export function shouldRankListing(
	row: Listing,
	contextHash: string,
	contentHash = row.contentHash ?? listingContentHash(row)
): boolean {
	return (
		row.rankScore == null ||
		row.rankContentHash !== contentHash ||
		row.rankContextHash !== contextHash
	);
}

export function shouldRankLead(
	row: Lead,
	contextHash: string,
	contentHash = row.contentHash ?? leadContentHash(row)
): boolean {
	return (
		row.rankScore == null ||
		row.rankContentHash !== contentHash ||
		row.rankContextHash !== contextHash
	);
}

export function shouldDraftLead(
	row: Lead,
	contextHash: string,
	contentHash = row.contentHash ?? leadContentHash(row)
): boolean {
	if (!row.email) return false;
	const hasDraft = Boolean(row.draftSubject && row.draftBody);
	return !hasDraft || row.draftContentHash !== contentHash || row.draftContextHash !== contextHash;
}
