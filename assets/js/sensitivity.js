/* ============================================================
    RAWAL DSS — SENSITIVITY ANALYSIS (Phase 12)
    One-at-a-time (OAT) sensitivity analysis. Each calibration
    constant is perturbed by +/- X% (user-controlled, default
    20%), the sediment-accounting loop is re-run, and the EOL
    year is recorded for each variant. Results render as a
    horizontal tornado chart, a numerical table, and an
    auto-generated commentary block identifying the most
    sensitive parameters.

    The forward simulation equations here are identical to those
    in the Simulator page (simulator.js simulateOnce). Keeping
    them duplicated rather than imported preserves the Phase 6
    validation: each page's math engine stands on its own.
    ============================================================ */

let pipelineData = null;
let tornadoChart = null;

/* ============================================================
    Parameter definitions — the six calibration constants
    varied by this analysis. Each has a baseline value, a
    human-readable label, and an accessor function that
    receives a fresh params object built from baseline and
    returns a mutated version with the chosen parameter
    replaced by the variant value.
    ============================================================ */
function getParameterDefinitions(data) {
    const meta = data.metadata;
    const ws   = data.watershed;
    const lg   = data.logistic_growth;

    return [
        {
            id: 'baseRate',
            label: 'Base sediment rate',
            unit: 'MCM/yr',
            baseline: meta.base_sediment_rate_mcm_per_year,
            apply: function (params, value) { params.baseRate = value; }
        },
        {
            id: 'r',
            label: 'Logistic growth rate (r)',
            unit: '',
            baseline: lg.r_rate,
            apply: function (params, value) { params.r = value; }
        },
        {
            id: 'A',
            label: 'Logistic shape (A)',
            unit: '',
            baseline: lg.A_factor,
            apply: function (params, value) { params.A = value; }
        },
        {
            id: 'K',
            label: 'Carrying capacity (K)',
            unit: 'acres',
            baseline: lg.carrying_capacity_acres,
            apply: function (params, value) { params.K = value; }
        },
        {
            id: 'climate',
            label: 'Climate multiplier',
            unit: '',
            baseline: 1.05,
            apply: function (params, value) { params.climateMult = value; }
        },
        {
            id: 'urban2024',
            label: '2024 starting urban',
            unit: 'acres',
            baseline: ws.current_urban_acres_2024,
            apply: function (params, value) { params.urban2024 = value; }
        }
    ];
}

/* ============================================================
    Build the default (baseline) parameter object for a run.
    ============================================================ */
function buildBaselineParams(data) {
    const meta = data.metadata;
    const ws   = data.watershed;
    const lg   = data.logistic_growth;

    return {
        baseRate:     meta.base_sediment_rate_mcm_per_year,
        r:            lg.r_rate,
        A:            lg.A_factor,
        K:            lg.carrying_capacity_acres,
        climateMult:  1.05,
        urban2024:    ws.current_urban_acres_2024,
        // Policy inputs held at Scenario A defaults for sensitivity analysis
        trapPct:      0,
        afforestRate: 0,
        zoningPct:    0,
        // Structural constants (not varied)
        baseline2000: ws.baseline_urban_acres_2000,
        watershedAc:  ws.total_acres,
        deadStorage:  meta.dead_storage_mcm,
        startStorage: data.historical.storage_mcm[data.historical.storage_mcm.length - 1]
    };
}

/* ============================================================
    Core simulation — mirrors simulateOnce from simulator.js.
    Returns the EOL year for the given params.
    ============================================================ */
function simulateForEOL(params) {
    let currentStorage = params.startStorage;
    let currentAcres   = params.urban2024;
    let currentYear    = 2024;

    while (currentStorage > params.deadStorage && currentYear < 2300) {
        currentYear += 1;
        const t = currentYear - 2000;

        const demandAcres = params.K / (1 + params.A * Math.exp(-params.r * t));

        const unrestrainedNew = demandAcres - currentAcres;
        const throttledNew = Math.max(0, unrestrainedNew * (1 - params.zoningPct));
        currentAcres += throttledNew;

        const cumulativeReclaim = params.afforestRate * (currentYear - 2024);
        const newSprawlSince2000 = currentAcres - params.baseline2000;
        const effectiveSprawl = Math.max(0, newSprawlSince2000 - cumulativeReclaim);

        const transformedFraction = effectiveSprawl / params.watershedAc;
        const sprawlMult = 1.0 + transformedFraction;

        let incrementalLoss = params.baseRate * sprawlMult * params.climateMult;
        incrementalLoss = incrementalLoss * (1 - params.trapPct);

        currentStorage -= incrementalLoss;
    }

    return currentYear;
}

