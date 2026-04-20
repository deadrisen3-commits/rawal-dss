/* ============================================================
   RAWAL DSS — LANDING PAGE SCRIPT
   Updates the hero status once pipeline data is loaded.
   ============================================================ */

document.addEventListener('rawal:ready', function (event) {
    const meta = event.detail.metadata;
    const statusEl = document.getElementById('hero-status');
    if (!statusEl) return;

    const eolYear = meta.baseline_eol_year;
    const currentStorage = event.detail.historical.storage_mcm.slice(-1)[0];

    statusEl.classList.add('loaded');
    statusEl.textContent =
        'Pipeline data loaded · Current storage ' +
        currentStorage.toFixed(2) + ' MCM · Estimated EOL year ' + eolYear;
});

document.addEventListener('rawal:error', function (event) {
    const statusEl = document.getElementById('hero-status');
    if (!statusEl) return;
    statusEl.classList.add('error');
    statusEl.textContent = 'Failed to load pipeline data: ' + event.detail.message;
});