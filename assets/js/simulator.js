/* ============================================================
    RAWAL DSS — POLICY SIMULATOR (Phase 6 + Monte Carlo)
    Replicates the sediment-decline math from Engines 4/6 of
    the Python pipeline. Four sliders drive the loop. Adds
    1,000-run Monte Carlo envelope showing 90% confidence
    interval around the custom-scenario trajectory.
    ============================================================ */

let pipelineData = null;
let chart = null;
let uncertaintyMode = true;  // show MC envelope by default

/* ============================================================
    Monte Carlo configuration
    ============================================================ */
const MC_CONFIG = {
    runs: 1000,
    jitter: {
        baseSediment: 0.10,   // ±10% Gaussian on r_base
        growthRate:   0.08,   // ±8%  Gaussian on r
        climate:      0.05,   // ±5%  Gaussian on climate multiplier
        trapEff:      0.03    // ±3pp uniform on trap efficiency
    },
    ciLow:  0.05,             // 5th percentile
    ciHigh: 0.95              // 95th percentile
};

const SLIDERS = {
    trap:     { el: null, labelEl: null, fmt: v => v + '%' },
    afforest: { el: null, labelEl: null, fmt: v => v + ' ac/yr' },
    zoning:   { el: null, labelEl: null, fmt: v => v + '%' },
    climate:  { el: null, labelEl: null, fmt: v => (v >= 0 ? '+' : '') + v + '%' }
};

document.addEventListener('rawal:ready', function (event) {
    pipelineData = event.detail;
    initSliders();
    initUncertaintyToggle();
    initChart();
    buildComparisonStrip();
    runSimulation();
});

document.addEventListener('rawal:error', function (event) {
    console.error('Pipeline data failed to load:', event.detail);
});

/* ============================================================
    1. SLIDER WIRING
    ============================================================ */
function initSliders() {
    SLIDERS.trap.el       = document.getElementById('slider-trap');
    SLIDERS.trap.labelEl  = document.getElementById('val-trap');
    SLIDERS.afforest.el      = document.getElementById('slider-afforest');
    SLIDERS.afforest.labelEl = document.getElementById('val-afforest');
    SLIDERS.zoning.el     = document.getElementById('slider-zoning');
    SLIDERS.zoning.labelEl = document.getElementById('val-zoning');
    SLIDERS.climate.el    = document.getElementById('slider-climate');
    SLIDERS.climate.labelEl = document.getElementById('val-climate');

    Object.values(SLIDERS).forEach(function (s) {
        s.el.addEventListener('input', function () {
            s.labelEl.textContent = s.fmt(parseFloat(s.el.value));
            runSimulation();
        });
    });

    document.getElementById('btn-reset').addEventListener('click', function () {
        SLIDERS.trap.el.value     = 0;
        SLIDERS.afforest.el.value = 0;
        SLIDERS.zoning.el.value   = 0;
        SLIDERS.climate.el.value  = 5;
        updateAllLabels();
        runSimulation();
    });

    document.getElementById('btn-preset-e').addEventListener('click', function () {
        SLIDERS.trap.el.value     = 25;
        SLIDERS.afforest.el.value = 300;
        SLIDERS.zoning.el.value   = 70;
        SLIDERS.climate.el.value  = 5;
        updateAllLabels();
        runSimulation();
    });

    updateAllLabels();
}

function updateAllLabels() {
    Object.values(SLIDERS).forEach(function (s) {
        s.labelEl.textContent = s.fmt(parseFloat(s.el.value));
    });
}

/* ============================================================
    2. UNCERTAINTY TOGGLE
    ============================================================ */
function initUncertaintyToggle() {
    const toggle = document.getElementById('toggle-uncertainty');
    if (!toggle) return;
    toggle.addEventListener('change', function (e) {
        uncertaintyMode = e.target.checked;
        runSimulation();
    });
}

/* ============================================================
    3. GAUSSIAN RNG (Box-Muller transform)
    Returns a normally-distributed random number with mean 0
    and standard deviation 1. Used for parameter jittering.
    ============================================================ */
function gaussian() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/* ============================================================
    4. SINGLE-RUN SIMULATION
    Returns { years:[], storage:[], eol: N } for a single
    parameter set. This is the core math, called 1 time for
    deterministic mode and MC_CONFIG.runs times for MC mode.
    ============================================================ */
