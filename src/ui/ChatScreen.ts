/**
 * Chat Screen — conversation interface with owl agents + scene panel + progress bar + quick replies
 */

import { uiManager } from './UIManager';
import { sendMessage, type MessageResponse } from '../api/chat';
import { extractSceneDescription } from '../api/scene';
import { ART_STYLES } from '../image';
import { getOwlAvatarReference } from '../api/owl-avatar';
import { animateMessageIn, crossfadeImage, buttonPress, owlSwitchAnimation } from '../utils/animations';
import { ProgressBar } from './ProgressBar';
import { OWL_INFO, type OwlId } from '../types/owl';
import type { ChatMessage } from '../types/chat';
import { callLLM } from '../utils/llm';
import { InfoPanel } from './InfoPanel';
import { ReportModal } from './ReportModal';

const MAX_IMAGES_PER_MESSAGE = 3;

/**
 * Precise owl description — MUST match the Meaningful AI brand mascot exactly:
 * - HARD geometric low-poly with FLAT angular faceted surfaces (like papercraft/origami)
 * - NOT smooth, NOT organic, NOT rounded — sharp triangular polygon faces
 * - Muted steel-blue / periwinkle body (NOT navy, NOT bright blue)
 * - Soft pink chest/belly in a V-shape
 * - Very large dark glossy spherical eyes with light gray rings, tiny cyan-teal dot highlights
 * - Small pink diamond/triangle beak between the eyes
 * - Small pink clawed feet
 * - Compact, chunky, ball-shaped body — wider than tall
 * - Pointed ear tufts made of angular triangular shapes
 */
const OWL_DESC = 'A geometric low-poly origami-style owl character made entirely of flat triangular polygon facets. Steel-blue periwinkle faceted body with sharp angular edges, NOT smooth. Soft pink triangular chest in a V-shape. Very large dark glossy sphere eyes with light gray rings and tiny cyan dot highlights. Small pink diamond beak. Small pink polygon feet. Compact chunky ball-shaped body with pointed angular ear tufts. Hard-surface faceted 3D render like papercraft, dramatic studio lighting';

/** Default scene prompts — Meaningful AI owl in Atlanta landmarks */
const DEFAULT_SCENE_PROMPTS = [
    `${OWL_DESC}. Scene: The owl perched on a rooftop overlooking the Atlanta skyline at golden hour. Midtown skyscrapers glow in warm sunset light. Cinematic depth of field.`,
    `${OWL_DESC}. Scene: The owl hovering over Centennial Olympic Park in Atlanta, SkyView Ferris wheel and fountains below. Bright sunny day.`,
    `${OWL_DESC}. Scene: The owl standing on a modern glass tech office rooftop overlooking the Atlanta BeltLine trail. Green trees, city skyline behind. Warm light.`,
    `${OWL_DESC}. Scene: The owl perched on a branch in Piedmont Park, Atlanta. Midtown skyline rises behind through trees. Golden light filtering through leaves.`,
    `${OWL_DESC}. Scene: The owl soaring above the Georgia Aquarium and World of Coca-Cola in downtown Atlanta. Dynamic angle, soft clouds and blue sky.`,
    `${OWL_DESC}. Scene: The owl sitting on a bench along the Atlanta BeltLine reading a glowing holographic tablet. Urban greenway with colorful murals behind.`
];

const SCENE_CACHE_KEY = 'ais_default_scenes';
const IDB_NAME = 'ais_scene_cache';
const IDB_STORE = 'scenes';

/** Save a scene data URL to IndexedDB (too large for localStorage) */
function saveSceneToIDB(key: string, dataUrl: string): void {
    try {
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
        req.onsuccess = () => {
            try {
                const tx = req.result.transaction(IDB_STORE, 'readwrite');
                tx.objectStore(IDB_STORE).put(dataUrl, key);
            } catch {}
        };
    } catch {}
}

/** Load a scene data URL from IndexedDB */
function loadSceneFromIDB(key: string): Promise<string | null> {
    return new Promise((resolve) => {
        try {
            const req = indexedDB.open(IDB_NAME, 1);
            req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
            req.onsuccess = () => {
                try {
                    const tx = req.result.transaction(IDB_STORE, 'readonly');
                    const getReq = tx.objectStore(IDB_STORE).get(key);
                    getReq.onsuccess = () => resolve(getReq.result || null);
                    getReq.onerror = () => resolve(null);
                } catch { resolve(null); }
            };
            req.onerror = () => resolve(null);
        } catch { resolve(null); }
    });
}

interface ChatScreenOptions {
    sessionId: string;
    playerName: string;
    playerAvatarUrl: string;
    owlAvatars: Record<OwlId, string>;
    openingMessage?: string;
    existingHistory?: ChatMessage[];
    currentAgent?: OwlId;
    currentGear?: number;
    currentPhase?: string;
    path?: string;
    capOnly?: boolean;
}

