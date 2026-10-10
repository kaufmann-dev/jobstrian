<script lang="ts">
	import type { ClassValue } from 'svelte/elements';
	import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from '#lib/applications.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import Handshake from '@lucide/svelte/icons/handshake';
	import MessagesSquare from '@lucide/svelte/icons/messages-square';
	import Reply from '@lucide/svelte/icons/reply';
	import Trophy from '@lucide/svelte/icons/trophy';
	import { STATUS_BADGE_CLASS } from './application-helpers.js';

	interface Props {
		status: ApplicationStatus;
		/** Quiet outline instead of the status accent, for the tabs without a reply. */
		muted?: boolean;
		class?: ClassValue;
	}

	let { status, muted = false, class: className }: Props = $props();

	const icons = {
		replied: Reply,
		interview: MessagesSquare,
		offer: Handshake,
		accepted: Trophy
	} as const;

	const accent = $derived(muted ? undefined : STATUS_BADGE_CLASS[status]);
	const Icon = $derived(accent && status in icons ? icons[status as keyof typeof icons] : null);
</script>

<Badge
	variant={accent ? 'secondary' : 'outline'}
	class={[accent ?? 'text-muted-foreground', className]}
>
	{#if Icon}<Icon />{/if}
	{APPLICATION_STATUS_LABELS[status]}
</Badge>