function simulateOnce(params) {
    const meta = pipelineData.metadata;
    const ws   = pipelineData.watershed;
    const lg   = pipelineData.logistic_growth;

    const deadStorage   = meta.dead_storage_mcm;
    const watershedAcres = ws.total_acres;
    const baseline2000Ac = ws.baseline_urban_acres_2000;
    const current2024Ac  = ws.current_urban_acres_2024;
    const K = lg.carrying_capacity_acres;
    const A = lg.A_factor;

    const startStorage = pipelineData.historical.storage_mcm[
        pipelineData.historical.storage_mcm.length - 1
    ];

    let currentStorage = startStorage;
    let currentAcres   = current2024Ac;
    let currentYear    = 2024;

    const years   = [2024];
    const storage = [startStorage];

    while (currentStorage > deadStorage && currentYear < 2200) {
        currentYear += 1;
        const t = currentYear - 2000;

        const demandAcres = K / (1 + A * Math.exp(-params.r * t));

        const unrestrainedNew = demandAcres - currentAcres;
        const throttledNew = Math.max(0, unrestrainedNew * (1 - params.zoningPct));
        currentAcres += throttledNew;

        const cumulativeReclaim = params.afforestRate * (currentYear - 2024);
        const newSprawlSince2000 = currentAcres - baseline2000Ac;
        const effectiveSprawl = Math.max(0, newSprawlSince2000 - cumulativeReclaim);

        const transformedFraction = effectiveSprawl / watershedAcres;
        const sprawlMult = 1.0 + transformedFraction;

        let incrementalLoss = params.baseRate * sprawlMult * params.climateMult;
        incrementalLoss = incrementalLoss * (1 - params.trapPct);

        currentStorage -= incrementalLoss;

        years.push(currentYear);
        storage.push(Math.max(deadStorage - 0.5, currentStorage));
    }

    return { years: years, storage: storage, eol: currentYear };
}

/* ============================================================
    5. PARAMETER BUILDERS — deterministic + jittered
    ============================================================ */
function buildBaseParams() {
    const meta = pipelineData.metadata;
    const lg   = pipelineData.logistic_growth;

    return {
        baseRate:     meta.base_sediment_rate_mcm_per_year,
        r:            lg.r_rate,
        trapPct:      parseFloat(SLIDERS.trap.el.value) / 100,
        afforestRate: parseFloat(SLIDERS.afforest.el.value),
        zoningPct:    parseFloat(SLIDERS.zoning.el.value) / 100,
        climateMult:  1.0 + (parseFloat(SLIDERS.climate.el.value) / 100)
    };
}

function jitterParams(baseParams) {
    const j = MC_CONFIG.jitter;

    // Gaussian jitter: base ± σ where σ = base × percentage
    const baseRate    = baseParams.baseRate    * (1 + gaussian() * j.baseSediment);
    const r           = baseParams.r           * (1 + gaussian() * j.growthRate);
    const climateMult = baseParams.climateMult * (1 + gaussian() * j.climate);

    // Uniform jitter for trap: ±3 percentage points, but clamped to [0, 1]
    let trapPct = baseParams.trapPct;
    if (trapPct > 0) {
        trapPct = trapPct + (Math.random() * 2 - 1) * j.trapEff;
        trapPct = Math.max(0, Math.min(1, trapPct));
    }

    return {
        baseRate:     Math.max(0.01, baseRate),
        r:            Math.max(0.001, r),
        trapPct:      trapPct,
        afforestRate: baseParams.afforestRate,   // no jitter (policy input)
        zoningPct:    baseParams.zoningPct,      // no jitter (policy input)
        climateMult:  climateMult
    };
}

/* ============================================================
    6. MASTER SIMULATION DISPATCHER
    Calls simulateOnce either 1x (deterministic) or N times (MC)
    and produces all data needed to update the chart and UI.
    ============================================================ */
function runSimulation() {
    const base = buildBaseParams();

    // Always run the deterministic version — it gives us the headline EOL year.
    const deterministic = simulateOnce(base);

    if (!uncertaintyMode) {
        updateOutputsDeterministic(deterministic);
        updateChartDeterministic(deterministic);
        highlightCompareRanking(deterministic.eol);
        return;
    }

    // Monte Carlo path
    const runs = [];
    const eols = [];
    for (let i = 0; i < MC_CONFIG.runs; i++) {
        const jittered = jitterParams(base);
        const result = simulateOnce(jittered);
        runs.push(result);
        eols.push(result.eol);
    }

    // Build median + envelope by aligning all runs on a common year axis
    const envelope = buildEnvelope(runs);
    const eolStats = computeEolStats(eols);

    updateOutputsMC(deterministic, eolStats);
    updateChartMC(deterministic, envelope);
    highlightCompareRanking(deterministic.eol);
}

