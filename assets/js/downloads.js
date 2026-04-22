/* ============================================================
   RAWAL DSS — DOWNLOADS PAGE (Phase 8B)
   File-size probing via HEAD requests + copy-to-clipboard
   for citation blocks.
   ============================================================ */

/* ============================================================
   1. PROBE FILE SIZES VIA HEAD REQUESTS
   The browser can fetch a HEAD-only response to get
   Content-Length without downloading the whole file.
   ============================================================ */
const SIZE_TARGETS = [
    { id: 'dl-size-rawaljson', url: 'data/core/rawal_data.json' },
    { id: 'dl-size-watershed', url: 'data/geo/watershed_boundary.geojson' },
    { id: 'dl-size-lake',      url: 'data/geo/lake_boundary.geojson' },
    { id: 'dl-size-scenA',     url: 'data/overlays/scenario_A_eol.png' },
    { id: 'dl-size-scenB',     url: 'data/overlays/scenario_B_eol.png' },
    { id: 'dl-size-scenC',     url: 'data/overlays/scenario_C_eol.png' },
    { id: 'dl-size-scenD',     url: 'data/overlays/scenario_D_eol.png' },
    { id: 'dl-size-scenE',     url: 'data/overlays/scenario_E_eol.png' },
    { id: 'dl-size-manifest',  url: 'data/manifest.json' }
];

function formatBytes(bytes) {
    if (bytes == null || isNaN(bytes)) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function probeSize(target) {
    return fetch(target.url, { method: 'HEAD' })
        .then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const len = res.headers.get('Content-Length');
            const el = document.getElementById(target.id);
            if (el) {
                el.textContent = len ? formatBytes(parseInt(len, 10)) : 'available';
            }
        })
        .catch(function (err) {
            const el = document.getElementById(target.id);
            if (el) el.textContent = 'unavailable';
            console.warn('Size probe failed for', target.url, err.message);
        });
}

document.addEventListener('DOMContentLoaded', function () {
    SIZE_TARGETS.forEach(probeSize);
    wireCopyButtons();
});

/* ============================================================
   2. COPY-TO-CLIPBOARD for citation blocks
   ============================================================ */
function wireCopyButtons() {
    const buttons = document.querySelectorAll('.dl-copy-btn');
    const feedback = document.getElementById('copy-feedback');

    buttons.forEach(function (btn) {
        btn.addEventListener('click', function () {
            const targetId = btn.getAttribute('data-copy-target');
            const target = document.getElementById(targetId);
            if (!target) return;

            const text = target.textContent;

            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(function () {
                    showFeedback(feedback);
                }).catch(function () {
                    fallbackCopy(text);
                    showFeedback(feedback);
                });
            } else {
                fallbackCopy(text);
                showFeedback(feedback);
            }
        });
    });
}

function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '-999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* silent */ }
    document.body.removeChild(ta);
}

function showFeedback(el) {
    if (!el) return;
    el.classList.add('visible');
    setTimeout(function () { el.classList.remove('visible'); }, 1800);
}