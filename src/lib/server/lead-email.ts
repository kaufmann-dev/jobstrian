import { sql, type SQL } from 'drizzle-orm';
import { lead, type Lead } from './db/schema';

type LeadEmailVisibility = Pick<
	Lead,
	'email' | 'emailManual' | 'emailQualityStatus' | 'emailSource'
>;

/**
 * Auto-discovered addresses the LLM marked as `rejected` are kept in the database so
 * the scrape run does not re-discover and re-review them on every refresh (which would
 * compound the LLM's misclassification rate), but they must never be shown to the user.
 * An address is user-visible only when it exists and is either manual or not auto-rejected.
 */
export function visibleLeadEmail(): SQL {
	return sql`${lead.email} is not null and (${lead.emailManual} or ${lead.emailQualityStatus} <> 'rejected')`;
}

/** True when the lead's stored address must stay hidden from the user. */
export function isLeadEmailHidden(row: LeadEmailVisibility): boolean {
	return row.email != null && !row.emailManual && row.emailQualityStatus === 'rejected';
}

/** Return the lead with its address cleared when it must stay invisible to the user. */
export function maskLeadEmail<T extends LeadEmailVisibility>(row: T): T {
	if (!isLeadEmailHidden(row)) return row;
	return { ...row, email: null, emailSource: null };
}