/* ============================================================
    Compute the sensitivity result for every parameter.
    ============================================================ */
function computeSensitivity(variationPct) {
    const params = getParameterDefinitions(pipelineData);
    const fraction = variationPct / 100;

    // Establish the baseline EOL by running with all params at baseline.
    const baseParams = buildBaselineParams(pipelineData);
    const baselineEOL = simulateForEOL(baseParams);

    const results = params.map(function (p) {
        // Low variant
        const lowValue = p.baseline * (1 - fraction);
        const lowParams = buildBaselineParams(pipelineData);
        p.apply(lowParams, lowValue);
        const lowEOL = simulateForEOL(lowParams);

        // High variant
        const highValue = p.baseline * (1 + fraction);
        const highParams = buildBaselineParams(pipelineData);
        p.apply(highParams, highValue);
        const highEOL = simulateForEOL(highParams);

        // Shifts relative to baseline EOL
        const lowShift  = lowEOL - baselineEOL;
        const highShift = highEOL - baselineEOL;
        const totalSwing = Math.abs(lowShift) + Math.abs(highShift);

        return {
            id: p.id,
            label: p.label,
            unit: p.unit,
            baseline: p.baseline,
            lowValue: lowValue,
            highValue: highValue,
            lowEOL: lowEOL,
            highEOL: highEOL,
            lowShift: lowShift,
            highShift: highShift,
            totalSwing: totalSwing
        };
    });

    // Sort by total swing, descending — most sensitive first
    results.sort(function (a, b) { return b.totalSwing - a.totalSwing; });

    return { baselineEOL: baselineEOL, results: results };
}

/* ============================================================
    Tornado chart rendering. Uses Chart.js horizontal bar chart
    with two stacked datasets: orange (low variant shift) and
    teal (high variant shift). Values expressed as
    signed year-shift from baseline.
    ============================================================ */
function initChart(sensitivity) {
    const ctx = document.getElementById('tornado-chart').getContext('2d');
    const labels = sensitivity.results.map(function (r) { return r.label; });

    // Low variant bar — one value per parameter, often negative
    const lowData  = sensitivity.results.map(function (r) { return r.lowShift; });
    const highData = sensitivity.results.map(function (r) { return r.highShift; });

    tornadoChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Low variant (-X%)',
                    data: lowData,
                    backgroundColor: 'rgba(251, 140, 0, 0.85)',
                    borderColor: '#fb8c00',
                    borderWidth: 1
                },
                {
                    label: 'High variant (+X%)',
                    data: highData,
                    backgroundColor: 'rgba(20, 184, 166, 0.85)',
                    borderColor: '#14b8a6',
                    borderWidth: 1
                }
            ]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#c5cce0',
                        font: { size: 12, family: 'Inter' }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (ctx) {
                            const val = ctx.parsed.x;
                            const sign = val >= 0 ? '+' : '';
                            return ctx.dataset.label + ': ' + sign + val + ' years';
                        },
                        title: function (ctxs) { return ctxs[0].label; }
                    }
                },
                // Vertical line at 0 (baseline) — inline annotation via plugin-free trick:
                // we add a tick at 0 and style it in the scale options below.
            },
            scales: {
                x: {
                    stacked: false,
                    title: {
                        display: true,
                        text: 'EOL shift from baseline (years)',
                        color: '#8e99b8',
                        font: { size: 12, family: 'Inter', weight: '600' }
                    },
                    ticks: {
                        color: '#8e99b8',
                        callback: function (value) {
                            return (value >= 0 ? '+' : '') + value;
                        }
                    },
                    grid: {
                        color: function (ctx) {
                            return ctx.tick.value === 0
                                ? 'rgba(197, 204, 224, 0.5)'
                                : 'rgba(255,255,255,0.04)';
                        },
                        lineWidth: function (ctx) {
                            return ctx.tick.value === 0 ? 2 : 1;
                        }
                    }
                },
                y: {
                    stacked: false,
                    ticks: {
                        color: '#c5cce0',
                        font: { size: 12, family: 'Inter', weight: '500' }
                    },
                    grid: { display: false }
                }
            }
        }
    });
}

