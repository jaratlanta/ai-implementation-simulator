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
        const { prompt, systemPrompt } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        console.log(`[AI] Text generation request`);
        const result = await llmService.generateText(prompt, systemPrompt);

        if (!result.success) {
            return res.status(500).json({ error: result.error || 'Failed to generate text' });
        }

        res.json(result);
    } catch (error: any) {
        console.error('[AI] Error in generate-text:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
