// src/scripts/app.ts — Phase 3 client island: form validation, in-flight guard,
// simulated progress, fetch + error taxonomy, and card rendering.
// Self-contained: no runtime imports from ../lib (avoids any risk of bundling zod).

// ---------------------------------------------------------------------------
// Local type shape (byte-identical to src/lib/types.ts VideoIdea/Intent/ErrorCode)
// ---------------------------------------------------------------------------
type Intent = 'informational' | 'how-to' | 'commercial' | 'comparison';
interface VideoIdea {
  id: string;
  title: string;
  intent: Intent;
  rationale: string;
}
type ErrorCode = 'VALIDATION' | 'NO_RESULTS' | 'RATE_LIMITED' | 'UPSTREAM_ERROR' | 'INTERNAL';

// ---------------------------------------------------------------------------
// Element handles (queried once; module is deferred, DOM exists by run time)
// ---------------------------------------------------------------------------
const form = document.getElementById('generate-form') as HTMLFormElement | null;
const keywordInput = document.getElementById('keyword') as HTMLInputElement | null;
const generateBtn = document.getElementById('generate-btn') as HTMLButtonElement | null;
const inputErrorEl = document.getElementById('input-error');
const progressEl = document.getElementById('progress');
const progressLabelEl = document.getElementById('progress-label');
const errorEl = document.getElementById('error');
const resultsEl = document.getElementById('results');

if (
  !form ||
  !keywordInput ||
  !generateBtn ||
  !inputErrorEl ||
  !progressEl ||
  !progressLabelEl ||
  !errorEl ||
  !resultsEl
) {
  console.error('app.ts: one or more required DOM elements are missing; aborting client island init.');
} else {
  initApp(form, keywordInput, generateBtn, inputErrorEl, progressEl, progressLabelEl, errorEl, resultsEl);
}

