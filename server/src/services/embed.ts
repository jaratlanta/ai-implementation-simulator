/**
 * Shared Embedding Service — Gemini Embedding API
 * Used by both RAG search (rag.ts) and content ingestion (ingest-content.ts)
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIM = 768;

export { EMBEDDING_DIM };

/**
 * Embed a text string using Google Gemini Embedding API.
 * Returns a 768-dimensional float array, or empty array on failure.
 */
export async function embedText(text: string): Promise<number[]> {
    if (!GEMINI_API_KEY) {
        console.warn('[Embed] No GEMINI_API_KEY — skipping embedding');
        return [];
    }

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: `models/${EMBEDDING_MODEL}`,
                content: { parts: [{ text }] },
                outputDimensionality: EMBEDDING_DIM
            })
        }
    );

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.error('[Embed] Embedding failed:', (err as any).error?.message || response.status);
        return [];
    }

    const data = await response.json() as any;
    return data.embedding?.values || [];
}

/**
 * Delay helper for rate limiting
 */
export function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
