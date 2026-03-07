/**
 * content.js
 * Injected into https://mail.google.com/*
 *
 * Responsibilities:
 *  1. Watch for Gmail's "print all" button to appear (in the email thread view)
 *  2. Inject an "Export to Notion" button next to it
 *  3. Scrape the currently open email's subject, sender, date, and body
 *  4. Open the export modal popup and pass email data to it
 */

(function () {
  "use strict";

  // ── Cross-browser compat ──────────────────────────────────────────────────
  const browser = globalThis.browser ?? globalThis.chrome;

  // ── State ──────────────────────────────────────────────────────────────────
  let injectedButton = null;
  let exportModal = null;
  let currentEmailData = null;

  // ── MutationObserver: watch for email thread to open ──────────────────────
  const observer = new MutationObserver(debounce(onDomChange, 400));
  observer.observe(document.body, { childList: true, subtree: true });

  // Run once on load in case the email is already open
  onDomChange();

  // ── DOM change handler ────────────────────────────────────────────────────

  function onDomChange() {
    const printButton = findPrintButton();
    if (printButton) {
      injectNotionButton(printButton);
    } else {
      // Thread closed / navigated away
      if (injectedButton) {
        injectedButton.remove();
        injectedButton = null;
      }
    }
  }

  /**
   * Find Gmail's "Print all" button.
   * Gmail renders it as a <button aria-label="Print all"> inside the thread view.
   */
  function findPrintButton() {
    // Primary selector: aria-label
    let btn = document.querySelector('button[aria-label="Print all"]');
    if (btn) return btn;

    // Fallback: look for the print SVG path pattern
    const buttons = document.querySelectorAll("button");
    for (const b of buttons) {
      if (b.getAttribute("aria-label")?.toLowerCase().includes("print")) return b;
    }
    return null;
  }

  /**
   * Inject the "Export to Notion" button directly to the left of the print button.
   */
  function injectNotionButton(printButton) {
    // Avoid double-injection
    if (injectedButton && document.body.contains(injectedButton)) return;

    const btn = document.createElement("button");
    btn.id = "email-to-notion-btn";
    btn.className = "email-to-notion-btn";
    btn.title = "Export to Notion";
    btn.setAttribute("aria-label", "Export to Notion");
    btn.innerHTML = `
      <span class="etn-icon" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.373.466l1.822 1.447zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279V9.107l-1.215-.14c-.093-.514.28-.887.747-.933l3.222-.187z" fill="currentColor"/>
        </svg>
      </span>
      <span class="etn-label">Export to Notion</span>
    `;

    btn.addEventListener("click", handleButtonClick);

    // Insert before the print button
    printButton.parentNode.insertBefore(btn, printButton);
    injectedButton = btn;
  }

  // ── Button click ──────────────────────────────────────────────────────────

  function handleButtonClick(e) {
    e.stopPropagation();
    e.preventDefault();

    currentEmailData = scrapeEmailData();
    openExportModal(currentEmailData);
  }

  // ── Email scraping ────────────────────────────────────────────────────────

  /**
   * Scrape the currently-open Gmail email thread.
   * Returns { subject, sender, senderEmail, date, body }
   */
  function scrapeEmailData() {
    const data = {
      subject: "",
      sender: "",
      senderEmail: "",
      date: new Date().toISOString().slice(0, 10),
      body: "",
    };

    // --- Subject ---
    // Gmail renders subject in h2.hP
    const subjectEl = document.querySelector("h2.hP");
    if (subjectEl) data.subject = subjectEl.textContent.trim();

    // --- Sender ---
    // The expanded email header has <span email="..." name="...">
    const senderSpan = document.querySelector(
      'span[email].gD, .iw span[email], .gFxsud span[email]'
    );
    if (senderSpan) {
      data.sender = senderSpan.getAttribute("name") || senderSpan.textContent.trim();
      data.senderEmail = senderSpan.getAttribute("email") || "";
    }

    // --- Date ---
    // Gmail's date tooltip: <span title="..."> inside .g3
    const dateEl = document.querySelector(".g3 span[title], .ads span[title], span.rr3emy span");
    if (dateEl) {
      const raw = dateEl.getAttribute("title") || dateEl.textContent.trim();
      // Try to parse into ISO date
      const parsed = parseDateString(raw);
      if (parsed) data.date = parsed;
    }

    // --- Body ---
    // The message body lives inside .a3s.aiL (Gmail's main message container)
    // There may be multiple (thread), we take the last (most recent) non-quoted one
    const bodyEls = document.querySelectorAll(".a3s.aiL, .a3s.aXjCH");
    if (bodyEls.length > 0) {
      // Use the last expanded message in the thread
      const lastBody = bodyEls[bodyEls.length - 1];
      data.body = extractTextFromBody(lastBody);
    }

    return data;
  }

  /**
   * Extract clean plain text from a Gmail body element,
   * stripping quoted reply sections.
   */
  function extractTextFromBody(el) {
    // Clone so we can mutate without affecting the DOM
    const clone = el.cloneNode(true);

    // Remove quoted sections (.gmail_quote)
    clone.querySelectorAll(".gmail_quote, blockquote").forEach((q) => q.remove());
    // Remove hidden elements
    clone.querySelectorAll('[style*="display:none"], [style*="display: none"]').forEach((h) => h.remove());

    // Convert <br> to newlines
    clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
    // Convert block elements to newlines
    clone.querySelectorAll("p, div, li, tr").forEach((block) => {
      block.prepend("\n");
    });

    return clone.textContent
      .replace(/\n{3,}/g, "\n\n") // collapse excessive newlines
      .trim();
  }

  /**
   * Attempt to parse various date string formats from Gmail into ISO YYYY-MM-DD.
   */
  function parseDateString(raw) {
    try {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) {
        return d.toISOString().slice(0, 10);
      }
    } catch (_) {/* ignore */}
    return null;
  }

  // ── Export Modal ──────────────────────────────────────────────────────────

  /**
   * Open a modal overlay inside the Gmail page for the export UI.
   * The markup is loaded from modal/modal.html (a web-accessible resource),
   * keeping JS and HTML cleanly separated.
   */
  function openExportModal(emailData) {
    // Remove existing modal
    if (exportModal) exportModal.remove();

    const overlay = document.createElement("div");
    overlay.id = "etn-modal-overlay";
    overlay.className = "etn-modal-overlay";

    // ETN_MODAL_TEMPLATE is injected by modal/modal-template.js (loaded before
    // this script in the manifest), keeping the HTML separate without any
    // runtime file fetching — which is blocked in Firefox MV2 content scripts.
    let html = ETN_MODAL_TEMPLATE; // eslint-disable-line no-undef

    // Substitute runtime values into the template placeholders
    const senderStr = emailData.sender
      ? escapeHtml(emailData.sender) +
        (emailData.senderEmail ? ` &lt;${escapeHtml(emailData.senderEmail)}&gt;` : "")
      : "Unknown";

    html = html
      .replace("{{subject}}", escapeHtml(emailData.subject || "(No Subject)"))
      .replace("{{sender}}",  senderStr)
      .replace("{{date}}",    escapeHtml(emailData.date || ""));

    overlay.innerHTML = html;
    document.body.appendChild(overlay);
    exportModal = overlay;

    // Close on backdrop click
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal();
    });

    // Wire up close button
    overlay.querySelector("#etn-close-btn").addEventListener("click", closeModal);

    // Escape key
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        closeModal();
        document.removeEventListener("keydown", onKeyDown);
      }
    };
    document.addEventListener("keydown", onKeyDown);

    // Load databases and set up form logic (async, runs in background)
    initModalLogic(overlay, emailData);
  }

  function closeModal() {
    if (exportModal) {
      exportModal.remove();
      exportModal = null;
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ── Modal logic ───────────────────────────────────────────────────────────

  async function initModalLogic(overlay, emailData) {
    const spinner = overlay.querySelector("#etn-spinner");
    const authSection = overlay.querySelector("#etn-auth-section");
    const formSection = overlay.querySelector("#etn-form-section");
    const footer = overlay.querySelector("#etn-footer");

    showSpinner(spinner);

    // Check auth
    const authResp = await sendMessage({ type: "GET_AUTH_STATUS" });
    hideSpinner(spinner);

    if (!authResp.ok || !authResp.data.authenticated) {
      authSection.style.display = "";
      overlay.querySelector("#etn-auth-btn").addEventListener("click", async () => {
        showSpinner(spinner);
        authSection.style.display = "none";
        const result = await sendMessage({ type: "START_OAUTH" });
        hideSpinner(spinner);
        if (result.ok) {
          initModalLogic(overlay, emailData);
        } else {
          authSection.style.display = "";
          setStatus(overlay, `Auth failed: ${result.error}`, "error");
        }
      });
      return;
    }

    // Authenticated – show form
    formSection.style.display = "";
    footer.style.display = "";

    // Load databases
    await loadDatabases(overlay);

    // Refresh button
    overlay.querySelector("#etn-refresh-db").addEventListener("click", () => loadDatabases(overlay));

    // Cancel
    overlay.querySelector("#etn-cancel-btn").addEventListener("click", closeModal);

    // Export
    overlay.querySelector("#etn-export-btn").addEventListener("click", () => handleExport(overlay, emailData));

    // Load saved default options
    loadSavedOptions(overlay);
  }

  async function loadDatabases(overlay) {
    const select = overlay.querySelector("#etn-db-select");
    select.innerHTML = '<option value="">Loading…</option>';
    select.disabled = true;
    setStatus(overlay, "", "");

    const result = await sendMessage({ type: "LIST_DATABASES" });
    if (!result.ok) {
      select.innerHTML = '<option value="">Failed to load databases</option>';
      setStatus(overlay, `Could not load databases: ${result.error}`, "error");
      select.disabled = false;
      return;
    }

    const databases = result.data ?? [];

    if (databases.length === 0) {
      select.innerHTML = '<option value="">No databases found — check integration permissions</option>';
      setStatus(overlay, "No databases accessible. Make sure your Notion integration has been added to at least one database.", "error");
      select.disabled = false;
      return;
    }

    select.innerHTML = '<option value="">— Select a database —</option>';
    for (const db of databases) {
      // Notion search results: title is an array of rich_text objects
      const name =
        db.title?.[0]?.plain_text ||
        db.title?.[0]?.text?.content ||
        (Array.isArray(db.title) && db.title.map((t) => t.plain_text ?? t.text?.content ?? "").join("")) ||
        db.id;
      const opt = document.createElement("option");
      opt.value = db.id;
      opt.textContent = name.trim() || `Untitled (${db.id.slice(0, 8)}…)`;
      select.appendChild(opt);
    }
    select.disabled = false;

    // Restore saved default
    browser.storage.local.get(["defaultDatabaseId"], ({ defaultDatabaseId }) => {
      if (defaultDatabaseId) select.value = defaultDatabaseId;
    });
  }

  async function loadSavedOptions(overlay) {
    browser.storage.local.get(["defaultOptions"], ({ defaultOptions }) => {
      if (!defaultOptions) return;
      const { includeSubject, includeSender, includeDate, includeBody } = defaultOptions;
      if (typeof includeSubject === "boolean") overlay.querySelector("#etn-opt-subject").checked = includeSubject;
      if (typeof includeSender === "boolean") overlay.querySelector("#etn-opt-sender").checked = includeSender;
      if (typeof includeDate === "boolean") overlay.querySelector("#etn-opt-date").checked = includeDate;
      if (typeof includeBody === "boolean") overlay.querySelector("#etn-opt-body").checked = includeBody;
    });
  }

  async function handleExport(overlay, emailData) {
    const databaseId = overlay.querySelector("#etn-db-select").value;
    if (!databaseId) {
      setStatus(overlay, "Please select a database.", "error");
      return;
    }

    const options = {
      includeSubject: overlay.querySelector("#etn-opt-subject").checked,
      includeSender: overlay.querySelector("#etn-opt-sender").checked,
      includeDate: overlay.querySelector("#etn-opt-date").checked,
      includeBody: overlay.querySelector("#etn-opt-body").checked,
    };

    const exportBtn = overlay.querySelector("#etn-export-btn");
    const exportBtnText = overlay.querySelector("#etn-export-btn-text");
    exportBtn.disabled = true;
    exportBtnText.textContent = "Exporting…";
    setStatus(overlay, "", "");

    const result = await sendMessage({
      type: "EXPORT_EMAIL",
      databaseId,
      emailData,
      options,
    });

    exportBtn.disabled = false;
    exportBtnText.textContent = "Export";

    if (result.ok) {
      const pageUrl = result.data?.url;
      setStatus(
        overlay,
        pageUrl
          ? `✓ Exported! <a href="${pageUrl}" target="_blank" rel="noopener">Open in Notion</a>`
          : "✓ Successfully exported to Notion!",
        "success"
      );
      // Save last-used database as default
      browser.storage.local.set({ defaultDatabaseId: databaseId, defaultOptions: options });
    } else {
      setStatus(overlay, `✗ Export failed: ${result.error}`, "error");
    }
  }

  function setStatus(overlay, html, type) {
    const statusEl = overlay.querySelector("#etn-status");
    statusEl.innerHTML = html;
    statusEl.className = `etn-status${type ? ` etn-status-${type}` : ""}`;
  }

  function showSpinner(spinner) { spinner.style.display = "flex"; }
  function hideSpinner(spinner) { spinner.style.display = "none"; }

  // ── Messaging ─────────────────────────────────────────────────────────────

  function sendMessage(msg) {
    return new Promise((resolve) => {
      browser.runtime.sendMessage(msg, (response) => {
        if (browser.runtime.lastError) {
          resolve({ ok: false, error: browser.runtime.lastError.message });
        } else {
          resolve(response ?? { ok: false, error: "No response" });
        }
      });
    });
  }

  // ── Utilities ──────────────────────────────────────────────────────────────

  function debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }
})();
