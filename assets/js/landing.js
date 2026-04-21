/* ============================================================
   RAWAL DSS — LANDING PAGE SCRIPT (Phase 4)
   Populates hero status + animated crisis stats from pipeline data.
   ============================================================ */

document.addEventListener('rawal:ready', function (event) {
    const data = event.detail;
    const meta = data.metadata;
    const hist = data.historical;
    const ws = data.watershed;

    // --- Hero status pill (simplified - real numbers live in crisis cards below) ---
    const statusEl = document.getElementById('hero-status');
    if (statusEl) {
        const firstYear = meta.analysis_years[0];
        const lastYear = meta.analysis_years[meta.analysis_years.length - 1];
        statusEl.classList.add('loaded');
        statusEl.textContent =
            'PIPELINE LIVE · ' + firstYear + '–' + lastYear +
            ' · ' + meta.analysis_years.length + ' epochs analyzed';
    }

    // --- Derived values ---
    const currentYear = new Date().getFullYear();
    const eolYear = meta.baseline_eol_year;
    const yearsRemaining = Math.max(0, eolYear - currentYear);

    const storage2000 = hist.storage_mcm[0];
    const storageNow = hist.storage_mcm[hist.storage_mcm.length - 1];
    const storageLostMCM = storage2000 - storageNow;
    const storageLostPct = (storageLostMCM / storage2000) * 100;

    const area2000 = hist.water_area_acres[0];
    const areaNow = hist.water_area_acres[hist.water_area_acres.length - 1];
    const areaLost = area2000 - areaNow;

    const urbanPct = ws.urbanization_percent_2024;

    // --- Animate crisis counters ---
    animateCounter('stat-eol-year', 2025, eolYear, 1400, 0);
    animateCounter('stat-years-left', 0, yearsRemaining, 1400, 0);
    animateCounter('stat-storage-pct', 0, storageLostPct, 1400, 1);
    animateCounter('stat-storage-lost', 0, storageLostMCM, 1400, 2);
    animateCounter('stat-area-lost', 0, areaLost, 1400, 1);
    animateCounter('stat-urban-pct', 0, urbanPct, 1400, 1);
});

document.addEventListener('rawal:error', function (event) {
    const statusEl = document.getElementById('hero-status');
    if (!statusEl) return;
    statusEl.classList.add('error');
    statusEl.textContent = 'PIPELINE ERROR: ' + event.detail.message;
});

/**
 * Animates a numeric counter from `from` to `to` over `duration` ms,
 * rendering into the element with the given id. `decimals` controls
 * how many digits appear after the decimal point.
 */
function animateCounter(elementId, from, to, duration, decimals) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const start = performance.now();

    function step(now) {
        const elapsed = now - start;
        const t = Math.min(1, elapsed / duration);
        // Cubic ease-out for a natural settle
        const eased = 1 - Math.pow(1 - t, 3);
        const current = from + (to - from) * eased;
        el.textContent = current.toFixed(decimals);

        if (t < 1) {
            requestAnimationFrame(step);
        } else {
            el.textContent = to.toFixed(decimals);
        }
    }

    requestAnimationFrame(step);
}