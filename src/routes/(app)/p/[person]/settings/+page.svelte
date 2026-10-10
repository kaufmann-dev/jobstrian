<script lang="ts">
	import SettingsForm from './settings-form.svelte';

	let { data } = $props();
</script>

<!-- Remount per person: form state and pending autosaves must never carry over between people. -->
{#key data.person.id}
	<SettingsForm {data} />
{/key}
