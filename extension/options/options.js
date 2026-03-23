/**
 * options.js
 * Settings / options page logic.
 */

(function () {
  "use strict";

  const browser = globalThis.browser ?? globalThis.chrome;

  // ── Elements ──────────────────────────────────────────────────────────────
  const clientIdInput = document.getElementById("client-id");
  const clientSecretInput = document.getElementById("client-secret");
  const toggleSecretBtn = document.getElementById("toggle-secret-btn");
  const saveCredentialsBtn = document.getElementById("save-credentials-btn");
  const credentialsStatus = document.getElementById("credentials-status");

  const authStatusDisplay = document.getElementById("auth-status-display");
  const connectNotionBtn = document.getElementById("connect-notion-btn");
  const disconnectNotionBtn = document.getElementById("disconnect-notion-btn");
  const authStatusMsg = document.getElementById("auth-status-msg");

  const defaultDatabaseSelect = document.getElementById("default-database");

  const defaultSubjectProp = document.getElementById("default-subject-prop");
  const defaultSenderProp = document.getElementById("default-sender-prop");
  const defaultDateProp = document.getElementById("default-date-prop");
  const defaultBodyTarget = document.getElementById("default-body-target");
  const defaultBodyProp = document.getElementById("default-body-prop");
  const bodyPropField = document.getElementById("body-prop-field");
  const defaultBodyMode = document.getElementById("default-body-mode");

  const saveDefaultsBtn = document.getElementById("save-defaults-btn");
  const defaultsStatus = document.getElementById("defaults-status");

  const redirectUriDisplay = document.getElementById("redirect-uri-display");
  const copyRedirectBtn = document.getElementById("copy-redirect-btn");
  const setupCallout = document.getElementById("setup-callout");

  // ── Helpers ───────────────────────────────────────────────────────────────

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

  function getStorage(keys) {
    return new Promise((resolve, reject) => {
      browser.storage.local.get(keys, (result) => {
        if (browser.runtime.lastError) reject(browser.runtime.lastError);
        else resolve(result);
      });
    });
  }

  function setStorage(data) {
    return new Promise((resolve, reject) => {
      browser.storage.local.set(data, () => {
        if (browser.runtime.lastError) reject(browser.runtime.lastError);
        else resolve();
      });
    });
  }

  function showStatus(el, msg, isError = false, duration = 3000) {
    el.textContent = msg;
    el.className = `save-status${isError ? " error" : ""}`;
    if (duration > 0) setTimeout(() => { el.textContent = ""; }, duration);
  }

  function getRedirectUri() {
    if (typeof chrome !== "undefined" && chrome.identity?.getRedirectURL) {
      return chrome.identity.getRedirectURL();
    }
    const extId = browser.runtime.id;
    return `https://${extId}.extensions.allizom.org/`;
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  async function init() {
    // Show redirect URI
    const redirectUri = getRedirectUri();
    redirectUriDisplay.value = redirectUri;

    // Load saved settings
    const stored = await getStorage([
      "notionClientId",
      "notionClientSecret",
      "notionAccessToken",
      "notionWorkspaceName",
      "defaultDatabaseId",
      "defaultOptions",
      "defaultPropertyMappings",
    ]);

    if (stored.notionClientId) {
      clientIdInput.value = stored.notionClientId;
      setupCallout.style.display = "none"; // hide callout once configured
    }
    if (stored.notionClientSecret) {
      clientSecretInput.value = stored.notionClientSecret;
    }

    // If both credentials set, hide callout
    if (stored.notionClientId && stored.notionClientSecret) {
      setupCallout.style.display = "none";
    }

    // Auth status
    updateAuthUI(stored.notionAccessToken, stored.notionWorkspaceName);

    // Load databases for default selector
    if (stored.notionAccessToken) {
      await loadDatabases(stored.defaultDatabaseId);
    }

    // Property mapping defaults
    const pm = stored.defaultPropertyMappings || {};
    if (pm.subjectProperty) defaultSubjectProp.value = pm.subjectProperty;
    if (pm.senderProperty) defaultSenderProp.value = pm.senderProperty;
    if (pm.dateProperty) defaultDateProp.value = pm.dateProperty;

    // Body target
    if (pm.bodyTarget && pm.bodyTarget !== "page_body") {
      defaultBodyTarget.value = "property";
      defaultBodyProp.value = pm.bodyTarget;
      bodyPropField.style.display = "";
    } else {
      defaultBodyTarget.value = "page_body";
    }

    // Body mode
    const opts = stored.defaultOptions || {};
    if (opts.bodyMode) defaultBodyMode.value = opts.bodyMode;
  }

  function updateAuthUI(token, workspaceName) {
    const dot = authStatusDisplay.querySelector(".status-dot");
    if (token) {
      authStatusDisplay.className = "auth-status-row connected";
      dot.className = "status-dot connected";
      authStatusDisplay.querySelector("span").textContent =
        `Connected to ${workspaceName || "Notion"}`;
      connectNotionBtn.style.display = "none";
      disconnectNotionBtn.style.display = "";
    } else {
      authStatusDisplay.className = "auth-status-row disconnected";
      dot.className = "status-dot disconnected";
      authStatusDisplay.querySelector("span").textContent = "Not connected";
      connectNotionBtn.style.display = "";
      disconnectNotionBtn.style.display = "none";
    }
  }

  async function loadDatabases(defaultId = "") {
    defaultDatabaseSelect.innerHTML = '<option value="">— None (always ask) —</option>';

    const result = await sendMessage({ type: "LIST_DATABASES" });
    if (!result.ok) return;

    const databases = result.data ?? [];
    for (const db of databases) {
      const name = db.title?.[0]?.plain_text ?? db.id;
      const opt = document.createElement("option");
      opt.value = db.id;
      opt.textContent = name;
      defaultDatabaseSelect.appendChild(opt);
    }

    if (defaultId) defaultDatabaseSelect.value = defaultId;
  }

  // ── Credentials ───────────────────────────────────────────────────────────

  saveCredentialsBtn.addEventListener("click", async () => {
    const clientId = clientIdInput.value.trim();
    const clientSecret = clientSecretInput.value.trim();

    if (!clientId || !clientSecret) {
      showStatus(credentialsStatus, "Both Client ID and Secret are required.", true);
      return;
    }

    await setStorage({ notionClientId: clientId, notionClientSecret: clientSecret });
    showStatus(credentialsStatus, "✓ Credentials saved!");
    setupCallout.style.display = "none";
  });

  toggleSecretBtn.addEventListener("click", () => {
    const isPassword = clientSecretInput.type === "password";
    clientSecretInput.type = isPassword ? "text" : "password";
    toggleSecretBtn.textContent = isPassword ? "Hide" : "Show";
  });

  // ── Redirect URI copy ─────────────────────────────────────────────────────

  copyRedirectBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(redirectUriDisplay.value).then(() => {
      copyRedirectBtn.textContent = "Copied!";
      setTimeout(() => { copyRedirectBtn.textContent = "Copy"; }, 2000);
    });
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  connectNotionBtn.addEventListener("click", async () => {
    connectNotionBtn.disabled = true;
    connectNotionBtn.textContent = "Connecting…";
    authStatusMsg.textContent = "";

    const result = await sendMessage({ type: "START_OAUTH" });

    connectNotionBtn.disabled = false;
    connectNotionBtn.textContent = "Connect Notion Account";

    if (result.ok) {
      const { notionAccessToken, notionWorkspaceName } = await getStorage([
        "notionAccessToken",
        "notionWorkspaceName",
      ]);
      updateAuthUI(notionAccessToken, notionWorkspaceName);
      showStatus(authStatusMsg, `✓ Connected to ${notionWorkspaceName || "Notion"}!`);
      await loadDatabases();
    } else {
      showStatus(authStatusMsg, `✗ ${result.error}`, true);
    }
  });

  disconnectNotionBtn.addEventListener("click", async () => {
    if (!confirm("Disconnect from Notion?")) return;
    await sendMessage({ type: "LOGOUT" });
    updateAuthUI(null, null);
    defaultDatabaseSelect.innerHTML = '<option value="">— None (always ask) —</option>';
    showStatus(authStatusMsg, "Disconnected.");
  });

  // ── Body target toggle ────────────────────────────────────────────────────

  defaultBodyTarget.addEventListener("change", () => {
    bodyPropField.style.display = defaultBodyTarget.value === "property" ? "" : "none";
  });

  // ── Default settings ──────────────────────────────────────────────────────

  saveDefaultsBtn.addEventListener("click", async () => {
    const bodyTarget = defaultBodyTarget.value === "property"
      ? (defaultBodyProp.value.trim() || "")
      : "page_body";

    const defaultPropertyMappings = {
      subjectProperty: defaultSubjectProp.value.trim(),
      senderProperty: defaultSenderProp.value.trim(),
      dateProperty: defaultDateProp.value.trim(),
      bodyTarget,
    };

    const defaultOptions = {
      includeSubject: true,
      includeSender: true,
      includeDate: true,
      includeBody: true,
      bodyMode: defaultBodyMode.value,
    };

    const defaultDatabaseId = defaultDatabaseSelect.value;
    await setStorage({ defaultOptions, defaultDatabaseId, defaultPropertyMappings });
    showStatus(defaultsStatus, "✓ Defaults saved!");
  });

  // ── Boot ──────────────────────────────────────────────────────────────────
  init();
})();
