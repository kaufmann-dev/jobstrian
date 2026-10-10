import { describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/server';

vi.mock('../db', () => ({ db: {} }));

import { MCP_SCOPES, TOOL_SCOPES } from './scopes';
import { createMcpServer } from './tools';

type Registration = {
	name: string;
	annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
};

function registeredTools(scopes: string[]): Registration[] {
	const spy = vi.spyOn(McpServer.prototype, 'registerTool');
	try {
		createMcpServer(new Set(scopes));
		return spy.mock.calls.map(([name, config]) => ({
			name: name as string,
			annotations: (config as Registration).annotations
		}));
	} finally {
		spy.mockRestore();
	}
}

describe('MCP tool scopes', () => {
	it('registers exactly the tools listed in TOOL_SCOPES when every scope is granted', () => {
		const names = registeredTools(Object.keys(MCP_SCOPES)).map((tool) => tool.name);
		expect(names.sort()).toEqual(Object.keys(TOOL_SCOPES).sort());
	});

	it('only uses declared scopes', () => {
		for (const scope of Object.values(TOOL_SCOPES)) expect(scope in MCP_SCOPES).toBe(true);
	});

	it('exposes read tools only to read tokens, all of them read-only', () => {
		const tools = registeredTools(['applications:read']);
		expect(tools.length).toBeGreaterThan(0);
		for (const tool of tools) {
			expect(TOOL_SCOPES[tool.name as keyof typeof TOOL_SCOPES]).toBe('applications:read');
			expect(tool.annotations?.readOnlyHint).toBe(true);
		}
	});

	it('never marks a write tool read-only and flags deletion as destructive', () => {
		const tools = registeredTools(['applications:write']);
		expect(tools.length).toBeGreaterThan(0);
		for (const tool of tools) {
			expect(TOOL_SCOPES[tool.name as keyof typeof TOOL_SCOPES]).toBe('applications:write');
			expect(tool.annotations?.readOnlyHint).not.toBe(true);
		}
		expect(tools.find((tool) => tool.name === 'delete_application')?.annotations).toMatchObject({
			destructiveHint: true
		});
	});

	it('exposes nothing without a tool scope', () => {
		expect(registeredTools(['openid', 'offline_access'])).toEqual([]);
	});
});
