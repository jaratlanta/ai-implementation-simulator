import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReportModal } from './ReportModal';

describe('ReportModal', () => {
    let modal: ReportModal;

    beforeEach(() => {
        // Clear DOM
        document.body.innerHTML = '';
        modal = new ReportModal();
        document.body.appendChild(modal.getElement());
    });

    it('should create an overlay element', () => {
        const el = modal.getElement();
        expect(el).toBeTruthy();
        expect(el.className).toBe('report-modal-overlay');
    });

    it('should show modal with regenerate button when onRegenerate is provided', () => {
        const onRegenerate = vi.fn();
        modal.show('Test Title', '<p>Test Content</p>', onRegenerate);

        const el = modal.getElement();
        expect(el.style.display).toBe('flex');
        
        const header = el.querySelector('h2');
        expect(header?.textContent).toBe('Test Title');

        const body = el.querySelector('.report-modal-body');
        expect(body?.innerHTML).toBe('<p>Test Content</p>');

        const regenerateBtn = el.querySelector('.report-regenerate-btn') as HTMLButtonElement;
        expect(regenerateBtn).toBeTruthy();
        
        // Ensure clicking it calls the callback
        regenerateBtn.click();
        expect(onRegenerate).toHaveBeenCalledTimes(1);
    });

    it('should NOT show regenerate button if onRegenerate is missing', () => {
        modal.show('Test Title', '<p>Test Content</p>');

        const el = modal.getElement();
        const regenerateBtn = el.querySelector('.report-regenerate-btn');
        expect(regenerateBtn).toBeNull();
    });

    it('should update content', () => {
        modal.show('Test', '<p>Old</p>');
        modal.updateContent('<p>New</p>');

        const el = modal.getElement();
        const body = el.querySelector('.report-modal-body');
        expect(body?.innerHTML).toBe('<p>New</p>');
    });

    it('should close when clicking the close button', () => {
        modal.show('Test', '<p>Close me</p>');
        const el = modal.getElement();
        
        const closeBtn = el.querySelector('.report-close-btn') as HTMLButtonElement;
        closeBtn.click();

        // Testing the classes
        expect(el.classList.contains('visible')).toBe(false);
    });
});
