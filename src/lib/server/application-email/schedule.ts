const TIME_ZONE = 'Europe/Vienna';
const BUSINESS_START_HOUR = 9;
const BUSINESS_END_HOUR = 18;

const formatter = new Intl.DateTimeFormat('en-GB', {
	timeZone: TIME_ZONE,
	weekday: 'short',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hourCycle: 'h23'
});

type ZonedParts = {
	weekday: string;
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
	second: number;
};

function zonedParts(date: Date): ZonedParts {
	const parts = Object.fromEntries(
		formatter.formatToParts(date).map((part) => [part.type, part.value])
	);
	return {
		weekday: parts.weekday,
		year: Number(parts.year),
		month: Number(parts.month),
		day: Number(parts.day),
		hour: Number(parts.hour),
		minute: Number(parts.minute),
		second: Number(parts.second)
	};
}

function localEpoch(
	parts: Pick<ZonedParts, 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second'>
) {
	return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

function dateInVienna(
	year: number,
	month: number,
	day: number,
	hour: number,
	minute = 0,
	second = 0
): Date {
	const wanted = { year, month, day, hour, minute, second };
	let utc = localEpoch(wanted);
	for (let i = 0; i < 4; i++) {
		const actual = zonedParts(new Date(utc));
		const delta = localEpoch(wanted) - localEpoch(actual);
		if (delta === 0) break;
		utc += delta;
	}
	return new Date(utc);
}

function addLocalDays(parts: Pick<ZonedParts, 'year' | 'month' | 'day'>, days: number) {
	const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12));
	return {
		year: date.getUTCFullYear(),
		month: date.getUTCMonth() + 1,
		day: date.getUTCDate()
	};
}

function isSendDay(weekday: string, sendOnWeekends: boolean): boolean {
	return sendOnWeekends || (weekday !== 'Sat' && weekday !== 'Sun');
}

function isInsideSendWindow(parts: ZonedParts, sendOnWeekends: boolean): boolean {
	return (
		isSendDay(parts.weekday, sendOnWeekends) &&
		parts.hour >= BUSINESS_START_HOUR &&
		parts.hour < BUSINESS_END_HOUR
	);
}

function nextSendDay(
	parts: Pick<ZonedParts, 'year' | 'month' | 'day'>,
	sendOnWeekends: boolean
): Date {
	let cursor = addLocalDays(parts, 1);
	for (;;) {
		const candidate = dateInVienna(cursor.year, cursor.month, cursor.day, BUSINESS_START_HOUR);
		if (isSendDay(zonedParts(candidate).weekday, sendOnWeekends)) return candidate;
		cursor = addLocalDays(cursor, 1);
	}
}

export function nextApplicationEmailWindowStart(after = new Date(), sendOnWeekends = false): Date {
	const parts = zonedParts(after);
	if (isInsideSendWindow(parts, sendOnWeekends)) return after;
	if (isSendDay(parts.weekday, sendOnWeekends) && parts.hour < BUSINESS_START_HOUR) {
		return dateInVienna(parts.year, parts.month, parts.day, BUSINESS_START_HOUR);
	}
	return nextSendDay(parts, sendOnWeekends);
}

function secondsBetween(min: number, max: number, random: () => number): number {
	return min + random() * (max - min);
}

function viennaDayKey(parts: Pick<ZonedParts, 'year' | 'month' | 'day'>): string {
	return `${parts.year}-${parts.month}-${parts.day}`;
}

export function viennaDayBounds(date = new Date()): { start: Date; end: Date } {
	const parts = zonedParts(date);
	const next = addLocalDays(parts, 1);
	return {
		start: dateInVienna(parts.year, parts.month, parts.day, 0, 0, 0),
		end: dateInVienna(next.year, next.month, next.day, 0, 0, 0)
	};
}

export function scheduleApplicationEmails(
	count: number,
	options: {
		from?: Date;
		random?: () => number;
		dailyLimit?: number;
		sendOnWeekends?: boolean;
		alreadySentToday?: number;
	} = {}
): Date[] {
	const sendOnWeekends = options.sendOnWeekends ?? false;
	const random = options.random ?? Math.random;
	const dailyLimit =
		options.dailyLimit && options.dailyLimit > 0 ? options.dailyLimit : Number.POSITIVE_INFINITY;
	const from = options.from ?? new Date();
	const dates: Date[] = [];
	let cursor = nextApplicationEmailWindowStart(from, sendOnWeekends);
	let currentDay = viennaDayKey(zonedParts(cursor));
	// Today's already-sent count only applies when sending actually resumes today;
	// an after-hours or weekend start begins on a fresh day with a full budget.
	let sentToday =
		currentDay === viennaDayKey(zonedParts(from)) ? (options.alreadySentToday ?? 0) : 0;

	for (let i = 0; i < count; i++) {
		cursor = nextApplicationEmailWindowStart(cursor, sendOnWeekends);
		const day = viennaDayKey(zonedParts(cursor));
		if (day !== currentDay) {
			currentDay = day;
			sentToday = 0;
		}
		if (sentToday >= dailyLimit) {
			cursor = nextSendDay(zonedParts(cursor), sendOnWeekends);
			currentDay = viennaDayKey(zonedParts(cursor));
			sentToday = 0;
		}
		dates.push(cursor);
		sentToday++;
		const delaySeconds = secondsBetween(30, 90, random);
		cursor = new Date(cursor.getTime() + Math.round(delaySeconds * 1000));
	}

	return dates;
}

export function isApplicationEmailSendWindow(date = new Date(), sendOnWeekends = false): boolean {
	return isInsideSendWindow(zonedParts(date), sendOnWeekends);
}
