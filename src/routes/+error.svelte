<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import SearchX from '@lucide/svelte/icons/search-x';
	import ShieldX from '@lucide/svelte/icons/shield-x';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';

	// SvelteKit's generic English messages ("Not Found", "Internal Error", ...) yield to the German copy.
	const detail = $derived.by(() => {
		const message = page.error?.message;
		const generic = ['Not Found', 'Forbidden', 'Internal Error', `Error: ${page.status}`];
		return message && !generic.includes(message) ? message : null;
	});

	const content = $derived.by(() => {
		if (page.status === 404)
			return {
				icon: SearchX,
				title: 'Seite nicht gefunden',
				description:
					detail ??
					'Diese Seite existiert nicht. Vielleicht wurde sie verschoben oder die Adresse enthält einen Tippfehler.'
			};
		if (page.status === 403)
			return {
				icon: ShieldX,
				title: 'Zugriff verweigert',
				description: detail ?? 'Du hast keine Berechtigung, diese Seite anzusehen.'
			};
		if (page.status < 500)
			return {
				icon: TriangleAlert,
				title: 'Anfrage konnte nicht ausgeführt werden',
				description: detail ?? 'Die Anfrage war ungültig.'
			};
		return {
			icon: TriangleAlert,
			title: 'Etwas ist schiefgelaufen',
			description: 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es gleich noch einmal.'
		};
	});
</script>

<svelte:head>
	<title>{content.title} · Jobstrian</title>
</svelte:head>

<Empty.Root class="min-h-svh">
	<Empty.Header>
		<Empty.Media variant="icon"><content.icon /></Empty.Media>
		<Empty.Title>{content.title}</Empty.Title>
		<Empty.Description>{content.description}</Empty.Description>
	</Empty.Header>
	<Empty.Content>
		<div class="flex flex-wrap justify-center gap-2">
			{#if page.status >= 500}
				<Button onclick={() => location.reload()}><RotateCcw />Erneut versuchen</Button>
			{/if}
			<Button href={resolve('/(app)')} variant={page.status >= 500 ? 'outline' : 'default'}>
				Zur Startseite
			</Button>
		</div>
		<p class="text-xs text-muted-foreground">Fehler {page.status}</p>
	</Empty.Content>
</Empty.Root>
