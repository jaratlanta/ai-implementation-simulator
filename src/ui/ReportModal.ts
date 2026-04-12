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
                        <button class="report-download-btn" title="Download PDF" style="display: flex; align-items: center; gap: 0.5rem; background: rgba(232, 49, 81, 0.1); border: 1px solid rgba(232, 49, 81, 0.3); color: #E83151; padding: 0.4rem 0.75rem; border-radius: 4px; cursor: pointer; font-size: 0.85rem; font-weight: 600; font-family: 'Inter', sans-serif; transition: all 0.2s ease;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            <span>DOWNLOAD PDF</span>
                        </button>
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
        this.overlay.querySelector('.report-download-btn')!.addEventListener('click', () => this.downloadPdf());
        
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

    private downloadPdf() {
        if (!(window as any).html2pdf) {
            console.error('html2pdf is not loaded');
            return;
        }

        const body = this.overlay.querySelector('.report-modal-body') as HTMLElement;
        if (!body) return;

        // Create a wrapper for the PDF purely for styling so it perfectly matches the Meaningful AI Journey layout
        const pdfWrapper = document.createElement('div');
        
        let extractedCompany = 'Meaningful';
        // Try passing the exact table structure the LLM uses for company profile
        const companyMatch = body.innerHTML.match(/Company(?:<\/strong>)?<\/td>\s*<td[^>]*>([^<]+)/i) || body.innerText.match(/Company:\s*([^\n]+)/i);
        if (companyMatch && companyMatch[1].trim() !== '') {
            extractedCompany = companyMatch[1].trim();
            // remove Meaningful AI if it appended it or hallucinated
            if (extractedCompany.toLowerCase().includes('meaningful') && extractedCompany.length > 15) {
                extractedCompany = extractedCompany.replace(/Meaningful\s*AI\s*\/?\s*/i, '');
            }
        }
        
        const coverTitle = extractedCompany.toLowerCase() === 'meaningful' 
            ? 'The Meaningful<br>AI Journey' 
            : `The ${extractedCompany}<br>AI Journey`;
        
        // Massive styling block representing the Meaningful Proposal template
        pdfWrapper.innerHTML = `
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;0,800;1,400;1,600&family=Inter:wght@300;400;500;600;700;800&display=swap');

  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

  /* Add scoped reset to our wrapper */
  .pdf-document { background: #ffffff; font-family: 'Inter', -apple-system, sans-serif; }
  .pdf-document * { color: #1a1a2e; } /* default text reset */

  .page {
    width: 8.5in;
    position: relative; overflow: hidden;
    page-break-after: always;
    background: #ffffff !important;
    box-sizing: border-box;
  }
  .page.cover-page {
    height: 10.95in; min-height: 10.95in; max-height: 10.95in; /* 10.95 avoids double page break trigger */
  }
  .page:last-child { page-break-after: auto; }

  /* ════════════════════════════════════════════════════
     PAGE 1 — COVER
     ════════════════════════════════════════════════════ */
  .cover {
    display: grid;
    grid-template-rows: 1fr;
    grid-template-columns: 1fr;
    height: 100%;
  }

  /* Top white area */
  .cover-top {
    position: absolute; top: 0; left: 0; right: 0; height: 52%;
    padding: 60px 70px;
    display: flex; flex-direction: column;
    z-index: 2;
  }
  .cover-logo { height: 48px; align-self: flex-start; margin-bottom: auto; }
  .cover-eyebrow {
    font-size: 11px; font-weight: 700;
    letter-spacing: 1px; text-transform: uppercase;
    color: #E83151; margin-bottom: 15px;
  }
  .cover-title {
    font-family: 'Playfair Display', serif;
    font-size: 54px; font-weight: 800;
    line-height: 1.05; letter-spacing: -1px;
    color: #222D63; margin-bottom: 12px;
  }
  .cover-subtitle {
    font-family: 'Playfair Display', serif;
    font-size: 18px; font-style: italic; font-weight: 400;
    color: #8892a8; line-height: 1.5;
  }

  /* Navy bottom block */
  .cover-navy {
    position: absolute; bottom: 0; left: 0; right: 0; height: 48%;
    background: #222D63;
    display: flex;
  }
  .cover-navy::before {
    content: '';
    position: absolute; top: 0; left: 0; right: 0; height: 4px;
    background: linear-gradient(90deg, #E83151, #ECBFCD, #60CBE8);
  }

  /* Left info panel inside navy */
  .cover-info {
    flex: 1;
    padding: 50px 70px;
    display: flex; flex-direction: column; justify-content: center;
  }
  .cover-info * { color: #fff; } /* force white text inside info */
  .cover-info-label {
    font-size: 10px; font-weight: 700;
    letter-spacing: 2px; text-transform: uppercase;
    color: #ECBFCD; margin-bottom: 25px;
  }
  .cover-journey-item {
    display: flex; align-items: baseline; gap: 20px;
    margin-bottom: 20px;
  }
  .cover-num {
    font-family: 'Playfair Display', serif;
    font-size: 48px; font-weight: 700;
    color: #60CBE8; line-height: 1;
    min-width: 60px;
  }
  .cover-item-text {
    flex: 1;
  }
  .cover-item-title {
    font-size: 18px; font-weight: 700;
    color: #fff; margin-bottom: 4px;
    letter-spacing: 0.2px;
  }
  .cover-item-desc {
    font-size: 13px; color: rgba(255,255,255,0.6);
    font-style: italic;
  }

  /* Cover footer */
  .cover-footer {
    position: absolute; bottom: 0; left: 0; right: 0;
    padding: 16px 70px;
    display: flex; justify-content: space-between; align-items: center;
    border-top: 1px solid rgba(255,255,255,0.08);
    z-index: 5;
  }
  .cf-ethic {
    font-size: 8px; font-weight: 600;
    letter-spacing: 2px; text-transform: uppercase;
    color: rgba(255,255,255,0.45) !important;
  }
  .cf-contact { text-align: right; }
  .cf-url {
    font-size: 16px; font-weight: 800;
    color: #60CBE8 !important; letter-spacing: 0.3px;
  }
  .cf-detail {
    font-size: 10px; margin-top: 4px; color: rgba(255,255,255,0.55) !important;
  }

  /* ════════════════════════════════════════════════════
     PAGE 2 — EDITORIAL CONTENT
     ════════════════════════════════════════════════════ */
  .editorial {
    display: flex; flex-direction: column; height: auto; min-height: 11in;
  }

  /* Header strip */
  .ed-header {
    background: #222D63;
    padding: 20px 48px;
    display: flex; align-items: center; gap: 24px;
    position: relative;
  }
  .ed-header::after {
    content: ''; position: absolute;
    bottom: 0; left: 0; right: 0; height: 4px;
    background: linear-gradient(90deg, #E83151, #ECBFCD, #60CBE8);
  }
  .ed-logo { height: 36px; }
  .ed-header-text { flex: 1; }
  .ed-eyebrow {
    font-size: 9px; font-weight: 700;
    letter-spacing: 2px; text-transform: uppercase;
    color: #ECBFCD !important; margin-bottom: 4px;
  }
  .ed-title {
    font-family: 'Playfair Display', serif;
    font-size: 24px; font-weight: 700;
    color: #fff !important; letter-spacing: -0.3px;
  }

  /* Page title — in white area below header */
  .ed-page-title {
    padding: 20px 48px 12px;
    border-bottom: 1px solid #f0f0f0;
  }
  .ed-page-title h2 {
    font-family: 'Playfair Display', serif;
    font-size: 26px; font-weight: 700;
    color: #222D63; letter-spacing: -0.3px;
    margin: 0;
  }

  /* Content area */
  .ed-body {
    flex: 1;
    padding: 30px 48px 10px 48px;
    display: flex; flex-direction: column;
  }

  /* DYNAMIC LLM STYLING INSIDE ED-BODY */
  .ed-body * { color: #1a1a2e !important; border-color: #cbd5e1 !important; }
  .ed-body h1, .ed-body h2, .ed-body h3 { 
      font-family: 'Playfair Display', serif !important; 
      color: #222d63 !important; 
      letter-spacing: -0.5px;
      margin-top: 1.5em;
      margin-bottom: 0.5em;
  }
  .ed-body h1 { font-size: 28px; }
  .ed-body h2 { font-size: 22px; }
  .ed-body h3 { font-size: 18px; }
  .ed-body p { 
      font-size: 13px; color: #4a5068 !important; 
      line-height: 1.6; margin-bottom: 14px;
  }
  .ed-body ul, .ed-body ol { padding-left: 20px; margin-bottom: 14px; }
  .ed-body li { 
      font-size: 13px; color: #1a1f36 !important; 
      line-height: 1.65; margin-bottom: 6px;
  }
  .ed-body table { width: 100%; border-collapse: collapse; margin-bottom: 24px; background: #ffffff !important; }
  .ed-body th { 
      background: #f8fafc !important; 
      color: #4A66AC !important; 
      font-weight: 700 !important; 
      font-size: 12px;
      padding: 12px; text-align: left;
      border-bottom: 2px solid #e2e8f0 !important;
  }
  .ed-body td { 
      font-size: 12px; padding: 12px; 
      border-bottom: 1px solid #f0f0f0 !important; 
      background: #ffffff !important;
  }
  .ed-body div { background: transparent !important; box-shadow: none !important; }
  .ed-body pre, .ed-body code { background: #f0f4ff !important; color: #4A66AC !important; padding: 2px 4px; border-radius: 4px; }

  /* Footer — high contrast */
  .ed-footer {
    padding: 16px 48px;
    background: #222D63;
    display: flex; justify-content: space-between; align-items: center;
    margin-top: auto;
  }
  .ef-left {
    font-size: 8px; font-weight: 600;
    letter-spacing: 2px; text-transform: uppercase;
    color: rgba(255,255,255,0.5) !important;
  }
  .ef-right {
    font-size: 12px; font-weight: 800; color: #60CBE8 !important;
  }
</style>

<div class="pdf-document">
  <!-- ══════════ PAGE 1 — COVER ══════════ -->
  <div class="page cover-page">
    <div class="cover">
      <!-- White top half -->
      <div class="cover-top">
        <img src="/brand/logo-horizontal.png" class="cover-logo">
        <div>
          <div class="cover-eyebrow">A Strategic Framework</div>
          <div class="cover-title">${coverTitle}</div>
          <div class="cover-subtitle">From curiosity to capability to transformation.</div>
        </div>
      </div>

      <!-- Navy bottom half -->
      <div class="cover-navy">
        <div class="cover-info">
          <div class="cover-info-label">Phase Breakdown</div>

          <div class="cover-journey-item">
            <div class="cover-num">01</div>
            <div class="cover-item-text">
              <div class="cover-item-title">AI Discovery Brief</div>
              <div class="cover-item-desc">Business alignment and system mapping.</div>
            </div>
          </div>

          <div class="cover-journey-item">
            <div class="cover-num">02</div>
            <div class="cover-item-text">
              <div class="cover-item-title">Strategy Framework</div>
              <div class="cover-item-desc">Evaluating tech stacks and feasibility risks.</div>
            </div>
          </div>

          <div class="cover-journey-item">
            <div class="cover-num">03</div>
            <div class="cover-item-text">
              <div class="cover-item-title">Implementation Plan</div>
              <div class="cover-item-desc">Detailed architecture and vendor recommendations.</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="cover-footer">
        <div style="display: flex; align-items: center; gap: 8px;">
          <img src="/brand/owl-icon.png" style="height: 14px;">
          <div class="cf-ethic">E.T.H.I.C. · Empowerment · Trust · Humanity · Impact · Clarity</div>
        </div>
        <div class="cf-contact">
          <div class="cf-url">bemeaningful.ai</div>
        </div>
      </div>
    </div>
  </div>

  <!-- ══════════ PAGE 2 — EDITORIAL REPORT ══════════ -->
  <div class="page editorial">
    <div class="ed-header">
      <img src="/brand/meaningful-owl-horizontal-reverse.png" class="ed-logo">
      <div class="ed-header-text">
        <div class="ed-eyebrow">FINAL REPORT</div>
      </div>
    </div>

    <div class="ed-page-title">
      <h2>Simulated Architecture Assessment</h2>
    </div>

    <div class="ed-body" id="pdf-dynamic-content">
      <!-- LLM CONTENT CLONED HERE -->
    </div>
    
    <div style="margin: 30px 48px; padding: 20px; border-radius: 8px; background: rgba(232, 49, 81, 0.1); border: 2px dashed rgba(232, 49, 81, 0.4); font-family: 'Inter', sans-serif;">
        <h4 style="margin: 0 0 10px 0; font-weight: 700; text-transform: uppercase; color: #E83151; font-family: 'Inter', sans-serif;">DISCLAIMER & NEXT STEPS</h4>
        <p style="margin: 0; color: #E83151 !important; font-size: 13px; line-height: 1.6; font-family: 'Inter', sans-serif;">This document is an <strong>educational example</strong> generated by an AI Simulator. Do not rely on this for financial or security planning. To build a verified, production-ready AI Implementation Plan with actual ROI models, engineering constraints, and data security policies, please contact the team at Meaningful AI (<a href="https://bemeaningful.ai" style="color: #60CBE8 !important; text-decoration: underline;">bemeaningful.ai</a> | hello@bemeaningful.ai).</p>
    </div>

    <div class="ed-footer">
      <div style="display: flex; align-items: center; gap: 8px;">
        <img src="/brand/owl-icon.png" style="height: 14px;">
        <div class="ef-left">E.T.H.I.C. · Empowerment · Trust · Humanity · Impact · Clarity</div>
      </div>
      <div class="ef-right">bemeaningful.ai</div>
    </div>
  </div>
</div>
`;

        // Clone report body and insert it into our new magazine skeleton
        const reportClone = body.cloneNode(true) as HTMLElement;
        reportClone.style.background = 'transparent';
        reportClone.style.padding = '0';
        reportClone.style.border = 'none';
        reportClone.style.boxShadow = 'none';
        
        const attachPoint = pdfWrapper.querySelector('#pdf-dynamic-content');
        if (attachPoint) {
            attachPoint.appendChild(reportClone);
        }

        // Do not attach pdfWrapper to document.body!
        // html2pdf automatically renders disconnected elements in a hidden iframe perfectly avoiding all scroll/positioning bugs.

        const status = this.overlay.querySelector('.report-copy-status') as HTMLElement;
        status.textContent = 'Generating PDF...';
        
        const opt = {
            margin:       0,
            filename:     'AI_Implementation_Plan_Meaningful.pdf',
            pagebreak:    { mode: ['css', 'legacy'], avoid: ['tr', 'h1', 'h2', 'h3', 'h4', '.ed-page-title', '.ed-header', 'p'] },
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
            jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
        };

        // Trigger export
        (window as any).html2pdf().set(opt).from(pdfWrapper).save().then(() => {
            if(status) {
                status.textContent = 'Download complete!';
                status.classList.add('success');
                setTimeout(() => { status.textContent = ''; status.classList.remove('success'); }, 3000);
            }
        });
    }
}
