/**
 * Content Ingestion Script
 * Reads .txt files from /content/, chunks them, and inserts into content_chunks table.
 * Run: cd server && npm run ingest-content
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, closePool } from '../db/index.js';
import { embedText, delay } from '../services/embed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONTENT_DIR = path.resolve(__dirname, '../../../content');
const CHUNK_SIZE = 800; // ~800 chars per chunk
const CHUNK_OVERLAP = 100; // overlap between chunks

interface ManifestEntry {
    source_type: string;
    source_name: string;
    tags: string[];
}

/**
 * Split text into overlapping chunks
 */
function chunkText(text: string, size: number = CHUNK_SIZE, overlap: number = CHUNK_OVERLAP): string[] {
    const chunks: string[] = [];
    const sentences = text.split(/(?<=[.!?])\s+/);
    let current = '';

    for (const sentence of sentences) {
        if (current.length + sentence.length > size && current.length > 0) {
            chunks.push(current.trim());
            // Keep overlap from end of current chunk
            const words = current.split(' ');
            const overlapWords = words.slice(-Math.ceil(overlap / 5));
            current = overlapWords.join(' ') + ' ' + sentence;
        } else {
            current += (current ? ' ' : '') + sentence;
        }
    }

    if (current.trim()) {
        chunks.push(current.trim());
    }

    return chunks;
}

async function main() {
    console.log('=== Content Ingestion ===');
    console.log(`Content directory: ${CONTENT_DIR}`);

    if (!fs.existsSync(CONTENT_DIR)) {
        console.error('Content directory not found! Create /content/ and add .txt files.');
        process.exit(1);
    }

    // Load manifest if it exists
    let manifest: Record<string, ManifestEntry> = {};
    const manifestPath = path.join(CONTENT_DIR, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        console.log(`Loaded manifest with ${Object.keys(manifest).length} entries`);
    }

    // Find all .txt and .md files
    const files = fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.txt') || f.endsWith('.md'));
    console.log(`Found ${files.length} text files`);

    if (files.length === 0) {
        console.log('No .txt or .md files found in /content/. Add some files and run again.');
        process.exit(0);
    }

    // Clear existing chunks
    console.log('Clearing existing content chunks...');
    await query('DELETE FROM content_chunks', []);

    let totalChunks = 0;

    for (const file of files) {
        const filePath = path.join(CONTENT_DIR, file);
        const text = fs.readFileSync(filePath, 'utf-8').trim();

        if (!text) {
            console.log(`  Skipping ${file} (empty)`);
            continue;
        }

        const meta = manifest[file] || {
            source_type: 'general',
            source_name: file.replace('.txt', '').replace(/-/g, ' '),
            tags: [],
        };

        const chunks = chunkText(text);
        console.log(`  ${file}: ${text.length} chars → ${chunks.length} chunks (${meta.source_type})`);

        for (let i = 0; i < chunks.length; i++) {
            // Compute embedding for this chunk
            const embedding = await embedText(chunks[i]);
            const hasEmbedding = embedding.length > 0;

            if (hasEmbedding) {
                await query(
                    `INSERT INTO content_chunks (content, source_type, source_name, tags, chunk_index, embedding)
                     VALUES ($1, $2, $3, $4, $5, $6::vector)`,
                    [
                        chunks[i],
                        meta.source_type,
                        meta.source_name,
                        meta.tags,
                        i,
                        `[${embedding.join(',')}]`,
                    ]
                );
            } else {
                await query(
                    `INSERT INTO content_chunks (content, source_type, source_name, tags, chunk_index)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [
                        chunks[i],
                        meta.source_type,
                        meta.source_name,
                        meta.tags,
                        i,
                    ]
                );
            }
            totalChunks++;

            // Rate limit: 100ms between embedding calls
            if (hasEmbedding && i < chunks.length - 1) {
                await delay(100);
            }
        }
        console.log(`    → ${chunks.length} chunks embedded`);
    }

    console.log(`\n✅ Ingested ${totalChunks} chunks from ${files.length} files`);

    await closePool();
}

main().catch(err => {
    console.error('Ingestion failed:', err);
    process.exit(1);
});
