/**
 * Chat Routes - Owl agent conversation endpoints
 */

import { Router, Request, Response } from 'express';
import * as ChatSession from '../models/ChatSession.js';
import * as llmService from '../services/llm.js';
import { lookupWebsite } from '../services/website.js';
import { searchContentChunks, formatContentContext, hasContent } from '../services/rag.js';
import { OWL_REGISTRY, getOwl, getPhaseInstructions, type OwlId } from '../prompts/owl-registry.js';
import { routeMessage } from '../services/agent-router.js';
import { recordMessageSignals, recordPhaseVelocity, recordExplicitRating, getSignalCount } from '../services/feedback.js';
import { getPhaseAdjustments } from '../services/adaptive.js';

const router = Router();

// Per-session business context from website lookup
const sessionContext: Map<string, string> = new Map();

/**
 * Detect if a message contains a URL
 */
function extractUrl(text: string): string | null {
    const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.(com|io|co|org|net|ai|app|dev|biz|us|info)[^\s]*)/i;
    const match = text.match(urlRegex);
    return match ? match[0] : null;
}

/**
 * Build chat prompt with conversation history
 */
function buildChatPrompt(
    playerName: string,
    userMessage: string,
    history: { role: string; content: string; agent_id?: string }[],
    agentName: string
): string {
    const historyContext = history.slice(-10).map(h =>
        `${h.role === 'user' ? playerName : (h.agent_id ? getOwl(h.agent_id as OwlId)?.name || 'Owl' : agentName)}: ${h.content}`
    ).join('\n');

    return `Player name: ${playerName}

CONVERSATION HISTORY:
${historyContext || '(This is the start of the conversation)'}

${playerName}'S LATEST MESSAGE: "${userMessage}"

Respond as ${agentName}. React naturally to what they said. Be helpful, specific, and encouraging. Remember: 2-3 sentences MAX, end with ONE question.`;
}

/**
 * GET /chat/sessions/list
 * List recent sessions (for session recovery / listing)
 * NOTE: Must be defined BEFORE /:id to avoid Express matching "sessions" as an id
 */
