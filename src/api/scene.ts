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
    `${OWL_CHARACTER} floating happily over the beautiful Atlanta skyline and Beltline on a sunny day. Clean, natural, and grounded workspace view. No glowing holograms.`,
    `${OWL_CHARACTER} flying over the Atlanta skyline at sunset, with warm golden light reflecting off the skyscrapers. A peaceful perspective of the city. No floating UI elements.`,
    `${OWL_CHARACTER} hovering above the Atlanta Beltline surrounded by green trees and city lights. No glowing screens.`,
    `${OWL_CHARACTER} perched in a cozy treehouse office with a view of the Atlanta skyline, warm amber lamplight, and shelves of physical books. No glowing holograms.`,
    `${OWL_CHARACTER} standing at a large physical whiteboard covered in strategy diagrams, with the Atlanta skyline visible through a massive window. No futuristic interfaces.`,
    `${OWL_CHARACTER} exploring a beautiful atrium with views of the Atlanta city center, sunlight streaming through a glass ceiling. A grounded corporate environment without futuristic interfaces.`,
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
- Include SPECIFIC physical visual props related to the topic
- The setting should ideally incorporate views of the Atlanta skyline or Beltline where appropriate
- The characters should be actively engaged with the environment (e.g. Poly floating/flying happily around)
- Warm cinematic lighting, 3D rendered, high quality textures
- DO NOT INCLUDE floating UI, glowing holograms, or futuristic sci-fi interfaces. Keep the scene grounded, using physical objects, whiteboards, or natural environments.
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
