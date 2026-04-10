/**
 * Image generation types
 */

export type ImageProvider = 'gemini-2.0-flash' | 'gemini-2.0-flash-upload' | 'gemini-2.0-flash-url' | 'gemini-2.0-flash-files' | 'gemini-2.5-flash-files-upload' | 'dalle3' | 'gptimage' | 'gptimage-url' | 'gptimage-upload' | 'gpt4o' | 'fal' | 'replicate' | 'comfyui' | 'grok' | 'gemini' | 'gemini-url' | 'gemini-upload' | 'gemini-files' | 'gemini-2.5-flash-url' | 'gemini-2.5-flash-upload' | 'gemini-2.5-flash' | 'gemini-2.5-flash-files' | 'gemini-3-pro-url' | 'gemini-3-pro-upload' | 'gemini-3-pro' | 'gemini-3-pro-files' | 'imagen-3.0' | 'imagen-4.0' | 'vertex-imagen';

export type ArtStyleId = '3d-storybook' | 'watercolor' | 'hand-painted' | 'clay-toy';

export interface ArtStyle {
  id: ArtStyleId;
  name: string;
  description: string;
  promptModifiers: string[];
  negativePrompts: string[];
}

export interface GeneratedImage {
  url: string;
  width: number;
  height: number;
  prompt: string;
  revisedPrompt?: string;
  provider: ImageProvider;
  generationTime: number;
  rhyme?: string; // Short rhyme describing the scene
  steps?: number; // Number of inference steps used
}

export interface ImageGenerationConfig {
  provider: ImageProvider;
  apiKey: string;
  model?: string;
}

/**
 * Reference image for character/style consistency
 */
export interface ReferenceImage {
  /** Base64 encoded image data (without data URL prefix) - used for inline upload */
  base64: string;
  /** MIME type of the image (e.g., 'image/png', 'image/jpeg') */
  mimeType: string;
  /** Optional description of what this reference represents */
  description?: string;
  /** Optional URL to the image (used for URL-based references instead of base64 upload) */
  url?: string;
  /** Optional thumbnail URL for faster loading (preferred over full URL when available) */
  thumbnailUrl?: string;
  /** Character label for prompt (WOMAN, MAN, DOG, etc.) - auto-detected from description */
  label?: string;
}

/**
 * File reference using Gemini Files API URI
 * More efficient than uploading base64 data repeatedly
 */
export interface FileReference {
  /** Gemini Files API URI (e.g., "files/abc123") */
  fileUri: string;
  /** Optional description of what this reference represents */
  description?: string;
  /** Character label for prompt (WOMAN, MAN, DOG, etc.) */
  label?: string;
}

/**
 * Supported aspect ratios for Gemini image generation
 */
export type GeminiAspectRatio = '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '9:16' | '16:9' | '21:9';

export interface ImageGenerationRequest {
  prompt: string;
  style: ArtStyle;
  width?: number;
  height?: number;
  /** Reference images for character/style consistency (Gemini supports up to 3 for Flash, 14 for Pro) */
  referenceImages?: ReferenceImage[];
  /** File references using Gemini Files API URIs (more efficient for repeated use) */
  fileReferences?: FileReference[];
  /** Aspect ratio for the generated image (Gemini only). Supported values: "1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9" */
  aspectRatio?: GeminiAspectRatio;
  /** Optional provider override for this request only */
  provider?: ImageProvider;
}

/**
 * Predefined art styles for child-safe storybook imagery
 */
export const ART_STYLES: Record<ArtStyleId, ArtStyle> = {
  '3d-storybook': {
    id: '3d-storybook',
    name: '3D Storybook',
    description: 'Child-safe 3D animated look with defined appealing structure and soft lighting',
    promptModifiers: [
      'high-budget 3D animated film style',
      '3D animated style rendering',
      'clean stylized surfaces',
      'soft ambient occlusion',
      'warm studio lighting with rim light',
      'vibrant saturated colors',
      'charming and expressive',
      'child-friendly whimsical aesthetic'
    ],
    negativePrompts: ['realistic', 'scary', 'dark', 'violent', 'horror', 'photorealistic', 'creepy uncanny valley', 'realistic skin texture', 'sharp pores']
  },
  'watercolor': {
    id: 'watercolor',
    name: 'Soft Watercolor',
    description: 'Gentle watercolor painting style with soft edges and dreamy atmosphere',
    promptModifiers: [
      'soft watercolor painting',
      'gentle pastel colors',
      'dreamy atmosphere',
      'children\'s book illustration',
      'soft edges',
      'delicate brushstrokes',
      'whimsical'
    ],
    negativePrompts: ['realistic', 'scary', 'dark', 'violent', 'horror', 'sharp edges']
  },
  'hand-painted': {
    id: 'hand-painted',
    name: 'Hand-Painted Fantasy',
    description: 'Rich hand-painted fantasy illustration with magical atmosphere',
    promptModifiers: [
      'hand-painted fantasy illustration',
      'rich vibrant colors',
      'magical atmosphere',
      'storybook art style',
      'detailed but friendly',
      'enchanting',
      'fairy tale aesthetic'
    ],
    negativePrompts: ['realistic', 'scary', 'dark', 'violent', 'horror', 'photorealistic']
  },
  'clay-toy': {
    id: 'clay-toy',
    name: 'Clay & Toy',
    description: 'Playful claymation or toy-like rendering style',
    promptModifiers: [
      'claymation style',
      'stop-motion aesthetic',
      'toy-like characters',
      'playful',
      'colorful',
      'child-friendly',
      'defined appealing structure',
      'tactile textures'
    ],
    negativePrompts: ['realistic', 'scary', 'dark', 'violent', 'horror', 'sharp']
  }
};
