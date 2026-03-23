/**
 * popup.js
 * Extension popup – primary export UI.
 * Handles: auth status, email scraping (via content script), database selection,
 * property mapping, body mode, and exporting.
 */

(function () {
  "use strict";

  const browser = globalThis.browser ?? globalThis.chrome;

  // ── Constants ──────────────────────────────────────────────────────────────

  /** Sentinel value used in the Body mapping dropdown for "page body (blocks)". */
  const PAGE_BODY_TARGET = "__page_body__";

  // ── State ─────────────────────────────────────────────────────────────────

  let currentEmailData = null;
  let currentDbProperties = null;
  let currentTabId = null;

  // ── DOM refs ──────────────────────────────────────────────────────────────

  const stateLoading  = document.getElementById("state-loading");
  const stateNotAuth  = document.getElementById("state-not-auth");
  const stateNotGmail = document.getElementById("state-not-gmail");
  const stateNoEmail  = document.getElementById("state-no-email");
  const stateExport   = document.getElementById("state-export");

  const dbSelect       = document.getElementById("db-select");
  const mappingSection = document.getElementById("mapping-section");
  const exportBtn      = document.getElementById("export-btn");
  const exportStatus   = document.getElementById("export-status");
  const disconnectLink = document.getElementById("disconnect-link");

  // ── Messaging helpers ─────────────────────────────────────────────────────

  function sendBgMessage(msg) {
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

  function sendTabMessage(tabId, msg) {
    return new Promise((resolve) => {
      browser.tabs.sendMessage(tabId, msg, (response) => {
        if (browser.runtime.lastError) {
          resolve({ ok: false, error: browser.runtime.lastError.message });
        } else {
          resolve(response ?? { ok: false, error: "No response from content script" });
        }
      });
    });
  }

  function getStorage(keys) {
    return new Promise((resolve) => {
      browser.storage.local.get(keys, (result) => {
        resolve(result ?? {});
      });
    });
  }

  // ── UI helpers ────────────────────────────────────────────────────────────

  function showState(name) {
    stateLoading.style.display  = "none";
    stateNotAuth.style.display  = "none";
    stateNotGmail.style.display = "none";
    stateNoEmail.style.display  = "none";
    stateExport.style.display   = "none";
    const el = document.getElementById(`state-${name}`);
    if (el) el.style.display = "";
  }

  function setWorkspaceName(name) {
    document.querySelectorAll(".ws-name").forEach((el) => { el.textContent = name || "Notion"; });
  }

  function setExportStatus(html, type) {
    exportStatus.innerHTML = html;
    exportStatus.className = `export-status${type ? ` ${type}` : ""}`;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function openOptions() {
    browser.runtime.openOptionsPage?.() ??
      browser.tabs.create({ url: browser.runtime.getURL("options/options.html") });
    window.close();
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  async function init() {
    showState("loading");

    // 1. Check auth
    const auth = await sendBgMessage({ type: "GET_AUTH_STATUS" });
    if (!auth.ok || !auth.data.authenticated) {
      showState("not-auth");
      return;
    }

    setWorkspaceName(auth.data.workspaceName);
    disconnectLink.style.display = "";

    // 2. Get the active tab
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs?.[0];
    if (!tab?.url?.startsWith("https://mail.google.com")) {
      showState("not-gmail");
      return;
    }

    currentTabId = tab.id;

    // 3. Load defaults before scraping so we know the body mode
    const stored = await getStorage(["defaultOptions", "defaultPropertyMappings", "defaultDatabaseId"]);
    const defaultBodyMode = stored.defaultOptions?.bodyMode || "last";

    // Set body mode radio
    const bodyRadio = document.querySelector(`input[name="body-mode"][value="${defaultBodyMode}"]`);
    if (bodyRadio) bodyRadio.checked = true;

    // 4. Scrape the email
    const scrapeResult = await sendTabMessage(currentTabId, {
      type: "SCRAPE_EMAIL",
      bodyMode: defaultBodyMode,
    });

    if (!scrapeResult?.ok || !scrapeResult.data) {
      showState("no-email");
      return;
    }

    currentEmailData = scrapeResult.data;
    currentEmailData._bodyMode = defaultBodyMode;

    // 5. Show export UI
    showEmailPreview(currentEmailData);
    showState("export");

    // 6. Load databases
    await loadDatabases(stored.defaultDatabaseId);
  }

  // ── Email preview ─────────────────────────────────────────────────────────

  function showEmailPreview(data) {
    document.getElementById("preview-subject").textContent = data.subject || "(No Subject)";
    const senderStr = data.sender
      ? data.sender + (data.senderEmail ? ` <${data.senderEmail}>` : "")
      : "Unknown";
    document.getElementById("preview-sender").textContent = senderStr;
    document.getElementById("preview-date").textContent = data.date || "–";
  }

  // ── Database loading ──────────────────────────────────────────────────────

  async function loadDatabases(defaultId) {
    dbSelect.innerHTML = '<option value="">Loading\u2026</option>';
    dbSelect.disabled = true;
    setExportStatus("", "");

    const result = await sendBgMessage({ type: "LIST_DATABASES" });
    if (!result.ok) {
      dbSelect.innerHTML = '<option value="">Failed to load databases</option>';
      setExportStatus("Could not load databases: " + escapeHtml(result.error), "error");
      dbSelect.disabled = false;
      return;
    }

    const databases = result.data ?? [];
    if (databases.length === 0) {
      dbSelect.innerHTML = '<option value="">No databases found</option>';
      setExportStatus("No accessible databases. Check integration permissions.", "error");
      dbSelect.disabled = false;
      return;
    }

    dbSelect.innerHTML = '<option value="">\u2014 Select a database \u2014</option>';
    for (const db of databases) {
      const name =
        db.title?.[0]?.plain_text ||
        db.title?.[0]?.text?.content ||
        (Array.isArray(db.title) && db.title.map((t) => t.plain_text ?? t.text?.content ?? "").join("")) ||
        db.id;
      const opt = document.createElement("option");
      opt.value = db.id;
      opt.textContent = (name || "").trim() || `Untitled (${db.id.slice(0, 8)}\u2026)`;
      dbSelect.appendChild(opt);
    }
    dbSelect.disabled = false;

    if (defaultId) {
      dbSelect.value = defaultId;
      if (dbSelect.value === defaultId) {
        await onDatabaseChange();
      }
    }
  }

  // ── Database property loading ─────────────────────────────────────────────

  async function onDatabaseChange() {
    const dbId = dbSelect.value;
    if (!dbId) {
      mappingSection.style.display = "none";
      currentDbProperties = null;
      return;
    }

    mappingSection.style.display = "none";
    setExportStatus("Loading properties\u2026", "");

    const result = await sendBgMessage({ type: "GET_DATABASE_PROPERTIES", databaseId: dbId });
    if (!result.ok) {
      setExportStatus("Failed to load properties: " + escapeHtml(result.error), "error");
      return;
    }

    setExportStatus("", "");
    currentDbProperties = result.data;
    populatePropertyMappings(currentDbProperties);
    mappingSection.style.display = "";
  }

  // ── Property mapping ──────────────────────────────────────────────────────

  // Which Notion property types are compatible with each email field
  const COMPAT = {
    subject: ["title", "rich_text"],
    sender:  ["rich_text", "email", "phone_number", "url", "title"],
    date:    ["date", "rich_text"],
    body:    ["rich_text"],
  };

  function populatePropertyMappings(props) {
    const entries = Object.entries(props).map(([name, schema]) => ({
      name,
      type: schema.type,
    }));

    // Subject
    populateSelect("map-subject", entries.filter((p) => COMPAT.subject.includes(p.type)), "Don\u2019t include");
    // Sender
    populateSelect("map-sender", entries.filter((p) => COMPAT.sender.includes(p.type)), "Don\u2019t include");
    // Date
    populateSelect("map-date", entries.filter((p) => COMPAT.date.includes(p.type)), "Don\u2019t include");
    // Body: "Page body" + compatible properties
    const bodyOptions = [
      { name: PAGE_BODY_TARGET, type: "page_body", label: "Page body (blocks)" },
      ...entries.filter((p) => COMPAT.body.includes(p.type)),
    ];
    populateSelect("map-body", bodyOptions, "Don\u2019t include");

    autoSelectDefaults(entries);
  }

  function populateSelect(selectId, options, emptyLabel) {
    const select = document.getElementById(selectId);
    select.innerHTML = "";

    const none = document.createElement("option");
    none.value = "";
    none.textContent = emptyLabel;
    select.appendChild(none);

    for (const opt of options) {
      const option = document.createElement("option");
      option.value = opt.name;
      option.dataset.type = opt.type;
      option.textContent = opt.label || `${opt.name} (${opt.type})`;
      select.appendChild(option);
    }
  }

  async function autoSelectDefaults(entries) {
    const stored = await getStorage(["defaultPropertyMappings"]);
    const pm = stored.defaultPropertyMappings || {};

    // Subject: saved default → title prop → first compatible
    const titleProp = entries.find((p) => p.type === "title");
    trySetSelect("map-subject",
      pm.subjectProperty,
      titleProp?.name,
      entries.find((p) => COMPAT.subject.includes(p.type))?.name
    );

    // Sender: saved default → prop named "From" → first compatible
    trySetSelect("map-sender",
      pm.senderProperty,
      entries.find((p) => p.name.toLowerCase() === "from" && COMPAT.sender.includes(p.type))?.name,
      entries.find((p) => COMPAT.sender.includes(p.type) && p.type !== "title")?.name
    );

    // Date: saved default → prop named "Date" → first date prop
    trySetSelect("map-date",
      pm.dateProperty,
      entries.find((p) => p.name.toLowerCase() === "date" && COMPAT.date.includes(p.type))?.name,
      entries.find((p) => p.type === "date")?.name
    );

    // Body: saved default → page body
    trySetSelect("map-body",
      pm.bodyTarget,
      PAGE_BODY_TARGET
    );
  }

  /** Try to set a select's value from the first truthy candidate. */
  function trySetSelect(selectId, ...candidates) {
    const select = document.getElementById(selectId);
    for (const val of candidates) {
      if (!val) continue;
      for (const opt of select.options) {
        if (opt.value === val) {
          select.value = val;
          return;
        }
      }
    }
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  async function handleExport() {
    const dbId = dbSelect.value;
    if (!dbId) {
      setExportStatus("Please select a database.", "error");
      return;
    }

    // Gather mappings
    const subjectSel = document.getElementById("map-subject");
    const senderSel  = document.getElementById("map-sender");
    const dateSel    = document.getElementById("map-date");
    const bodySel    = document.getElementById("map-body");

    const propertyMappings = {};

    if (subjectSel.value) {
      propertyMappings.subjectProperty = subjectSel.value;
      propertyMappings.subjectType = subjectSel.selectedOptions[0]?.dataset.type || "title";
    }
    if (senderSel.value) {
      propertyMappings.senderProperty = senderSel.value;
      propertyMappings.senderType = senderSel.selectedOptions[0]?.dataset.type || "rich_text";
    }
    if (dateSel.value) {
      propertyMappings.dateProperty = dateSel.value;
      propertyMappings.dateType = dateSel.selectedOptions[0]?.dataset.type || "date";
    }
    if (bodySel.value === PAGE_BODY_TARGET) {
      propertyMappings.bodyTarget = "page_body";
    } else if (bodySel.value) {
      propertyMappings.bodyTarget = bodySel.value;
      propertyMappings.bodyType = bodySel.selectedOptions[0]?.dataset.type || "rich_text";
    }

    const options = {
      includeSubject: !!propertyMappings.subjectProperty,
      includeSender:  !!propertyMappings.senderProperty,
      includeDate:    !!propertyMappings.dateProperty,
      includeBody:    !!propertyMappings.bodyTarget,
    };

    // Re-scrape if body mode changed
    const bodyMode = getSelectedBodyMode();
    if (bodyMode !== (currentEmailData._bodyMode || "last")) {
      const scrapeResult = await sendTabMessage(currentTabId, { type: "SCRAPE_EMAIL", bodyMode });
      if (scrapeResult?.ok && scrapeResult.data) {
        currentEmailData = scrapeResult.data;
        currentEmailData._bodyMode = bodyMode;
      }
    }

    exportBtn.disabled = true;
    exportBtn.textContent = "Exporting\u2026";
    setExportStatus("", "");

    const result = await sendBgMessage({
      type: "EXPORT_EMAIL",
      databaseId: dbId,
      emailData: currentEmailData,
      options,
      propertyMappings,
    });

    exportBtn.disabled = false;
    exportBtn.textContent = "Export to Notion";

    if (result.ok) {
      const url = result.data?.url;
      setExportStatus(
        url
          ? `\u2713 Exported! <a href="${escapeHtml(url)}" target="_blank" rel="noopener">Open in Notion</a>`
          : "\u2713 Successfully exported!",
        "success"
      );
      // Persist as new defaults
      saveDefaults(dbId, propertyMappings, bodyMode);
    } else {
      setExportStatus("\u2717 " + escapeHtml(result.error), "error");
    }
  }

  function getSelectedBodyMode() {
    return document.querySelector('input[name="body-mode"]:checked')?.value || "last";
  }

  function saveDefaults(dbId, propertyMappings, bodyMode) {
    browser.storage.local.set({
      defaultDatabaseId: dbId,
      defaultPropertyMappings: {
        subjectProperty: propertyMappings.subjectProperty || "",
        senderProperty:  propertyMappings.senderProperty || "",
        dateProperty:    propertyMappings.dateProperty || "",
        bodyTarget:      propertyMappings.bodyTarget === "page_body"
          ? "page_body"
          : (propertyMappings.bodyTarget || ""),
      },
      defaultOptions: {
        includeSubject: !!propertyMappings.subjectProperty,
        includeSender:  !!propertyMappings.senderProperty,
        includeDate:    !!propertyMappings.dateProperty,
        includeBody:    !!propertyMappings.bodyTarget,
        bodyMode,
      },
    });
  }

  // ── Event listeners ───────────────────────────────────────────────────────

  document.getElementById("connect-btn")?.addEventListener("click", async () => {
    showState("loading");
    const result = await sendBgMessage({ type: "START_OAUTH" });
    if (result.ok) {
      init(); // re-init after successful auth
    } else {
      showState("not-auth");
      alert("Connection failed: " + (result.error || "Unknown error"));
    }
  });

  document.getElementById("setup-btn")?.addEventListener("click", openOptions);
  document.getElementById("settings-btn")?.addEventListener("click", openOptions);
  document.getElementById("options-link")?.addEventListener("click", (e) => {
    e.preventDefault();
    openOptions();
  });

  disconnectLink?.addEventListener("click", async (e) => {
    e.preventDefault();
    if (!confirm("Disconnect from Notion?")) return;
    await sendBgMessage({ type: "LOGOUT" });
    showState("not-auth");
    disconnectLink.style.display = "none";
  });

  dbSelect?.addEventListener("change", () => onDatabaseChange());
  document.getElementById("refresh-db")?.addEventListener("click", () => loadDatabases());
  exportBtn?.addEventListener("click", handleExport);

  // ── Boot ──────────────────────────────────────────────────────────────────
  init();
})();
