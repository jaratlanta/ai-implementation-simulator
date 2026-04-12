/**
 * AI API Client - Backend-proxied AI services
 */

import apiClient from './client.js';

export interface AIResponse {
    success: boolean;
    content: string;
    error?: string;
}

export interface ImageResponse {
    success: boolean;
    b64_json?: string;
    error?: string;
}

/**
 * Generate text using backend proxy
 */
export async function generateText(prompt: string, systemPrompt?: string, provider?: string): Promise<AIResponse | null> {
    try {
        const response = await apiClient.post<AIResponse>('/ai/generate-text', {
            prompt,
            systemPrompt,
            provider
        });
        return response?.data || null;
    } catch (error) {
        console.error('[AI] Text generation failed:', error);
        return null;
    }
}

/**
 * Generate image using backend proxy (placeholder for future use)
 */
export async function generateImage(prompt: string, _storyId?: string): Promise<ImageResponse | null> {
    try {
        const response = await apiClient.post<ImageResponse>('/ai/generate-image', { prompt });
        return response?.data || null;
    } catch (error) {
        console.error('[AI] Image generation failed:', error);
        return null;
    }
}
