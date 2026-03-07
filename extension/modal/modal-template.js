/**
 * modal/modal-template.js
 * Injected as a content script before content.js.
 * Exposes the modal HTML as a global so content.js can use it
 * without any runtime file fetching.
 *
 * Placeholders substituted at runtime by content.js:
 *   {{subject}}  – escaped email subject
 *   {{sender}}   – escaped sender display string
 *   {{date}}     – escaped date string
 */

/* eslint-disable no-var */
/* global window */
var ETN_MODAL_TEMPLATE = `
<div class="etn-modal" role="dialog" aria-modal="true" aria-labelledby="etn-modal-title">

  <!-- ── Header ──────────────────────────────────────────────────────────── -->
  <div class="etn-modal-header">
    <span class="etn-modal-icon" aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86
          1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.373.466l1.822
          1.447zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42
          0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748
          0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186
          0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233
          4.764 7.279V9.107l-1.215-.14c-.093-.514.28-.887.747-.933l3.222-.187z"
          fill="currentColor"/>
      </svg>
    </span>
    <h2 id="etn-modal-title">Export to Notion</h2>
    <button id="etn-close-btn" class="etn-close-btn" aria-label="Close">&times;</button>
  </div>

  <!-- ── Body ────────────────────────────────────────────────────────────── -->
  <div class="etn-modal-body">

    <!-- Auth prompt (hidden until needed) -->
    <div id="etn-auth-section" class="etn-auth-section" style="display:none;">
      <p>You need to connect your Notion account first.</p>
      <button id="etn-auth-btn" class="etn-btn etn-btn-primary">Connect Notion</button>
    </div>

    <!-- Main export form (hidden until auth confirmed) -->
    <div id="etn-form-section" style="display:none;">

      <!-- Database picker -->
      <div class="etn-field etn-field-db">
        <label for="etn-db-select">Notion Database</label>
        <div class="etn-db-row">
          <select id="etn-db-select" class="etn-select">
            <option value="">Loading databases\u2026</option>
          </select>
          <button id="etn-refresh-db" class="etn-btn-icon" title="Refresh databases" aria-label="Refresh databases">
            \u21bb
          </button>
        </div>
      </div>

      <!-- Email preview -->
      <div class="etn-field etn-field-preview">
        <label>Email Preview</label>
        <div class="etn-preview">
          <div class="etn-preview-row">
            <span class="etn-preview-label">Subject:</span>
            <span id="etn-preview-subject">{{subject}}</span>
          </div>
          <div class="etn-preview-row">
            <span class="etn-preview-label">From:</span>
            <span id="etn-preview-sender">{{sender}}</span>
          </div>
          <div class="etn-preview-row">
            <span class="etn-preview-label">Date:</span>
            <span id="etn-preview-date">{{date}}</span>
          </div>
        </div>
      </div>

      <!-- Export options -->
      <div class="etn-field">
        <label class="etn-section-label">Include in export</label>
        <div class="etn-checkboxes">
          <label class="etn-checkbox-label">
            <input type="checkbox" id="etn-opt-subject" checked>
            Email subject as page title
          </label>
          <label class="etn-checkbox-label">
            <input type="checkbox" id="etn-opt-sender" checked>
            Sender name &amp; address
          </label>
          <label class="etn-checkbox-label">
            <input type="checkbox" id="etn-opt-date" checked>
            Date
          </label>
          <label class="etn-checkbox-label">
            <input type="checkbox" id="etn-opt-body" checked>
            Email body
          </label>
        </div>
      </div>

    </div><!-- /etn-form-section -->
  </div><!-- /etn-modal-body -->

  <!-- ── Footer ──────────────────────────────────────────────────────────── -->
  <div class="etn-modal-footer" id="etn-footer" style="display:none;">
    <span id="etn-status" class="etn-status"></span>
    <div class="etn-footer-actions">
      <button id="etn-cancel-btn" class="etn-btn etn-btn-secondary">Cancel</button>
      <button id="etn-export-btn" class="etn-btn etn-btn-primary">
        <span id="etn-export-btn-text">Export</span>
      </button>
    </div>
  </div>

  <!-- ── Loading spinner ─────────────────────────────────────────────────── -->
  <div class="etn-modal-spinner" id="etn-spinner" style="display:none;">
    <div class="etn-spinner-ring"></div>
    <p>Loading\u2026</p>
  </div>

</div><!-- /etn-modal -->
`;
