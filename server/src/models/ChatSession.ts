/**
 * Workshop Session Model
 * Sessions persist until explicitly deleted (soft-delete via deleted_at).
 * Avatar data stored server-side so conversations survive browser/device changes.
 */

import { query } from '../db/index.js';

export interface WorkshopSession {
    id: string;
    player_name: string;
    avatar_url: string | null;
    avatar_data: string | null;  // base64 data URL stored server-side
    company_name: string | null;
    company_url: string | null;
    company_context: string | null;
    industry: string | null;
    path: string;
    current_gear: number;
    current_phase: string;
    completed_phases: string[];
    current_agent: string;
    chat_history: { role: string; content: string; timestamp: string; agent_id?: string }[];
    session_data: Record<string, any>;
    is_active: boolean;
    deleted_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

export interface CreateSessionInput {
    player_name: string;
    avatar_url?: string;
    avatar_data?: string;
    path?: string;
}

export interface UpdateSessionInput {
    player_name?: string;
    avatar_url?: string;
    avatar_data?: string;
    company_name?: string;
    company_url?: string;
    company_context?: string;
    industry?: string;
    path?: string;
    current_gear?: number;
    current_phase?: string;
    completed_phases?: string[];
    current_agent?: string;
    chat_history?: any[];
    session_data?: Record<string, any>;
    is_active?: boolean;
}

/**
 * Find session by ID (excludes soft-deleted)
 */
export async function findById(id: string): Promise<WorkshopSession | null> {
    const result = await query<WorkshopSession>(
        'SELECT * FROM workshop_sessions WHERE id = $1 AND deleted_at IS NULL',
        [id]
    );
    return result.rows[0] || null;
}

/**
 * Find session by ID, including soft-deleted (for recovery)
 */
export async function findByIdIncludeDeleted(id: string): Promise<WorkshopSession | null> {
    const result = await query<WorkshopSession>(
        'SELECT * FROM workshop_sessions WHERE id = $1',
        [id]
    );
    return result.rows[0] || null;
}

/**
 * List all active sessions for a player (by name match)
 */
export async function listByPlayer(playerName: string): Promise<WorkshopSession[]> {
    const result = await query<WorkshopSession>(
        `SELECT * FROM workshop_sessions
         WHERE player_name = $1 AND is_active = true AND deleted_at IS NULL
         ORDER BY updated_at DESC
         LIMIT 20`,
        [playerName]
    );
    return result.rows;
}

/**
 * List recent sessions (for admin/debug)
 */
export async function listRecent(limit: number = 20): Promise<WorkshopSession[]> {
    const result = await query<WorkshopSession>(
        `SELECT id, player_name, company_name, path, current_gear, current_phase,
                current_agent, is_active, created_at, updated_at
         FROM workshop_sessions
         WHERE deleted_at IS NULL
         ORDER BY updated_at DESC
         LIMIT $1`,
        [limit]
    );
    return result.rows;
}

/**
 * Create a new workshop session
 */
export async function create(input: CreateSessionInput): Promise<WorkshopSession> {
    const result = await query<WorkshopSession>(
        `INSERT INTO workshop_sessions (player_name, avatar_url, avatar_data, path, chat_history, session_data, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, true)
         RETURNING *`,
        [
            input.player_name,
            input.avatar_url || null,
            input.avatar_data || null,
            input.path || 'discovery',
            JSON.stringify([]),
            JSON.stringify({})
        ]
    );
    return result.rows[0];
}

/**
 * Update an existing workshop session
 */
export async function update(id: string, input: UpdateSessionInput): Promise<WorkshopSession | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, any> = {
        player_name: input.player_name,
        avatar_url: input.avatar_url,
        avatar_data: input.avatar_data,
        company_name: input.company_name,
        company_url: input.company_url,
        company_context: input.company_context,
        industry: input.industry,
        path: input.path,
        current_gear: input.current_gear,
        current_phase: input.current_phase,
        current_agent: input.current_agent,
        is_active: input.is_active,
    };

    for (const [key, value] of Object.entries(fieldMap)) {
        if (value !== undefined) {
            fields.push(`${key} = $${paramIndex++}`);
            values.push(value);
        }
    }

    if (input.completed_phases !== undefined) {
        fields.push(`completed_phases = $${paramIndex++}`);
        values.push(input.completed_phases);
    }
    if (input.chat_history !== undefined) {
        fields.push(`chat_history = $${paramIndex++}`);
        values.push(JSON.stringify(input.chat_history));
    }
    if (input.session_data !== undefined) {
        fields.push(`session_data = $${paramIndex++}`);
        values.push(JSON.stringify(input.session_data));
    }

    if (fields.length === 0) return findById(id);

    values.push(id);
    const sql = `UPDATE workshop_sessions SET ${fields.join(', ')} WHERE id = $${paramIndex} AND deleted_at IS NULL RETURNING *`;

    const result = await query<WorkshopSession>(sql, values);
    return result.rows[0] || null;
}

/**
 * Soft-delete a session (can be recovered)
 */
export async function softDelete(id: string): Promise<boolean> {
    const result = await query(
        `UPDATE workshop_sessions SET deleted_at = NOW(), is_active = false WHERE id = $1 AND deleted_at IS NULL`,
        [id]
    );
    return (result.rowCount ?? 0) > 0;
}

/**
 * Recover a soft-deleted session
 */
export async function recover(id: string): Promise<WorkshopSession | null> {
    const result = await query<WorkshopSession>(
        `UPDATE workshop_sessions SET deleted_at = NULL, is_active = true WHERE id = $1 RETURNING *`,
        [id]
    );
    return result.rows[0] || null;
}

/**
 * Save avatar data to a session (server-side persistence)
 */
export async function saveAvatar(id: string, avatarData: string): Promise<boolean> {
    const result = await query(
        `UPDATE workshop_sessions SET avatar_data = $1 WHERE id = $2 AND deleted_at IS NULL`,
        [avatarData, id]
    );
    return (result.rowCount ?? 0) > 0;
}

/**
 * Get avatar data for a session
 */
export async function getAvatar(id: string): Promise<string | null> {
    const result = await query<{ avatar_data: string | null }>(
        `SELECT avatar_data FROM workshop_sessions WHERE id = $1 AND deleted_at IS NULL`,
        [id]
    );
    return result.rows[0]?.avatar_data || null;
}
