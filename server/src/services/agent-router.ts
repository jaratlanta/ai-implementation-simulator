/**
 * Agent Router — phase-driven conversation flow for the Implementation Planner
 *
 * PHASE → OWL MAPPING:
 * 1.1 Poly (Company Context)
 * 1.2 Poly (Pain Points)
 * 1.3 Nova (Gear Assessment)
 * 1.4 Nova (Use Case Selection + Discovery Readout)
 * 2.1 Nova (Confirm Scope + Success)
 * 2.2 Ember (Ownership + Stakeholders)
 * 2.3 Ember (Governance)
 * 2.4 Atlas (Systems & Data)
 * 2.5 Atlas (Extend/Buy/Build)
 * 2.6 Ember (Change Management)
 * 2.7 Ledger (Roadmap + Milestones + Strategy Readout)
 * 3.1 Ledger (ROI Case)
 * 3.2 Poly (Final Implementation Plan Readout)
 */

import * as llmService from './llm.js';
import { type OwlId } from '../prompts/owl-registry.js';

interface RoutingDecision {
    agent: OwlId;
    reason: string;
    phaseTransition?: boolean;
    newPhase?: string;
}

const PHASE_DEFAULTS: Record<string, OwlId> = {
    '1.1': 'poly',
    '1.2': 'poly',
    '1.3': 'nova',
    '1.4': 'nova',
    '2.1': 'nova',
    '2.2': 'ember',
    '2.3': 'ember',
    '2.4': 'atlas',
    '2.5': 'atlas',
    '2.6': 'ember',
    '2.7': 'ledger',
    '3.1': 'ledger',
    '3.2': 'poly',
};

const PHASE_ORDER = ['1.1', '1.2', '1.3', '1.4', '2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7', '3.1', '3.2'];

/**
 * Maximum user turns per phase before auto-advancing.
 * Prevents circular conversations — forces the experience forward.
 */
const MAX_PHASE_TURNS: Record<string, number> = {
    '1.1': 2,   // Company context — quick
    '1.2': 4,   // Pain points
    '1.3': 3,   // Gear assessment
    '1.4': 4,   // Use case selection + readout
    '2.1': 3,   // Scope + success
    '2.2': 3,   // Ownership
    '2.3': 3,   // Governance
    '2.4': 4,   // Systems & data
    '2.5': 3,   // Extend/Buy/Build
    '2.6': 3,   // Change management
    '2.7': 4,   // Roadmap + readout
    '3.1': 3,   // ROI
    '3.2': 7,   // Final plan — more room
};

function getNextPhase(currentPhase: string): string | null {
    const idx = PHASE_ORDER.indexOf(currentPhase);
    return idx >= 0 && idx < PHASE_ORDER.length - 1 ? PHASE_ORDER[idx + 1] : null;
}

/**
 * Phases that generate a readout/brief BEFORE advancing.
 * On the turn the user triggers completion (e.g. picks a use case), the owl
 * delivers the readout while staying in the same phase. Only the NEXT user
 * message (e.g. "continue", "ready") advances to the next phase.
 */
const READOUT_PHASES = new Set(['1.4', '2.7']);

/** Check if the readout has already been delivered in recent history */
function readoutWasDelivered(phase: string, history: { role: string; content: string }[]): boolean {
    const lastOwlMessages = history.filter(h => h.role === 'assistant').slice(-2);
    const recentText = lastOwlMessages.map(h => h.content).join(' ');

    if (phase === '1.4') {
        return recentText.includes('Discovery Brief') || recentText.includes('DISCOVERY BRIEF');
    }
    if (phase === '2.7') {
        return recentText.includes('Strategy Brief') || recentText.includes('STRATEGY BRIEF') || recentText.includes('AI STRATEGY BRIEF');
    }
    return true;
}

/**
 * Phase descriptions for the router LLM
 */
const PHASE_COMPLETION_HINTS: Record<string, string> = {
    '1.1': 'move when we have company name, role, and context',
    '1.2': 'move when user has described a clear pain point',
    '1.3': 'move when user has indicated their Gear level (1/2/3)',
    '1.4': 'move ONLY AFTER the Discovery Brief readout has been delivered AND user says continue/ready',
    '2.1': 'move when scope and success indicators are confirmed',
    '2.2': 'move when ownership/stakeholders are identified',
    '2.3': 'move when governance considerations are covered',
    '2.4': 'move when systems and data readiness are assessed',
    '2.5': 'move when extend/buy/build decision is made',
    '2.6': 'move when change management plan is outlined',
    '2.7': 'move ONLY AFTER the Strategy Brief readout has been delivered AND user says continue/ready',
    '3.1': 'move when ROI case is validated',
    '3.2': 'this is the final phase — no advance',
};

/**
 * Determine which owl should respond and whether to advance the phase
 */
