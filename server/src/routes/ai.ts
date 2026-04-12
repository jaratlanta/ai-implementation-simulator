/**
 * AI Routes - Backend proxy for AI services
 */

import { Router, Request, Response } from 'express';
import * as llmService from '../services/llm.js';

const router = Router();

/**
 * POST /ai/generate-text
 */
router.post('/generate-text', async (req: Request, res: Response) => {
    try {
        const { prompt, systemPrompt, provider, jsonMode, temperature, maxTokens } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        console.log(`[AI] Text generation request (provider: ${provider || 'default'})`);
        const result = await llmService.generateText(prompt, systemPrompt, { provider, jsonMode, temperature, maxTokens });

        if (!result.success) {
            return res.status(500).json({ error: result.error || 'Failed to generate text' });
        }

        res.json(result);
    } catch (error: any) {
        console.error('[AI] Error in generate-text:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /ai/log
 */
router.post('/log', (req: Request, res: Response) => {
    const { message } = req.body;
    if (message) {
        console.log(message);
    }
    res.json({ success: true });
});

export default router;