/* ============================================================
    7. ENVELOPE COMPUTATION
    Takes N runs of varying length and produces P5/P50/P95
    storage values at every year on a common year axis.
    ============================================================ */
function buildEnvelope(runs) {
    // Find year range across all runs
    let minYear = Infinity, maxYear = -Infinity;
    runs.forEach(function (run) {
        if (run.years[0] < minYear) minYear = run.years[0];
        if (run.years[run.years.length - 1] > maxYear) maxYear = run.years[run.years.length - 1];
    });

    const allYears = [];
    for (let y = minYear; y <= maxYear; y++) allYears.push(y);

    // Build a storage-per-year matrix, padding shorter runs with deadStorage
    const deadStorage = pipelineData.metadata.dead_storage_mcm;
    const p5  = [], p50 = [], p95 = [];

    for (let i = 0; i < allYears.length; i++) {
        const y = allYears[i];
        const values = [];

        for (let r = 0; r < runs.length; r++) {
            const run = runs[r];
            const idx = run.years.indexOf(y);
            if (idx >= 0) {
                values.push(run.storage[idx]);
            } else if (y > run.years[run.years.length - 1]) {
                values.push(deadStorage);  // run already ended
            }
            // If y < run start (shouldn't happen since all start 2024), skip.
        }

        values.sort(function (a, b) { return a - b; });
        const p5idx  = Math.floor(values.length * MC_CONFIG.ciLow);
        const p50idx = Math.floor(values.length * 0.5);
        const p95idx = Math.floor(values.length * MC_CONFIG.ciHigh);

        p5.push(values[p5idx]);
        p50.push(values[p50idx]);
        p95.push(values[p95idx]);
    }

    return { years: allYears, p5: p5, p50: p50, p95: p95 };
}

function computeEolStats(eols) {
    const sorted = eols.slice().sort(function (a, b) { return a - b; });
    const p5idx  = Math.floor(sorted.length * MC_CONFIG.ciLow);
    const p50idx = Math.floor(sorted.length * 0.5);
    const p95idx = Math.floor(sorted.length * MC_CONFIG.ciHigh);

    return {
        low:    sorted[p5idx],
        median: sorted[p50idx],
        high:   sorted[p95idx]
    };
}

/* ============================================================
    8. UI OUTPUT UPDATES
    ============================================================ */
function updateOutputsDeterministic(result) {
    const eol = result.eol;
    const baselineEOL = pipelineData.metadata.baseline_eol_year;
    const gained = eol - baselineEOL;

    document.getElementById('out-eol').textContent = eol;
    document.getElementById('out-eol-ci').textContent = 'Deterministic · no uncertainty envelope';

    const gainedEl = document.getElementById('out-gained');
    const sign = gained >= 0 ? '+' : '';
    gainedEl.textContent = sign + gained + ' years';
    gainedEl.classList.toggle('positive', gained > 0);
    gainedEl.classList.toggle('negative', gained < 0);

    let storageAt2088 = pipelineData.metadata.dead_storage_mcm;
    for (let i = 0; i < result.years.length; i++) {
        if (result.years[i] === baselineEOL) { storageAt2088 = result.storage[i]; break; }
    }
    const preserved = storageAt2088 - pipelineData.metadata.dead_storage_mcm;

    const preservedEl = document.getElementById('out-preserved');
    preservedEl.textContent = preserved.toFixed(2) + ' MCM';
    preservedEl.classList.toggle('positive', preserved > 0);

    document.getElementById('out-horizon').textContent = (result.years.length - 1) + ' years';
}