/** AI Glossary — terms the owls use that get expandable definitions */
const AI_GLOSSARY: Record<string, string> = {
    'RAG': 'Retrieval-Augmented Generation — an AI technique that connects a language model to your company\'s own documents and data, so responses are grounded in your specific knowledge rather than generic training data.',
    'MCP': 'Model Context Protocol — a standard that lets AI agents securely connect to live tools, databases, and APIs. Think of it as USB-C for AI: one universal plug to connect to everything.',
    'LLM': 'Large Language Model — the AI brain behind tools like ChatGPT, Claude, and Gemini. Trained on vast text data, LLMs understand and generate human language for tasks like writing, analysis, and coding.',
    'NLP': 'Natural Language Processing — the field of AI that enables computers to understand, interpret, and respond to human language in useful ways.',
    'GPT': 'Generative Pre-trained Transformer — the architecture behind ChatGPT and similar AI models. "Custom GPTs" are tailored versions built for specific tasks or companies.',
    'Vector Database': 'A specialized database that stores information as mathematical representations (embeddings), enabling AI to search by meaning rather than just keywords.',
    'Fine-Tuning': 'The process of further training an AI model on your specific data to make it more accurate for your particular use case — like teaching a general doctor to become a specialist.',
    'Embeddings': 'Mathematical representations of text that capture meaning. Similar concepts get similar numbers, letting AI understand that "car" and "automobile" mean the same thing.',
    'Agentic Workflows': 'AI systems that can independently plan, execute multi-step tasks, use tools, and make decisions — going beyond simple question-and-answer to completing entire workflows.',
    'Multi-Agent': 'A system where multiple specialized AI agents collaborate, each handling different aspects of a task — like a team where one agent researches, another writes, and another reviews.',
    'Copilot': 'An AI assistant embedded directly into your existing tools (like Microsoft 365 Copilot) that helps with tasks in context — drafting emails, summarizing meetings, analyzing data.',
    'Prompt Engineering': 'The skill of crafting effective instructions for AI to get better, more accurate, and more useful results. The difference between "write something" and a well-structured prompt is dramatic.',
    'Human-in-the-Loop': 'A design pattern where AI handles most of a task but a human reviews, approves, or corrects the output before it\'s finalized — combining AI speed with human judgment.',
    'Computer Vision': 'AI that can understand and analyze images and video — from reading documents and detecting defects to recognizing objects and extracting data from photos.',
    'Predictive Analytics': 'AI that analyzes historical data to forecast future outcomes — predicting customer churn, demand, equipment failure, or market trends before they happen.',
    'API': 'Application Programming Interface — a standardized way for software systems to communicate. APIs let AI connect to your CRM, ERP, databases, and other tools.',
};

export class ChatScreen {
    private element: HTMLElement;
    private options: ChatScreenOptions;
    private isSending: boolean = false;
    private isGeneratingScene: boolean = false;
    private chatHistory: ChatMessage[] = [];
    private currentAgent: OwlId;
    private progressBar: ProgressBar;

    private isMobile: boolean = window.innerWidth <= 768;
    private imageCreditsRemaining: number = MAX_IMAGES_PER_MESSAGE;
    private sceneRefreshTimer: ReturnType<typeof setInterval> | null = null;
    private infoPanel: InfoPanel;
    private reportModal: ReportModal;
    private messageSource: 'typed' | 'quick_reply' = 'typed';

    // Default scene carousel
    private defaultScenes: string[] = [];
    private defaultSceneIndex: number = 0;
    private defaultSceneTimer: ReturnType<typeof setInterval> | null = null;
    private defaultScenesGenerating: boolean = false;

    // Owl brand reference image for scene generation
    private owlRef: { base64: string; mimeType: string } | null = null;

    // Avatar references for scene generation (like FTW)
    private playerRef: { base64: string; mimeType: string } | null = null;

    constructor(options: ChatScreenOptions) {
        this.options = options;
        this.currentAgent = (((options.currentAgent as string) === 'sage' ? 'poly' : options.currentAgent) || 'poly') as OwlId;
        this.element = document.createElement('div');
        this.element.className = 'chat-layout';

        this.infoPanel = new InfoPanel();
        this.reportModal = new ReportModal();

        this.progressBar = new ProgressBar({
            currentGear: options.currentGear || 1,
            currentPhase: options.currentPhase || '1.1',
            path: options.path || 'discovery',
            onPhaseClick: (phase) => this.showPhaseReport(phase),
        });

        // Prepare references for scene image generation
        this.preparePlayerReference();
        // Owl reference is loaded in mount() before scene generation starts

        this.render();
    }

    /**
     * Convert player avatar URL to base64 reference for scene generation
     */
    private async preparePlayerReference() {
        if (this.options.capOnly || !this.options.playerAvatarUrl) return;
        const url = this.options.playerAvatarUrl;

        try {
            if (url.startsWith('data:')) {
                const match = url.match(/^data:([^;]+);base64,(.+)$/);
                if (match) {
                    this.playerRef = { mimeType: match[1], base64: match[2] };
                    console.log('[ChatScreen] Player avatar reference ready');
                }
            }
        } catch (err) {
            console.warn('[ChatScreen] Could not prepare player avatar reference:', err);
        }
    }

