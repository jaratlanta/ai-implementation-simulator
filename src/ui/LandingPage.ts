/**
 * Landing Page — Meaningful AI owl-themed welcome + path selection
 */

import { uiManager } from './UIManager';
import { heroEntrance } from '../utils/animations';

export class LandingPage {
    private element: HTMLElement;
    private onStart: (path: 'discovery' | 'strategy') => void;

    constructor(onStart: (path: 'discovery' | 'strategy') => void, _owlAvatarUrl?: string) {
        this.onStart = onStart;
        this.element = document.createElement('div');
        this.element.className = 'landing-page';

        this.element.innerHTML = `
            <div style="margin-bottom: 1.5rem;">
                <img src="/brand/meaningful-owl-horizontal-reverse.png" alt="Meaningful AI" style="width: 260px; height: auto;" onerror="this.outerHTML='<h2 style=\\'color:var(--color-delft-blue);font-family:var(--font-display);\\'>meaningful<span style=\\'color:var(--color-sky-blue)\\'>ai</span></h2>';" />
            </div>

            <h1 class="landing-title" style="margin-bottom: 2.5rem;">AI Implementation Simulator</h1>

            <div class="path-selector">
                <button id="path-discovery" class="btn path-btn" style="font-size: 1rem; padding: 1rem 2rem;">
                    Discover AI Use Cases
                </button>
                <button id="path-strategy" class="btn btn-outline path-btn" style="font-size: 1rem; padding: 1rem 2rem;">
                    Refine My AI Strategy
                </button>
            </div>

            <p style="margin-top: 2rem; font-size: 0.8rem; color: var(--color-text-light);">
                Powered by Meaningful AI
            </p>
        `;

        const discoveryBtn = this.element.querySelector('#path-discovery') as HTMLButtonElement;
        const strategyBtn = this.element.querySelector('#path-strategy') as HTMLButtonElement;

        discoveryBtn.addEventListener('click', () => this.onStart('discovery'));
        strategyBtn.addEventListener('click', () => this.onStart('strategy'));
    }

    public mount() {
        uiManager.renderScreen(this.element);
        try {
            setTimeout(() => heroEntrance(this.element), 100);
        } catch {}
        // Safety net: ensure everything is visible even if animation fails
        setTimeout(() => {
            this.element.querySelectorAll('.btn, .landing-title, .landing-subtitle, p').forEach(el => {
                (el as HTMLElement).style.opacity = '1';
                (el as HTMLElement).style.transform = 'none';
            });
        }, 2000);
    }
}