export async function routeMessage(
    userMessage: string,
    recentHistory: { role: string; content: string; agent_id?: string }[],
    currentPhase: string,
    currentAgent: OwlId,
    path: string,
    turnsInPhase: number = 0,
    provider?: string
): Promise<RoutingDecision> {
    // Phase 1.1: Keep Poly for first 1-2 exchanges
    if (currentPhase === '1.1') {
        const userMsgCount = recentHistory.filter(h => h.role === 'user').length;
        if (userMsgCount >= 1) {
            return {
                agent: 'poly',
                reason: 'intro_complete',
                phaseTransition: true,
                newPhase: '1.2',
            };
        }
        return { agent: 'poly', reason: 'intro_phase' };
    }

    const nextPhase = getNextPhase(currentPhase);
    const maxTurns = MAX_PHASE_TURNS[currentPhase] || 5;

    // AUTO-ADVANCE: If we've hit the max turns for this phase, force advance
    // For readout phases, we still stay one more turn to let the owl deliver the readout
    if (turnsInPhase >= maxTurns && nextPhase) {
        // For readout phases at max turns, check if readout was delivered
        if (READOUT_PHASES.has(currentPhase) && !readoutWasDelivered(currentPhase, recentHistory)) {
            console.log(`[AgentRouter] Phase ${currentPhase}: max turns (${turnsInPhase}/${maxTurns}) but readout not delivered yet — forcing readout`);
            return {
                agent: PHASE_DEFAULTS[currentPhase] || currentAgent,
                reason: 'force_readout',
            };
        }
        console.log(`[AgentRouter] Phase ${currentPhase}: auto-advancing after ${turnsInPhase} turns (max: ${maxTurns})`);
        return {
            agent: PHASE_DEFAULTS[nextPhase] || currentAgent,
            reason: `auto_advance_max_turns_${turnsInPhase}`,
            phaseTransition: true,
            newPhase: nextPhase,
        };
    }

    // Readout gate: if we're in a readout phase and the readout hasn't been delivered yet,
    // DON'T advance — let the owl deliver the readout first
    if (READOUT_PHASES.has(currentPhase) && !readoutWasDelivered(currentPhase, recentHistory)) {
        console.log(`[AgentRouter] Phase ${currentPhase}: readout not yet delivered, staying in phase`);
        return {
            agent: PHASE_DEFAULTS[currentPhase] || currentAgent,
            reason: 'readout_pending',
        };
    }

    // For all other phases, use LLM routing (with turn count context)
    try {
        const historySnippet = recentHistory.slice(-6).map(h =>
            `${h.role === 'user' ? 'User' : (h.agent_id || 'Owl')}: ${h.content}`
        ).join('\n');

        const completionHint = PHASE_COMPLETION_HINTS[currentPhase] || '';

        const prompt = `You control conversation flow for an AI implementation planning workshop.

CURRENT PHASE: ${currentPhase}
COMPLETION CRITERIA: ${completionHint}
NEXT PHASE: ${nextPhase || 'NONE (final)'}
TURNS IN THIS PHASE: ${turnsInPhase}/${maxTurns} (auto-advance at ${maxTurns})

CONVERSATION:
${historySnippet}

USER'S LATEST: "${userMessage}"

Should the conversation advance to the next phase?

RULES:
- If user picks a use case (says "1", "2", "3", "first one", "option 2", etc), ADVANCE
- If user says "next", "continue", "move on", "let's go", "yes continue", ADVANCE
- If user says "Would you like to refine anything" and answers "no" or "continue", ADVANCE
- If the completion criteria seem met based on the conversation, ADVANCE
- If user asks to go back or refine, DON'T advance
- BIAS TOWARD ADVANCING — keep it moving, 30-minute experience
- If turns >= ${maxTurns - 1}, STRONGLY prefer advancing — we're running out of turns for this phase

Respond with ONLY valid JSON:
{"advance":true/false,"reason":"brief_reason"}`;

        const result = await llmService.generateText(prompt, undefined, {
            temperature: 0.1,
            maxTokens: 60,
            provider
        });

        if (result.success && result.content) {
            try {
                let jsonStr = result.content.trim();
                if (jsonStr.startsWith('```')) {
                    jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
                }
                const parsed = JSON.parse(jsonStr);

                if (parsed.advance && nextPhase) {
                    return {
                        agent: PHASE_DEFAULTS[nextPhase] || currentAgent,
                        reason: parsed.reason || 'phase_complete',
                        phaseTransition: true,
                        newPhase: nextPhase,
                    };
                }
            } catch (parseErr) {
                console.warn('[AgentRouter] Failed to parse:', result.content);
            }
        }
    } catch (err) {
        console.warn('[AgentRouter] Routing failed, using phase default');
    }

    return {
        agent: PHASE_DEFAULTS[currentPhase] || currentAgent,
        reason: 'stay_in_phase',
    };
}

/**
 * Get a transition message when switching owls
 */
export function getTransitionMessage(fromOwl: OwlId, toOwl: OwlId, _reason: string): string {
    const names: Record<OwlId, string> = {
        poly: 'Poly', nova: 'Nova', atlas: 'Atlas',
        ember: 'Ember', ledger: 'Ledger', scout: 'Scout',
    };
    const roles: Record<OwlId, string> = {
        poly: 'our facilitator',
        nova: 'our AI Strategist',
        atlas: 'our Data & Systems Architect',
        ember: 'our People & Change Lead',
        ledger: 'our ROI & Roadmap Analyst',
        scout: 'our Industry Research Lead',
    };
    return `*${names[fromOwl]} nods and steps aside* Let me bring in ${names[toOwl]}, ${roles[toOwl]}...`;
}
