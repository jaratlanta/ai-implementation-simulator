/**
 * Avatar Creator Screen
 * Take a photo to create your 3D animated avatar, or skip
 */

import { uiManager } from './UIManager';
import { describeImageForCharacter } from '../api/vision';
import { ART_STYLES } from '../image';
import { revealAvatarGrid, fadeInUp } from '../utils/animations';

const LOADING_MESSAGES = [
    "Just a few seconds...",
    "You're looking good...",
    "Almost there...",
    "Adding some animation magic...",
    "Creating your look...",
    "Finalizing the details...",
    "Nearly ready...",
];

export class AvatarCreator {
    private element: HTMLElement;
    private onComplete: (name: string, avatarUrl: string, skippedPhoto: boolean) => void;

    private currentName: string = '';
    private photoData: { base64: string, mimeType: string } | null = null;
    private generatedOptions: string[] = [];
    private selectedIndex: number = -1;
    private loadingInterval: ReturnType<typeof setInterval> | null = null;

    private savedAvatarUrl: string = '';

    constructor(onComplete: (name: string, avatarUrl: string, skippedPhoto: boolean) => void, savedName?: string, savedAvatar?: string) {
        this.onComplete = onComplete;
        if (savedName) this.currentName = savedName;
        if (savedAvatar) this.savedAvatarUrl = savedAvatar;
        this.element = document.createElement('div');
        this.element.className = 'container avatar-creator';
        this.element.style.maxWidth = '700px';
        this.render();
    }

    private render() {
        this.element.innerHTML = `
            <h1>Create Your Avatar</h1>

            <div id="step-name" style="margin-bottom: 2rem;">
                <input type="text" id="avatar-name" placeholder="Enter your name..."
                    style="font-size: 1.3rem; text-align: center; font-weight: 600;"
                    value="${this.currentName}" />
            </div>

            ${this.savedAvatarUrl ? `
            <div style="margin-bottom: 1rem; display: flex; flex-direction: column; align-items: center; gap: 0.5rem;">
                <img src="${this.savedAvatarUrl}" alt="Your avatar" style="width: 120px; height: 120px; border-radius: 16px; object-fit: cover; border: 3px solid var(--color-sky-blue); box-shadow: 0 4px 12px rgba(0,0,0,0.15);" />
                <span style="font-size: 0.8rem; color: var(--color-text-muted);">Your current avatar</span>
            </div>` : ''}

            <div id="step-photo" style="display: flex; flex-direction: column; align-items: center; gap: 1rem; margin-bottom: 2rem;">
                <button id="webcam-btn" class="btn" style="width: 220px;">${this.savedAvatarUrl ? 'New Photo' : 'Take a Photo'}</button>
                <button id="skip-btn" style="background: none; border: none; color: var(--color-text-muted); cursor: pointer; font-size: 0.9rem; font-family: var(--font-main); text-decoration: underline; padding: 0.5rem;">${this.savedAvatarUrl ? 'Keep current avatar — let\'s go!' : 'Skip photo — let\'s get started!'}</button>
            </div>

            <div id="loading-state" class="hidden" style="margin-bottom: 2rem; display: flex; flex-direction: column; align-items: center; gap: 1rem;">
                <div class="capatar-spinner"></div>
                <div id="loading-text" style="color: var(--color-accent); font-size: 1.1rem; font-weight: 600;"></div>
            </div>

            <div id="grid-container" class="hidden" style="margin-bottom: 2rem;">
                <h3 style="margin-bottom: 1rem;">Choose your look</h3>
                <div id="avatar-grid" class="avatar-grid"></div>
            </div>

            <div id="action-buttons" class="hidden">
                <button id="regenerate-btn" class="btn btn-outline">Start Over</button>
                <button id="confirm-btn" class="btn disabled" disabled>Let's Go</button>
            </div>

            <div id="modal-container"></div>
        `;

        this.attachListeners();
    }

