/**
 * AI Implementation Simulator — Main Entry Point
 * Flow: Landing Page → Avatar Creator → Chat with Owl Team
 */

import { imageGenerator } from './image';
import { uiManager } from './ui/UIManager';
import { LandingPage } from './ui/LandingPage';
import { AvatarCreator } from './ui/AvatarCreator';
import { ChatScreen } from './ui/ChatScreen';
import { createSession, getSession, saveAvatarToServer, loadAvatarFromServer, deleteSession } from './api/chat';
// owl-avatar module no longer needed — using static brand SVG
import type { OwlId } from './types/owl';

// Expose imageGenerator globally
(window as any).imageGenerator = imageGenerator;

// Session persistence
const SESSION_KEY = 'ais_session_id';
const AVATAR_KEY = 'ais_avatar_url';
const AVATAR_PERSISTENT_KEY = 'ais_avatar_persistent'; // NEVER cleared on reset — survives conversation resets
const NAME_KEY = 'ais_player_name';
const NAME_PERSISTENT_KEY = 'ais_player_name_persistent'; // NEVER cleared on reset
const PATH_KEY = 'ais_path';

// In-memory avatar for current session (full resolution)
let currentAvatarUrl: string = '';

// All owls use the same brand owl icon
const OWL_ICON = '/brand/owl-icon.png';
let owlAvatars: Record<OwlId, string> = {
    poly: OWL_ICON,
    nova: OWL_ICON,
    atlas: OWL_ICON,
    ember: OWL_ICON,
    ledger: OWL_ICON,
    scout: OWL_ICON,
};

let selectedPath: 'discovery' | 'strategy' = 'discovery';

/**
 * Compress a base64 data URL down to a small thumbnail for localStorage
 */
