/* ============================================================
   RAWAL DSS — INTERACTIVE WATERSHED MAP (Phase 5 final)
   Each PNG is a complete PDF-style composite (forest + urban + lake).
   Only ONE raster overlay is visible at a time (radio semantics).
   ============================================================ */

const RAWAL_CENTER = [33.7019, 73.1178];
const INITIAL_ZOOM = 12;

const VECTOR_STYLES = {
    watershed: {
        color: '#14b8a6', weight: 3, opacity: 0.95,
        fill: false, dashArray: '6, 4'
    }
};

// Which raster overlay corresponds to each state
const RASTER_PATHS = {
    'sprawl2000':   'data/overlays/sprawl_2000',
    'sprawl2024':   'data/overlays/sprawl_2024',
    'scenario_A':   'data/overlays/scenario_A_eol',
    'scenario_B':   'data/overlays/scenario_B_eol',
    'scenario_C':   'data/overlays/scenario_C_eol',
    'scenario_D':   'data/overlays/scenario_D_eol',
    'scenario_E':   'data/overlays/scenario_E_eol'
};

const OVERLAY_OPACITY = 0.92;

let map = null;
let baseLayers = {};
let watershedLayer = null;
let rasterOverlays = {};       // preloaded L.imageOverlay instances
let activeOverlay = null;      // the one currently shown on the map
let cachedPipelineData = null;

document.addEventListener('rawal:ready', function (event) {
    cachedPipelineData = event.detail;
    buildMap();
    loadAllLayers();
    populateSidebarStats(event.detail);
});

document.addEventListener('rawal:error', function (event) {
    const statusEl = document.getElementById('map-status');
    if (statusEl) {
        statusEl.textContent = 'Data load failed: ' + event.detail.message;
        statusEl.classList.add('error');
    }
});

function buildMap() {
    map = L.map('map-canvas', {
        center: RAWAL_CENTER,
        zoom: INITIAL_ZOOM,
        zoomControl: true,
        attributionControl: true
    });

    const darkBase = L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        { attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
          subdomains: 'abcd', maxZoom: 19 }
    );

    const satelliteBase = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { attribution: 'Tiles &copy; Esri', maxZoom: 19 }
    );

    darkBase.addTo(map);
    baseLayers = { dark: darkBase, satellite: satelliteBase };
}

function loadAllLayers() {
    // Load watershed boundary (always visible)
    const watershedPromise = fetch('data/geo/watershed_boundary.geojson')
        .then(function (res) { return res.json(); })
        .then(function (geojson) {
            watershedLayer = L.geoJSON(geojson, { style: VECTOR_STYLES.watershed });
            watershedLayer.addTo(map);
            map.fitBounds(watershedLayer.getBounds(), { padding: [20, 20] });
        })
        .catch(function (err) { console.error('Watershed load failed:', err); });

    // Preload all raster overlays
    const rasterPromises = Object.keys(RASTER_PATHS).map(function (key) {
        return preloadRaster(key, RASTER_PATHS[key]);
    });

    Promise.all([watershedPromise].concat(rasterPromises)).then(function () {
        // Default view: show 2024 composite
        setActiveOverlay('sprawl2024');

        wireUpLayerRadios();
        wireUpBasemapSwitch();
        wireUpScenarioRadios();

        const statusEl = document.getElementById('map-status');
        if (statusEl) {
            statusEl.textContent = 'Map ready · PDF-parity composite overlays loaded';
            statusEl.classList.add('loaded');
        }
    });
}

function preloadRaster(key, basePath) {
    return fetch(basePath + '.json')
        .then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + basePath);
            return res.json();
        })
        .then(function (bounds) {
            const leafletBounds = [
                [bounds.south, bounds.west],
                [bounds.north, bounds.east]
            ];
            rasterOverlays[key] = L.imageOverlay(basePath + '.png', leafletBounds, {
                opacity: OVERLAY_OPACITY,
                interactive: false
            });
        })
        .catch(function (err) { console.error('Raster load failed:', basePath, err); });
}

