/**
 * Scene Description API — generates visual prompts from conversation for owl-themed scenes
 * When the user has an avatar, they appear in the scene WITH the owl (like FTW).
 */

import { callLLM } from '../utils/llm';
import type { OwlId } from '../types/owl';

/** Precise owl description — MUST match the hard-surface geometric low-poly brand mascot */
const OWL_CHARACTER = 'a geometric low-poly origami-style owl character made of flat triangular polygon facets with sharp angular edges (NOT smooth, NOT organic). Steel-blue periwinkle faceted body, soft pink triangular V-shaped chest, very large dark glossy sphere eyes with light gray rings and tiny cyan dot highlights, small pink diamond beak, small pink polygon feet. Compact chunky ball-shaped body with pointed angular ear tufts. Hard-surface faceted 3D render like papercraft';

/**
 * Owl workshop scenes for early conversation / no specific topic yet
 */
const OWL_WORKSHOP_SCENES = [
    `${OWL_CHARACTER} perched in a cozy treehouse office, surrounded by floating holographic data visualizations, warm amber lamplight, and shelves of books. City lights visible through round windows.`,
    `${OWL_CHARACTER} standing at a large glowing whiteboard covered in AI strategy diagrams and flowcharts, in a modern workspace with warm string lights and potted ferns.`,
    `${OWL_CHARACTER} sitting in a comfortable leather chair in a warm study filled with books, a glowing crystal ball on the oak desk showing data patterns, maps and charts pinned to the walls.`,
    `${OWL_CHARACTER} perched on a branch overlooking a bustling modern city at sunset, holographic screens floating nearby showing business analytics, warm golden light.`,
    `${OWL_CHARACTER} in a cozy library with towering bookshelves, a warm fireplace, floating digital screens showing AI dashboards, and a large table covered in strategy documents.`,
    `${OWL_CHARACTER} hovering above a futuristic atrium with living walls of greenery, large screens showing AI-powered business dashboards, and sunlight streaming through a glass ceiling.`,
];

function hasSpecificTopic(history: { role: string; content: string }[]): boolean {
    if (history.length <= 2) return false;
    const recentUserMessages = history
        .filter(h => h.role === 'user')
        .slice(-3)
        .map(h => h.content.toLowerCase())
        .join(' ');
    if (recentUserMessages.length < 40) return false;
    return true;
}

/**
 * Extract a visual scene description from recent conversation context
 */
export async function extractSceneDescription(
    playerName: string,
    playerDescription: string,
    recentHistory: { role: string; content: string; agent_id?: string }[],
    activeOwlId: OwlId,
    owlOnly: boolean = true
): Promise<string> {
    const stylePrefix = 'Warm cinematic 3D rendered scene with soft volumetric lighting, high quality textures.';

    // Early conversation — use preset workshop scenes
    if (!hasSpecificTopic(recentHistory)) {
        const scene = OWL_WORKSHOP_SCENES[Math.floor(Math.random() * OWL_WORKSHOP_SCENES.length)];
        if (owlOnly) {
            return `${stylePrefix} ${scene}`;
        } else {
            return `${stylePrefix} ${scene} Nearby is ${playerName} — ${playerDescription}. They are having a warm conversation together.`;
        }
    }

    // Topic-driven — generate scene matching the discussion
    const historySnippet = recentHistory.slice(-6).map(h =>
        `${h.role === 'user' ? playerName : (h.agent_id || 'Owl')}: ${h.content}`
    ).join('\n');

    const characterBlock = owlOnly
        ? `THE CHARACTER: ${OWL_CHARACTER}. CRITICAL: The owl MUST be geometric low-poly with flat faceted surfaces like origami/papercraft. NOT smooth or organic looking.`
        : `THE CHARACTERS:
1. ${OWL_CHARACTER}. CRITICAL: The owl MUST be geometric low-poly with flat faceted surfaces like origami/papercraft. NOT smooth.
2. ${playerName} — ${playerDescription}. They are having a conversation together.`;

    const prompt = `You generate scene descriptions for a 3D animated image generator. Read the conversation and create a scene that VISUALLY MATCHES the topic.

CONVERSATION:
${historySnippet}

${characterBlock}

YOUR TASK: Describe a scene where the character(s) are IN an environment that relates to the conversation topic. The setting should make the topic visually obvious.

CRITICAL RULES:
- The environment MUST match the conversation subject
- Include SPECIFIC visual props related to the topic
- The characters should be actively engaged with the environment
- Warm cinematic lighting, 3D rendered, high quality textures
- Output ONLY the scene description in 2-3 sentences. No dialogue.`;

    try {
        const response = await callLLM({ prompt, temperature: 0.7, maxTokens: 250 });
        if (response.success) {
            return `${stylePrefix} ${response.content}`;
        }
    } catch (error) {
        console.error('[Scene] Failed to extract scene description:', error);
    }

    // Fallback
    const scene = OWL_WORKSHOP_SCENES[Math.floor(Math.random() * OWL_WORKSHOP_SCENES.length)];
    return `${stylePrefix} ${scene}`;
}