function compressAvatar(dataUrl: string, maxDim: number = 400): Promise<string> {
    return new Promise((resolve) => {
        if (!dataUrl || !dataUrl.startsWith('data:')) {
            resolve(dataUrl);
            return;
        }
        const img = new Image();
        img.onload = () => {
            // Preserve aspect ratio
            let w = img.naturalWidth;
            let h = img.naturalHeight;
            if (w > maxDim || h > maxDim) {
                const scale = maxDim / Math.max(w, h);
                w = Math.round(w * scale);
                h = Math.round(h * scale);
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => resolve('skipped');
        img.src = dataUrl;
    });
}

/**
 * Save avatar — full res in memory, compressed thumbnail in localStorage
 * Avatar persists until the user explicitly deletes or changes it.
 */
async function saveAvatar(avatarUrl: string) {
    currentAvatarUrl = avatarUrl;
    if (!avatarUrl || avatarUrl === 'skipped') {
        try { localStorage.setItem(AVATAR_KEY, 'skipped'); } catch {}
        // Don't overwrite persistent avatar with 'skipped' — keep whatever was there
        return;
    }
    try {
        const thumbnail = await compressAvatar(avatarUrl);
        localStorage.setItem(AVATAR_KEY, thumbnail);
        // Also save to persistent key that survives conversation resets
        localStorage.setItem(AVATAR_PERSISTENT_KEY, thumbnail);
        console.log('[App] Avatar saved to localStorage (session + persistent), thumbnail size:', Math.round(thumbnail.length / 1024), 'KB');
    } catch (e) {
        console.warn('[App] Could not save avatar thumbnail to localStorage:', e);
        try {
            const smallThumb = await compressAvatar(avatarUrl, 128);
            localStorage.setItem(AVATAR_KEY, smallThumb);
            localStorage.setItem(AVATAR_PERSISTENT_KEY, smallThumb);
            console.log('[App] Avatar saved with smaller compression');
        } catch {
            const existing = localStorage.getItem(AVATAR_KEY);
            if (!existing || existing === 'skipped') {
                try { localStorage.setItem(AVATAR_KEY, 'skipped'); } catch {}
            }
        }
    }
}

async function init() {
    console.log('[AIS] Initializing AI Implementation Simulator...');

    // Initialize Gemini for image generation
    const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (geminiKey) {
        imageGenerator.setProviderConfig('gemini-2.5-flash', geminiKey);
        imageGenerator.setProviderConfig('gemini-2.5-flash-upload', geminiKey);
        imageGenerator.setProviderConfig('gemini', geminiKey);
    } else {
        console.warn('[App] VITE_GEMINI_API_KEY is not set!');
    }

    const openaiKey = import.meta.env.VITE_OPENAI_API_KEY;
    if (openaiKey) {
        imageGenerator.setProviderConfig('openai', openaiKey);
    }

    const grokKey = import.meta.env.VITE_GROK_API_KEY;
    if (grokKey) {
        imageGenerator.setProviderConfig('grok', grokKey);
    }

    console.log('[App] Using brand owl icon for all agents');

    // Check for existing session
    const savedSessionId = localStorage.getItem(SESSION_KEY);
    const savedAvatarUrl = localStorage.getItem(AVATAR_KEY);
    const savedName = localStorage.getItem(NAME_KEY);

    if (savedSessionId && savedName) {
        try {
            const session = await getSession(savedSessionId);
            if (session && session.is_active) {
                console.log('[App] Found existing session:', savedSessionId);

                // Try localStorage first, then persistent key, then server for avatar
                let restoredAvatar = savedAvatarUrl || '';
                if (!restoredAvatar || restoredAvatar === 'skipped') {
                    // Check the persistent avatar key (survives resets)
                    const persistentAvatar = localStorage.getItem(AVATAR_PERSISTENT_KEY);
                    if (persistentAvatar && persistentAvatar !== 'skipped' && persistentAvatar.startsWith('data:')) {
                        restoredAvatar = persistentAvatar;
                        try { localStorage.setItem(AVATAR_KEY, restoredAvatar); } catch {}
                        console.log('[App] Avatar restored from persistent key');
                    } else {
                        console.log('[App] No avatar in localStorage, checking server...');
                        const serverAvatar = await loadAvatarFromServer(savedSessionId);
                        if (serverAvatar && serverAvatar.startsWith('data:')) {
                            restoredAvatar = serverAvatar;
                            try { localStorage.setItem(AVATAR_KEY, restoredAvatar); } catch {}
                            try { localStorage.setItem(AVATAR_PERSISTENT_KEY, restoredAvatar); } catch {}
                            console.log('[App] Avatar restored from server');
                        }
                    }
                }

                currentAvatarUrl = restoredAvatar;
                console.log('[App] Restored avatar:', restoredAvatar && restoredAvatar !== 'skipped' ? `${Math.round(restoredAvatar.length / 1024)}KB` : 'none');
                showResumePrompt(session, savedName, restoredAvatar);
                return;
            }
        } catch (err) {
            console.warn('[App] Failed to resume session, starting fresh');
        }
    }

    // No active session — check if we have a persistent avatar from a previous session
    // This happens after a conversation reset: session is gone but avatar should survive
    const persistentAvatar = localStorage.getItem(AVATAR_PERSISTENT_KEY);
    const persistentName = localStorage.getItem(NAME_PERSISTENT_KEY);
    if (persistentAvatar && persistentAvatar !== 'skipped' && persistentAvatar.startsWith('data:')) {
        currentAvatarUrl = persistentAvatar;
        // Re-populate the session avatar key so the avatar creator can skip photo
        try { localStorage.setItem(AVATAR_KEY, persistentAvatar); } catch {}
        if (persistentName) {
            try { localStorage.setItem(NAME_KEY, persistentName); } catch {}
        }
        console.log('[App] Persistent avatar found after reset, pre-populating for new session');
    }

    showLanding();
}

/**
 * Show a resume prompt with the saved avatar and option to recreate
 */
function showResumePrompt(session: any, name: string, avatarUrl: string) {
    const container = document.createElement('div');
    container.className = 'landing-page';

    const hasAvatar = avatarUrl && avatarUrl !== 'skipped' && avatarUrl.startsWith('data:');

    container.innerHTML = `
        <div style="margin-bottom: 1.5rem;">
            ${hasAvatar
                ? `<img src="${avatarUrl}" class="landing-avatar" alt="${name}" />`
                : `<div class="landing-avatar" style="display:flex;align-items:center;justify-content:center;background:var(--color-accent);color:white;font-size:3rem;font-family:var(--font-display);">${name.charAt(0).toUpperCase()}</div>`
            }
        </div>

        <h1 class="landing-title" style="font-size: 2rem;">Welcome back, ${name}!</h1>
        <p class="landing-subtitle">Pick up where you left off, or start fresh.</p>

        <div style="display: flex; flex-direction: column; gap: 0.75rem; align-items: center;">
            <button id="resume-btn" class="btn" style="width: 260px;">Continue Session</button>
            <button id="new-avatar-btn" class="btn btn-outline" style="width: 260px;">New Avatar</button>
            <button id="start-over-btn" style="background:none;border:none;color:var(--color-text-muted);cursor:pointer;font-size:0.85rem;font-family:var(--font-main);text-decoration:underline;padding:0.5rem;">Start completely over</button>
        </div>
    `;

    uiManager.renderScreen(container);

    container.querySelector('#resume-btn')!.addEventListener('click', () => {
        launchChat(
            session.id, name, avatarUrl,
            session.chat_history, undefined,
            !hasAvatar,
            session.current_agent as OwlId,
            session.current_gear, session.current_phase, session.path
        );
    });

    container.querySelector('#new-avatar-btn')!.addEventListener('click', () => {
        selectedPath = session.path || 'discovery';
        showAvatarCreator(session.id);
    });

    container.querySelector('#start-over-btn')!.addEventListener('click', async () => {
        // Soft-delete the session on the server (recoverable, not permanently lost)
        const sid = localStorage.getItem(SESSION_KEY);
        if (sid) {
            deleteSession(sid).catch(() => {});
        }
        // "Start completely over" clears EVERYTHING including avatar
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(AVATAR_KEY);
        localStorage.removeItem(AVATAR_PERSISTENT_KEY);
        localStorage.removeItem(NAME_KEY);
        localStorage.removeItem(NAME_PERSISTENT_KEY);
        localStorage.removeItem(PATH_KEY);
        currentAvatarUrl = '';
        showLanding();
    });
}

function showLanding() {
    const polyAvatar = owlAvatars.poly;
    const landing = new LandingPage((path) => {
        selectedPath = path;
        showAvatarCreator();
    }, polyAvatar);
    landing.mount();
}

function showAvatarCreator(existingSessionId?: string) {
    // Pre-populate name from persistent storage if available
    const savedName = localStorage.getItem(NAME_PERSISTENT_KEY) || localStorage.getItem(NAME_KEY) || '';
    const creator = new AvatarCreator(async (name, avatarUrl, skippedPhoto) => {
        console.log('[App] Avatar created:', name, skippedPhoto ? '(skipped photo)' : `(url length: ${avatarUrl.length})`);

        // If user skipped photo but we have a persistent avatar, USE IT
        if (skippedPhoto || !avatarUrl || avatarUrl === 'skipped') {
            const persistentAvatar = localStorage.getItem(AVATAR_PERSISTENT_KEY);
            if (persistentAvatar && persistentAvatar !== 'skipped' && persistentAvatar.startsWith('data:')) {
                avatarUrl = persistentAvatar;
                skippedPhoto = false; // We DO have an avatar
                console.log('[App] Using persistent avatar instead of skipping');
            }
        }

        try {
            let sessionId = existingSessionId;

            // Save avatar (compressed thumbnail to localStorage, full in memory)
            await saveAvatar(avatarUrl || 'skipped');

            if (!sessionId) {
                // Create new session
                const session = await createSession(name, '', selectedPath);
                sessionId = session.id;

                localStorage.setItem(SESSION_KEY, session.id);
                localStorage.setItem(NAME_KEY, name);
                localStorage.setItem(NAME_PERSISTENT_KEY, name);
                localStorage.setItem(PATH_KEY, selectedPath);

                // Save avatar to server (fire-and-forget, don't block)
                if (avatarUrl && avatarUrl !== 'skipped') {
                    saveAvatarToServer(session.id, avatarUrl).catch(() => {});
                }

                launchChat(
                    session.id, name, currentAvatarUrl, [],
                    session.opening_message, skippedPhoto,
                    'poly', 1, '1.1', selectedPath
                );
            } else {
                // Reuse existing session, just update avatar
                localStorage.setItem(NAME_KEY, name);
                localStorage.setItem(NAME_PERSISTENT_KEY, name);

                // Save avatar to server
                if (avatarUrl && avatarUrl !== 'skipped') {
                    saveAvatarToServer(sessionId, avatarUrl).catch(() => {});
                }

                const session = await getSession(sessionId);
                if (session) {
                    launchChat(
                        session.id, name, currentAvatarUrl,
                        session.chat_history, undefined,
                        skippedPhoto,
                        session.current_agent as OwlId,
                        session.current_gear, session.current_phase, session.path
                    );
                }
            }
        } catch (err) {
            console.error('[App] Failed to create/resume session:', err);
            throw err;
        }
    }, savedName, localStorage.getItem(AVATAR_PERSISTENT_KEY) || '');
    creator.mount();
}

function launchChat(
    sessionId: string,
    playerName: string,
    playerAvatarUrl: string,
    existingHistory?: any[],
    openingMessage?: string,
    skippedPhoto?: boolean,
    currentAgent?: OwlId,
    currentGear?: number,
    currentPhase?: string,
    path?: string
) {
    const chatScreen = new ChatScreen({
        sessionId,
        playerName,
        playerAvatarUrl: playerAvatarUrl || '',
        owlAvatars,
        openingMessage,
        existingHistory: existingHistory && existingHistory.length > 0 ? existingHistory : undefined,
        currentAgent: currentAgent || 'poly',
        currentGear: currentGear || 1,
        currentPhase: currentPhase || '1.1',
        path: path || 'discovery',
        capOnly: skippedPhoto || playerAvatarUrl === 'skipped' || !playerAvatarUrl
    });
    chatScreen.mount();
}

// Boot
init();
