#!/usr/bin/env node
/**
 * MCP Server — Model Context Protocol server for the AI Implementation Simulator
 *
 * Exposes 3 tools via stdio transport:
 * 1. search_knowledge_base — RAG-powered search over Meaningful AI knowledge
 * 2. get_company_context — Retrieve business context for a workshop session
 * 3. get_session_progress — Get current phase, gear, and collected data
 *
 * Run: cd server && npx tsx src/mcp/index.ts
 */

import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { searchContentChunks, formatContentContext } from '../services/rag.js';
import { query } from '../db/index.js';

const server = new Server(
    {
        name: 'meaningful-ai-simulator',
        version: '1.0.0',
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: 'search_knowledge_base',
            description: 'Search the Meaningful AI knowledge base using RAG (Retrieval-Augmented Generation). Returns relevant passages about AI strategy, implementation frameworks, and methodology.',
            inputSchema: {
                type: 'object' as const,
                properties: {
                    query: {
                        type: 'string',
                        description: 'The search query — a question or topic about AI strategy, implementation, or technology',
                    },
                },
                required: ['query'],
            },
        },
        {
            name: 'get_company_context',
            description: 'Retrieve the business context extracted from a company website during a workshop session.',
            inputSchema: {
                type: 'object' as const,
                properties: {
                    session_id: {
                        type: 'string',
                        description: 'The workshop session UUID',
                    },
                },
                required: ['session_id'],
            },
        },
        {
            name: 'get_session_progress',
            description: 'Get the current progress of a workshop session — phase, gear level, active agent, and key data collected.',
            inputSchema: {
                type: 'object' as const,
                properties: {
                    session_id: {
                        type: 'string',
                        description: 'The workshop session UUID',
                    },
                },
                required: ['session_id'],
            },
        },
    ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
        case 'search_knowledge_base': {
            const searchQuery = (args as any)?.query;
            if (!searchQuery) {
                return { content: [{ type: 'text', text: 'Error: query parameter is required' }] };
            }
            try {
                const chunks = await searchContentChunks(searchQuery, '', '', undefined);
                if (chunks.length === 0) {
                    return { content: [{ type: 'text', text: 'No relevant knowledge base passages found for this query.' }] };
                }
                const formatted = formatContentContext(chunks);
                return { content: [{ type: 'text', text: formatted }] };
            } catch (err: any) {
                return { content: [{ type: 'text', text: `Error searching knowledge base: ${err.message}` }] };
            }
        }

        case 'get_company_context': {
            const sessionId = (args as any)?.session_id;
            if (!sessionId) {
                return { content: [{ type: 'text', text: 'Error: session_id parameter is required' }] };
            }
            try {
                const result = await query(
                    'SELECT company_name, company_url, company_context, industry FROM workshop_sessions WHERE id = $1',
                    [sessionId]
                );
                if (result.rows.length === 0) {
                    return { content: [{ type: 'text', text: 'Session not found.' }] };
                }
                const session = result.rows[0];
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            company: session.company_name || 'Not provided',
                            website: session.company_url || 'Not provided',
                            industry: session.industry || 'Not identified',
                            context: session.company_context || 'No business context extracted yet',
                        }, null, 2)
                    }]
                };
            } catch (err: any) {
                return { content: [{ type: 'text', text: `Error: ${err.message}` }] };
            }
        }

        case 'get_session_progress': {
            const sessionId = (args as any)?.session_id;
            if (!sessionId) {
                return { content: [{ type: 'text', text: 'Error: session_id parameter is required' }] };
            }
            try {
                const result = await query(
                    `SELECT player_name, current_phase, current_gear, current_agent, path,
                            completed_phases, session_data, created_at
                     FROM workshop_sessions WHERE id = $1`,
                    [sessionId]
                );
                if (result.rows.length === 0) {
                    return { content: [{ type: 'text', text: 'Session not found.' }] };
                }
                const s = result.rows[0];
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            player: s.player_name,
                            currentPhase: s.current_phase,
                            currentGear: s.current_gear,
                            activeAgent: s.current_agent,
                            path: s.path,
                            completedPhases: s.completed_phases,
                            turnsInPhase: s.session_data?.phase_turn_count || 0,
                            started: s.created_at,
                        }, null, 2)
                    }]
                };
            } catch (err: any) {
                return { content: [{ type: 'text', text: `Error: ${err.message}` }] };
            }
        }

        default:
            return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
    }
});

// Start the server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('[MCP] Meaningful AI Simulator MCP server running on stdio');
}

main().catch(err => {
    console.error('[MCP] Failed to start:', err);
    process.exit(1);
});
