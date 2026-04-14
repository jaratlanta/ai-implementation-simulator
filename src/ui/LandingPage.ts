/**
 * Landing Page — Meaningful AI owl-themed welcome + path selection
 */

import { uiManager } from './UIManager';
import { heroEntrance, buttonPress } from '../utils/animations';
import gsap from 'gsap';

export class LandingPage {
    private element: HTMLElement;
    private onStart: (path: 'discovery' | 'strategy') => void;

    constructor(onStart: (path: 'discovery' | 'strategy') => void, _owlAvatarUrl?: string) {
        this.onStart = onStart;
        this.element = document.createElement('div');
        this.element.className = 'landing-page';

        this.element.innerHTML = `
            <div style="margin-bottom: 1.5rem;">
                <a href="https://bemeaningful.ai" target="_blank" rel="noopener noreferrer">
                    <img src="/brand/meaningful-owl-horizontal-reverse.png" alt="Meaningful AI" style="width: 260px; height: auto;" onerror="this.outerHTML='<h2 style=\\'color:var(--color-delft-blue);font-family:var(--font-display);\\'>meaningful<span style=\\'color:var(--color-sky-blue)\\'>ai</span></h2>';" />
                </a>
            </div>

            <div style="margin-bottom: 2rem; display: flex; justify-content: center;">
                <video src="/brand/poly-animated.mp4" autoplay loop muted playsinline style="width: 220px; max-width: 100%; border-radius: 100px; box-shadow: 0 12px 32px rgba(0,0,0,0.3); object-fit: cover; aspect-ratio: 1/1;"></video>
            </div>

            <h1 class="landing-title" style="margin-bottom: 2.5rem;">AI Implementation Simulator</h1>

            <div class="path-selector">
                <button id="path-discovery" class="btn path-btn" style="font-size: 1rem; padding: 1rem 2rem;">
                    Discover AI Use Cases
                </button>
            </div>

            <p style="margin-top: 2rem; font-size: 0.8rem; color: var(--color-text-light);">
                Powered by <a href="https://bemeaningful.ai" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline;">Meaningful AI</a>
            </p>
        `;

        const discoveryBtn = this.element.querySelector('#path-discovery') as HTMLButtonElement;

        discoveryBtn.addEventListener('click', () => {
            buttonPress(discoveryBtn);
            setTimeout(() => this.onStart('discovery'), 150);
        });
    }

    public mount() {
        uiManager.renderScreen(this.element);
        try {
            setTimeout(() => {
                heroEntrance(this.element);
                
                const video = this.element.querySelector('video');
                if (video) {
                    gsap.to(video, {
                        y: -15,
                        rotation: 1.5,
                        duration: 3,
                        yoyo: true,
                        repeat: -1,
                        ease: "sine.inOut"
                    });
                }

                this.element.querySelectorAll('.btn').forEach(btn => {
                    btn.addEventListener('mouseenter', () => {
                        gsap.to(btn, { scale: 1.05, duration: 0.3, ease: 'back.out(2)' });
                    });
                    btn.addEventListener('mouseleave', () => {
                        gsap.to(btn, { scale: 1, duration: 0.3, ease: 'back.out(2)' });
                    });
                });
            }, 100);
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
