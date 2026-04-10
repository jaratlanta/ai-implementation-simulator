/**
 * GSAP Animation Utilities for AI Implementation Simulator
 */

import gsap from 'gsap';

export function fadeInUp(element: HTMLElement, options?: { delay?: number; duration?: number; distance?: number }): gsap.core.Tween {
    const { delay = 0, duration = 0.6, distance = 30 } = options || {};
    gsap.set(element, { opacity: 0, y: distance });
    return gsap.to(element, { opacity: 1, y: 0, duration, delay, ease: 'power2.out' });
}

export function staggerFadeIn(parent: HTMLElement, childSelector: string, options?: { delay?: number; stagger?: number }): gsap.core.Tween {
    const { delay = 0, stagger = 0.1 } = options || {};
    const children = parent.querySelectorAll(childSelector);
    gsap.set(children, { opacity: 0, y: 20 });
    return gsap.to(children, { opacity: 1, y: 0, duration: 0.5, delay, stagger, ease: 'power2.out' });
}

export function animateMessageIn(element: HTMLElement, fromRight: boolean = false): gsap.core.Tween {
    const x = fromRight ? 40 : -40;
    gsap.set(element, { opacity: 0, x, scale: 0.95 });
    return gsap.to(element, { opacity: 1, x: 0, scale: 1, duration: 0.4, ease: 'back.out(1.2)' });
}

export function crossfadeImage(imgElement: HTMLImageElement, newSrc: string): Promise<void> {
    return new Promise((resolve) => {
        gsap.to(imgElement, {
            opacity: 0, scale: 1.02, duration: 0.5, ease: 'power2.in',
            onComplete: () => {
                imgElement.src = newSrc;
                imgElement.onload = () => {
                    gsap.fromTo(imgElement, { opacity: 0, scale: 1.05 }, { opacity: 1, scale: 1, duration: 0.8, ease: 'power2.out', onComplete: resolve });
                };
                if (imgElement.complete) {
                    gsap.fromTo(imgElement, { opacity: 0, scale: 1.05 }, { opacity: 1, scale: 1, duration: 0.8, ease: 'power2.out', onComplete: resolve });
                }
            }
        });
    });
}

export function buttonPress(element: HTMLElement): gsap.core.Tween {
    return gsap.fromTo(element, { scale: 1 }, { scale: 0.95, duration: 0.1, yoyo: true, repeat: 1, ease: 'power2.inOut' });
}

export function revealAvatarGrid(gridElement: HTMLElement): gsap.core.Tween {
    const images = gridElement.querySelectorAll('img');
    gsap.set(images, { opacity: 0, scale: 0.7 });
    return gsap.to(images, { opacity: 1, scale: 1, duration: 0.5, stagger: 0.15, ease: 'back.out(1.7)' });
}

export function heroEntrance(container: HTMLElement): gsap.core.Timeline {
    const tl = gsap.timeline();

    const avatar = container.querySelector('.landing-avatar, [style*="border-radius: 50%"]') as HTMLElement;
    const title = container.querySelector('.landing-title, h1') as HTMLElement;
    const subtitle = container.querySelector('.landing-subtitle') as HTMLElement;
    const buttons = container.querySelectorAll('.btn');

    // Use absolute positions instead of relative offsets to avoid timeline issues
    // when optional elements (like avatar) are missing
    let t = 0;

    if (avatar) {
        gsap.set(avatar, { opacity: 0, scale: 0.5 });
        tl.to(avatar, { opacity: 1, scale: 1, duration: 0.6, ease: 'back.out(1.5)' }, t);
        t += 0.4;
    }
    if (title) {
        gsap.set(title, { opacity: 0, y: 20 });
        tl.to(title, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }, t);
        t += 0.2;
    }
    if (subtitle) {
        gsap.set(subtitle, { opacity: 0, y: 15 });
        tl.to(subtitle, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }, t);
        t += 0.2;
    }
    buttons.forEach((btn) => {
        gsap.set(btn, { opacity: 0, y: 10, scale: 0.95 });
        tl.to(btn, { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: 'back.out(1.3)' }, t);
        t += 0.15;
    });

    return tl;
}

/**
 * Owl switch animation — flash overlay with new owl name
 */
export function owlSwitchAnimation(container: HTMLElement, owlName: string, owlRole: string): Promise<void> {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'owl-switch-overlay';
        overlay.innerHTML = `
            <div class="owl-switch-text">
                <span class="owl-switch-name">${owlName}</span>
                <span class="owl-switch-role">${owlRole}</span>
            </div>
        `;
        container.appendChild(overlay);

        const tl = gsap.timeline({
            onComplete: () => {
                overlay.remove();
                resolve();
            }
        });

        tl.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.3 });
        tl.fromTo(overlay.querySelector('.owl-switch-text'), { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.5)' }, '-=0.1');
        tl.to(overlay, { opacity: 0, duration: 0.4, delay: 1 });
    });
}

/**
 * Gear unlock animation — progress bar segment fill
 */
export function gearUnlockAnimation(element: HTMLElement, gearNumber: number): gsap.core.Timeline {
    const tl = gsap.timeline();
    tl.to(element, { backgroundColor: 'var(--color-accent)', duration: 0.5, ease: 'power2.out' });
    tl.fromTo(element, { scale: 1 }, { scale: 1.05, duration: 0.2, yoyo: true, repeat: 1, ease: 'power2.inOut' });
    return tl;
}
