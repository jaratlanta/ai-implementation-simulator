/**
 * Progress Bar — 3 Phases with step-based fill progress
 * Completed phases are clickable to view their reports.
 */

import gsap from 'gsap';

interface ProgressBarOptions {
    currentGear: number;
    currentPhase: string;
    path: string;
    onPhaseClick?: (phase: number) => void;
}

const PHASE_LABELS = ['Discover', 'Strategy', 'Implementation'];

const PHASE_STEPS: Record<number, string[]> = {
    1: ['1.1', '1.2', '1.3', '1.4'],
    2: ['2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7'],
    3: ['3.1', '3.2'],
};

export class ProgressBar {
    private element: HTMLElement;
    private currentGear: number;
    private currentPhase: string;
    private onPhaseClick?: (phase: number) => void;

    constructor(options: ProgressBarOptions) {
        this.currentGear = options.currentGear;
        this.currentPhase = options.currentPhase;
        this.onPhaseClick = options.onPhaseClick;
        this.element = document.createElement('div');
        this.element.className = 'progress-bar';
        this.render();
    }

    private render() {
        this.element.innerHTML = '';

        for (let phase = 1; phase <= 3; phase++) {
            const steps = PHASE_STEPS[phase] || [];

            let fillPct = 0;
            if (phase < this.currentGear) {
                fillPct = 100;
            } else if (phase === this.currentGear) {
                const stepIdx = steps.indexOf(this.currentPhase);
                if (stepIdx >= 0) {
                    fillPct = ((stepIdx + 1) / steps.length) * 100;
                }
            }

            const isCompleted = phase < this.currentGear;
            const isActive = phase <= this.currentGear;
            const isCurrent = phase === this.currentGear;

            const phaseEl = document.createElement('div');
            phaseEl.className = `progress-phase ${isActive ? 'active' : ''} ${isCurrent ? 'current' : ''} ${isCompleted ? 'completed-clickable' : ''}`;

            const checkmark = isCompleted ? '<span style="color:var(--color-sky-blue);margin-right:0.25rem;">✓</span>' : '';

            phaseEl.innerHTML = `
                <div class="progress-phase-header">
                    <span class="progress-phase-label">${checkmark}${PHASE_LABELS[phase - 1]}</span>
                </div>
                <div class="progress-track">
                    <div class="progress-fill" style="width: ${fillPct}%"></div>
                </div>
            `;

            // Make completed phases clickable to open their report
            if (isCompleted && this.onPhaseClick) {
                phaseEl.addEventListener('click', () => this.onPhaseClick!(phase));
            }

            this.element.appendChild(phaseEl);
        }
    }

    public updatePhase(gear: number, phase: string) {
        this.currentGear = gear;
        this.currentPhase = phase;
        this.render();

        const fill = this.element.querySelector('.progress-phase.current .progress-fill') as HTMLElement;
        if (fill) {
            gsap.from(fill, { width: '0%', duration: 0.6, ease: 'power2.out' });
        }
    }

    public getElement(): HTMLElement {
        return this.element;
    }
}
