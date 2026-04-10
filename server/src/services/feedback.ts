/**
 * Feedback Signal Service — Reinforcement Learning data collection
 * Collects implicit and explicit feedback signals to drive adaptive agent behavior.
 */

import { query } from '../db/index.js';

export type SignalType = 'quick_reply_used' | 'message_length' | 'phase_velocity' | 'explicit_rating' | 'completion_depth';

/**
 * Record a feedback signal
 */
export async function recordSignal(
    sessionId: string,
    phase: string,
    agentId: string,
    signalType: SignalType,
    signalValue: number,
    context: Record<string, any> = {}
): Promise<void> {
    try {
        await query(
            `INSERT INTO feedback_signals (session_id, phase, agent_id, signal_type, signal_value, context)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [sessionId, phase, agentId, signalType, signalValue, JSON.stringify(context)]
        );
    } catch (err) {
        console.warn('[Feedback] Failed to record signal:', err);
    }
}

/**
 * Record implicit signals from a user message.
 * Called automatically from chat.ts on every user message.
 */
export async function recordMessageSignals(
    sessionId: string,
    phase: string,
    agentId: string,
    message: string,
    source: 'typed' | 'quick_reply' = 'typed'
): Promise<void> {
    // Quick reply usage signal (1.0 = used quick reply, 0.0 = typed)
    await recordSignal(sessionId, phase, agentId, 'quick_reply_used',
        source === 'quick_reply' ? 1.0 : 0.0,
        { messageLength: message.length }
    );

    // Message length signal (normalized: 0-1 scale, longer = more engaged)
    const lengthScore = Math.min(message.length / 200, 1.0);
    await recordSignal(sessionId, phase, agentId, 'message_length',
        lengthScore,
        { rawLength: message.length }
    );
}

/**
 * Record phase transition velocity.
 * Called when a phase transition occurs.
 */
export async function recordPhaseVelocity(
    sessionId: string,
    phase: string,
    agentId: string,
    turnsInPhase: number
): Promise<void> {
    // Lower turns = faster velocity = better flow (inverted: 1.0 = fast, 0.0 = slow)
    const velocityScore = Math.max(0, 1.0 - (turnsInPhase / 10));
    await recordSignal(sessionId, phase, agentId, 'phase_velocity',
        velocityScore,
        { turnsInPhase }
    );
}

/**
 * Record explicit thumbs up/down rating
 */
export async function recordExplicitRating(
    sessionId: string,
    phase: string,
    agentId: string,
    rating: 'positive' | 'negative',
    messageIndex: number
): Promise<void> {
    await recordSignal(sessionId, phase, agentId, 'explicit_rating',
        rating === 'positive' ? 1.0 : 0.0,
        { messageIndex, rating }
    );
}

/**
 * Get total signal count (for status API)
 */
export async function getSignalCount(): Promise<number> {
    try {
        const result = await query('SELECT COUNT(*) as count FROM feedback_signals');
        return parseInt(result.rows[0]?.count || '0');
    } catch {
        return 0;
    }
}