    /**
     * Load the brand owl icon as a reference image for scene generation
     */
    private async prepareOwlReference() {
        try {
            const response = await fetch('/brand/3d-owl.jpg');
            const blob = await response.blob();
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
            const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
                this.owlRef = { mimeType: match[1], base64: match[2] };
                console.log('[ChatScreen] Owl brand reference ready (%d KB)', Math.round(match[2].length / 1024));
            } else {
                console.warn('[ChatScreen] Owl reference loaded but failed to parse as data URL');
            }
        } catch (err) {
            console.warn('[ChatScreen] Could not load owl reference:', err);
        }
    }

    /**
     * Load cached default scenes or generate new ones in background.
     * Shows each scene as it completes — doesn't wait for all 6.
     */
    private async loadDefaultScenes() {
        // Clear any stale localStorage cache from earlier versions
        try { localStorage.removeItem(SCENE_CACHE_KEY); } catch {}

        this.defaultScenesGenerating = true;
        this.defaultScenes = new Array(6).fill('');

        // 1. Show a previously cached scene IMMEDIATELY (if available from IndexedDB)
        const cachedScene = await loadSceneFromIDB('owl_atlanta_0');
        if (cachedScene) {
            this.defaultScenes[0] = cachedScene;
            this.showDefaultScene(0);
            console.log('[ChatScreen] Showing cached Atlanta scene instantly');
        }

        // 2. Generate fresh scenes in background
        console.log('[ChatScreen] Generating default scenes...');

        const generateOne = async (index: number) => {
            try {
                const config: any = {
                    prompt: DEFAULT_SCENE_PROMPTS[index],
                    style: ART_STYLES['3d-storybook'],
                    width: 1024, height: 1024,
                    aspectRatio: '1:1',
                    provider: 'gemini-2.5-flash-upload'
                };
                if (this.owlRef) {
                    config.referenceImages = [{
                        base64: this.owlRef.base64,
                        mimeType: this.owlRef.mimeType,
                        description: 'Reference: The Meaningful AI owl mascot — this is exactly what the owl character should look like in the scene'
                    }];
                }
                const result = await (window as any).imageGenerator.generate(config);
                if (result.url) {
                    this.defaultScenes[index] = result.url;
                    if (index === 0 || this.defaultSceneIndex === 0) {
                        this.showDefaultScene(index);
                    }
                    if (index === 0) {
                        this.startDefaultSceneCarousel();
                        // Cache scene 0 to IndexedDB for instant display next time
                        saveSceneToIDB('owl_atlanta_0', result.url);
                    }
                    // Also cache a couple more for variety
                    if (index <= 2) {
                        saveSceneToIDB(`owl_atlanta_${index}`, result.url);
                    }
                    console.log(`[ChatScreen] Default scene ${index + 1}/6 ready`);
                }
            } catch (err) {
                console.warn(`[ChatScreen] Default scene ${index} failed:`, err);
            }
        };

        await generateOne(0);
        await Promise.all([1, 2, 3, 4, 5].map(i => generateOne(i)));

        this.defaultScenesGenerating = false;
        console.log(`[ChatScreen] ${this.defaultScenes.filter(s => s).length} default scenes generated`);
    }

    /**
     * Insert a scene image inline in the chat messages (for mobile).
     * On desktop this is a no-op — scenes go in the scene panel.
     */
    private insertInlineChatImage(src: string) {
        if (!this.isMobile) return;
        const messagesEl = this.element.querySelector('#chat-messages') as HTMLElement;
        if (!messagesEl) return;

        const img = document.createElement('img');
        img.className = 'inline-scene-image';
        img.src = src;
        img.alt = 'Scene';
        img.style.opacity = '0';
        messagesEl.appendChild(img);

        // Fade in
        requestAnimationFrame(() => { img.style.opacity = '1'; });
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    private showDefaultScene(index: number) {
        if (!this.defaultScenes[index]) return;
        this.defaultSceneIndex = index;

        // On mobile: inject the first scene inline in chat
        if (this.isMobile) {
            if (index === 0) {
                this.insertInlineChatImage(this.defaultScenes[index]);
            }
            return; // Don't update the hidden scene panel
        }

        // Desktop: update the scene panel
        const sceneImageEl = this.element.querySelector('#scene-image') as HTMLImageElement;
        const splashEl = this.element.querySelector('#scene-splash') as HTMLElement;
        if (!sceneImageEl) return;

        if (splashEl && splashEl.style.display !== 'none') {
            splashEl.style.transition = 'opacity 0.8s ease';
            splashEl.style.opacity = '0';
            setTimeout(() => {
                splashEl.style.display = 'none';
                sceneImageEl.style.display = '';
                sceneImageEl.src = this.defaultScenes[index];
                sceneImageEl.style.opacity = '1';
            }, 800);
        } else {
            crossfadeImage(sceneImageEl, this.defaultScenes[index]);
        }
    }

    private startDefaultSceneCarousel() {
        if (this.defaultSceneTimer) return;
        this.defaultSceneTimer = setInterval(() => {
            // Find the next available scene
            const available = this.defaultScenes.filter(s => s && s.length > 0);
            if (available.length <= 1) return;

            let nextIdx = (this.defaultSceneIndex + 1) % 6;
            let attempts = 0;
            while (!this.defaultScenes[nextIdx] && attempts < 6) {
                nextIdx = (nextIdx + 1) % 6;
                attempts++;
            }
            if (this.defaultScenes[nextIdx]) {
                this.showDefaultScene(nextIdx);
            }
        }, 8000);
    }

    private stopDefaultSceneCarousel() {
        if (this.defaultSceneTimer) {
            clearInterval(this.defaultSceneTimer);
            this.defaultSceneTimer = null;
        }
    }

    private getOwlAvatar(owlId: OwlId): string {
        return this.options.owlAvatars[owlId] || `https://placehold.co/200x200/222D63/ffffff.png?text=${owlId[0].toUpperCase()}`;
    }

    private render() {
        const owl = OWL_INFO[this.currentAgent];
        const owlAvatar = this.getOwlAvatar(this.currentAgent);

        this.element.innerHTML = `
            <!-- Scene Image Panel (Left Side) -->
            <div id="scene-panel" class="scene-panel">
                <div class="scene-panel-logo">
                    <img src="/brand/owl-icon.png" alt="" style="width:28px;height:28px;" />
                </div>
                <div id="scene-splash" style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;gap:1rem;padding:2rem;">
                    <img src="/brand/3d-owl.jpg" alt="Meaningful AI Owl" style="width:280px;height:auto;border-radius:16px;filter:drop-shadow(0 8px 24px rgba(0,0,0,0.3));" />
                    <img src="/brand/logo-horizontal.png" alt="Meaningful AI" style="width:180px;height:auto;opacity:0.7;" onerror="this.style.display='none'" />
                    <div style="display:flex;gap:6px;margin-top:0.5rem;">
                        <div class="typing-dot" style="width:6px;height:6px;"></div>
                        <div class="typing-dot" style="width:6px;height:6px;"></div>
                        <div class="typing-dot" style="width:6px;height:6px;"></div>
                    </div>
                    <span style="font-size:0.75rem;color:rgba(255,255,255,0.5);font-family:var(--font-main);">Generating your scene...</span>
                </div>
                <img id="scene-image" src="" alt="Scene" style="display:none;" />
                <button id="info-btn" class="info-btn" title="How is this built?">?</button>
            </div>

            <!-- Chat Panel (Right Side) -->
            <div class="chat-panel">
                <!-- Progress Bar -->
                <div id="progress-container" class="progress-container"></div>

                <!-- Header -->
                <div id="chat-header" class="chat-header" style="background: ${owl.color};">
                    <img id="owl-header-avatar" src="${owlAvatar}" alt="${owl.name}" onerror="this.style.background='${owl.color}';" />
                    <div class="chat-header-info">
                        <h3 id="owl-header-name">${owl.name}</h3>
                        <span id="owl-header-role">${owl.role}</span>
                    </div>
                    <button id="reset-btn" class="reset-btn" title="Start over">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                    </button>
                </div>

                <!-- Messages -->
                <div id="chat-messages" class="chat-messages"></div>

                <!-- Quick Reply Buttons -->
                <div id="quick-replies" class="quick-replies"></div>

                <!-- Input Area -->
                <div class="chat-input-area">
                    <input type="text" id="chat-input" placeholder="Type your message..." />
                    <button id="send-btn" class="btn send-btn-styled">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                        <span class="send-btn-text">Send</span>
                    </button>
                </div>
            </div>
        `;

        // Mount progress bar
        const progressContainer = this.element.querySelector('#progress-container') as HTMLElement;
        progressContainer.appendChild(this.progressBar.getElement());

        this.setupEventListeners();
    }

    private setupEventListeners() {
        const chatInput = this.element.querySelector('#chat-input') as HTMLInputElement;
        const sendBtn = this.element.querySelector('#send-btn') as HTMLButtonElement;
        const resetBtn = this.element.querySelector('#reset-btn') as HTMLButtonElement;

        sendBtn.addEventListener('click', () => { buttonPress(sendBtn); this.handleSend(); });
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !this.isSending) {
                this.handleSend();
            }
        });

        resetBtn.addEventListener('click', () => this.handleReset());

        // Info panel: "How is this built?"
        const infoBtn = this.element.querySelector('#info-btn');
        if (infoBtn) {
            this.element.appendChild(this.infoPanel.getElement());
            infoBtn.addEventListener('click', () => this.infoPanel.toggle());
        }

        // Report modal
        this.element.appendChild(this.reportModal.getElement());
    }

    /**
     * Show a phase completion report in a modal.
     * Generates the report from chat history if not already cached.
     */
    private async showPhaseReport(phase: number) {
        const phaseNames = ['', 'Discovery', 'Strategy', 'Implementation'];
        const title = `${phaseNames[phase]} Report`;

        // Find the readout content from chat history (the formatted brief)
        const readoutKeywords: Record<number, string[]> = {
            1: ['Discovery Brief', 'DISCOVERY BRIEF'],
            2: ['Strategy Brief', 'STRATEGY BRIEF', 'AI STRATEGY BRIEF'],
            3: ['Implementation Plan', 'IMPLEMENTATION PLAN'],
        };

        const keywords = readoutKeywords[phase] || [];
        const readoutMsg = this.chatHistory.find(msg =>
            msg.role === 'assistant' && keywords.some(kw => msg.content.includes(kw))
        );

        if (readoutMsg) {
            // Parse the markdown content into HTML for the modal
            const htmlContent = this.parseMarkdown(readoutMsg.content);
            this.reportModal.show(title, htmlContent);
        } else {
            // No readout found — generate one on the fly
            this.reportModal.show(title, `
                <div style="text-align:center;padding:2rem;color:var(--color-text-muted);">
                    <p>Generating ${title.toLowerCase()}...</p>
                </div>
            `);

            try {
                const result = await callLLM({
                    prompt: `Generate a comprehensive ${phaseNames[phase]} Report based on this conversation. Include tables, specific metrics, ROI analysis, Human-in-the-Loop vs Automation analysis, and actionable recommendations.

CONVERSATION CONTEXT:
${this.chatHistory.map(m => `${m.role}: ${m.content}`).join('\n').substring(0, 4000)}

FORMAT: Use markdown with tables (| col | col |), headers (###), bold (**text**), and bullet points. Make it presentation-ready with specific numbers and analysis.`,
                    maxTokens: 3000,
                    temperature: 0.6,
                });

                if (result.success && result.content) {
                    const htmlContent = this.parseMarkdown(result.content);
                    this.reportModal.show(title, htmlContent);
                }
            } catch (err) {
                this.reportModal.show(title, '<p style="color:var(--color-text-muted);">Could not generate report. Please continue the conversation to complete this phase.</p>');
            }
        }
    }

    private handleReset() {
        if (!confirm('Start a new conversation?')) return;
        this.stopSceneRefreshTimer();
        this.stopDefaultSceneCarousel();
        // Clear session data but KEEP avatar — it persists across resets
        // Avatar is stored in 'ais_avatar_persistent' which is never cleared here
        localStorage.removeItem('ais_session_id');
        localStorage.removeItem('ais_path');
        // Don't remove ais_avatar_url — let init() restore from persistent key
        // Don't remove ais_player_name — let init() restore from persistent key
        window.location.reload();
    }

    /** Map legacy agent IDs to current ones (e.g. 'sage' was renamed to 'poly') */
    private normalizeOwlId(id: string): OwlId {
        if (id === 'sage') return 'poly';
        return id as OwlId;
    }

    private updateOwlHeader(owlId: OwlId) {
        owlId = this.normalizeOwlId(owlId);
        if (owlId === this.currentAgent) return;

        const owl = OWL_INFO[owlId];
        const header = this.element.querySelector('#chat-header') as HTMLElement;
        const avatar = this.element.querySelector('#owl-header-avatar') as HTMLImageElement;
        const name = this.element.querySelector('#owl-header-name') as HTMLElement;
        const role = this.element.querySelector('#owl-header-role') as HTMLElement;

        owlSwitchAnimation(this.element.querySelector('#scene-panel') as HTMLElement, owl.name, owl.role);

        header.style.background = owl.color;
        avatar.src = this.getOwlAvatar(owlId);
        name.textContent = owl.name;
        role.textContent = owl.role;

        this.currentAgent = owlId;
    }

    private async refreshSceneImage() {
        if (this.isGeneratingScene) return;
        if (this.imageCreditsRemaining <= 0) return;

        this.isGeneratingScene = true;
        this.imageCreditsRemaining--;

        const sceneImageEl = this.element.querySelector('#scene-image') as HTMLImageElement;
        const hasPlayerAvatar = !!this.playerRef;

        try {
            // Include player in scene if they have an avatar (like FTW)
            const playerDescription = hasPlayerAvatar
                ? `A 3D animated character portrait of ${this.options.playerName}`
                : '';

            const visualPrompt = await extractSceneDescription(
                this.options.playerName, playerDescription,
                this.chatHistory, this.currentAgent,
                !hasPlayerAvatar  // owlOnly = true if no player avatar
            );

            const config: any = {
                prompt: visualPrompt,
                style: ART_STYLES['3d-storybook'],
                width: 1024, height: 1024,
                aspectRatio: '1:1',
                provider: 'gemini-2.5-flash-upload'
            };

            // Build reference images array — player + owl
            const refs: any[] = [];

            if (this.playerRef && !this.options.capOnly) {
                refs.push({
                    base64: this.playerRef.base64,
                    mimeType: this.playerRef.mimeType,
                    description: `Reference: ${this.options.playerName} (the user)`
                });
            }

            // Always use the brand owl icon as reference — NOT a generated owl
            // (generated owls often don't match the brand style)
            if (this.owlRef) {
                refs.push({
                    base64: this.owlRef.base64, mimeType: this.owlRef.mimeType,
                    description: `CRITICAL REFERENCE: The owl in the scene MUST look exactly like this — a geometric low-poly origami-style owl with flat triangular polygon facets, steel-blue periwinkle body, pink V-shaped chest, large dark glossy sphere eyes with gray rings and cyan highlights, pink diamond beak. Hard-surface faceted, NOT smooth.`
                });
            }

            if (refs.length > 0) {
                config.referenceImages = refs;
            }

            const generatedImage = await (window as any).imageGenerator.generate(config);

            // On mobile: inject inline in chat stream
            if (this.isMobile) {
                this.insertInlineChatImage(generatedImage.url);
            } else {
                // Desktop: update the scene panel
                const splashEl = this.element.querySelector('#scene-splash') as HTMLElement;
                if (splashEl && splashEl.style.display !== 'none') {
                    splashEl.style.transition = 'opacity 0.8s ease';
                    splashEl.style.opacity = '0';
                    setTimeout(() => {
                        splashEl.style.display = 'none';
                        sceneImageEl.style.display = '';
                        sceneImageEl.src = generatedImage.url;
                        sceneImageEl.style.opacity = '1';
                    }, 800);
                } else {
                    await crossfadeImage(sceneImageEl, generatedImage.url);
                }
            }
        } catch (err) {
            console.error('[ChatScreen] Scene image generation failed:', err);
        } finally {
            this.isGeneratingScene = false;
        }
    }

    private startSceneImageCycle() {
        this.stopSceneRefreshTimer();
        this.stopDefaultSceneCarousel(); // Stop default carousel once conversation generates scenes
        this.imageCreditsRemaining = MAX_IMAGES_PER_MESSAGE;
        this.refreshSceneImage();

        this.sceneRefreshTimer = setInterval(() => {
            if (this.imageCreditsRemaining <= 0) { this.stopSceneRefreshTimer(); return; }
            this.refreshSceneImage();
        }, 10000);
    }

    private stopSceneRefreshTimer() {
        if (this.sceneRefreshTimer) { clearInterval(this.sceneRefreshTimer); this.sceneRefreshTimer = null; }
    }

    // ── Quick Reply Generation ──────────────────────────────

    /**
     * Generate 2-3 quick reply suggestions based on the owl's last message
     */
    private async generateQuickReplies(owlMessage: string) {
        const repliesContainer = this.element.querySelector('#quick-replies') as HTMLElement;
        repliesContainer.innerHTML = '';

        try {
            const recentContext = this.chatHistory.slice(-4).map(h =>
                `${h.role === 'user' ? 'User' : 'Owl'}: ${h.content}`
            ).join('\n');

            const prompt = `Given this conversation between a business leader and an AI advisor owl, generate 2-3 SHORT suggested reply buttons the user could click.

RECENT CONVERSATION:
${recentContext}

OWL'S LATEST MESSAGE: "${owlMessage}"

CRITICAL RULES:
- Each reply must be 3-8 words max
- NEVER invent fake names, companies, numbers, or specific details — the user will fill those in
- Suggestions should be GENERIC PROMPTS that help the user respond, not pre-filled answers
- Good: "Tell me about my company", "Our biggest challenge is...", "Yes, let's do that"
- BAD: "TechFlow Solutions, I'm CEO", "Jason from marketing" — NEVER make up identities
- One can be a direct affirmative, one a different angle, one asking for clarification
- Output ONLY a JSON array of strings, nothing else

Example output: ["Yes, about 20 people","We handle most things manually","Can you explain more?"]`;

            const result = await callLLM({ prompt, temperature: 0.7, maxTokens: 100, jsonMode: true });

            if (result.success && result.content) {
                try {
                    const replies = JSON.parse(result.content);
                    if (Array.isArray(replies) && replies.length > 0) {
                        this.renderQuickReplies(replies.slice(0, 3));
                    }
                } catch {
                    console.warn('[ChatScreen] Failed to parse quick replies');
                }
            }
        } catch (err) {
            console.warn('[ChatScreen] Quick reply generation failed:', err);
        }
    }

    private renderQuickReplies(replies: string[]) {
        const repliesContainer = this.element.querySelector('#quick-replies') as HTMLElement;
        repliesContainer.innerHTML = '';

        replies.forEach(reply => {
            const btn = document.createElement('button');
            btn.className = 'quick-reply-btn';
            btn.textContent = reply;
            btn.addEventListener('click', () => {
                const chatInput = this.element.querySelector('#chat-input') as HTMLInputElement;
                chatInput.value = reply;
                repliesContainer.innerHTML = '';
                this.messageSource = 'quick_reply';
                this.handleSend();
            });
            repliesContainer.appendChild(btn);
        });

        // Scroll messages to bottom so last message is visible above the quick replies
        const messagesEl = this.element.querySelector('#chat-messages') as HTMLElement;
        if (messagesEl) {
            requestAnimationFrame(() => { messagesEl.scrollTop = messagesEl.scrollHeight; });
        }
    }

    private clearQuickReplies() {
        const repliesContainer = this.element.querySelector('#quick-replies') as HTMLElement;
        if (repliesContainer) repliesContainer.innerHTML = '';
    }

    // ── Message Handling ────────────────────────────────────

    private async handleSend() {
        const chatInput = this.element.querySelector('#chat-input') as HTMLInputElement;
        const messageText = chatInput.value.trim();

        if (!messageText || this.isSending) return;

        this.isSending = true;
        chatInput.value = '';
        this.clearQuickReplies();

        this.chatHistory.push({ role: 'user', content: messageText, timestamp: new Date().toISOString() });
        this.addMessage('user', messageText);

        this.showTypingIndicator();

        const result = await sendMessage(this.options.sessionId, messageText, this.messageSource);
        this.messageSource = 'typed'; // Reset after sending

        this.removeTypingIndicator();

        if (result) {
            const owlResponse = result.response || "That's a great point. Can you tell me more?";

            const agentId = this.normalizeOwlId(result.agent_id || this.currentAgent);

            if (agentId !== this.currentAgent) {
                this.updateOwlHeader(agentId);
            }

            if (result.phase && result.gear) {
                this.progressBar.updatePhase(result.gear, result.phase);
            }

            this.chatHistory.push({
                role: 'assistant', content: owlResponse,
                timestamp: new Date().toISOString(), agent_id: agentId
            });
            this.addMessage('assistant', owlResponse, agentId);

            // Generate quick reply suggestions in background
            this.generateQuickReplies(owlResponse);
        } else {
            const fallbackMsg = "Our owls are resting for a moment. Could you try that again?";
            this.chatHistory.push({ role: 'assistant', content: fallbackMsg, timestamp: new Date().toISOString(), agent_id: this.currentAgent });
            this.addMessage('assistant', fallbackMsg, this.currentAgent);
        }

        this.isSending = false;
        chatInput.focus();

        this.startSceneImageCycle();
    }

    /**
     * Parse markdown to HTML — supports bold, tables, horizontal rules, and numbered lists
     */
    private parseMarkdown(text: string): string {
        // HTML-escape first
        let html = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Parse markdown tables
        const lines = html.split('\n');
        const result: string[] = [];
        let inTable = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Check if line is a table row (starts and contains |)
            if (line.startsWith('|') && line.endsWith('|') && line.includes('|')) {
                // Skip separator rows (|---|---|)
                if (/^\|[\s\-:|]+\|$/.test(line)) continue;

                if (!inTable) {
                    result.push('<table class="md-table">');
                    inTable = true;
                }

                const cells = line.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
                const isHeader = i + 1 < lines.length && /^\|[\s\-:|]+\|$/.test(lines[i + 1].trim());
                const tag = isHeader ? 'th' : 'td';
                result.push('<tr>' + cells.map(c => `<${tag}>${c.trim()}</${tag}>`).join('') + '</tr>');
            } else {
                if (inTable) {
                    result.push('</table>');
                    inTable = false;
                }
                // Horizontal rule
                if (/^---+$/.test(line)) {
                    result.push('<hr class="md-hr">');
                } else {
                    result.push(line);
                }
            }
        }
        if (inTable) result.push('</table>');

        html = result.join('\n');

        // Bold **text**
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        // Italic *text* (but not inside already-processed strong tags)
        html = html.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>');
        // Numbered list items at start of line
        html = html.replace(/^(\d+)\.\s+(.+)$/gm, '<div class="md-list-item"><span class="md-list-num">$1.</span> $2</div>');

        // AI glossary terms — wrap with clickable tooltip spans
        // Track which terms we've already annotated to avoid duplicates
        const annotated = new Set<string>();
        for (const [term, definition] of Object.entries(AI_GLOSSARY)) {
            if (annotated.has(term)) continue;
            // Match the term as a whole word (case-insensitive), but only the FIRST occurrence
            const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Don't match inside HTML tags or already-wrapped terms
            const regex = new RegExp(`(?<![\\w/">])\\b(${escaped})\\b(?![^<]*>)`, 'i');
            const match = html.match(regex);
            if (match) {
                const id = `ai-term-${term.toLowerCase().replace(/\s+/g, '-')}-${Math.random().toString(36).slice(2, 6)}`;
                const replacement = `<span class="ai-term" data-term-id="${id}" onclick="(function(e){var t=document.getElementById('${id}');if(t)t.classList.toggle('visible');e.stopPropagation();})(event)">${match[1]}</span><div id="${id}" class="ai-term-tooltip"><span class="ai-term-label">${term}</span>${definition}</div>`;
                html = html.replace(regex, replacement);
                annotated.add(term);
            }
        }

        return html;
    }

    private addMessage(role: 'user' | 'assistant', content: string, agentId?: OwlId) {
        const messagesEl = this.element.querySelector('#chat-messages') as HTMLElement;

        const row = document.createElement('div');
        row.className = `message-row ${role === 'assistant' ? 'owl' : 'user'}`;

        if (role === 'assistant') {
            const owlId = agentId || this.currentAgent;
            const avatar = document.createElement('img');
            avatar.className = 'message-avatar';
            avatar.src = this.getOwlAvatar(owlId);
            avatar.onerror = () => {
                avatar.style.background = OWL_INFO[owlId]?.color || 'var(--color-accent)';
                avatar.style.minWidth = '32px'; avatar.style.minHeight = '32px';
            };
            row.appendChild(avatar);
        } else if (!this.options.capOnly && this.options.playerAvatarUrl) {
            const avatar = document.createElement('img');
            avatar.className = 'message-avatar';
            avatar.src = this.options.playerAvatarUrl;
            row.appendChild(avatar);
        }

        const bubble = document.createElement('div');
        bubble.className = `message-bubble ${role === 'assistant' ? 'owl' : 'user'}`;
        // Strip transition action text like "*Nova nods and steps aside*..."
        let displayContent = content.replace(/^\*[^*]+\*\s*/g, '').trim();
        // Parse markdown to HTML
        const htmlContent = this.parseMarkdown(displayContent);
        bubble.innerHTML = htmlContent;

        // Add thumbs up/down INSIDE owl bubbles (RL feedback)
        if (role === 'assistant') {
            const feedbackRow = document.createElement('div');
            feedbackRow.className = 'message-feedback';
            const msgIdx = this.chatHistory.length;
            feedbackRow.innerHTML = `
                <button class="feedback-btn" data-rating="positive" title="Helpful">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
                </button>
                <button class="feedback-btn" data-rating="negative" title="Not helpful">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>
                </button>
            `;
            feedbackRow.querySelectorAll('.feedback-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const rating = (e.currentTarget as HTMLElement).dataset.rating as string;
                    fetch(`/chat/${this.options.sessionId}/feedback`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ message_index: msgIdx, rating })
                    }).catch(() => {});
                    feedbackRow.querySelectorAll('.feedback-btn').forEach(b => b.classList.remove('selected'));
                    (e.currentTarget as HTMLElement).classList.add('selected');
                });
            });
            bubble.appendChild(feedbackRow);
        }

        row.appendChild(bubble);
        messagesEl.appendChild(row);

        animateMessageIn(row, role === 'user');
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    private showTypingIndicator() {
        const messagesEl = this.element.querySelector('#chat-messages') as HTMLElement;
        const indicator = document.createElement('div');
        indicator.id = 'typing-indicator';
        indicator.className = 'typing-indicator';
        indicator.innerHTML = `<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>`;
        messagesEl.appendChild(indicator);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    private removeTypingIndicator() {
        const indicator = this.element.querySelector('#typing-indicator');
        if (indicator) indicator.remove();
    }

    public loadHistory(history: ChatMessage[]) {
        this.chatHistory = [...history];
        history.forEach(msg => {
            this.addMessage(msg.role, msg.content, this.normalizeOwlId(msg.agent_id || this.currentAgent));
        });
        // Generate quick replies for the last owl message
        const lastOwlMsg = [...history].reverse().find(m => m.role === 'assistant');
        if (lastOwlMsg) {
            this.generateQuickReplies(lastOwlMsg.content);
        }
    }

    public async mount() {
        uiManager.renderScreen(this.element);

        // Load owl brand reference BEFORE scene generation so it's always available
        await this.prepareOwlReference();

        // Start loading default Atlanta owl scenes
        this.loadDefaultScenes();

        if (this.options.existingHistory && this.options.existingHistory.length > 0) {
            this.loadHistory(this.options.existingHistory);
        } else if (this.options.openingMessage) {
            this.chatHistory.push({ role: 'assistant', content: this.options.openingMessage, timestamp: new Date().toISOString(), agent_id: 'poly' });
            this.addMessage('assistant', this.options.openingMessage, 'poly');
            this.generateQuickReplies(this.options.openingMessage);
        }

        const chatInput = this.element.querySelector('#chat-input') as HTMLInputElement;
        chatInput?.focus();
    }
}
