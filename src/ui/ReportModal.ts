/**
 * Report Modal — full-screen modal showing phase completion reports
 * with copy-to-clipboard functionality
 */

export class ReportModal {
    private overlay: HTMLElement;

    constructor() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'report-modal-overlay';
        this.overlay.style.display = 'none';
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.hide();
        });
    }

    public getElement(): HTMLElement {
        return this.overlay;
    }

    /**
     * Show the modal with a report title and HTML content
     */
    public show(title: string, htmlContent: string, onRegenerate?: () => void) {
        const regenerateBtnHtml = onRegenerate ? `
            <button class="report-regenerate-btn" title="Regenerate Plan from Chat History" style="display: flex; align-items: center; gap: 0.5rem; background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.3); color: #38bdf8; padding: 0.4rem 0.75rem; border-radius: 4px; cursor: pointer; font-size: 0.85rem; font-weight: 600; font-family: 'Inter', sans-serif; transition: all 0.2s ease;">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.13 15.57a9 9 0 1 0 3.87-11.1l4 2.53"/></svg>
                <span>REGENERATE PLAN</span>
            </button>
        ` : '';

        this.overlay.innerHTML = `
            <div class="report-modal">
                <div class="report-modal-header">
                    <h2>${title}</h2>
                    <div class="report-modal-actions">
                        ${regenerateBtnHtml}
                        <button class="report-copy-btn" title="Copy to clipboard">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            <span>Copy</span>
                        </button>
                        <button class="report-close-btn" title="Close">&times;</button>
                    </div>
                </div>
                <div class="report-modal-body">${htmlContent}</div>
                <div class="report-modal-footer">
                    <span class="report-copy-status"></span>
                </div>
            </div>
        `;

        this.overlay.querySelector('.report-close-btn')!.addEventListener('click', () => this.hide());
        this.overlay.querySelector('.report-copy-btn')!.addEventListener('click', () => this.copyToClipboard());
        
        if (onRegenerate) {
            this.overlay.querySelector('.report-regenerate-btn')?.addEventListener('click', () => {
                onRegenerate();
            });
        }

        this.overlay.style.display = 'flex';
        requestAnimationFrame(() => this.overlay.classList.add('visible'));
    }

    public updateContent(htmlContent: string) {
        const body = this.overlay.querySelector('.report-modal-body');
        if (body) {
            body.innerHTML = htmlContent;
        }
    }

    public hide() {
        this.overlay.classList.remove('visible');
        setTimeout(() => { this.overlay.style.display = 'none'; }, 300);
    }

    private async copyToClipboard() {
        const body = this.overlay.querySelector('.report-modal-body') as HTMLElement;
        const status = this.overlay.querySelector('.report-copy-status') as HTMLElement;
        if (!body || !status) return;

        try {
            const html = body.innerHTML;
            const text = body.innerText;

            if (navigator.clipboard && (navigator.clipboard as any).write) {
                const blob = new Blob([html], { type: 'text/html' });
                const textBlob = new Blob([text], { type: 'text/plain' });
                await (navigator.clipboard as any).write([
                    new ClipboardItem({ 'text/html': blob, 'text/plain': textBlob })
                ]);
            } else {
                await navigator.clipboard.writeText(text);
            }

            status.textContent = 'Copied to clipboard!';
            status.classList.add('success');
            setTimeout(() => { status.textContent = ''; status.classList.remove('success'); }, 3000);
        } catch {
            // Fallback: select text
            const range = document.createRange();
            range.selectNodeContents(body);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
            status.textContent = 'Text selected \u2014 press Ctrl+C to copy';
        }
    }
}