function updateChart(sensitivity, variationPct) {
    if (!tornadoChart) return;

    tornadoChart.data.labels = sensitivity.results.map(function (r) { return r.label; });
    tornadoChart.data.datasets[0].label = 'Low variant (-' + variationPct + '%)';
    tornadoChart.data.datasets[0].data  = sensitivity.results.map(function (r) { return r.lowShift; });
    tornadoChart.data.datasets[1].label = 'High variant (+' + variationPct + '%)';
    tornadoChart.data.datasets[1].data  = sensitivity.results.map(function (r) { return r.highShift; });

    tornadoChart.update('none');
}

/* ============================================================
    Numerical table.
    ============================================================ */
function renderTable(sensitivity) {
    const tbody = document.getElementById('sens-tbody');
    tbody.innerHTML = '';

    sensitivity.results.forEach(function (r) {
        const tr = document.createElement('tr');
        const unit = r.unit ? ' ' + r.unit : '';
        tr.innerHTML =
            '<td class="sens-param-cell">' + r.label + '</td>' +
            '<td>' + formatNumber(r.baseline) + unit + '</td>' +
            '<td>' + formatNumber(r.lowValue) + unit + '</td>' +
            '<td class="sens-shift-cell">' + r.lowEOL +
                '<span class="sens-shift">' + formatShift(r.lowShift) + '</span></td>' +
            '<td>' + formatNumber(r.highValue) + unit + '</td>' +
            '<td class="sens-shift-cell">' + r.highEOL +
                '<span class="sens-shift">' + formatShift(r.highShift) + '</span></td>' +
            '<td class="sens-swing-cell">' + r.totalSwing + ' yrs</td>';
        tbody.appendChild(tr);
    });
}

function formatNumber(n) {
    if (n >= 1000) return Math.round(n).toLocaleString();
    if (Math.abs(n) >= 1) return n.toFixed(3);
    return n.toFixed(5);
}

function formatShift(shift) {
    if (shift > 0) return ' (+' + shift + ')';
    if (shift < 0) return ' (' + shift + ')';
    return ' (±0)';
}

/* ============================================================
    Auto-generated commentary identifying the top 2 most
    sensitive parameters and explaining what it means.
    ============================================================ */
function renderCommentary(sensitivity, variationPct) {
    const container = document.getElementById('sens-commentary');
    const top1 = sensitivity.results[0];
    const top2 = sensitivity.results[1];
    const leastSensitive = sensitivity.results[sensitivity.results.length - 1];

    container.innerHTML =
        '<p>At &plusmn;' + variationPct + '% variation, the forecast is most sensitive to ' +
        '<strong>' + top1.label + '</strong> ' +
        '(total swing of <strong>' + top1.totalSwing + ' years</strong>), followed by ' +
        '<strong>' + top2.label + '</strong> (' + top2.totalSwing + ' years). ' +
        'A ' + variationPct + '% over-estimate of ' + top1.label.toLowerCase() +
        ' alone would shift the projected end-of-life by ' +
        Math.abs(top1.highShift) + ' years from the baseline 2088.</p>' +

        '<p>The least sensitive parameter is <strong>' + leastSensitive.label + '</strong> ' +
        '(' + leastSensitive.totalSwing + '-year swing). Errors in this parameter have a ' +
        'negligible effect on the forecast compared with errors in the top two.</p>' +

        '<p>The practical implication for this work: the <strong>' + top1.label + '</strong> ' +
        'calibration deserves the most rigorous defence at the committee stage, since ' +
        'small errors in it compound into the largest forecast uncertainty. The ' +
        'corresponding entries in the <a href="methodology.html">methodology</a> ' +
        'document the calibration procedure and anchor points for this parameter.</p>';
}

/* ============================================================
    Slider wiring — drives the full recompute pipeline.
    ============================================================ */
function wireSlider() {
    const slider = document.getElementById('slider-variation');
    const label  = document.getElementById('val-variation');

    slider.addEventListener('input', function () {
        const v = parseInt(slider.value, 10);
        label.textContent = '\u00B1' + v + '%';
        const sensitivity = computeSensitivity(v);
        updateChart(sensitivity, v);
        renderTable(sensitivity);
        renderCommentary(sensitivity, v);
    });
}

/* ============================================================
    Master init — called once rawal:ready fires.
    ============================================================ */
document.addEventListener('rawal:ready', function (event) {
    pipelineData = event.detail;

    document.getElementById('baseline-eol').textContent =
        pipelineData.metadata.baseline_eol_year;

    const sensitivity = computeSensitivity(20);
    initChart(sensitivity);
    renderTable(sensitivity);
    renderCommentary(sensitivity, 20);
    wireSlider();
});

document.addEventListener('rawal:error', function (event) {
    console.error('Sensitivity page: pipeline data load failed', event.detail);
});