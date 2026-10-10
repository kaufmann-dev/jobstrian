<script lang="ts">
	import PageHeader from '#lib/components/page-header.svelte';
	import AppSettingsCard from './app-settings-card.svelte';
	import ConnectedAppsCard from './connected-apps-card.svelte';
	import LlmConnectionsCard from './llm-connections-card.svelte';
	import PeopleCard from './people-card.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>App-Einstellungen · Jobstrian</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6">
	<PageHeader
		title="App-Einstellungen"
		description="Personen, KI-Verbindungen und Standardwerte für alle Bewerbungen."
	/>

	<PeopleCard people={data.people} personForm={data.personForm} />
	<LlmConnectionsCard
		connections={data.connections}
		connectionForm={data.connectionForm}
		addModelsForm={data.addModelsForm}
	/>
	<AppSettingsCard appSettingsForm={data.appSettingsForm} connections={data.connections} />
	<ConnectedAppsCard connectedApps={data.connectedApps} mcpUrl={data.mcpUrl} />
</div>
