/**
 * UIManager — handles screen transitions with GSAP animations
 */

import gsap from 'gsap';

export class UIManager {
    private static instance: UIManager;
    private container: HTMLElement;
    private currentScreen: HTMLElement | null = null;

    private constructor() {
        this.container = document.getElementById('app-container')!;
    }

    public static getInstance(): UIManager {
        if (!UIManager.instance) {
            UIManager.instance = new UIManager();
        }
        return UIManager.instance;
    }

    public renderScreen(screenElement: HTMLElement) {
        if (this.currentScreen && this.currentScreen.parentNode === this.container) {
            // Animate out the current screen, then swap
            const oldScreen = this.currentScreen;
            gsap.to(oldScreen, {
                opacity: 0,
                y: -10,
                duration: 0.2,
                ease: 'power2.in',
                onComplete: () => {
                    if (oldScreen.parentNode === this.container) {
                        this.container.removeChild(oldScreen);
                    }
                    this.mountNewScreen(screenElement);
                }
            });
        } else {
            this.mountNewScreen(screenElement);
        }
    }

    private mountNewScreen(screenElement: HTMLElement) {
        this.currentScreen = screenElement;
        gsap.set(screenElement, { opacity: 0, y: 15 });
        this.container.appendChild(screenElement);
        gsap.to(screenElement, {
            opacity: 1,
            y: 0,
            duration: 0.4,
            ease: 'power2.out'
        });
    }

    public showLoading(message: string = 'Loading...') {
        let loader = document.getElementById('global-loader');
        if (!loader) {
            loader = document.createElement('div');
            loader.id = 'global-loader';
            loader.style.position = 'fixed';
            loader.style.top = '0';
            loader.style.left = '0';
            loader.style.width = '100vw';
            loader.style.height = '100vh';
            loader.style.backgroundColor = 'var(--color-bg)';
            loader.style.display = 'flex';
            loader.style.justifyContent = 'center';
            loader.style.alignItems = 'center';
            loader.style.zIndex = '9999';
            loader.style.color = 'var(--color-accent)';
            loader.style.fontFamily = 'var(--font-display)';
            loader.style.fontSize = '1.5rem';
            document.body.appendChild(loader);
        }
        loader.innerText = message;
        loader.style.display = 'flex';
        gsap.fromTo(loader, { opacity: 0 }, { opacity: 1, duration: 0.3 });
    }

    public hideLoading() {
        const loader = document.getElementById('global-loader');
        if (loader) {
            gsap.to(loader, {
                opacity: 0,
                duration: 0.2,
                onComplete: () => { loader.style.display = 'none'; }
            });
        }
    }
}

export const uiManager = UIManager.getInstance();
