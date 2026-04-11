/**
 * Info Panel — "How is this built?" overlay showing 6 AI toolsets
 */

interface ToolsetStatus {
    rag: { status: string; chunks: number; withEmbeddings: number };
    conversational: { status: string; agents: number; provider: string };
    imageGen: { status: string; provider: string };
    mcp: { status: string; tools: number };
    rl: { status: string; signals: number };
    vibeCoding: { status: string };
}

const TOOLSETS = [
    {
        key: 'rag',
        icon: '🔍',
        title: 'RAG + Vector Search',
        description: 'Gemini embeddings + pgvector similarity search. Every owl response is grounded in Meaningful AI\'s knowledge base — not generic AI.',
        detail: (s: any) => s?.chunks ? `${s.withEmbeddings} embedded chunks` : '',
    },
    {
        key: 'conversational',
        icon: '🦉',
        title: 'Multi-Agent Conversational AI',
        description: '5 specialized owl agents with LLM-driven phase routing. Claude primary, Gemini fallback. Each owl has domain expertise and personality.',
        detail: (s: any) => s?.agents ? `${s.agents} agents, ${s.provider}` : '',
    },
    {
        key: 'imageGen',
        icon: '🎨',
        title: 'GenAI Image Generation',
        description: 'Real-time scene generation using Gemini Flash with 3D owl reference images. Scenes and avatars generated live during the workshop.',
        detail: (s: any) => s?.provider || '',
    },
    {
        key: 'mcp',
        icon: '🔌',
        title: 'MCP Server',
        description: 'Model Context Protocol server exposing knowledge search, company context, and session tools — the standard for AI tool interop.',
        detail: (s: any) => s?.tools ? `${s.tools} tools exposed` : '',
    },
    {
        key: 'rl',
        icon: '🧠',
        title: 'Reinforcement Learning',
        description: 'Implicit feedback signals drive adaptive agent behavior. The experience improves with every conversation — real contextual-bandit RL.',
        detail: (s: any) => s?.signals ? `${s.signals} signals collected` : 'collecting...',
    },
    {
        key: 'vibeCoding',
        icon: '✨',
        title: 'Vibe Coding',
        description: 'This entire application was built using AI-assisted development — Claude Code and collaborative human-AI engineering.',
        detail: () => 'AI-built',
    },
];

export class InfoPanel {
    private overlay: HTMLElement;
    private visible: boolean = false;
    private status: ToolsetStatus | null = null;

    constructor() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'info-panel-overlay';
        this.overlay.style.display = 'none';
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.hide();
        });
        this.render();
    }

    private render() {
        this.overlay.innerHTML = `
            <div class="info-panel">
                <button class="info-panel-close" title="Close">&times;</button>
                <h2 class="info-panel-title">Built with 6 AI Technologies</h2>
                <p class="info-panel-subtitle">This isn't just a chatbot — it's a working showcase of modern AI toolsets.</p>
                <div class="toolset-grid">
                    ${TOOLSETS.map(t => `
                        <div class="toolset-card" data-key="${t.key}">
                            <div class="toolset-icon">${t.icon}</div>
                            <div class="toolset-content">
                                <div class="toolset-header">
                                    <h3>${t.title}</h3>
                                    <span class="status-dot loading" data-status="${t.key}"></span>
                                </div>
                                <p>${t.description}</p>
                                <span class="toolset-detail" data-detail="${t.key}"></span>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="info-panel-footer">
                    <img src="/brand/meaningful-owl-horizontal-reverse.png" alt="Meaningful AI" style="height: 24px; opacity: 0.6;" onerror="this.style.display='none'" />
                </div>
            </div>
        `;

        this.overlay.querySelector('.info-panel-close')!.addEventListener('click', () => this.hide());
    }

    public getElement(): HTMLElement {
        return this.overlay;
    }

    public async show() {
        this.visible = true;
        this.overlay.style.display = 'flex';
        requestAnimationFrame(() => this.overlay.classList.add('visible'));

        // Fetch live status
        try {
            const resp = await fetch('/chat/toolset-status');
            if (resp.ok) {
                this.status = await resp.json();
                this.updateStatusDots();
            }
        } catch {
            // Status API not available — show all as active
            TOOLSETS.forEach(t => {
                const dot = this.overlay.querySelector(`[data-status="${t.key}"]`);
                if (dot) { dot.className = 'status-dot active'; }
            });
        }
    }

    public hide() {
        this.visible = false;
        this.overlay.classList.remove('visible');
        setTimeout(() => { this.overlay.style.display = 'none'; }, 300);
    }

    public toggle() {
        if (this.visible) this.hide(); else this.show();
    }

    private updateStatusDots() {
        if (!this.status) return;
        TOOLSETS.forEach(t => {
            const dot = this.overlay.querySelector(`[data-status="${t.key}"]`);
            const detail = this.overlay.querySelector(`[data-detail="${t.key}"]`);
            const s = (this.status as any)[t.key];
            if (dot) {
                dot.className = `status-dot ${s?.status === 'active' ? 'active' : s?.status === 'collecting' ? 'collecting' : 'inactive'}`;
            }
            if (detail && s) {
                detail.textContent = t.detail(s);
            }
        });
    }
}
