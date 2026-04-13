/**
 * Chat Screen — conversation interface with owl agents + scene panel + progress bar + quick replies
 */

import { uiManager } from './UIManager';
import { sendMessage, type MessageResponse } from '../api/chat';
import { extractSceneDescription } from '../api/scene';
import { ART_STYLES } from '../image';
import { getOwlAvatarReference } from '../api/owl-avatar';
import { animateMessageIn, crossfadeImage, buttonPress, owlSwitchAnimation, staggerFadeIn } from '../utils/animations';
import { ProgressBar } from './ProgressBar';
import { OWL_INFO, type OwlId } from '../types/owl';
import type { ChatMessage } from '../types/chat';
import { callLLM, callLLMStream } from '../utils/llm';
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
    llmProvider?: string;
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
    private activeReportPhase: number | null = null;
    private hasCongratulated: boolean = false;

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
        if (!sceneImageEl) return;

        crossfadeImage(sceneImageEl, this.defaultScenes[index]);
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

    private getOwlAvatar(_owlId?: OwlId): string {
        const gear = this.options.currentGear || 1;
        const phase = Math.floor(gear);
        
        if (phase === 2) return '/brand/3d-owl-green.png';
        if (phase === 3) return '/brand/3d-owl-red.png';
        
        return this.options.owlAvatars['poly'] || '/brand/3d-owl.jpg';
    }

    private render() {
        const gear = this.options.currentGear || 1;
        const phase = Math.floor(gear);

        let owlName = 'Discovery';
        let owlRole = 'Phase 1';
        let owlColor = '#4A66AC';
        if (phase === 2) { owlName = 'Strategy'; owlRole = 'Phase 2'; owlColor = '#34d399'; }
        if (phase === 3) { owlName = 'Implementation'; owlRole = 'Phase 3'; owlColor = '#E83151'; }

        const owlAvatar = this.getOwlAvatar();
        const splashImages = ['/owl-scenes/splash-1.png', '/owl-scenes/splash-2.png', '/owl-scenes/splash-3.png', '/owl-scenes/splash-4.png'];
        const randomSplash = splashImages[Math.floor(Math.random() * splashImages.length)];

        this.element.innerHTML = `
            <!-- Scene Image Panel (Left Side) -->
            <div id="scene-panel" class="scene-panel">
                <div class="scene-panel-logo">
                    <img src="/brand/owl-icon.png" alt="" style="width:28px;height:28px;" />
                </div>
                <img id="scene-image" src="${randomSplash}" alt="Scene" style="display:block; width:100%; height:100%; object-fit:cover;" />
            </div>
            <button id="info-btn" class="info-btn" title="How is this built?">?</button>

            <!-- Chat Panel (Right Side) -->
            <div class="chat-panel">
                <!-- Header -->
                <div id="chat-header" class="chat-header" style="background: ${owlColor};">
                    <img id="owl-header-avatar" src="${owlAvatar}" alt="${owlName}" onerror="this.style.background='${owlColor}';" />
                    <div class="chat-header-info">
                        <h2 id="owl-header-name" style="margin: 0; font-size: 1.25rem;">${owlName}</h2>
                        <span id="owl-header-role" style="display:none;">${owlRole}</span>
                    </div>
                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                        <button id="download-report-btn" class="btn btn-outline" style="height: 32px; padding: 0 0.75rem; font-size: 0.7rem; border-color: rgba(255,255,255,0.3); color: white; border-radius: var(--radius-sm); border-width: 1px; display: flex; align-items: center; justify-content: center; gap: 0.4rem; white-space: nowrap;" title="View AI Implementation Plan">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            AI IMPLEMENTATION PLAN
                        </button>
                        <button id="reset-btn" class="reset-btn" style="height: 32px; width: 32px; flex-shrink: 0;" title="Start over">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                        </button>
                    </div>
                </div>

                <!-- Progress Bar -->
                <div id="progress-container" class="progress-container"></div>

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

        const messagesEl = this.element.querySelector('#chat-messages') as HTMLElement;
        if (messagesEl) {
            messagesEl.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                if (target && target.classList.contains('ai-term')) {
                    const termId = target.dataset.termId;
                    if (termId) {
                        const tooltip = document.getElementById(termId);
                        if (tooltip) {
                            tooltip.classList.toggle('visible');
                        }
                    }
                    e.stopPropagation();
                }
            });
        }

        const downloadBtn = this.element.querySelector('#download-report-btn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => this.showFullReport());
        }

        // Info panel: "How is this built?"
        const infoBtn = this.element.querySelector('#info-btn');
        if (infoBtn) {
            this.element.appendChild(this.infoPanel.getElement());
            infoBtn.addEventListener('click', () => this.infoPanel.toggle());
        }

        document.addEventListener('llm-provider-changed', (e: any) => {
            this.options.llmProvider = e.detail.provider;
        });

        document.addEventListener('image-provider-changed', (e: any) => {
            if ((window as any).imageGenerator) {
                (window as any).imageGenerator.setProvider(e.detail.provider);
            }
        });

        // Report modal
        this.element.appendChild(this.reportModal.getElement());
    }

    private getPhaseHtml(phase: number): string {
        let pattern: RegExp | null = null;
        if (phase === 1) pattern = /(?:\n|^)(?:\*\*|#+)\s*(?:AI\s+)?DISCOVERY BRIEF/i;
        else if (phase === 2) pattern = /(?:\n|^)(?:\*\*|#+)\s*(?:AI\s+)?STRATEGY BRIEF/i;
        else if (phase === 3) pattern = /(?:\n|^)(?:\*\*|#+)\s*(?:AI\s+)?IMPLEMENTATION PLAN/i;

        if (pattern) {
            const msgs = [...this.chatHistory].reverse();
            for (const msg of msgs) {
                const matchIndex = msg.content.search(pattern);
                if (msg.role === 'assistant' && matchIndex !== -1) {
                    let text = msg.content.substring(matchIndex);
                    // Strip the closing conversational hook usually added by the prompts
                    text = text.replace(/Now let's move into.*\bReady\?/gis, '');
                    text = text.replace(/Now let's move to Implementation.*\bReady\?/gis, '');
                    
                    return `
                        <div style="background: linear-gradient(135deg, #1e293b, #0f172a); color: rgba(255,255,255,0.9); padding: clamp(1rem, 5vw, 2.5rem) clamp(1rem, 5vw, 3rem); border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); font-family: 'Inter', sans-serif; line-height: 1.6; max-width: 900px; margin: 0 auto; margin-bottom: 2rem;">
                            <style>
                                .regenerated-report h1, .regenerated-report h2, .regenerated-report h3 { color: #38bdf8; margin-top: 2rem; margin-bottom: 1rem; }
                                .regenerated-report h1 { border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.75rem; font-size: 2.2rem; }
                                .regenerated-report h2 { font-size: 1.5rem; color: #818cf8; }
                                .regenerated-report table { width: 100%; border-collapse: collapse; margin: 1.5rem 0; background: rgba(0,0,0,0.2); border-radius: 8px; overflow: hidden; }
                                .regenerated-report th, .regenerated-report td { border: 1px solid rgba(255,255,255,0.1); padding: 0.75rem 1rem; text-align: left; }
                                .regenerated-report th { background: rgba(56, 189, 248, 0.1); color: #38bdf8; font-weight: 600; text-transform: uppercase; font-size: 0.85rem; letter-spacing: 1px; }
                                .regenerated-report ul, .regenerated-report ol { padding-left: 1.5rem; margin: 1rem 0; }
                                .regenerated-report li { margin-bottom: 0.5rem; }
                                .regenerated-report p { margin: 1rem 0; }
                                .regenerated-report strong { color: white; }
                                .regenerated-report em { color: #cbd5e1; }
                            </style>
                            <div class="regenerated-report">
                                ${this.parseMarkdown(text)}
                            </div>
                        </div>
                    `;
                }
            }
        }

        const phaseNames = ['', 'Discovery', 'Strategy', 'Implementation'];
        const title = `${phaseNames[phase]} Document`;

        const cacheKey = `ais_report_data_${this.options.sessionId}_${phase}`;
        const cachedDataStr = localStorage.getItem(cacheKey);
        let data: any = {};
        if (cachedDataStr) {
            try { data = JSON.parse(cachedDataStr); } catch (e) {}
        }

        let html = '';
        if (phase === 1) {
             html = `
<div class="report-template" style="color: white; font-family: 'Inter', sans-serif;">
  <div style="background: linear-gradient(135deg, #1e293b, #0f172a); padding: 2rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1);">
     <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 1rem;">
         <h1 style="color: #38bdf8; margin: 0; font-size: 1.8rem; letter-spacing: -0.5px;">Discovery Phase Report</h1>
         <span style="background: rgba(56, 189, 248, 0.2); color: #38bdf8; padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.85rem; font-weight: bold;">Phase 1</span>
     </div>
     
     <div style="background: rgba(255,255,255,0.03); padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem; border-left: 4px solid #38bdf8; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <h3 style="color: #94a3b8; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.5rem; margin-top: 0;">Company Context</h3>
        <p style="font-size: 1.15rem; font-weight: 500; margin: 0; line-height: 1.5;">${data.companyName || 'Tracking firm details...'}</p>
     </div>

     <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem;">
        <div style="background: rgba(0,0,0,0.2); padding: 1.5rem; border-radius: 8px; border-top: 3px solid #818cf8; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
           <h3 style="color: #818cf8; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.75rem; margin-top: 0;">Key Challenges</h3>
           <p style="font-size: 1.05rem; line-height: 1.6; color: #e2e8f0; margin: 0;">${data.challenges || 'Listening for key challenges...'}</p>
        </div>
        <div style="background: rgba(0,0,0,0.2); padding: 1.5rem; border-radius: 8px; border-top: 3px solid #f472b6; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
           <h3 style="color: #f472b6; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.75rem; margin-top: 0;">Current Bottlenecks</h3>
           <p style="font-size: 1.05rem; line-height: 1.6; color: #e2e8f0; margin: 0;">${data.bottlenecks || 'Identifying process bottlenecks...'}</p>
        </div>
     </div>

     <div style="background: rgba(167, 139, 250, 0.1); padding: 1.5rem; border-radius: 8px; border: 1px solid rgba(167, 139, 250, 0.2); box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <h3 style="color: #c4b5fd; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.75rem; margin-top: 0;">Proposed Goal / Objective</h3>
        <p style="font-size: 1.15rem; line-height: 1.6; color: #f8fafc; margin: 0;">${data.goal || 'Awaiting goal alignment...'}</p>
     </div>
  </div>
</div>
`;
        } else if (phase === 2) {
             html = `
<div class="report-template" style="color: white; font-family: 'Inter', sans-serif;">
  <div style="background: linear-gradient(135deg, #1e1b4b, #3b0764); padding: 2rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1);">
     <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 1rem;">
         <h1 style="color: #c084fc; margin: 0; font-size: 1.8rem; letter-spacing: -0.5px;">Strategy Blueprint</h1>
         <span style="background: rgba(192, 132, 252, 0.2); color: #c084fc; padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.85rem; font-weight: bold;">Phase 2</span>
     </div>
     
     <div style="background: rgba(255,255,255,0.03); padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem; border-left: 4px solid #c084fc; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <h3 style="color: #d8b4fe; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.5rem; margin-top: 0;">Solution Overview</h3>
        <p style="font-size: 1.15rem; line-height: 1.6; margin: 0;">${data.solutionOverview || 'Designing solution blueprint...'}</p>
     </div>

     <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem;">
        <div style="background: rgba(0,0,0,0.2); padding: 1.5rem; border-radius: 8px; border-top: 3px solid #38bdf8; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
           <h3 style="color: #38bdf8; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.75rem; margin-top: 0;">Selected AI Architecture</h3>
           <p style="font-size: 1.05rem; line-height: 1.6; color: #e2e8f0; margin: 0;">${data.aiModelsOptions || 'Evaluating LLM integrations...'}</p>
        </div>
        <div style="background: rgba(0,0,0,0.2); padding: 1.5rem; border-radius: 8px; border-top: 3px solid #f472b6; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
           <h3 style="color: #f472b6; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.75rem; margin-top: 0;">Human-in-the-Loop Strategy</h3>
           <p style="font-size: 1.05rem; line-height: 1.6; color: #e2e8f0; margin: 0;">${data.hitlStrategy || 'Defining feedback mechanisms...'}</p>
        </div>
     </div>

     <div style="background: rgba(52, 211, 153, 0.1); padding: 1.5rem; border-radius: 8px; border: 1px solid rgba(52, 211, 153, 0.2); box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <h3 style="color: #6ee7b7; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.75rem; margin-top: 0;">Estimated ROI / Impact</h3>
        <p style="font-size: 1.15rem; line-height: 1.6; color: #f8fafc; margin: 0;">${data.roiEstimate || 'Calculating cost/benefit...'}</p>
     </div>
  </div>
</div>
`;
        } else if (phase === 3) {
             html = `
<div class="report-template" style="color: white; font-family: 'Inter', sans-serif;">
  <div style="background: linear-gradient(135deg, #064e3b, #022c22); padding: 2rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1);">
     <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 1rem;">
         <h1 style="color: #34d399; margin: 0; font-size: 1.8rem; letter-spacing: -0.5px;">Implementation Plan</h1>
         <span style="background: rgba(52, 211, 153, 0.2); color: #34d399; padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.85rem; font-weight: bold;">Phase 3</span>
     </div>
     
     <div style="background: rgba(255,255,255,0.03); padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem; border-left: 4px solid #34d399; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <h3 style="color: #6ee7b7; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.5rem; margin-top: 0;">Architecture & Flow</h3>
        <p style="font-size: 1.15rem; line-height: 1.6; margin: 0;">${data.architecture || 'Finalizing system design...'}</p>
     </div>

     <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem;">
        <div style="background: rgba(0,0,0,0.2); padding: 1.5rem; border-radius: 8px; border-top: 3px solid #38bdf8; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
           <h3 style="color: #38bdf8; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.75rem; margin-top: 0;">Milestone Timeline</h3>
           <p style="font-size: 1.05rem; line-height: 1.6; color: #e2e8f0; margin: 0;">${data.timeline || 'Estimating rollout sprints...'}</p>
        </div>
        <div style="background: rgba(0,0,0,0.2); padding: 1.5rem; border-radius: 8px; border-top: 3px solid #fca5a5; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
           <h3 style="color: #fca5a5; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.75rem; margin-top: 0;">Risk Mitigation</h3>
           <p style="font-size: 1.05rem; line-height: 1.6; color: #e2e8f0; margin: 0;">${data.keyRisks || 'Identifying edge cases...'}</p>
        </div>
     </div>

     <div style="background: rgba(99, 102, 241, 0.1); padding: 1.5rem; border-radius: 8px; border: 1px solid rgba(99, 102, 241, 0.2); box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <h3 style="color: #818cf8; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.75rem; margin-top: 0;">Next Steps</h3>
        <p style="font-size: 1.15rem; line-height: 1.6; color: #f8fafc; margin: 0;">${data.nextSteps || 'Awaiting phase completion...'}</p>
     </div>
  </div>
</div>
`;
        }

        return html;
    }

    private getCtaHtml(): string {
        return `
            <div style="margin-top: 2.5rem; background: rgba(0,0,0,0.25); padding: 2rem; border-radius: 8px; border-top: 4px solid #38bdf8; box-shadow: 0 4px 6px rgba(0,0,0,0.1); font-family: 'Inter', sans-serif;">
                <h3 style="color: #f8fafc; font-size: 1.25rem; margin-top: 0; margin-bottom: 1rem;">The Bigger Picture &amp; Next Steps</h3>
                <p style="color: #94a3b8; font-size: 1.05rem; line-height: 1.6; margin-bottom: 1rem;">
                    This AI use case is just one example. Ultimately, there are dozens, if not hundreds, of use cases for AI across your entire organization. Working with an AI implementation consultant at Meaningful AI helps you identify the use cases with the highest ROI&mdash;separating the quick wins from the long-term strategic bets.
                </p>
                <p style="color: #94a3b8; font-size: 1.05rem; line-height: 1.6; margin-bottom: 1.5rem;">
                    Every single month, we work together to transform your company into an AI-enabled leader. Some of these use cases are major wins, while others are incremental wins that open up time and budget for the bigger, long-term strategic bets. Crucially, rolling out these tools requires a qualified implementation team to manage governance, mitigate security risks, and protect your company's proprietary data against emerging threats.
                </p>
                <div style="background: rgba(56, 189, 248, 0.1); padding: 1rem 1.5rem; border-radius: 6px; border: 1px solid rgba(56, 189, 248, 0.2); display: inline-block;">
                    <p style="color: #e2e8f0; font-size: 1.05rem; font-weight: 500; margin: 0;">
                        <strong>Ready to start?</strong> Visit us at <a href="https://bemeaningful.ai" target="_blank" style="color: #38bdf8; text-decoration: none; font-weight: 600;">bemeaningful.ai</a> or email us at <a href="mailto:hello@bemeaningful.ai" style="color: #38bdf8; text-decoration: none; font-weight: 600;">hello@bemeaningful.ai</a>.
                    </p>
                </div>
            </div>
        `;
    }

    private async showPhaseReport(phase: number) {
        this.activeReportPhase = phase;
        const phaseNames = ['', 'Discovery', 'Strategy', 'Implementation'];
        const title = `${phaseNames[phase]} Document`;
        let html = this.getPhaseHtml(phase);
        
        if (this.reportModal.getElement().classList.contains('visible') && this.activeReportPhase === phase) {
            this.reportModal.updateContent(html);
        } else {
            this.reportModal.show(title, html, () => this.handleRegeneratePhaseReport(phase));
        }
    }

    private async showFullReport() {
        this.activeReportPhase = null;
        
        const cacheKey = `ais_full_report_${this.options.sessionId}`;
        const cachedHtml = localStorage.getItem(cacheKey);

        let fullHtml = cachedHtml || `
<div style="display:flex; flex-direction:column; gap: 2rem;">
  ${this.getPhaseHtml(1)}
  ${this.getPhaseHtml(2)}
  ${this.getPhaseHtml(3)}
</div>`;

        if (!fullHtml.includes('The Bigger Picture &amp; Next Steps') && !fullHtml.includes('The Bigger Picture & Next Steps')) {
            fullHtml += this.getCtaHtml();
        }

        this.reportModal.show("Meaningful AI - Full Implementation Report", fullHtml, () => this.handleRegeneratePlan());
    }

    private async handleRegeneratePhaseReport(phase: number) {
        this.reportModal.updateContent(`
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 6rem 2rem; color: #94a3b8; gap: 1.5rem; text-align: center; font-family: 'Inter', sans-serif;">
                <video src="/brand/poly-animated.mp4" autoplay loop muted playsinline style="width: 100px; height: 100px; border-radius: 50%; box-shadow: 0 8px 24px rgba(0,0,0,0.3); object-fit: cover; aspect-ratio: 1/1; border: 3px solid rgba(192, 132, 252, 0.4);"></video>
                <div style="font-size: 1.3rem; margin-bottom: 0.5rem; color: white;">Analysis Complete</div>
                <div>Extracted Phase Report from current Conversation</div>
            </div>
        `);
        
        setTimeout(() => {
            this.showPhaseReport(phase);
        }, 1200);
    }

    private async handleRegeneratePlan() {
        this.reportModal.updateContent(`
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 6rem 2rem; color: #94a3b8; gap: 1.5rem; text-align: center; font-family: 'Inter', sans-serif;">
                <video src="/brand/poly-animated.mp4" autoplay loop muted playsinline style="width: 100px; height: 100px; border-radius: 50%; box-shadow: 0 8px 24px rgba(0,0,0,0.3); object-fit: cover; aspect-ratio: 1/1; border: 3px solid rgba(56, 189, 248, 0.4);"></video>
                <div style="font-size: 1.3rem; margin-bottom: 0.5rem; color: white;">Synthesizing Chat History...</div>
                <div>Generating comprehensive implementation plan.<br>This may take 15-30 seconds.</div>
            </div>
        `);

        const systemPrompt = `You are an expert AI implementation strategist.
Your task is to generate a beautiful, comprehensive AI Implementation Plan based ONLY on the provided chat history.
Format the plan elegantly using Markdown. Include well-structured headings, bullet points, and tables where appropriate (like Executive Summary, Expected ROI, Architecture, Roles, Roadmap, Investment).
Do not add any conversational filler. Just the polished Markdown report.`;

        const userPrompt = `CONVERSATION CONTEXT:
${this.chatHistory.map(m => `${m.role}: ${m.content}`).join('\n')}

Generate the complete AI Implementation Plan.`;

        try {
            const res = await callLLM({ 
                systemPrompt: systemPrompt,
                prompt: userPrompt,
                temperature: 0.4,
                maxTokens: 3000,
                provider: this.options.llmProvider
            });

            if (res.success && res.content) {
                const htmlContent = `
                    <div style="background: linear-gradient(135deg, #1e293b, #0f172a); color: rgba(255,255,255,0.9); padding: clamp(1rem, 5vw, 2.5rem) clamp(1rem, 5vw, 3rem); border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); font-family: 'Inter', sans-serif; line-height: 1.6; max-width: 900px; margin: 0 auto;">
                        <style>
                            .regenerated-report h1, .regenerated-report h2, .regenerated-report h3 { color: #38bdf8; margin-top: 2rem; margin-bottom: 1rem; }
                            .regenerated-report h1 { border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.75rem; font-size: 2.2rem; }
                            .regenerated-report h2 { font-size: 1.5rem; color: #818cf8; }
                            .regenerated-report table { width: 100%; border-collapse: collapse; margin: 1.5rem 0; background: rgba(0,0,0,0.2); border-radius: 8px; overflow: hidden; }
                            .regenerated-report th, .regenerated-report td { border: 1px solid rgba(255,255,255,0.1); padding: 0.75rem 1rem; text-align: left; }
                            .regenerated-report th { background: rgba(56, 189, 248, 0.1); color: #38bdf8; font-weight: 600; text-transform: uppercase; font-size: 0.85rem; letter-spacing: 1px; }
                            .regenerated-report ul, .regenerated-report ol { padding-left: 1.5rem; margin: 1rem 0; }
                            .regenerated-report li { margin-bottom: 0.5rem; }
                            .regenerated-report p { margin: 1rem 0; }
                            .regenerated-report strong { color: white; }
                            .regenerated-report em { color: #cbd5e1; }
                        </style>
                        <div class="regenerated-report">
                            ${this.parseMarkdown(res.content)}
                            ${this.getCtaHtml()}
                        </div>
                    </div>
                `;
                const cacheKey = `ais_full_report_${this.options.sessionId}`;
                localStorage.setItem(cacheKey, htmlContent);
                this.reportModal.updateContent(htmlContent);
            } else {
                this.reportModal.updateContent(`<div style="color:#ef4444; padding: 2rem; text-align:center;">Failed to generate plan. Please try again.</div>`);
            }
        } catch (e) {
            console.error('[ChatScreen] Error generating plan', e);
            this.reportModal.updateContent(`<div style="color:#ef4444; padding: 2rem; text-align:center;">Error generating plan. Check console.</div>`);
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

        const gear = this.options.currentGear || 1;
        const phase = Math.floor(gear);

        let owlName = 'Discovery';
        let owlRole = 'Phase 1';
        let owlColor = '#4A66AC';
        if (phase === 2) { owlName = 'Strategy'; owlRole = 'Phase 2'; owlColor = '#34d399'; }
        if (phase === 3) { owlName = 'Implementation'; owlRole = 'Phase 3'; owlColor = '#E83151'; }

        const header = this.element.querySelector('#chat-header') as HTMLElement;
        const avatar = this.element.querySelector('#owl-header-avatar') as HTMLImageElement;
        const name = this.element.querySelector('#owl-header-name') as HTMLElement;
        const role = this.element.querySelector('#owl-header-role') as HTMLElement;

        owlSwitchAnimation(this.element.querySelector('#scene-panel') as HTMLElement, owlName, owlRole);

        header.style.background = owlColor;
        avatar.src = this.getOwlAvatar();
        name.textContent = owlName;
        role.textContent = owlRole;

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
                !hasPlayerAvatar, // owlOnly = true if no player avatar
                this.options.llmProvider
            );

            const config: any = {
                prompt: visualPrompt,
                style: ART_STYLES['3d-storybook'],
                width: 1024, height: 1024,
                aspectRatio: '1:1'
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
                await crossfadeImage(sceneImageEl, generatedImage.url);
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

            const result = await callLLM({ prompt, temperature: 0.7, maxTokens: 100, jsonMode: true, provider: this.options.llmProvider });

            if (result.success && result.content) {
                try {
                    let parsed = null;
                    try {
                        parsed = JSON.parse(result.content);
                    } catch {
                        // Resilient stripping: extract only the JSON array block natively regardless of surrounding markdown
                        const match = result.content.match(/\[[\s\S]*\]/);
                        if (match) {
                            parsed = JSON.parse(match[0]);
                        } else {
                            throw new Error("No array found");
                        }
                    }
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        this.renderQuickReplies(parsed.slice(0, 3));
                    }
                } catch {
                    console.warn('[ChatScreen] Failed to parse quick replies', result.content);
                }
            }
        } catch (err) {
            console.warn('[ChatScreen] Quick reply generation failed:', err);
        }
    }

    private renderQuickReplies(replies: string[]) {
        const repliesContainer = this.element.querySelector('#quick-replies') as HTMLElement;
        repliesContainer.innerHTML = '';

        replies.forEach((reply, i) => {
            const btn = document.createElement('button');
            btn.className = 'quick-reply-btn';
            btn.textContent = reply;
            
            // Interaction animations
            btn.addEventListener('mouseenter', () => {
                // Ignore if it's currently scaling out
                if (btn.style.opacity === '0') return;
                btn.style.transform = 'scale(1.03) translateY(-2px)';
            });
            btn.addEventListener('mouseleave', () => {
                if (btn.style.opacity === '0') return;
                btn.style.transform = '';
            });

            btn.addEventListener('click', () => {
                buttonPress(btn);
                // Quickly fade out other quick replies for a clean UI feeling
                const allBtns = repliesContainer.querySelectorAll('.quick-reply-btn');
                setTimeout(() => {
                    const chatInput = this.element.querySelector('#chat-input') as HTMLInputElement;
                    chatInput.value = reply;
                    repliesContainer.innerHTML = '';
                    this.messageSource = 'quick_reply';
                    this.handleSend();
                }, 150);
            });
            repliesContainer.appendChild(btn);
        });

        // Magical stagger entrance for buttons
        staggerFadeIn(repliesContainer, '.quick-reply-btn', { delay: 0.1, stagger: 0.08 });

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

        const isDev = import.meta.env.DEV || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (messageText.toLowerCase() === 'demo' && isDev) {
            this.isSending = false;
            this.progressBar.updatePhase(3, '3.2');
            this.addMessage('user', messageText);
            
            // Build a sufficient mock history so the LLM generation has something to work with
            this.chatHistory = [
                { role: 'assistant', content: 'Welcome to Meaningful AI. What is your company name?', timestamp: new Date().toISOString() },
                { role: 'user', content: 'Acme Corp, I am the COO.', timestamp: new Date().toISOString() },
                { role: 'assistant', content: 'Great. What are your pain points?', timestamp: new Date().toISOString() },
                { role: 'user', content: 'We spend too much time manually sorting customer support emails.', timestamp: new Date().toISOString() },
                { role: 'assistant', content: 'Let us build an AI use case for an automated routing agent. What systems do you use?', timestamp: new Date().toISOString() },
                { role: 'user', content: 'Zendesk and Salesforce.', timestamp: new Date().toISOString() },
                { role: 'assistant', content: 'This will require a custom RAG agent integrated via API. Who will own this?', timestamp: new Date().toISOString() },
                { role: 'user', content: 'Sarah in Operations.', timestamp: new Date().toISOString() },
                { role: 'assistant', content: 'I have logged this. This concludes the strategy phase.', timestamp: new Date().toISOString() },
                { role: 'assistant', content: 'Here is your **IMPLEMENTATION PLAN**', timestamp: new Date().toISOString() }
            ];
            
            this.addMessage('assistant', "I've fast-forwarded us directly to the end and injected a mock chat history for Acme Corp! Watch the top right...", 'poly');
            
            this.triggerCongratulations();
            setTimeout(() => this.handleRegeneratePlan(), 4500);
            return;
        }

        this.chatHistory.push({ role: 'user', content: messageText, timestamp: new Date().toISOString() });
        this.addMessage('user', messageText);

        this.showTypingIndicator();

        const result = await sendMessage(this.options.sessionId, messageText, this.messageSource, this.options.llmProvider);
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

            if (/(?:\n|^)(?:\*\*|#+)\s*(?:AI\s+)?IMPLEMENTATION PLAN/i.test(owlResponse) && !this.hasCongratulated) {
                this.triggerCongratulations();
            }
        } else {
            const fallbackMsg = "Our owls are resting for a moment. Could you try that again?";
            this.chatHistory.push({ role: 'assistant', content: fallbackMsg, timestamp: new Date().toISOString(), agent_id: this.currentAgent });
            this.addMessage('assistant', fallbackMsg, this.currentAgent);
        }

        this.isSending = false;
        chatInput.focus();

        this.startSceneImageCycle();
    }

    private triggerCongratulations() {
        this.hasCongratulated = true;
        setTimeout(() => {
            const congratsHtml = `
                <div style="text-align: center; margin: 0;">
                    <video src="/brand/poly-animated-fly.mp4" autoplay loop muted playsinline style="display: block; margin: 0 auto 0.75rem auto; width: 100%; max-width: 160px; aspect-ratio: 1/1; object-fit: cover; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); border: 2px solid rgba(96, 203, 232, 0.3);"></video>
                    <h3 style="color: var(--color-true-blue); font-family: var(--font-display); margin: 0 0 0.5rem 0; font-size: 1.15rem;">Congratulations on completing your Strategy! 🚀</h3>
                    <p style="margin: 0; font-size: 0.95rem; line-height: 1.4; color: #1a1a2e;">Your formal AI Implementation Plan is ready. Click the report button in the upper right to view, copy, or download it as a PDF.</p>
                </div>
            `;
            
            // Push an unformatted text version to history (for reports if needed) but not really necessary for UI render
            this.chatHistory.push({ role: 'assistant', content: "Congratulations! The AI Implementation Plan is ready.", timestamp: new Date().toISOString(), agent_id: 'poly' });
            
            const messagesContainer = this.element.querySelector('#chat-messages') as HTMLElement;
            if (!messagesContainer) return;
            
            const row = document.createElement('div');
            row.className = 'message-row owl';
            row.innerHTML = `
                <img src="/brand/owl-icon.png" alt="Poly" class="message-avatar" style="border: 2px solid var(--color-sky-blue);" />
                <div class="message-bubble owl" style="white-space: normal; padding: 1.2rem; border: 1px solid rgba(96, 203, 232, 0.5); box-shadow: 0 4px 20px rgba(96, 203, 232, 0.15);">${congratsHtml}</div>`;
            messagesContainer.appendChild(row);
            requestAnimationFrame(() => { messagesContainer.scrollTop = messagesContainer.scrollHeight; });
        }, 2000);
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

        // Headers
        html = html.replace(/^#### (.*$)/gm, '<h4>$1</h4>');
        html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');

        // Bold **text**
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        // Italic *text* (but not inside already-processed strong tags)
        html = html.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>');
        
        // Unordered lists (bullet points)
        html = html.replace(/^[-\*]\s+\[x\]\s+(.*)$/gmi, '<li class="md-check-done">☑ $1</li>');
        html = html.replace(/^[-\*]\s+\[ \]\s+(.*)$/gmi, '<li class="md-check-open">☐ $1</li>');
        html = html.replace(/^[-\*]\s+(.*)$/gm, '<li>$1</li>');

        // Wrap consecutive <li> in <ul> (simple approximation)
        html = html.replace(/(<li>(?:.*?)<\/li>\n?)+/g, match => `<ul>${match}</ul>`);

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
                const replacement = `<span class="ai-term" data-term-id="${id}">${match[1]}</span><div id="${id}" class="ai-term-tooltip"><span class="ai-term-label">${term}</span>${definition}</div>`;
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
                <div style="position: relative; display: flex; align-items: center;">
                    <button class="copy-btn" title="Copy text">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </button>
                    <span class="copy-toast">Copied to clipboard</span>
                </div>
                <div class="feedback-thumbs">
                    <button class="feedback-btn" data-rating="positive" title="Helpful">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
                    </button>
                    <button class="feedback-btn" data-rating="negative" title="Not helpful">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>
                    </button>
                </div>
            `;
            
            feedbackRow.querySelector('.copy-btn')?.addEventListener('click', async (e) => {
                try {
                    await navigator.clipboard.writeText(displayContent);
                    const btn = e.currentTarget as HTMLElement;
                    btn.style.color = 'var(--color-success)';
                    const toast = btn.nextElementSibling as HTMLElement;
                    if (toast) {
                        toast.classList.add('show');
                        setTimeout(() => { toast.classList.remove('show'); btn.style.color = ''; }, 2000);
                    }
                } catch (err) {}
            });

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

        // Start loading the personalized image scene cycle immediately
        this.startSceneImageCycle();

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