function initApp(
  form: HTMLFormElement,
  keywordInput: HTMLInputElement,
  generateBtn: HTMLButtonElement,
  inputErrorEl: HTMLElement,
  progressEl: HTMLElement,
  progressLabelEl: HTMLElement,
  errorEl: HTMLElement,
  resultsEl: HTMLElement,
) {
  // -------------------------------------------------------------------------
  // Region helpers — Tailwind's `hidden` class is the single source of truth
  // -------------------------------------------------------------------------
  function show(el: HTMLElement) {
    el.classList.remove('hidden');
  }
  function hide(el: HTMLElement) {
    el.classList.add('hidden');
  }

  // -------------------------------------------------------------------------
  // Inline validation (INPUT-02)
  // -------------------------------------------------------------------------
  function showInlineError(msg: string) {
    inputErrorEl.textContent = msg;
    show(inputErrorEl);
  }
  function clearInlineError() {
    inputErrorEl.textContent = '';
    hide(inputErrorEl);
  }

  // -------------------------------------------------------------------------
  // Simulated progress (UI-02) — client-side timed labels, not real streaming
  // -------------------------------------------------------------------------
  let progressTimers: number[] = [];

  function startProgress() {
    hide(errorEl);
    hide(resultsEl);
    show(progressEl);
    progressLabelEl.textContent = 'Searching pages...'; // 0ms, synchronous
    progressTimers.push(
      window.setTimeout(() => {
        progressLabelEl.textContent = 'Analyzing content...';
      }, 4000),
    );
    progressTimers.push(
      window.setTimeout(() => {
        progressLabelEl.textContent = 'Generating ideas...';
      }, 9000),
    );
    progressTimers.push(
      window.setTimeout(() => {
        progressLabelEl.textContent = 'Almost done...';
      }, 16000),
    );
    // No further timers scheduled — hold on "Almost done..." until the real
    // response lands (covers the ~13-25s tail and rare slow-function cases).
  }

  function stopProgress() {
    progressTimers.forEach((id) => clearTimeout(id));
    progressTimers = [];
    hide(progressEl);
  }

  // -------------------------------------------------------------------------
  // Error taxonomy (UI-03)
  // -------------------------------------------------------------------------
  function mapError(code: ErrorCode | string | undefined, backendMessage: string | undefined): string {
    switch (code) {
      case 'VALIDATION':
        return backendMessage && backendMessage.trim().length > 0
          ? backendMessage
          : 'Please enter a valid keyword.';
      case 'NO_RESULTS':
        return 'No results found for that keyword — try a broader or different term.';
      case 'RATE_LIMITED':
        return 'This tool hit a free-tier rate limit — please try again in a bit.';
      case 'UPSTREAM_ERROR':
        return 'Something went wrong generating ideas — please try again.';
      case 'INTERNAL':
        return 'Something unexpected went wrong — please try again.';
      default:
        return 'Something unexpected went wrong — please try again.';
    }
  }

  function showError(msg: string) {
    stopProgress();
    hide(resultsEl);
    errorEl.textContent = msg;
    show(errorEl);
  }

  // -------------------------------------------------------------------------
  // Card rendering (UI-01, UI-04)
  // -------------------------------------------------------------------------
  let currentIdeas: VideoIdea[] = [];
  let currentKeyword = '';

  const INTENT_BADGE_CLASSES: Record<Intent, string> = {
    informational: 'bg-blue-100 text-blue-800',
    'how-to': 'bg-green-100 text-green-800',
    commercial: 'bg-purple-100 text-purple-800',
    comparison: 'bg-amber-100 text-amber-800',
  };

  function buildCard(idea: VideoIdea): HTMLElement {
    const article = document.createElement('article');
    article.className = 'rounded-lg border border-gray-200 bg-white p-4 shadow-sm';
    article.dataset.id = idea.id;

    const header = document.createElement('div');
    header.className = 'flex items-start justify-between gap-2';

    const title = document.createElement('h3');
    title.className = 'font-semibold text-gray-900';
    title.textContent = idea.title;

    const badge = document.createElement('span');
    badge.className = `shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${INTENT_BADGE_CLASSES[idea.intent]}`;
    badge.textContent = idea.intent;

    header.appendChild(title);
    header.appendChild(badge);

    const rationale = document.createElement('p');
    rationale.className = 'mt-2 text-sm text-gray-600';
    rationale.textContent = idea.rationale;

    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-one mt-3 text-sm text-blue-600 hover:underline';
    copyBtn.type = 'button';
    copyBtn.textContent = 'Copy';
    copyBtn.dataset.id = idea.id;

    article.appendChild(header);
    article.appendChild(rationale);
    article.appendChild(copyBtn);

    return article;
  }

  function renderCards(ideas: VideoIdea[]) {
    stopProgress();
    hide(errorEl);
    currentIdeas = ideas; // currentKeyword is set in the submit handler before this runs
    resultsEl.replaceChildren();

    const toolbar = buildExportToolbar();
    resultsEl.appendChild(toolbar);

    for (const idea of ideas) {
      resultsEl.appendChild(buildCard(idea));
    }
    show(resultsEl);
  }

  // -------------------------------------------------------------------------
  // Submit handler (INPUT-01 + INPUT-03)
  // -------------------------------------------------------------------------
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); // stop full-page nav; Enter and click both route here
    const keyword = keywordInput.value.trim();
    if (keywordInput.value.trim().length < 3) {
      // INPUT-02: mirrors backend z.string().trim().min(3)
      showInlineError('Keyword must be at least 3 characters');
      return; // NO network request
    }
    clearInlineError();
    currentKeyword = keyword;
    generateBtn.disabled = true; // INPUT-03: set synchronously BEFORE await
    startProgress(); // UI-02
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }, // REQUIRED
        body: JSON.stringify({ keyword }),
      });
      const data = await res.json(); // body is { ideas } or { error:{code,message} } — always JSON
      if (!res.ok) {
        showError(mapError(data.error?.code, data.error?.message));
        return;
      }
      renderCards(data.ideas as VideoIdea[]);
    } catch {
      showError("Can't reach the server — check your connection and try again."); // fetch threw, no response
    } finally {
      stopProgress(); // clears timers even on the success path
      generateBtn.disabled = false; // re-enable on BOTH success and failure
    }
  });

  // =========================================================================
  // Export actions (EXPORT-01/02/03)
  // =========================================================================

  // -------------------------------------------------------------------------
  // Clipboard helper (native async Clipboard API)
  // -------------------------------------------------------------------------
  async function copyText(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  function flashButtonLabel(btn: HTMLButtonElement, success: boolean) {
    const original = btn.textContent;
    btn.textContent = success ? 'Copied!' : 'Copy failed';
    setTimeout(() => {
      btn.textContent = original;
    }, 1500);
  }

  // -------------------------------------------------------------------------
  // EXPORT-03 — copy a single idea (event delegation on #results)
  // -------------------------------------------------------------------------
  resultsEl.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const copyOneBtn = target.closest('.copy-one') as HTMLButtonElement | null;
    if (!copyOneBtn) return;
    const id = copyOneBtn.dataset.id;
    const idea = currentIdeas.find((i) => i.id === id);
    if (!idea) return;
    const text = `${idea.title}\nIntent: ${idea.intent}\n${idea.rationale}`;
    const ok = await copyText(text);
    flashButtonLabel(copyOneBtn, ok);
  });

  // -------------------------------------------------------------------------
  // Export toolbar — built once per renderCards call, prepended above cards
  // -------------------------------------------------------------------------
  function buildExportToolbar(): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.className = 'flex flex-wrap gap-2 mb-2';

    const copyAllBtn = document.createElement('button');
    copyAllBtn.id = 'copy-all';
    copyAllBtn.type = 'button';
    copyAllBtn.className = 'rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100';
    copyAllBtn.textContent = 'Copy all (Markdown)';
    copyAllBtn.addEventListener('click', async () => {
      const markdown = buildMarkdown(currentKeyword, currentIdeas);
      const ok = await copyText(markdown);
      flashButtonLabel(copyAllBtn, ok);
    });

    const downloadBtn = document.createElement('button');
    downloadBtn.id = 'download-json';
    downloadBtn.type = 'button';
    downloadBtn.className = 'rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100';
    downloadBtn.textContent = 'Download JSON';
    downloadBtn.addEventListener('click', () => {
      const slug = currentKeyword
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const filename = slug ? `youtube-ideas-${slug}.json` : 'youtube-ideas.json';
      downloadJSON({ keyword: currentKeyword, ideas: currentIdeas }, filename);
    });

    toolbar.appendChild(copyAllBtn);
    toolbar.appendChild(downloadBtn);
    return toolbar;
  }

  // -------------------------------------------------------------------------
  // EXPORT-01 — copy all ideas as markdown
  // -------------------------------------------------------------------------
  function buildMarkdown(keyword: string, ideas: VideoIdea[]): string {
    const items = ideas
      .map(
        (idea, i) =>
          `${i + 1}. **${idea.title}**\n   - Intent: ${idea.intent}\n   - ${idea.rationale}`,
      )
      .join('\n\n');
    return `# YouTube video ideas for "${keyword}"\n\n${items}`;
  }

  // -------------------------------------------------------------------------
  // EXPORT-02 — download all results as JSON
  // -------------------------------------------------------------------------
  function downloadJSON(data: unknown, filename: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url); // memory hygiene — do NOT skip
  }
}
