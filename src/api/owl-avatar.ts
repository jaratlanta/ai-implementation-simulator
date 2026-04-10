/**
 * Owl Avatar Generator
 * Generates and caches polygonal/geometric owl avatars matching the Meaningful AI brand style
 * Uses in-memory cache (avatars are too large for localStorage)
 */

import { ART_STYLES } from '../image';
import type { OwlId } from '../types/owl';

// In-memory cache for generated owl avatars (full resolution)
const avatarCache: Map<OwlId, string> = new Map();

// Cached 3D owl reference image (loaded once, reused for all generations)
let owlRefCache: { base64: string; mimeType: string } | null = null;

/**
 * Load the canonical 3D owl reference image from /brand/3d-owl.jpg
 * Used as a style reference for all owl avatar generation
 */
async function loadOwlReference(): Promise<{ base64: string; mimeType: string } | null> {
    if (owlRefCache) return owlRefCache;
    try {
        const response = await fetch('/brand/3d-owl.jpg');
        const blob = await response.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
        const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
            owlRefCache = { mimeType: match[1], base64: match[2] };
            console.log('[OwlAvatar] 3D owl reference loaded (%d KB)', Math.round(match[2].length / 1024));
            return owlRefCache;
        }
    } catch (err) {
        console.warn('[OwlAvatar] Could not load 3D owl reference:', err);
    }
    return null;
}

/**
 * Visual descriptions for each owl — matching the Meaningful AI brand owl style:
 * Clean geometric/polygonal low-poly style, large round eyes with white rings and cyan/teal pupils,
 * light pink face/chest area, small triangular beak, tiny pink feet, compact cute proportions.
 * Like the company logo owl but in different colors per character.
 */
const OWL_DESCRIPTIONS: Record<OwlId, string> = {
    poly: `A geometric low-poly owl icon in the Meaningful AI brand style. Deep navy blue and indigo polygonal body facets. Large round eyes with white rings and bright cyan/teal pupils. Light pink heart-shaped chest/face area. Small triangular beak. Tiny pink feet. Angular ear tufts on top. Compact, cute, forward-facing, symmetrical. Clean flat geometric style with subtle shading on facets. Simple white background. Character icon style, NOT realistic.`,

    nova: `A geometric low-poly owl icon in the Meaningful AI brand style. Bright white and light gray polygonal body facets with subtle blue edges. Large round eyes with white rings and bright cyan/teal pupils. Light pink heart-shaped chest/face area. Small triangular beak. Tiny pink feet. Smooth rounded head. Compact, cute, forward-facing, symmetrical. Clean flat geometric style with subtle shading on facets. Simple white background. Character icon style, NOT realistic.`,

    atlas: `A geometric low-poly owl icon in the Meaningful AI brand style. Golden-amber and warm brown polygonal body facets. Large round eyes with white rings and bright cyan/teal pupils. Light pink heart-shaped chest/face area. Small triangular beak. Tiny pink feet. Heart-shaped face outline. Compact, cute, forward-facing, symmetrical. Clean flat geometric style with subtle shading on facets. Simple white background. Character icon style, NOT realistic.`,

    ember: `A geometric low-poly owl icon in the Meaningful AI brand style. Bright coral-red and warm pink polygonal body facets. Large round eyes with white rings and bright cyan/teal pupils. Light pink heart-shaped chest/face area. Small triangular beak. Tiny pink feet. Small angular ear tufts. Compact, cute, forward-facing, symmetrical. Clean flat geometric style with subtle shading on facets. Simple white background. Character icon style, NOT realistic.`,

    ledger: `A geometric low-poly owl icon in the Meaningful AI brand style. Sandy-tan and olive-green polygonal body facets. Large round eyes with white rings and bright cyan/teal pupils. Light pink heart-shaped chest/face area. Small triangular beak. Tiny pink feet. Slightly longer legs visible. Compact, cute, forward-facing, symmetrical. Clean flat geometric style with subtle shading on facets. Simple white background. Character icon style, NOT realistic.`,

    scout: `A geometric low-poly owl icon in the Meaningful AI brand style. Soft purple and lavender polygonal body facets. Very large round eyes with white rings and bright cyan/teal pupils — eyes oversized relative to body. Light pink heart-shaped chest/face area. Small triangular beak. Tiny pink feet. Smallest and most compact of all. Cute, forward-facing, symmetrical. Clean flat geometric style with subtle shading on facets. Simple white background. Character icon style, NOT realistic.`,
};