    private attachListeners() {
        const nameInput = this.element.querySelector('#avatar-name') as HTMLInputElement;
        const webcamBtn = this.element.querySelector('#webcam-btn') as HTMLButtonElement;
        const skipBtn = this.element.querySelector('#skip-btn') as HTMLButtonElement;
        const regenBtn = this.element.querySelector('#regenerate-btn') as HTMLButtonElement;
        const confirmBtn = this.element.querySelector('#confirm-btn') as HTMLButtonElement;

        nameInput.addEventListener('input', (e) => {
            this.currentName = (e.target as HTMLInputElement).value;
        });

        webcamBtn.addEventListener('click', () => {
            if (!this.currentName.trim()) {
                alert("Please enter your name first.");
                nameInput.focus();
                return;
            }
            this.openWebcamModal();
        });

        skipBtn.addEventListener('click', () => {
            if (!this.currentName.trim()) {
                alert("Please enter your name first.");
                nameInput.focus();
                return;
            }
            console.log('[AvatarCreator] Skipping photo for:', this.currentName);
            this.finishCreation(this.currentName, '', true);
        });

        regenBtn.addEventListener('click', () => {
            this.generatedOptions = [];
            this.selectedIndex = -1;
            this.photoData = null;
            this.render();
        });

        confirmBtn.addEventListener('click', () => {
            console.log('[AvatarCreator] Confirm clicked. selectedIndex:', this.selectedIndex, 'options:', this.generatedOptions.length);
            if (this.selectedIndex >= 0 && this.selectedIndex < this.generatedOptions.length) {
                const avatarUrl = this.generatedOptions[this.selectedIndex];
                console.log('[AvatarCreator] Launching with avatar, URL length:', avatarUrl.length);
                this.finishCreation(this.currentName, avatarUrl, false);
            } else {
                console.warn('[AvatarCreator] No avatar selected');
            }
        });
    }