function updateOutputsMC(deterministic, eolStats) {
    const baselineEOL = pipelineData.metadata.baseline_eol_year;
    const gained = deterministic.eol - baselineEOL;

    document.getElementById('out-eol').textContent = deterministic.eol;
    document.getElementById('out-eol-ci').textContent =
        '90% CI: ' + eolStats.low + '–' + eolStats.high + '  ·  median ' + eolStats.median;

    const gainedEl = document.getElementById('out-gained');
    const sign = gained >= 0 ? '+' : '';
    gainedEl.textContent = sign + gained + ' years';
    gainedEl.classList.toggle('positive', gained > 0);
    gainedEl.classList.toggle('negative', gained < 0);

    let storageAt2088 = pipelineData.metadata.dead_storage_mcm;
    for (let i = 0; i < deterministic.years.length; i++) {
        if (deterministic.years[i] === baselineEOL) {
            storageAt2088 = deterministic.storage[i];
            break;
        }
    }
    const preserved = storageAt2088 - pipelineData.metadata.dead_storage_mcm;

    const preservedEl = document.getElementById('out-preserved');
    preservedEl.textContent = preserved.toFixed(2) + ' MCM';
    preservedEl.classList.toggle('positive', preserved > 0);

    document.getElementById('out-horizon').textContent = (deterministic.years.length - 1) + ' years';
}

/* ============================================================
    9. CHART.JS RENDERING
    ============================================================ */
function initChart() {
    const ctx = document.getElementById('sim-chart').getContext('2d');
    const baseline = pipelineData.forecast_baseline;
    const deadStorage = pipelineData.metadata.dead_storage_mcm;

    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: baseline.years,
            datasets: [
                {
                    label: 'Scenario A · Business-as-Usual',
                    data: baseline.storage_mcm,
                    borderColor: '#e53935',
                    borderWidth: 2,
                    borderDash: [6, 4],
                    fill: false,
                    pointRadius: 0,
                    tension: 0.15,
                    order: 2
                },
                {
                    // Upper envelope (P95) — invisible line, filled down to P5
                    label: '90% CI upper',
                    data: baseline.storage_mcm,
                    borderColor: 'rgba(20, 184, 166, 0.0)',
                    backgroundColor: 'rgba(20, 184, 166, 0.18)',
                    borderWidth: 0,
                    fill: '+1',
                    pointRadius: 0,
                    tension: 0.15,
                    order: 3
                },
                {
                    // Lower envelope (P5) — invisible line
                    label: '90% CI lower',
                    data: baseline.storage_mcm,
                    borderColor: 'rgba(20, 184, 166, 0.0)',
                    borderWidth: 0,
                    fill: false,
                    pointRadius: 0,
                    tension: 0.15,
                    order: 4
                },
                {
                    // Median / deterministic line
                    label: 'Your custom scenario (median)',
                    data: baseline.storage_mcm,
                    borderColor: '#14b8a6',
                    borderWidth: 3,
                    fill: false,
                    pointRadius: 0,
                    tension: 0.15,
                    order: 1
                },
                {
                    label: 'Dead-storage threshold',
                    data: baseline.years.map(function () { return deadStorage; }),
                    borderColor: '#888',
                    borderWidth: 2,
                    borderDash: [2, 3],
                    fill: false,
                    pointRadius: 0,
                    order: 5
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#c5cce0',
                        font: { size: 12, family: 'Inter' },
                        filter: function (item) {
                            // Hide the two invisible envelope datasets from legend
                            return item.text !== '90% CI upper' && item.text !== '90% CI lower';
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (ctx) {
                            if (ctx.dataset.label === '90% CI upper' ||
                                ctx.dataset.label === '90% CI lower') return null;
                            return ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(2) + ' MCM';
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Year', color: '#8e99b8' },
                    ticks: { color: '#8e99b8', maxTicksLimit: 14 },
                    grid: { color: 'rgba(255,255,255,0.04)' }
                },
                y: {
                    title: { display: true, text: 'Storage capacity (MCM)', color: '#8e99b8' },
                    ticks: { color: '#8e99b8' },
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    beginAtZero: false
                }
            }
        }
    });
}

function padToLength(arr, length, padValue) {
    const out = arr.slice();
    while (out.length < length) out.push(padValue);
    return out;
}

function alignBaseline(targetYears) {
    const baseYears = pipelineData.forecast_baseline.years;
    const baseStorage = pipelineData.forecast_baseline.storage_mcm;
    const deadStorage = pipelineData.metadata.dead_storage_mcm;

    return targetYears.map(function (y) {
        const idx = baseYears.indexOf(y);
        if (idx >= 0) return baseStorage[idx];
        // Before base start or after base end
        if (y < baseYears[0]) return null;
        return deadStorage;
    });
}

