/**
 * Chat-related type definitions
 */

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    agent_id?: string;
}

export interface WorkshopSession {
    id: string;
    player_name: string;
    avatar_url: string | null;
    company_name: string | null;
    company_url: string | null;
    industry: string | null;
    path: string;
    current_gear: number;
    current_phase: string;
    completed_phases: string[];
    current_agent: string;
    chat_history: ChatMessage[];
    session_data: Record<string, any>;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    opening_message?: string;
}