    /**
     * Common finish handler with loading state and error handling
     */
    private async finishCreation(name: string, avatarUrl: string, skippedPhoto: boolean) {
        // Show loading state on the button
        const confirmBtn = this.element.querySelector('#confirm-btn') as HTMLButtonElement;
        const skipBtn = this.element.querySelector('#skip-btn') as HTMLElement;
        if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Starting...'; }
        if (skipBtn) { skipBtn.style.pointerEvents = 'none'; skipBtn.style.opacity = '0.5'; }

        try {
            await this.onComplete(name, avatarUrl, skippedPhoto);
        } catch (err: any) {
            console.error('[AvatarCreator] onComplete failed:', err);
            alert(`Failed to start session: ${err?.message || err}. Please try again.`);
            if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = "Let's Go"; }
            if (skipBtn) { skipBtn.style.pointerEvents = ''; skipBtn.style.opacity = ''; }
        }
    }

    private async processPhotoFile(file: File) {
        try {
            this.showLoading("Analyzing your photo...");

            const reader = new FileReader();
            reader.readAsDataURL(file);

            reader.onload = async () => {
                const result = reader.result as string;
                const parts = result.split(',');
                this.photoData = { base64: parts[1], mimeType: file.type };

                const descResult = await describeImageForCharacter(this.photoData.base64, this.photoData.mimeType, 'person');

                if (descResult.success && descResult.description) {
                    await this.generateVariants(descResult.description);
                } else {
                    throw new Error(descResult.error || "Failed to describe image.");
                }
            };
        } catch (err) {
            console.error('[AvatarCreator] Photo processing failed:', err);
            alert("Error processing photo. Please try again.");
            this.hideLoading();
        }
    }

    private async generateVariants(baseDescription: string) {
        this.showLoading("Creating your avatar...");
        this.generatedOptions = ['', '', ''];
        this.selectedIndex = -1;

        // Show grid immediately with placeholder slots
        this.renderGridProgressive();

        const variations = [
            "Use a more defined, heroic facial structure and a confident, warm expression.",
            "Use a slightly leaner facial structure and a friendly, approachable expression.",
            "Use a slightly more angular facial shape and a thoughtful, engaged expression."
        ];

        const baseStyle = "Create a 3D animated character render based on this photo in the style of a 3D animated movie. The characters and world should be built with high-quality textures, subsurface scattering on skin, charming exaggerated features, and soft, cinematic lighting. Use a simple, solid, pure white background.";

        // Fire all off in parallel, but update grid as each completes
        const generateOne = async (index: number, variation: string) => {
            try {
                const prompt = `${baseStyle} ${baseDescription}. ${variation}`;
                const result = await (window as any).imageGenerator.generate({
                    prompt,
                    style: ART_STYLES['3d-storybook'],
                    width: 1024, height: 1024,
                    referenceImages: [{
                        base64: this.photoData!.base64,
                        mimeType: this.photoData!.mimeType,
                        description: 'Reference photo'
                    }],
                    provider: 'gemini-2.5-flash-upload'
                });
                const url = result.url || '';
                this.generatedOptions[index] = url;
                this.updateGridSlot(index, url);
            } catch (e) {
                console.error(`Variant ${index} generation failed:`, e);
                this.generatedOptions[index] = 'https://placehold.co/400x400/222D63/ffffff.png?text=Error';
                this.updateGridSlot(index, this.generatedOptions[index]);
            }
        };

        await Promise.all(variations.map((v, i) => generateOne(i, v)));
        this.hideLoading();
    }

    /**
     * Show the grid immediately with spinner placeholders
     */
    private renderGridProgressive() {
        const gridContainer = this.element.querySelector('#grid-container') as HTMLElement;
        const grid = this.element.querySelector('#avatar-grid') as HTMLElement;
        const actionGrid = this.element.querySelector('#action-buttons') as HTMLElement;
        const stepPhoto = this.element.querySelector('#step-photo') as HTMLElement;

        stepPhoto.classList.add('hidden');
        gridContainer.classList.remove('hidden');
        actionGrid.classList.remove('hidden');

        grid.innerHTML = '';

        // Create 3 placeholder slots
        for (let i = 0; i < 3; i++) {
            const slot = document.createElement('div');
            slot.className = 'avatar-slot';
            slot.id = `avatar-slot-${i}`;
            slot.style.cssText = 'aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;background:rgba(34,45,99,0.08);border-radius:var(--radius-md);border:4px solid transparent;cursor:default;';
            slot.innerHTML = '<div class="capatar-spinner" style="width:32px;height:32px;border-width:3px;"></div>';
            grid.appendChild(slot);
        }

        fadeInUp(actionGrid, { delay: 0.3 });
    }

    /**
     * Update a single grid slot when its image is ready
     */
    private updateGridSlot(index: number, url: string) {
        const slot = this.element.querySelector(`#avatar-slot-${index}`) as HTMLElement;
        if (!slot) return;

        const img = document.createElement('img');
        img.src = url;
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:var(--radius-md);cursor:pointer;transition:all 0.3s ease;opacity:0;';
        img.addEventListener('click', () => this.selectVariation(index));
        img.onload = () => {
            img.style.opacity = '1';
        };

        slot.innerHTML = '';
        slot.style.cursor = 'pointer';
        slot.appendChild(img);
        slot.addEventListener('click', () => this.selectVariation(index));
    }

    private selectVariation(index: number) {
        // Only allow selection if the image is actually loaded
        if (!this.generatedOptions[index] || this.generatedOptions[index].includes('placehold.co')) return;

        this.selectedIndex = index;
        const confirmBtn = this.element.querySelector('#confirm-btn') as HTMLButtonElement;

        // Update all slots
        for (let i = 0; i < 3; i++) {
            const slot = this.element.querySelector(`#avatar-slot-${i}`) as HTMLElement;
            if (!slot) continue;
            const img = slot.querySelector('img');
            if (!img) continue;

            if (i === index) {
                slot.style.borderColor = 'var(--color-sky-blue)';
                slot.style.boxShadow = '0 0 20px rgba(96, 203, 232, 0.4)';
                slot.style.transform = 'scale(1.05)';
                img.style.opacity = '1';
            } else {
                slot.style.borderColor = 'transparent';
                slot.style.boxShadow = 'none';
                slot.style.transform = 'scale(1)';
                img.style.opacity = '0.5';
            }
        }

        confirmBtn.disabled = false;
        confirmBtn.classList.remove('disabled');
    }

    private showLoading(_initialMsg: string) {
        const loader = this.element.querySelector('#loading-state') as HTMLElement;
        const loadingText = this.element.querySelector('#loading-text') as HTMLElement;
        const stepPhoto = this.element.querySelector('#step-photo') as HTMLElement;

        loader.classList.remove('hidden');
        stepPhoto.classList.add('hidden');

        let msgIndex = 0;
        loadingText.textContent = LOADING_MESSAGES[0];
        loadingText.style.transition = 'opacity 0.3s ease';

        if (this.loadingInterval) clearInterval(this.loadingInterval);
        this.loadingInterval = setInterval(() => {
            loadingText.style.opacity = '0';
            setTimeout(() => {
                msgIndex = (msgIndex + 1) % LOADING_MESSAGES.length;
                loadingText.textContent = LOADING_MESSAGES[msgIndex];
                loadingText.style.opacity = '1';
            }, 300);
        }, 2500);
    }

    private hideLoading() {
        const loader = this.element.querySelector('#loading-state') as HTMLElement;
        loader.classList.add('hidden');
        if (this.loadingInterval) {
            clearInterval(this.loadingInterval);
            this.loadingInterval = null;
        }
    }

    private openWebcamModal() {
        const modalContainer = this.element.querySelector('#modal-container') as HTMLElement;
        modalContainer.innerHTML = `
            <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000;">
                <div style="background: var(--color-bg-card); padding: 2rem; border-radius: var(--radius-lg); max-width: 600px; width: 90%;">
                    <h2 style="margin-bottom: 1rem;">Take a Photo</h2>
                    <video id="webcam-video" autoplay playsinline style="width: 100%; border-radius: var(--radius-md); transform: scaleX(-1); background: #000; min-height: 300px;"></video>
                    <canvas id="webcam-canvas" style="display: none;"></canvas>
                    <div style="display: flex; gap: 1rem; justify-content: center; margin-top: 1rem;">
                        <button id="capture-btn" class="btn">Capture</button>
                        <button id="cancel-webcam-btn" class="btn btn-outline">Cancel</button>
                    </div>
                </div>
            </div>
        `;

        const video = modalContainer.querySelector('#webcam-video') as HTMLVideoElement;
        const canvas = modalContainer.querySelector('#webcam-canvas') as HTMLCanvasElement;
        const captureBtn = modalContainer.querySelector('#capture-btn') as HTMLButtonElement;
        const cancelBtn = modalContainer.querySelector('#cancel-webcam-btn') as HTMLButtonElement;

        let stream: MediaStream | null = null;

        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } })
            .then(s => { stream = s; video.srcObject = stream; })
            .catch(err => {
                console.error("Webcam err:", err);
                alert("Could not access webcam.");
                modalContainer.innerHTML = '';
            });

        const stopWebcam = () => {
            stream?.getTracks().forEach(t => t.stop());
            modalContainer.innerHTML = '';
        };

        cancelBtn.addEventListener('click', stopWebcam);

        captureBtn.addEventListener('click', () => {
            if (!video.videoWidth) return;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.translate(canvas.width, 0);
                ctx.scale(-1, 1);
                ctx.drawImage(video, 0, 0);
            }
            canvas.toBlob(async (blob) => {
                if (blob) {
                    stopWebcam();
                    const file = new File([blob], 'webcam.jpg', { type: 'image/jpeg' });
                    await this.processPhotoFile(file);
                }
            }, 'image/jpeg', 0.9);
        });
    }

    public mount() {
        uiManager.renderScreen(this.element);
    }
}
