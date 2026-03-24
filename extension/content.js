/**
 * content.js
 * Injected into https://mail.google.com/*
 *
 * Responsibilities:
 *  1. Scrape the currently open email's subject, sender, date, and body
 *  2. Respond to SCRAPE_EMAIL messages from the extension popup
 */

(function () {
  "use strict";

  const browser = globalThis.browser ?? globalThis.chrome;

  // ── Message listener ──────────────────────────────────────────────────────

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "SCRAPE_EMAIL") {
      try {
        const data = scrapeEmailData(message.bodyMode || "last");
        if (!data) {
          sendResponse({ ok: false, error: "No email found. Open an email in Gmail." });
        } else {
          sendResponse({ ok: true, data });
        }
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    }
    return false; // synchronous response
  });

  // ── Email scraping ────────────────────────────────────────────────────────

  /**
   * Scrape the currently-open Gmail email thread.
   * @param {string} bodyMode  "last" = just the latest message, "full" = entire thread
   * @returns {{ subject: string, sender: string, senderEmail: string, date: string, body: string } | null}
   */
  function scrapeEmailData(bodyMode) {
    // Detect whether an email is open
    const subjectEl = document.querySelector("h2.hP");
    const bodyEls = document.querySelectorAll(
      ".a3s.aiL, .a3s.aXjCH, .ii.gt .a3s, .a3s"
    );

    if (!subjectEl && bodyEls.length === 0) {
      return null; // no email thread is open
    }

    const data = {
      subject: "",
      sender: "",
      senderEmail: "",
      date: new Date().toISOString().slice(0, 10),
      body: "",
    };

    // --- Subject ---
    if (subjectEl) data.subject = subjectEl.textContent.trim();

    // --- Sender ---
    const senderSpan =
      document.querySelector('span[email].gD') ||
      document.querySelector('.iw span[email]') ||
      document.querySelector('.gFxsud span[email]') ||
      document.querySelector('.cf.gt span[email]') ||
      document.querySelector('.go span[email]') ||
      document.querySelector('.h7 span[email], .bA4 span[email], [email].g2');
    if (senderSpan) {
      data.sender = senderSpan.getAttribute("name") || senderSpan.textContent.trim();
      data.senderEmail = senderSpan.getAttribute("email") || "";
    } else {
      const anyEmailSpan = document.querySelector('span[email]');
      if (anyEmailSpan) {
        data.sender = anyEmailSpan.getAttribute("name") || anyEmailSpan.textContent.trim();
        data.senderEmail = anyEmailSpan.getAttribute("email") || "";
      }
    }

    // --- Date ---
    const dateEl = document.querySelector(".g3 span[title], .ads span[title], span.rr3emy span");
    if (dateEl) {
      const raw = dateEl.getAttribute("title") || dateEl.textContent.trim();
      const parsed = parseDateString(raw);
      if (parsed) data.date = parsed;
    }

    // --- Body ---
    if (bodyMode === "full") {
      // Collect every message body in the thread (each with its own quotes stripped
      // to avoid duplicating content that also appears in earlier messages).
      const bodies = [];
      for (const el of bodyEls) {
        const text = extractTextFromBody(el, true);
        if (text.length > 0) bodies.push(text);
      }
      data.body = bodies.join("\n\n---\n\n");
    } else {
      // "last" mode: get the last non-empty message body, stripping quoted sections
      for (let i = bodyEls.length - 1; i >= 0; i--) {
        const text = extractTextFromBody(bodyEls[i], true);
        if (text.length > 0) {
          data.body = text;
          break;
        }
      }
    }

    return data;
  }

  /**
   * Extract clean plain text from a Gmail body element.
   * @param {Element} el           The body container element
   * @param {boolean} stripQuotes  Whether to remove .gmail_quote / blockquote
   */
  function extractTextFromBody(el, stripQuotes) {
    const clone = el.cloneNode(true);

    if (stripQuotes) {
      clone.querySelectorAll(".gmail_quote, blockquote").forEach((q) => q.remove());
    }
    clone.querySelectorAll('[style*="display:none"], [style*="display: none"]').forEach((h) => h.remove());

    clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
    clone.querySelectorAll("p, div, li, tr").forEach((block) => {
      block.prepend("\n");
    });

    return clone.textContent
      .replace(/\n{3,}/g, "\n\n")
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
})();
