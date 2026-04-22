/* ============================================================
    RAWAL DSS — INTERACTIVE WATERSHED MAP (Phase 5 · final fix)
    Every raster overlay is positioned using the watershed
    polygon's EXACT WGS84 bounding box, and clipped to the
    polygon shape via an SVG clip-path built in the same
    reference frame. Both edges are now mathematically forced
    to coincide, eliminating the top-side mismatch caused by
    UTM-to-WGS84 reprojection padding in the Python bounds JSON.
    ============================================================ */

const RAWAL_CENTER = [33.7019, 73.1178];
const INITIAL_ZOOM = 12;

const VECTOR_STYLES = {
    watershed: {
        color: '#14b8a6', weight: 3, opacity: 0.95,
        fill: false, dashArray: '6, 4'
    }
};

const RASTER_PATHS = {
    'sprawl2000': 'data/overlays/sprawl_2000.png',
    'sprawl2024': 'data/overlays/sprawl_2024.png',
    'scenario_A': 'data/overlays/scenario_A_eol.png',
    'scenario_B': 'data/overlays/scenario_B_eol.png',
    'scenario_C': 'data/overlays/scenario_C_eol.png',
    'scenario_D': 'data/overlays/scenario_D_eol.png',
    'scenario_E': 'data/overlays/scenario_E_eol.png'
};

const OVERLAY_OPACITY = 0.92;

let map = null;
let baseLayers = {};
let watershedLayer = null;
let rasterOverlays = {};
let activeOverlay = null;
let cachedPipelineData = null;
let watershedGeoJSON = null;
let watershedBBox = null;

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
    const watershedPromise = fetch('data/geo/watershed_boundary.geojson')
        .then(function (res) { return res.json(); })
        .then(function (geojson) {
            watershedGeoJSON = geojson;
            watershedLayer = L.geoJSON(geojson, { style: VECTOR_STYLES.watershed });

            // Capture the polygon's exact WGS84 bbox — this becomes the
            // reference frame for BOTH the image placement AND the clip path.
            const lb = watershedLayer.getBounds();
            watershedBBox = {
                south: lb.getSouth(),
                west:  lb.getWest(),
                north: lb.getNorth(),
                east:  lb.getEast()
            };

            watershedLayer.addTo(map);
            map.fitBounds(lb, { padding: [20, 20] });
        })
        .catch(function (err) { console.error('Watershed load failed:', err); });

    watershedPromise.then(function () {
        // Place every PNG at the polygon's exact bbox (ignoring the Python
        // bounds JSON entirely). The slight 0.003° stretch that corrects
        // the asymmetry is visually imperceptible at thesis resolution.
        const leafletBounds = [
            [watershedBBox.south, watershedBBox.west],
            [watershedBBox.north, watershedBBox.east]
        ];

        Object.keys(RASTER_PATHS).forEach(function (key) {
            rasterOverlays[key] = L.imageOverlay(RASTER_PATHS[key], leafletBounds, {
                opacity: OVERLAY_OPACITY,
                interactive: false
            });
        });

        buildWatershedClipPath(watershedGeoJSON, watershedBBox);

        setActiveOverlay('sprawl2024');

        wireUpLayerRadios();
        wireUpBasemapSwitch();
        wireUpScenarioRadios();
        wireUpBoundaryToggles();

        const statusEl = document.getElementById('map-status');
        if (statusEl) {
            statusEl.textContent = 'Map ready · polygon-aligned overlays loaded';
            statusEl.classList.add('loaded');
        }
    });
}

function buildWatershedClipPath(geojson, bbox) {
    const west = bbox.west, east = bbox.east;
    const south = bbox.south, north = bbox.north;

    const rings = [];
    const geom = geojson.features[0].geometry;
    if (geom.type === 'Polygon') {
        geom.coordinates.forEach(function (ring) { rings.push(ring); });
    } else if (geom.type === 'MultiPolygon') {
        geom.coordinates.forEach(function (poly) {
            poly.forEach(function (ring) { rings.push(ring); });
        });
    }

    const pathData = rings.map(function (ring) {
        return ring.map(function (pt, i) {
            const lng = pt[0], lat = pt[1];
            const x = (lng - west) / (east - west);
            const y = (north - lat) / (north - south);
            return (i === 0 ? 'M' : 'L') + x.toFixed(6) + ',' + y.toFixed(6);
        }).join(' ') + ' Z';
    }).join(' ');

    const prior = document.getElementById('rawal-clip-svg');
    if (prior) prior.remove();

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('id', 'rawal-clip-svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    svg.style.pointerEvents = 'none';

    const defs = document.createElementNS(svgNS, 'defs');
    const clipPath = document.createElementNS(svgNS, 'clipPath');
    clipPath.setAttribute('id', 'watershed-clip');
    clipPath.setAttribute('clipPathUnits', 'objectBoundingBox');

    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', pathData);

    clipPath.appendChild(path);
    defs.appendChild(clipPath);
    svg.appendChild(defs);
    document.body.appendChild(svg);
}

function applyClipToOverlay(overlay) {
    if (!overlay) return;
    const el = overlay.getElement();
    if (el) {
        el.style.clipPath = 'url(#watershed-clip)';
        el.style.webkitClipPath = 'url(#watershed-clip)';
    }
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
    applyClipToOverlay(overlay);

    if (watershedLayer && map.hasLayer(watershedLayer)) watershedLayer.bringToFront();
}

function wireUpBoundaryToggles() {
    const watershedCb = document.getElementById('toggle-watershed');
    if (watershedCb) {
        watershedCb.addEventListener('change', function (e) {
            if (!watershedLayer) return;
            if (e.target.checked) {
                watershedLayer.addTo(map);
                watershedLayer.bringToFront();
            } else {
                map.removeLayer(watershedLayer);
            }
        });
    }
}

function wireUpLayerRadios() {
    document.querySelectorAll('[name="historical-layer"]').forEach(function (radio) {
        radio.addEventListener('change', function (e) {
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
            if (activeOverlay) activeOverlay.bringToFront();
            if (watershedLayer && map.hasLayer(watershedLayer)) watershedLayer.bringToFront();
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
        const selectedHist = document.querySelector('[name="historical-layer"]:checked');
        setActiveOverlay(selectedHist ? selectedHist.value : 'sprawl2024');
        updateImpactCard(null);
        return;
    }

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
        nameEl.textContent   = 'Select a policy';
        eolEl.textContent    = '—';
        gainedEl.textContent = '—';
        descEl.textContent   = 'Pick one of the five 2088 scenarios to see its physical footprint and performance.';
        return;
    }

    const scen = cachedPipelineData.scenarios[choice];
    if (!scen) return;

    nameEl.textContent   = scen.id + ' · ' + scen.name;
    eolEl.textContent    = scen.eol_year;
    gainedEl.textContent = (scen.years_gained_vs_baseline > 0 ? '+' : '') + scen.years_gained_vs_baseline + ' yrs';
    descEl.textContent   = scen.description;
}

function populateSidebarStats(data) {
    const hist = data.historical;
    const ws   = data.watershed;
    const meta = data.metadata;

    const area2000 = hist.water_area_acres[0];
    const areaNow  = hist.water_area_acres[hist.water_area_acres.length - 1];
    const years    = meta.analysis_years;

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