function setActiveOverlay(key) {
    if (activeOverlay) {
        map.removeLayer(activeOverlay);
        activeOverlay = null;
    }
    if (!key) return;

    const overlay = rasterOverlays[key];
    if (!overlay) { console.warn('No overlay for key:', key); return; }

    overlay.addTo(map);
    activeOverlay = overlay;

    // Ensure the watershed boundary stays on top
    if (watershedLayer) watershedLayer.bringToFront();
}

function wireUpLayerRadios() {
    // Layer radios: 2000 vs 2024 historical view
    document.querySelectorAll('[name="historical-layer"]').forEach(function (radio) {
        radio.addEventListener('change', function (e) {
            // Clear scenario selection
            const noneScenario = document.querySelector('[name="scenario"][value="none"]');
            if (noneScenario) noneScenario.checked = true;
            updateImpactCard(null);
            setActiveOverlay(e.target.value);
        });
    });
}

function wireUpBasemapSwitch() {
    document.querySelectorAll('[name="basemap"]').forEach(function (radio) {
        radio.addEventListener('change', function (e) {
            const chosen = e.target.value;
            Object.values(baseLayers).forEach(function (layer) { map.removeLayer(layer); });
            if (baseLayers[chosen]) baseLayers[chosen].addTo(map);
            // Base layer sits below overlays — re-assert z-order
            if (activeOverlay) activeOverlay.bringToFront();
            if (watershedLayer) watershedLayer.bringToFront();
        });
    });
}

function wireUpScenarioRadios() {
    document.querySelectorAll('[name="scenario"]').forEach(function (radio) {
        radio.addEventListener('change', function (e) { switchScenario(e.target.value); });
    });
}

function switchScenario(choice) {
    if (choice === 'none') {
        // Fall back to whatever historical radio is selected, or 2024 default
        const selectedHist = document.querySelector('[name="historical-layer"]:checked');
        setActiveOverlay(selectedHist ? selectedHist.value : 'sprawl2024');
        updateImpactCard(null);
        return;
    }

    // Clear historical radio selection to make it clear scenario overrides it
    document.querySelectorAll('[name="historical-layer"]').forEach(function (r) { r.checked = false; });

    setActiveOverlay('scenario_' + choice);
    updateImpactCard(choice);
}

function updateImpactCard(choice) {
    const nameEl   = document.getElementById('impact-name');
    const eolEl    = document.getElementById('impact-eol');
    const gainedEl = document.getElementById('impact-gained');
    const descEl   = document.getElementById('impact-desc');

    if (!nameEl) return;

    if (!choice || !cachedPipelineData) {
        nameEl.textContent = 'Select a policy';
        eolEl.textContent = '—';
        gainedEl.textContent = '—';
        descEl.textContent = 'Pick one of the five 2088 scenarios to see its physical footprint and performance.';
        return;
    }

    const scen = cachedPipelineData.scenarios[choice];
    if (!scen) return;

    nameEl.textContent = scen.id + ' · ' + scen.name;
    eolEl.textContent = scen.eol_year;
    gainedEl.textContent = (scen.years_gained_vs_baseline > 0 ? '+' : '') + scen.years_gained_vs_baseline + ' yrs';
    descEl.textContent = scen.description;
}

function populateSidebarStats(data) {
    const hist = data.historical;
    const ws = data.watershed;
    const meta = data.metadata;

    const area2000 = hist.water_area_acres[0];
    const areaNow = hist.water_area_acres[hist.water_area_acres.length - 1];
    const years = meta.analysis_years;

    setText('stat-watershed-area', formatAcres(ws.total_acres));
    setText('stat-lake-2000', formatAcres(area2000));
    setText('stat-lake-now', formatAcres(areaNow) + ' (' + years[years.length - 1] + ')');
    setText('stat-urban-now', formatAcres(ws.current_urban_acres_2024));
    setText('stat-urban-pct', ws.urbanization_percent_2024.toFixed(1) + '%');
    setText('stat-eol-year', meta.baseline_eol_year);

    updateImpactCard(null);
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function formatAcres(n) {
    if (n == null || isNaN(n)) return '—';
    return Math.round(n).toLocaleString() + ' ac';
}