/* ============================================================
   RAWAL DSS — DATA LOADER
   Loads pipeline output data and exposes a global RAWAL object.
   Every page script can read window.RAWAL after the 'rawal:ready' event fires.
   ============================================================ */

window.RAWAL = {
    data: null,
    ready: false,
    error: null
};

(function loadRawalData() {
    const DATA_URL = 'data/core/rawal_data.json';

    fetch(DATA_URL)
        .then(response => {
            if (!response.ok) {
                throw new Error('HTTP ' + response.status + ' — could not fetch ' + DATA_URL);
            }
            return response.json();
        })
        .then(json => {
            window.RAWAL.data = json;
            window.RAWAL.ready = true;
            console.log('[RAWAL] Pipeline data loaded successfully.', json.metadata);
            document.dispatchEvent(new CustomEvent('rawal:ready', { detail: json }));
        })
        .catch(err => {
            window.RAWAL.error = err.message;
            console.error('[RAWAL] Failed to load pipeline data:', err);
            document.dispatchEvent(new CustomEvent('rawal:error', { detail: err }));
        });
})();

/* Convenience accessors — use these in page scripts */
window.RAWAL.getMetadata   = function () { return window.RAWAL.data ? window.RAWAL.data.metadata : null; };
window.RAWAL.getHistorical = function () { return window.RAWAL.data ? window.RAWAL.data.historical : null; };
window.RAWAL.getScenario   = function (id) { return window.RAWAL.data ? window.RAWAL.data.scenarios[id] : null; };
window.RAWAL.getWatershed  = function () { return window.RAWAL.data ? window.RAWAL.data.watershed : null; };
window.RAWAL.getForecast   = function () { return window.RAWAL.data ? window.RAWAL.data.forecast_baseline : null; };
window.RAWAL.getClimate    = function () { return window.RAWAL.data ? window.RAWAL.data.climate_regression : null; };