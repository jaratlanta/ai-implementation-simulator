/**
 * Adaptive Behavior Service — Reinforcement Learning policy adjustments
 *
 * Queries aggregate feedback signals to compute per-phase, per-agent
 * prompt adjustments. This is contextual-bandit RL: signals drive policy
 * (prompt modifier) without neural networks.
 */

import { query } from '../db/index.js';

interface PhaseStats {
    avgQuickReplyRate: number;
    avgMessageLength: number;
    avgVelocity: number;
    avgRating: number;
    totalSignals: number;
}

/**
 * Get aggregate stats for a phase/agent combination
 */
async function getPhaseStats(phase: string, agentId: string): Promise<PhaseStats | null> {
    try {
        const result = await query(`
            SELECT
                AVG(CASE WHEN signal_type = 'quick_reply_used' THEN signal_value END) as avg_qr,
                AVG(CASE WHEN signal_type = 'message_length' THEN signal_value END) as avg_len,
                AVG(CASE WHEN signal_type = 'phase_velocity' THEN signal_value END) as avg_vel,
                AVG(CASE WHEN signal_type = 'explicit_rating' THEN signal_value END) as avg_rating,
                COUNT(*) as total
            FROM feedback_signals
            WHERE phase = $1 AND agent_id = $2
        `, [phase, agentId]);

        const row = result.rows[0];
        if (!row || parseInt(row.total) < 5) return null; // Need at least 5 signals

        return {
            avgQuickReplyRate: parseFloat(row.avg_qr) || 0.5,
            avgMessageLength: parseFloat(row.avg_len) || 0.5,
            avgVelocity: parseFloat(row.avg_vel) || 0.5,
            avgRating: parseFloat(row.avg_rating) || 0.5,
            totalSignals: parseInt(row.total),
        };
    } catch {
        return null;
    }
}

/**
 * Generate prompt adjustments based on aggregated feedback signals.
 * Returns a string to append to the system prompt, or empty string if no data.
 */
export async function getPhaseAdjustments(phase: string, agentId: string): Promise<string> {
    const stats = await getPhaseStats(phase, agentId);
    if (!stats) return ''; // Not enough data yet

    const adjustments: string[] = [];

    // Low engagement (short messages, high quick reply rate) → simplify questions
    if (stats.avgMessageLength < 0.2 && stats.avgQuickReplyRate > 0.7) {
        adjustments.push('Keep questions very short and specific — users tend to give brief answers in this phase.');
    }

    // High engagement (long messages) → allow deeper exploration
    if (stats.avgMessageLength > 0.6) {
        adjustments.push('Users engage deeply in this phase — feel free to ask follow-up questions when they share details.');
    }

    // Slow velocity (many turns) → be more direct
    if (stats.avgVelocity < 0.3) {
        adjustments.push('Move quickly through this phase — users prefer fewer, more focused questions here.');
    }

    // Low ratings → adjust tone
    if (stats.avgRating < 0.4 && stats.totalSignals >= 10) {
        adjustments.push('Previous users found this phase less engaging — try to be more concrete with examples and avoid abstract questions.');
    }

    // High ratings → keep doing what works
    if (stats.avgRating > 0.8 && stats.totalSignals >= 10) {
        adjustments.push('Users respond very well in this phase — maintain your current approach.');
    }

    if (adjustments.length === 0) return '';

    return `\n\nADAPTIVE INSIGHTS (from ${stats.totalSignals} feedback signals):\n${adjustments.join('\n')}`;
}
