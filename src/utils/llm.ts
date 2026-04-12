/**
 * LLM Utility - Client-side AI text generation
 * Priority: Anthropic (Claude) -> Gemini -> OpenAI
 */

export interface LLMPayload {
    prompt: string;
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
    jsonMode?: boolean;
    provider?: string;
}

export interface LLMResponse {
    success: boolean;
    content: string;
    error?: string;
    provider: 'anthropic' | 'gemini' | 'openai';
}

/**
 * Call the LLM with fallback chain
 */
export async function callLLM(payload: LLMPayload): Promise<LLMResponse> {
    // 1. Try backend proxy first
    try {
        const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/ai/generate-text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: payload.prompt,
                systemPrompt: payload.systemPrompt,
                provider: payload.provider,
                jsonMode: payload.jsonMode
            })
        });

        if (response.ok) {
            const data = await response.json();
            return { ...data, provider: data.provider || 'anthropic' };
        }
    } catch (error) {
        console.warn('[LLM] Backend proxy error, falling back to direct calls:', error);
    }

    // 2. Direct Gemini call as fallback
    const geminiKey = (import.meta.env.VITE_GEMINI_API_KEY as string);

    if (geminiKey) {
        try {
            return await callGeminiDirect(payload, geminiKey);
        } catch (error: any) {
            console.warn('[LLM] Gemini direct call failed:', error.message);
        }
    }

    return {
        success: false,
        content: '',
        error: 'No LLM available',
        provider: 'gemini'
    };
}

async function callGeminiDirect(payload: LLMPayload, apiKey: string): Promise<LLMResponse> {
    let fullPrompt = payload.prompt;
    if (payload.systemPrompt) {
        fullPrompt = `${payload.systemPrompt}\n\nUSER REQUEST: ${payload.prompt}`;
    }

    if (payload.jsonMode && !fullPrompt.toLowerCase().includes('json')) {
        fullPrompt += '\n\nIMPORTANT: Respond ONLY with valid JSON.';
    }

    const models = ['gemini-2.5-flash', 'gemini-2.0-flash-001'];

    for (const model of models) {
        try {
            const apiVersion = 'v1beta';
            const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${apiKey}`;

            const requestBody: any = {
                contents: [{ parts: [{ text: fullPrompt }] }],
                generationConfig: {
                    maxOutputTokens: payload.maxTokens || 1000,
                    temperature: payload.temperature || 0.7
                }
            };

            if (payload.jsonMode) {
                requestBody.generationConfig.response_mime_type = 'application/json';
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) continue;

            const data = await response.json();
            const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

            if (content) {
                return { success: true, content: content.trim(), provider: 'gemini' };
            }
        } catch {
            continue;
        }
    }

    throw new Error('All Gemini models failed');
}

export async function callLLMStream(payload: LLMPayload, onToken: (text: string) => void): Promise<LLMResponse> {
    const geminiKey = (import.meta.env.VITE_GEMINI_API_KEY as string);
    if (!geminiKey) {
        return { success: false, content: '', error: 'No LLM available', provider: 'gemini' };
    }
    
    let fullPrompt = payload.prompt;
    if (payload.systemPrompt) {
        fullPrompt = `${payload.systemPrompt}\n\nUSER REQUEST: ${payload.prompt}`;
    }

    const model = 'gemini-2.5-flash';
    const apiVersion = 'v1beta';
    const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:streamGenerateContent?key=${geminiKey}&alt=sse`;

    const requestBody: any = {
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: {
            maxOutputTokens: payload.maxTokens || 1000,
            temperature: payload.temperature || 0.7
        }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error('Stream request failed');
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder("utf-8");
        let fullText = "";
        
        if (reader) {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split("\n");
                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const dataStr = line.slice(6);
                        if (dataStr.trim() === "[DONE]") continue;
                        try {
                            const data = JSON.parse(dataStr);
                            const textPart = data.candidates?.[0]?.content?.parts?.[0]?.text;
                            if (textPart) {
                                fullText += textPart;
                                onToken(fullText);
                            }
                        } catch (e) {}
                    }
                }
            }
        }
        return { success: true, content: fullText, provider: 'gemini' };
    } catch (e: any) {
        return { success: false, content: '', error: e.message, provider: 'gemini' };
    }
}
