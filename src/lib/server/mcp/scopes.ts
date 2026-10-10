/** OAuth scopes guarding the tools. Tokens only see and call the tools their scopes allow. */
export const MCP_SCOPES = {
	'applications:read': 'Personen, Suchen und Bewerbungen ansehen',
	'applications:write': 'Suchen und Bewerbungen anlegen, ändern und löschen'
} as const;

export type McpScope = keyof typeof MCP_SCOPES;

/** Every MCP tool and the scope it needs. New tools must be registered here. */
export const TOOL_SCOPES = {
	list_people: 'applications:read',
	get_overview: 'applications:read',
	list_searches: 'applications:read',
	list_applications: 'applications:read',
	get_application: 'applications:read',
	create_search: 'applications:write',
	update_search: 'applications:write',
	create_application: 'applications:write',
	update_application: 'applications:write',
	set_application_status: 'applications:write',
	add_application_note: 'applications:write',
	delete_application: 'applications:write'
} as const satisfies Record<string, McpScope>;

export type McpToolName = keyof typeof TOOL_SCOPES;