router.get('/sessions/list', async (req: Request, res: Response) => {
    try {
        const playerName = req.query.player_name as string;
        let sessions;
        if (playerName) {
            sessions = await ChatSession.listByPlayer(playerName);
        } else {
            sessions = await ChatSession.listRecent(20);
        }
        // Don't send full chat_history or avatar_data in list response (too large)
        const slim = sessions.map(s => ({
            id: s.id,
            player_name: s.player_name,
            company_name: s.company_name,
            path: s.path,
            current_gear: s.current_gear,
            current_phase: s.current_phase,
            current_agent: s.current_agent,
            is_active: s.is_active,
            has_avatar: !!s.avatar_data,
            message_count: Array.isArray(s.chat_history) ? s.chat_history.length : 0,
            created_at: s.created_at,
            updated_at: s.updated_at,
        }));
        res.json(slim);
    } catch (error: any) {
        console.error('[Chat] Error listing sessions:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /chat/:id
 */
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const session = await ChatSession.findById(req.params.id);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }
        res.json(session);
    } catch (error: any) {
        console.error('[Chat] Error fetching session:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /chat/:id/avatar
 * Save avatar data server-side (persists across browser clears)
 */
router.post('/:id/avatar', async (req: Request, res: Response) => {
    try {
        const { avatar_data } = req.body;
        if (!avatar_data) {
            return res.status(400).json({ error: 'avatar_data is required' });
        }
        // Limit to ~2MB base64 (roughly 1.5MB image)
        if (avatar_data.length > 2 * 1024 * 1024) {
            return res.status(413).json({ error: 'Avatar too large (max 2MB)' });
        }
        const saved = await ChatSession.saveAvatar(req.params.id, avatar_data);
        if (!saved) {
            return res.status(404).json({ error: 'Session not found' });
        }
        console.log(`[Chat] Avatar saved for session ${req.params.id} (${Math.round(avatar_data.length / 1024)}KB)`);
        res.json({ success: true });
    } catch (error: any) {
        console.error('[Chat] Error saving avatar:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /chat/:id/avatar
 * Get avatar data for a session
 */
router.get('/:id/avatar', async (req: Request, res: Response) => {
    try {
        const avatarData = await ChatSession.getAvatar(req.params.id);
        if (!avatarData) {
            return res.status(404).json({ error: 'No avatar found' });
        }
        res.json({ avatar_data: avatarData });
    } catch (error: any) {
        console.error('[Chat] Error getting avatar:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * DELETE /chat/:id
 * Soft-delete a session (can be recovered)
 */
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const deleted = await ChatSession.softDelete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ error: 'Session not found' });
        }
        console.log(`[Chat] Session soft-deleted: ${req.params.id}`);
        res.json({ success: true, message: 'Session deleted (can be recovered)' });
    } catch (error: any) {
        console.error('[Chat] Error deleting session:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /chat/:id/recover
 * Recover a soft-deleted session
 */
router.post('/:id/recover', async (req: Request, res: Response) => {
    try {
        const session = await ChatSession.recover(req.params.id);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }
        console.log(`[Chat] Session recovered: ${req.params.id}`);
        res.json(session);
    } catch (error: any) {
        console.error('[Chat] Error recovering session:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /chat
 * Create a new workshop session
 */
router.post('/', async (req: Request, res: Response) => {
    try {
        const { player_name, avatar_url, path } = req.body;

        if (!player_name) {
            return res.status(400).json({ error: 'player_name is required' });
        }

        const session = await ChatSession.create({
            player_name,
            avatar_url,
            path: path || 'discovery',
        });

        console.log(`[Chat] New session created: ${session.id} for ${player_name} (path: ${path || 'discovery'})`);

        // Generate Poly's opening greeting
        const poly = getOwl('poly');
        const greeting = poly.getGreeting(player_name);

        const chatHistory = [
            { role: 'assistant', content: greeting, timestamp: new Date().toISOString(), agent_id: 'poly' }
        ];

        const updatedSession = await ChatSession.update(session.id, {
            chat_history: chatHistory
        });

        res.json({
            ...updatedSession,
            opening_message: greeting,
            current_agent: 'poly',
        });
    } catch (error: any) {
        console.error('[Chat] Error creating session:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * PATCH /chat/:id
 */
router.patch('/:id', async (req: Request, res: Response) => {
    try {
        const session = await ChatSession.findById(req.params.id);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const updated = await ChatSession.update(req.params.id, req.body);
        res.json(updated);
    } catch (error: any) {
        console.error('[Chat] Error updating session:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /chat/:id/message
 * Send a message and get an owl's response
 */
router.post('/:id/message', async (req: Request, res: Response) => {
    try {
        const { message, source, provider } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'message is required' });
        }

        const session = await ChatSession.findById(req.params.id);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        console.log(`[Chat] Message from ${session.player_name}: "${message.substring(0, 80)}"`);

        // Check for URL — look up business context
        const detectedUrl = extractUrl(message);
        let businessContext = sessionContext.get(req.params.id) || session.company_context || '';

        if (detectedUrl) {
            console.log(`[Chat] URL detected: ${detectedUrl} — looking up business...`);
            const summary = await lookupWebsite(detectedUrl);
            if (summary) {
                businessContext = `\n\nBUSINESS CONTEXT (from ${detectedUrl}):\n${summary}`;
                sessionContext.set(req.params.id, businessContext);
                // Save to session for persistence
                await ChatSession.update(req.params.id, {
                    company_url: detectedUrl,
                    company_context: businessContext,
                });
            }
        }

        // Route to the appropriate owl agent
        // Normalize legacy 'sage' → 'poly' for existing DB sessions
        const rawAgent = session.current_agent || 'poly';
        const currentAgent = (rawAgent === 'sage' ? 'poly' : rawAgent) as OwlId;

        // Count turns in current phase (from session_data)
        const sessionData = session.session_data || {};
        const turnsInPhase = (sessionData.phase_turn_count || 0) + 1; // +1 for this message

        // Check for summary/report keywords — jump to final plan
        const summaryKeywords = /\b(summary|report|wrap up|final plan|generate plan|finish|done|let'?s wrap)\b/i;
        const currentPhase = session.current_phase || '1.1';

        let routing;
        if (summaryKeywords.test(message) && currentPhase !== '3.2') {
            console.log(`[Chat] Summary keyword detected — jumping to phase 3.2`);
            routing = {
                agent: 'poly' as OwlId,
                reason: 'user_requested_summary',
                phaseTransition: true,
                newPhase: '3.2',
            };
        } else {
            routing = await routeMessage(
                message,
                session.chat_history || [],
                currentPhase,
                currentAgent,
                session.path || 'discovery',
                turnsInPhase
            );
        }

        const activeAgent = routing.agent;
        const owl = getOwl(activeAgent);

        // Log agent switch (no transition text injected into messages)
        if (activeAgent !== currentAgent) {
            console.log(`[Chat] Agent switch: ${currentAgent} -> ${activeAgent} (${routing.reason})`);
        }

        // RAG: Search content for relevant passages
        let contentContext = '';
        try {
            const contentExists = await hasContent();
            if (contentExists) {
                const recentContext = (session.chat_history || [])
                    .slice(-4)
                    .map((h: any) => `${h.role}: ${h.content}`)
                    .join('\n');
                const chunks = await searchContentChunks(
                    message,
                    recentContext,
                    owl.domainKeywords,
                    session.industry || undefined
                );
                contentContext = formatContentContext(chunks);
            }
        } catch (err) {
            console.warn('[Chat] RAG search failed, continuing without content context:', err);
        }

        // Build enriched system prompt with phase-specific instructions
        const activePhase = routing.newPhase || currentPhase;
        const phaseInstructions = getPhaseInstructions(activePhase);

        let enrichedSystemPrompt = owl.systemPrompt;
        if (phaseInstructions) {
            enrichedSystemPrompt += `\n\n${phaseInstructions}`;
        }

        // Force readout when phase hit max turns
        if (routing.reason === 'force_readout') {
            enrichedSystemPrompt += `\n\nCRITICAL: You have reached the maximum questions for this phase. You MUST produce the readout/brief NOW in this response. Do NOT ask any more questions. Generate the formatted deliverable immediately based on what you know so far.`;
        }

        // If auto-advancing due to max turns, tell the owl to wrap up and transition
        if (routing.reason?.startsWith('auto_advance_max_turns')) {
            enrichedSystemPrompt += `\n\nNOTE: The conversation is moving to the next phase now. Provide a brief, confident wrap-up of this phase and transition smoothly. Do not ask more questions about this topic.`;
        }
        if (businessContext) {
            enrichedSystemPrompt += `\n${businessContext}\n\nYou've looked at their website. Reference specific details you learned about their business in your advice.`;
        }
        if (contentContext) {
            enrichedSystemPrompt += contentContext;
        }

        // Reinforcement Learning: Inject adaptive behavior adjustments from feedback signals
        const adaptiveAdjustments = await getPhaseAdjustments(activePhase, activeAgent);
        if (adaptiveAdjustments) {
            enrichedSystemPrompt += adaptiveAdjustments;
        }

        const chatPrompt = buildChatPrompt(
            session.player_name,
            message,
            session.chat_history || [],
            owl.name
        );

        // End-of-phase readouts need more tokens for comprehensive reports with tables
        const readoutPhases = ['1.4', '2.7', '3.1', '3.2'];
        const isReadoutPhase = readoutPhases.includes(activePhase);
        const result = await llmService.generateText(chatPrompt, enrichedSystemPrompt, {
            temperature: isReadoutPhase ? 0.6 : 0.8,
            maxTokens: activePhase === '3.2' ? 4000 : isReadoutPhase ? 3000 : 400,
            provider
        });

        let owlResponse = result.success
            ? result.content
            : `That's a great point. Can you tell me a bit more about that?`;

        // Update chat history
        const updatedHistory = [
            ...(session.chat_history || []),
            { role: 'user', content: message, timestamp: new Date().toISOString() },
            { role: 'assistant', content: owlResponse, timestamp: new Date().toISOString(), agent_id: activeAgent }
        ];

        // Update session
        const updateData: any = {
            chat_history: updatedHistory,
            current_agent: activeAgent,
        };

        if (routing.phaseTransition && routing.newPhase) {
            updateData.current_phase = routing.newPhase;
            const gear = parseInt(routing.newPhase.split('.')[0]);
            if (gear) updateData.current_gear = gear;
            // Reset turn counter on phase transition
            updateData.session_data = { ...sessionData, phase_turn_count: 0 };
            console.log(`[Chat] Phase transition: ${currentPhase} -> ${routing.newPhase} (turns in prev phase: ${turnsInPhase})`);
        } else {
            // Increment turn counter
            updateData.session_data = { ...sessionData, phase_turn_count: turnsInPhase };
        }

        await ChatSession.update(req.params.id, updateData);

        res.json({
            response: owlResponse,
            agent_id: activeAgent,
            agent_name: owl.name,
            agent_role: owl.role,
            tokens: result.tokensUsed,
            phase: routing.newPhase || session.current_phase,
            gear: routing.newPhase ? parseInt(routing.newPhase.split('.')[0]) : session.current_gear,
        });

        // RL: Record implicit feedback signals (fire-and-forget, don't block response)
        recordMessageSignals(req.params.id, activePhase, activeAgent, message, source || 'typed').catch(() => {});
        if (routing.phaseTransition) {
            recordPhaseVelocity(req.params.id, currentPhase, activeAgent, turnsInPhase).catch(() => {});
        }
    } catch (error: any) {
        console.error('[Chat] Error processing message:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /chat/:id/feedback
 * Record explicit thumbs up/down rating for a message
 */
router.post('/:id/feedback', async (req: Request, res: Response) => {
    try {
        const { message_index, rating } = req.body;
        if (!rating || !['positive', 'negative'].includes(rating)) {
            return res.status(400).json({ error: 'rating must be "positive" or "negative"' });
        }

        const session = await ChatSession.findById(req.params.id);
        if (!session) return res.status(404).json({ error: 'Session not found' });

        const rawAgent = session.current_agent || 'poly';
        const agentId = (rawAgent === 'sage' ? 'poly' : rawAgent);

        await recordExplicitRating(
            req.params.id,
            session.current_phase || '1.1',
            agentId,
            rating,
            message_index || 0
        );

        res.json({ success: true });
    } catch (error: any) {
        console.error('[Chat] Feedback error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /ai/toolset-status
 * Returns live status of all 6 AI toolsets for the info panel
 */
router.get('/toolset-status', async (_req: Request, res: Response) => {
    try {
        // Check RAG status
        let ragStatus = { status: 'inactive', chunks: 0, withEmbeddings: 0 };
        try {
            const result = await (await import('../db/index.js')).query(
                `SELECT COUNT(*) as total, COUNT(embedding) as with_emb FROM content_chunks`
            );
            const row = result.rows[0];
            ragStatus = {
                status: parseInt(row.with_emb) > 0 ? 'active' : 'inactive',
                chunks: parseInt(row.total),
                withEmbeddings: parseInt(row.with_emb),
            };
        } catch {}

        // RL signal count
        const signalCount = await getSignalCount();

        res.json({
            rag: ragStatus,
            conversational: { status: 'active', agents: 5, provider: 'anthropic+gemini' },
            imageGen: { status: 'active', provider: 'gemini-flash' },
            mcp: { status: 'active', tools: 3 },
            rl: { status: signalCount > 0 ? 'active' : 'collecting', signals: signalCount },
            vibeCoding: { status: 'active' },
        });
    } catch (error: any) {
        console.error('[Toolset] Status error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
