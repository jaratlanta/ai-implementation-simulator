/**
 * RAG Service — Retrieval-Augmented Generation for Meaningful AI knowledge base
 *
 * Embeds user questions and retrieves the most relevant content passages
 * from the pgvector-powered content_chunks table.
 */

import { query } from '../db/index.js';
import { embedText } from './embed.js';

const TOP_K = 4;

export interface ContentChunk {
    id: string;
    source_type: string;
    source_name: string;
    section: string;
    content: string;
    similarity: number;
}

/**
 * Check if the content_chunks table has any data
 */
export async function hasContent(): Promise<boolean> {
    try {
        const result = await query('SELECT COUNT(*) as count FROM content_chunks');
        return parseInt(result.rows[0]?.count || '0') > 0;
    } catch {
        return false;
    }
}

// embedQuery is now the shared embedText from embed.ts
const embedQuery = embedText;

/**
 * Search for the most relevant content chunks given a user message.
 * Supports agent-aware and industry-aware context weighting.
 *
 * @param userMessage - The user's chat message
 * @param conversationContext - Optional recent conversation for better context
 * @param agentContext - Optional agent domain keywords to weight results
 * @param industryContext - Optional industry to weight results
 */
export async function searchContentChunks(
    userMessage: string,
    conversationContext?: string,
    agentContext?: string,
    industryContext?: string
): Promise<ContentChunk[]> {
    try {
        // Build enriched search text
        let searchText = userMessage;

        if (agentContext) {
            searchText = `${agentContext} ${searchText}`;
        }
        if (industryContext) {
            searchText = `${industryContext} ${searchText}`;
        }
        if (conversationContext) {
            searchText = `${conversationContext}\n\nCurrent question: ${searchText}`;
        }

        const embedding = await embedQuery(searchText);
        if (embedding.length === 0) return [];

        const embeddingStr = `[${embedding.join(',')}]`;

        const result = await query<ContentChunk>(
            `SELECT
                id,
                source_type,
                source_name,
                section,
                content,
                (1 - (embedding <=> $1::vector)) - CASE WHEN source_type = 'level2' THEN 0.04 ELSE 0 END as similarity
             FROM content_chunks
             ORDER BY ((1 - (embedding <=> $1::vector)) - CASE WHEN source_type = 'level2' THEN 0.04 ELSE 0 END) DESC
             LIMIT $2`,
            [embeddingStr, TOP_K]
        );

        const chunks = result.rows.filter(r => r.similarity > 0.3);
        console.log(`[RAG] Found ${chunks.length} relevant chunks (top similarity: ${chunks[0]?.similarity?.toFixed(3) || 'N/A'})`);
        chunks.forEach((c, idx) => {
            console.log(`      ${idx + 1}. [${c.source_type}] ${c.source_name} (sim: ${c.similarity.toFixed(3)})`);
        });

        return chunks;
    } catch (error: any) {
        console.error('[RAG] Search failed:', error.message);
        return [];
    }
}

/**
 * Format retrieved content chunks into a context block for owl system prompts.
 */
export function formatContentContext(chunks: ContentChunk[]): string {
    if (chunks.length === 0) return '';

    const formatted = chunks.map((chunk, i) => {
        const source = chunk.source_name ? `[${chunk.source_name}]` : '';
        return `--- Meaningful AI Insight ${i + 1} ${source} ---\n${chunk.content}`;
    }).join('\n\n');

    return `\n\nRELEVANT INSIGHTS FROM MEANINGFUL AI'S KNOWLEDGE BASE:
${formatted}

INSTRUCTIONS: Weave insights from these passages naturally into your advice. Reference specific frameworks, strategies, or examples from Meaningful AI's expertise when relevant. Don't say "according to our knowledge base" — just share the wisdom as expertise from the Meaningful AI team.`;
}
