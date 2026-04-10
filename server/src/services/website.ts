/**
 * Website Lookup Service
 * Fetches a URL and extracts business information using the LLM
 */

import * as llmService from './llm.js';

/**
 * Fetch a website's HTML and extract key business information.
 * Returns a concise business summary for injection into owl context.
 */
export async function lookupWebsite(url: string): Promise<string | null> {
    try {
        let fetchUrl = url.trim();
        if (!fetchUrl.startsWith('http://') && !fetchUrl.startsWith('https://')) {
            fetchUrl = 'https://' + fetchUrl;
        }

        console.log(`[Website] Fetching: ${fetchUrl}`);

        const response = await fetch(fetchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; MeaningfulAI/1.0)',
                'Accept': 'text/html,application/xhtml+xml'
            },
            signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) {
            console.warn(`[Website] Failed to fetch ${fetchUrl}: ${response.status}`);
            return null;
        }

        const html = await response.text();

        const textContent = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
            .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
            .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 8000);

        if (textContent.length < 50) {
            console.warn('[Website] Too little content extracted');
            return null;
        }

        const prompt = `Analyze this website content and extract a concise business summary. Include:
1. Company name
2. What they do (products/services) in 1-2 sentences
3. Target market / customers
4. Key differentiators or value proposition
5. Industry/sector
6. Any notable details (team size, location, funding, partnerships)

Keep the summary to 4-6 bullet points. Be concise and factual.

WEBSITE CONTENT:
${textContent}`;

        const result = await llmService.generateText(prompt, undefined, {
            temperature: 0.2,
            maxTokens: 500
        });

        if (result.success && result.content) {
            console.log(`[Website] Business summary extracted for ${fetchUrl}`);
            return result.content;
        }

        return null;
    } catch (error: any) {
        console.error(`[Website] Lookup failed:`, error.message);
        return null;
    }
}
