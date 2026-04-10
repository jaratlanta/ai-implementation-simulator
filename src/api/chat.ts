/**
 * Chat API client for workshop sessions
 */

import type { WorkshopSession } from '../types/chat';

const API_URL = import.meta.env.VITE_API_URL || '';

export async function getSession(sessionId: string): Promise<WorkshopSession | null> {
    try {
        const response = await fetch(`${API_URL}/chat/${sessionId}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`Failed to fetch session: ${response.status}`);
        return await response.json();
    } catch (err) {
        console.error('[ChatAPI] Error fetching session:', err);
        return null;
    }
}

export async function createSession(playerName: string, avatarUrl?: string, path?: string): Promise<WorkshopSession> {
    const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_name: playerName, avatar_url: avatarUrl, path })
    });
    if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown');
        throw new Error(`Create session failed (${response.status}): ${errorText}`);
    }
    return await response.json();
}

export async function updateSession(sessionId: string, updates: Partial<WorkshopSession>): Promise<WorkshopSession | null> {
    try {
        const response = await fetch(`${API_URL}/chat/${sessionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        if (!response.ok) throw new Error(`Failed to update session: ${response.status}`);
        return await response.json();
    } catch (err) {
        console.error('[ChatAPI] Error updating session:', err);
        return null;
    }
}

export interface MessageResponse {
    response: string;
    agent_id: string;
    agent_name: string;
    agent_role: string;
    tokens?: { input: number; output: number };
    phase?: string;
    gear?: number;
}

export async function sendMessage(sessionId: string, message: string, source: 'typed' | 'quick_reply' = 'typed'): Promise<MessageResponse | null> {
    try {
        const response = await fetch(`${API_URL}/chat/${sessionId}/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, source })
        });
        if (!response.ok) throw new Error(`Failed to send message: ${response.status}`);
        return await response.json();
    } catch (err) {
        console.error('[ChatAPI] Error sending message:', err);
        return null;
    }
}

/**
 * Save avatar data to server (persists across browser clears)
 */
export async function saveAvatarToServer(sessionId: string, avatarData: string): Promise<boolean> {
    try {
        const response = await fetch(`${API_URL}/chat/${sessionId}/avatar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ avatar_data: avatarData })
        });
        if (!response.ok) {
            console.warn('[ChatAPI] Avatar save failed:', response.status);
            return false;
        }
        console.log('[ChatAPI] Avatar saved to server');
        return true;
    } catch (err) {
        console.warn('[ChatAPI] Avatar save error:', err);
        return false;
    }
}

/**
 * Load avatar data from server
 */
export async function loadAvatarFromServer(sessionId: string): Promise<string | null> {
    try {
        const response = await fetch(`${API_URL}/chat/${sessionId}/avatar`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        if (response.status === 404) return null;
        if (!response.ok) return null;
        const data = await response.json();
        return data.avatar_data || null;
    } catch (err) {
        console.warn('[ChatAPI] Avatar load error:', err);
        return null;
    }
}

/**
 * Soft-delete a session (recoverable)
 */
export async function deleteSession(sessionId: string): Promise<boolean> {
    try {
        const response = await fetch(`${API_URL}/chat/${sessionId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });
        return response.ok;
    } catch (err) {
        console.error('[ChatAPI] Error deleting session:', err);
        return false;
    }
}