/**
 * Get a cached owl avatar URL, or generate a new one
 */
export async function getOwlAvatar(owlId: OwlId): Promise<string> {
    const cached = avatarCache.get(owlId);
    if (cached) return cached;
    return generateOwlAvatar(owlId);
}

/**
 * Generate a geometric/polygonal owl avatar matching company brand
 */
async function generateOwlAvatar(owlId: OwlId): Promise<string> {
    const description = OWL_DESCRIPTIONS[owlId];

    try {
        // Load the canonical 3D owl as a style reference
        const owlRef = await loadOwlReference();

        const config: any = {
            prompt: description,
            style: ART_STYLES['3d-storybook'],
            width: 1024,
            height: 1024,
            aspectRatio: '1:1',
            provider: 'gemini-2.5-flash-upload'
        };

        if (owlRef) {
            config.referenceImages = [{
                base64: owlRef.base64,
                mimeType: owlRef.mimeType,
                description: 'Reference: The Meaningful AI owl mascot in 3D low-poly geometric style — generated owls MUST match this exact style'
            }];
        }

        const result = await (window as any).imageGenerator.generate(config);

        const avatarUrl = result.url;
        if (avatarUrl) {
            avatarCache.set(owlId, avatarUrl);
            console.log(`[OwlAvatar] Generated and cached ${owlId} avatar (in memory)`);
        }

        return avatarUrl || getFallbackAvatar(owlId);
    } catch (err) {
        console.error(`[OwlAvatar] Generation failed for ${owlId}:`, err);
        return getFallbackAvatar(owlId);
    }
}

/**
 * Get all owl avatars (generates missing ones in background)
 */
export async function preloadOwlAvatars(): Promise<Record<OwlId, string>> {
    const owlIds: OwlId[] = ['poly', 'nova', 'atlas', 'ember', 'ledger', 'scout'];
    const avatars: Record<string, string> = {};

    // Start with fallbacks
    for (const id of owlIds) {
        avatars[id] = avatarCache.get(id) || getFallbackAvatar(id);
    }

    // Generate missing ones in background (don't block UI)
    for (const id of owlIds) {
        if (!avatarCache.has(id)) {
            generateOwlAvatar(id).then(url => {
                avatars[id] = url;
            }).catch(() => {});
        }
    }

    return avatars as Record<OwlId, string>;
}

/**
 * Get owl description for scene prompts
 */
export function getOwlDescription(owlId: OwlId): string {
    return OWL_DESCRIPTIONS[owlId] || OWL_DESCRIPTIONS.poly;
}

/**
 * Extract base64 + mimeType from an owl's avatar URL for scene reference
 */
export async function getOwlAvatarReference(owlId: OwlId): Promise<{ base64: string; mimeType: string } | null> {
    const avatarUrl = await getOwlAvatar(owlId);

    if (avatarUrl.startsWith('data:')) {
        const match = avatarUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
            return { mimeType: match[1], base64: match[2] };
        }
    }

    return null;
}

const OWL_COLORS: Record<OwlId, { bg: string; fg: string }> = {
    poly: { bg: '222D63', fg: 'ffffff' },
    nova: { bg: 'E8E8E8', fg: '222D63' },
    atlas: { bg: 'D4A853', fg: '1a1a2e' },
    ember: { bg: 'E83151', fg: 'ffffff' },
    ledger: { bg: '7A8B5E', fg: 'ffffff' },
    scout: { bg: '9B7DCA', fg: 'ffffff' },
};

function getFallbackAvatar(owlId: OwlId): string {
    const colors = OWL_COLORS[owlId] || OWL_COLORS.poly;
    const initial = owlId.charAt(0).toUpperCase();
    return `https://placehold.co/200x200/${colors.bg}/${colors.fg}.png?text=${initial}`;
}