function updateChartDeterministic(result) {
    if (!chart) return;

    const baseYears = pipelineData.forecast_baseline.years;
    const allYears = result.years.length > baseYears.length ? result.years : baseYears;

    chart.data.labels = allYears;
    chart.data.datasets[0].data = alignBaseline(allYears);             // Red baseline
    chart.data.datasets[1].data = padToLength([], allYears.length, null);  // CI upper — hidden
    chart.data.datasets[2].data = padToLength([], allYears.length, null);  // CI lower — hidden
    chart.data.datasets[3].data = padToLength(result.storage, allYears.length, null);  // Median
    chart.data.datasets[4].data = allYears.map(function () {
        return pipelineData.metadata.dead_storage_mcm;
    });

    // Hide the envelope fill
    chart.data.datasets[1].backgroundColor = 'rgba(20, 184, 166, 0.0)';
    chart.update('none');
}

function updateChartMC(deterministic, envelope) {
    if (!chart) return;

    const baseYears = pipelineData.forecast_baseline.years;
    const envYears  = envelope.years;

    // Common axis = union of base years and envelope years (both start 2024)
    const maxEnd = Math.max(
        baseYears[baseYears.length - 1],
        envYears[envYears.length - 1]
    );
    const allYears = [];
    for (let y = baseYears[0]; y <= maxEnd; y++) allYears.push(y);

    function mapEnvelopeToAxis(src) {
        return allYears.map(function (y) {
            const idx = envYears.indexOf(y);
            return idx >= 0 ? src[idx] : null;
        });
    }

    chart.data.labels = allYears;
    chart.data.datasets[0].data = alignBaseline(allYears);
    chart.data.datasets[1].data = mapEnvelopeToAxis(envelope.p95);      // CI upper
    chart.data.datasets[2].data = mapEnvelopeToAxis(envelope.p5);       // CI lower
    chart.data.datasets[3].data = mapEnvelopeToAxis(envelope.p50);      // Median
    chart.data.datasets[4].data = allYears.map(function () {
        return pipelineData.metadata.dead_storage_mcm;
    });

    // Show the envelope fill
    chart.data.datasets[1].backgroundColor = 'rgba(20, 184, 166, 0.18)';
    chart.update('none');
}

/* ============================================================
    10. COMPARISON STRIP (unchanged from Phase 6)
    ============================================================ */
function buildComparisonStrip() {
    const strip = document.getElementById('compare-strip');
    const scenarios = pipelineData.scenarios;
    const order = ['A', 'B', 'C', 'D', 'E'];

    strip.innerHTML = '';
    order.forEach(function (sid) {
        const scen = scenarios[sid];
        const card = document.createElement('div');
        card.className = 'compare-card';
        card.setAttribute('data-id', sid);
        card.style.borderTopColor = scen.color;
        card.innerHTML =
            '<div class="compare-id" style="color:' + scen.color + '">' + sid + '</div>' +
            '<div class="compare-name">' + scen.name + '</div>' +
            '<div class="compare-eol">' + scen.eol_year + '</div>' +
            '<div class="compare-gained">+' + scen.years_gained_vs_baseline + ' yrs</div>';
        strip.appendChild(card);
    });

    const customCard = document.createElement('div');
    customCard.className = 'compare-card compare-custom';
    customCard.id = 'compare-custom';
    customCard.innerHTML =
        '<div class="compare-id">◆</div>' +
        '<div class="compare-name">Your scenario</div>' +
        '<div class="compare-eol" id="compare-custom-eol">—</div>' +
        '<div class="compare-gained" id="compare-custom-gained">—</div>';
    strip.appendChild(customCard);
}

function highlightCompareRanking(customEOL) {
    const eolEl = document.getElementById('compare-custom-eol');
    const gainedEl = document.getElementById('compare-custom-gained');
    if (!eolEl) return;

    const baselineEOL = pipelineData.metadata.baseline_eol_year;
    const gained = customEOL - baselineEOL;
    eolEl.textContent = customEOL;
    gainedEl.textContent = (gained >= 0 ? '+' : '') + gained + ' yrs';

    const order = ['A', 'B', 'C', 'D', 'E'];
    order.forEach(function (sid) {
        const card = document.querySelector('[data-id="' + sid + '"]');
        if (!card) return;
        const scenEOL = pipelineData.scenarios[sid].eol_year;
        card.classList.toggle('beaten', customEOL > scenEOL);
    });
}