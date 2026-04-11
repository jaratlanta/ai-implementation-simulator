/**
 * Server-side LLM service with Anthropic primary + Gemini fallback
 * Priority: 1) Anthropic Claude  2) Gemini
 */

export interface LLMResponse {
    success: boolean;
    content: string;
    error?: string;
    provider?: string;
    tokensUsed?: { input: number; output: number };
}

/**
 * Generate text using the priority chain: Anthropic -> Gemini
 */
export async function generateText(
    prompt: string,
    systemPrompt?: string,
    options?: { temperature?: number; maxTokens?: number; provider?: string }
): Promise<LLMResponse> {
    const forcedProvider = options?.provider;
    
    if (forcedProvider === 'gemini') {
        const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
        if (geminiKey) {
            const geminiResult = await callGemini(prompt, systemPrompt, geminiKey, options);
            if (geminiResult.success) return geminiResult;
        }
        return { success: false, content: '', error: 'Gemini API failed or not configured' };
    }

    if (forcedProvider === 'openai') {
        const openaiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
        if (openaiKey) {
            const openaiResult = await callOpenAI(prompt, systemPrompt, openaiKey, options);
            if (openaiResult.success) return openaiResult;
        }
        return { success: false, content: '', error: 'OpenAI API failed or not configured' };
    }

    // Default: Try Anthropic first
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
        const result = await callAnthropic(prompt, systemPrompt, anthropicKey, options);
        if (result.success) return result;
        console.warn('[LLM] Anthropic failed, falling back downstream:', result.error);
    }

    // Fallback to OpenAI
    const openaiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
    if (openaiKey) {
        const result = await callOpenAI(prompt, systemPrompt, openaiKey, options);
        if (result.success) return result;
    }

    // Fallback to Gemini
    const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (geminiKey) {
        return callGemini(prompt, systemPrompt, geminiKey, options);
    }

    return { success: false, content: '', error: 'No LLM API keys configured' };
}

/**
 * Call Anthropic Claude API
 */
async function callAnthropic(
    prompt: string,
    systemPrompt: string | undefined,
    apiKey: string,
    options?: { temperature?: number; maxTokens?: number }
): Promise<LLMResponse> {
    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

    try {
        console.log(`[LLM] Calling Anthropic ${model}...`);

        const messages: any[] = [{ role: 'user', content: prompt }];

        const body: any = {
            model,
            max_tokens: options?.maxTokens || 1500,
            messages,
        };

        if (systemPrompt) {
            body.system = systemPrompt;
        }

        if (options?.temperature !== undefined) {
            body.temperature = options.temperature;
        }

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const msg = (errorData as any).error?.message || `Anthropic API error: ${response.status}`;
            console.warn('[LLM] Anthropic error:', response.status, msg);
            return { success: false, content: '', error: msg, provider: 'anthropic' };
        }

        const data = (await response.json()) as any;
        const content = data.content?.[0]?.text || '';

        if (!content) {
            return { success: false, content: '', error: 'Empty response from Anthropic', provider: 'anthropic' };
        }

        return {
            success: true,
            content: content.trim(),
            provider: 'anthropic',
            tokensUsed: data.usage ? {
                input: data.usage.input_tokens || 0,
                output: data.usage.output_tokens || 0,
            } : undefined,
        };
    } catch (error: any) {
        console.error('[LLM] Anthropic exception:', error.message);
        return { success: false, content: '', error: error.message, provider: 'anthropic' };
    }
}

/**
 * Call Google Gemini API (fallback)
 */
async function callGemini(
    prompt: string,
    systemPrompt: string | undefined,
    apiKey: string,
    options?: { temperature?: number; maxTokens?: number }
): Promise<LLMResponse> {
    const models = [
        { name: 'gemini-2.5-flash', version: 'v1beta' },
        { name: 'gemini-2.0-flash-001', version: 'v1beta' },
    ];

    let lastError = '';

    for (const model of models) {
        try {
            console.log(`[LLM] Trying Gemini ${model.name}...`);
            const url = `https://generativelanguage.googleapis.com/${model.version}/models/${model.name}:generateContent?key=${apiKey}`;

            let fullPrompt = prompt;
            if (systemPrompt) {
                fullPrompt = `${systemPrompt}\n\nUSER MESSAGE: ${prompt}`;
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: fullPrompt }] }],
                    generationConfig: {
                        maxOutputTokens: options?.maxTokens || 1500,
                        temperature: options?.temperature || 0.8
                    },
                    safetySettings: [
                        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
                    ]
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.warn(`[LLM] Gemini ${model.name} error:`, response.status);
                lastError = (errorData as any).error?.message || `API error: ${response.status}`;
                continue;
            }

            const data = (await response.json()) as any;
            
            const parts = data.candidates?.[0]?.content?.parts || [];
            const content = parts.map((p: any) => p.text).join('') || '';

            if (!content) {
                console.warn(`[LLM] Gemini ${model.name} returned empty content`);
                continue;
            }

            const usage = data.usageMetadata;
            return {
                success: true,
                content: content.trim(),
                provider: 'gemini',
                tokensUsed: usage ? {
                    input: usage.promptTokenCount || 0,
                    output: usage.candidatesTokenCount || 0
                } : undefined
            };
        } catch (error: any) {
            console.error(`[LLM] Exception calling Gemini ${model.name}:`, error);
            lastError = error.message;
            continue;
        }
    }

    return { success: false, content: '', error: `All Gemini attempts failed. Last error: ${lastError}`, provider: 'gemini' };
}

/**
 * Call OpenAI API
 */
async function callOpenAI(
    prompt: string,
    systemPrompt: string | undefined,
    apiKey: string,
    options?: { temperature?: number; maxTokens?: number }
): Promise<LLMResponse> {
    const model = process.env.OPENAI_MODEL || 'gpt-4o';

    try {
        console.log(`[LLM] Calling OpenAI ${model}...`);
        const messages: any[] = [];
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }
        messages.push({ role: 'user', content: prompt });

        const body: any = {
            model,
            messages,
            max_tokens: options?.maxTokens || 1500,
            temperature: options?.temperature !== undefined ? options.temperature : 0.8
        };

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const msg = (errorData as any).error?.message || `OpenAI API error: ${response.status}`;
            console.warn('[LLM] OpenAI error:', response.status, msg);
            return { success: false, content: '', error: msg, provider: 'openai' };
        }

        const data = (await response.json()) as any;
        const content = data.choices?.[0]?.message?.content || '';

        if (!content) {
            return { success: false, content: '', error: 'Empty response from OpenAI', provider: 'openai' };
        }

        return {
            success: true,
            content: content.trim(),
            provider: 'openai',
            tokensUsed: data.usage ? {
                input: data.usage.prompt_tokens || 0,
                output: data.usage.completion_tokens || 0,
            } : undefined,
        };
    } catch (error: any) {
        console.error('[LLM] OpenAI exception:', error.message);
        return { success: false, content: '', error: error.message, provider: 'openai' };
    }
}

export default { generateText };
