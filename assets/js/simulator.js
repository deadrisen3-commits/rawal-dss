/* ============================================================
   RAWAL DSS — POLICY SIMULATOR (Phase 6)
   Replicates the sediment-decline math from Engines 4 and 6 of
   the Python pipeline. Four sliders (trap efficiency, afforestation,
   zoning restraint, climate stress) drive the loop. All constants
   pulled from rawal_data.json — zero fabrication.
   ============================================================ */

let pipelineData = null;
let chart = null;

const SLIDERS = {
    trap:     { el: null, labelEl: null, fmt: v => v + '%' },
    afforest: { el: null, labelEl: null, fmt: v => v + ' ac/yr' },
    zoning:   { el: null, labelEl: null, fmt: v => v + '%' },
    climate:  { el: null, labelEl: null, fmt: v => (v >= 0 ? '+' : '') + v + '%' }
};

document.addEventListener('rawal:ready', function (event) {
    pipelineData = event.detail;
    initSliders();
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
    SLIDERS.afforest.el       = document.getElementById('slider-afforest');
    SLIDERS.afforest.labelEl  = document.getElementById('val-afforest');
    SLIDERS.zoning.el       = document.getElementById('slider-zoning');
    SLIDERS.zoning.labelEl  = document.getElementById('val-zoning');
    SLIDERS.climate.el       = document.getElementById('slider-climate');
    SLIDERS.climate.labelEl  = document.getElementById('val-climate');

    Object.values(SLIDERS).forEach(function (s) {
        s.el.addEventListener('input', function () {
            s.labelEl.textContent = s.fmt(parseFloat(s.el.value));
            runSimulation();
        });
    });

    // Buttons
    document.getElementById('btn-reset').addEventListener('click', function () {
        SLIDERS.trap.el.value = 0;
        SLIDERS.afforest.el.value = 0;
        SLIDERS.zoning.el.value = 0;
        SLIDERS.climate.el.value = 5;
        updateAllLabels();
        runSimulation();
    });

    document.getElementById('btn-preset-e').addEventListener('click', function () {
        // Hybrid approximation: 25% trap + 300 ac/yr afforest + 70% zoning + baseline climate
        SLIDERS.trap.el.value = 25;
        SLIDERS.afforest.el.value = 300;
        SLIDERS.zoning.el.value = 70;
        SLIDERS.climate.el.value = 5;
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
   2. THE SIMULATION MATH — ported from Engine 6 of Python pipeline
   ============================================================ */
function runSimulation() {
    const trapPct       = parseFloat(SLIDERS.trap.el.value) / 100;
    const afforestRate  = parseFloat(SLIDERS.afforest.el.value);
    const zoningPct     = parseFloat(SLIDERS.zoning.el.value) / 100;
    const climateStress = parseFloat(SLIDERS.climate.el.value) / 100;

    const meta = pipelineData.metadata;
    const ws   = pipelineData.watershed;
    const lg   = pipelineData.logistic_growth;

    const baseRate       = meta.base_sediment_rate_mcm_per_year;
    const deadStorage    = meta.dead_storage_mcm;
    const watershedAcres = ws.total_acres;
    const baseline2000Ac = ws.baseline_urban_acres_2000;
    const current2024Ac  = ws.current_urban_acres_2024;
    const K              = lg.carrying_capacity_acres;
    const A              = lg.A_factor;
    const r              = lg.r_rate;

    // Starting point at 2024
    let startStorage = pipelineData.historical.storage_mcm[
        pipelineData.historical.storage_mcm.length - 1
    ];
    let currentStorage = startStorage;
    let currentAcres   = current2024Ac;
    let currentYear    = 2024;

    const years   = [2024];
    const storage = [startStorage];

    // Climate multiplier equivalent to Python's climate_mult = 1.05 at slider=5
    const climateMult = 1.0 + climateStress;

    // Loop forward until storage hits dead storage OR year caps at 2200
    while (currentStorage > deadStorage && currentYear < 2200) {
        currentYear += 1;
        const t = currentYear - 2000;

        // Logistic sprawl demand — same formula as Engine 5/6 of pipeline
        const demandAcres = K / (1 + A * Math.exp(-r * t));

        // Apply zoning restraint: throttle new sprawl by (1 - zoningPct)
        const unrestrainedNew = demandAcres - currentAcres;
        const throttledNew    = Math.max(0, unrestrainedNew * (1 - zoningPct));
        currentAcres += throttledNew;

        // Apply afforestation: subtract reclaim acres from the effective sprawl
        const cumulativeReclaim = afforestRate * (currentYear - 2024);
        const newSprawlSince2000 = currentAcres - baseline2000Ac;
        const effectiveSprawl    = Math.max(0, newSprawlSince2000 - cumulativeReclaim);

        // Transformed fraction drives the sprawl multiplier
        const transformedFraction = effectiveSprawl / watershedAcres;
        const sprawlMult = 1.0 + transformedFraction;

        // Core sediment loss — same structure as Python Engine 6
        let incrementalLoss = baseRate * 1 * sprawlMult * climateMult;

        // Check dam trap efficiency reduces the loss that reaches the dam
        incrementalLoss = incrementalLoss * (1 - trapPct);

        currentStorage -= incrementalLoss;

        years.push(currentYear);
        storage.push(Math.max(deadStorage - 0.5, currentStorage));
    }

    const customEOL = currentYear;
    const baselineEOL = meta.baseline_eol_year;
    const yearsGained = customEOL - baselineEOL;

    // Storage preserved at year 2088 (the baseline EOL year)
    let storageAt2088 = deadStorage;
    for (let i = 0; i < years.length; i++) {
        if (years[i] === baselineEOL) {
            storageAt2088 = storage[i];
            break;
        }
    }
    const storagePreserved = storageAt2088 - deadStorage;

    updateOutputs(customEOL, yearsGained, storagePreserved, years.length - 1);
    updateChart(years, storage);
    highlightCompareRanking(customEOL);
}

/* ============================================================
   3. UI OUTPUT UPDATES
   ============================================================ */
function updateOutputs(eolYear, gained, preserved, horizon) {
    document.getElementById('out-eol').textContent = eolYear;

    const gainedEl = document.getElementById('out-gained');
    const sign = gained >= 0 ? '+' : '';
    gainedEl.textContent = sign + gained + ' years';
    gainedEl.classList.toggle('positive', gained > 0);
    gainedEl.classList.toggle('negative', gained < 0);

    const preservedEl = document.getElementById('out-preserved');
    preservedEl.textContent = preserved.toFixed(2) + ' MCM';
    preservedEl.classList.toggle('positive', preserved > 0);

    document.getElementById('out-horizon').textContent = horizon + ' years';
}

/* ============================================================
   4. CHART.JS RENDERING
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
                    tension: 0.15
                },
                {
                    label: 'Your custom scenario',
                    data: baseline.storage_mcm,
                    borderColor: '#14b8a6',
                    borderWidth: 3,
                    fill: {
                        target: 0,
                        above: 'rgba(20, 184, 166, 0.08)'
                    },
                    pointRadius: 0,
                    tension: 0.15
                },
                {
                    label: 'Dead-storage threshold',
                    data: baseline.years.map(function () { return deadStorage; }),
                    borderColor: '#888',
                    borderWidth: 2,
                    borderDash: [2, 3],
                    fill: false,
                    pointRadius: 0
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
                    labels: { color: '#c5cce0', font: { size: 12, family: 'Inter' } }
                },
                tooltip: {
                    callbacks: {
                        label: function (ctx) {
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

function updateChart(years, storage) {
    if (!chart) return;
    // Extend the x-axis if custom scenario runs longer than baseline
    const baseYears = pipelineData.forecast_baseline.years;
    const allYears = years.length > baseYears.length ? years : baseYears;
    chart.data.labels = allYears;

    // Pad the baseline array to match length if needed
    const baseStorage = pipelineData.forecast_baseline.storage_mcm.slice();
    while (baseStorage.length < allYears.length) {
        baseStorage.push(null);
    }
    chart.data.datasets[0].data = baseStorage;

    // Pad the custom storage array
    const customPadded = storage.slice();
    while (customPadded.length < allYears.length) {
        customPadded.push(null);
    }
    chart.data.datasets[1].data = customPadded;

    // Update dead-storage line length
    chart.data.datasets[2].data = allYears.map(function () {
        return pipelineData.metadata.dead_storage_mcm;
    });

    chart.update('none');
}

/* ============================================================
   5. COMPARISON STRIP
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

    // Add custom card at the end
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

    // Find which scenarios the custom scenario beats
    const order = ['A', 'B', 'C', 'D', 'E'];
    order.forEach(function (sid) {
        const card = document.querySelector('[data-id="' + sid + '"]');
        if (!card) return;
        const scenEOL = pipelineData.scenarios[sid].eol_year;
        card.classList.toggle('beaten', customEOL > scenEOL);
    });
}