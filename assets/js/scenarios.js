/* ============================================================
   RAWAL DSS — SCENARIO RANKING (Phase 7 + 7B)
   MCDA with live weight sliders + engineered cost estimator
   fed directly into the cost scoring dimension.
   ============================================================ */

let pipelineData = null;
let chart = null;
let datasetVisibility = { A: true, B: true, C: true, D: true, E: true };

/* ============================================================
   MES CSR RAWALPINDI 2-2025 — VERIFIED RATES
   All costs in PKR. Every rate tagged with its CSR source.
   ============================================================ */
const MES_RATES = {
    rcc_m20_insitu: {
        perCum: 29449.80,
        label: 'RCC M20 (1:1.5:3 nominal, laid in-situ)',
        source: 'MES CSR Rawalpindi 2-2025, Item 6a Type B'
    },
    pcc_1_2_4: {
        perCum: 16898.75,
        label: 'PCC 1:2:4',
        source: 'MES CSR Rawalpindi 2-2025, PCC 1:2:4'
    },
    steel_g60: {
        perKg: 299.63,
        label: 'Steel Grade 60 (fabricated + laid)',
        source: 'MES CSR Rawalpindi 2-2025, Grade 60 deformed bars'
    },
    excavation: {
        perCum: 258.15,
        label: 'Excavation in ordinary soil',
        source: 'MES CSR Rawalpindi 2-2025, Excavation ordinary soil'
    },
    stone_masonry_1_3: {
        perCum: 13921.35,
        label: 'Stone masonry in CM 1:3',
        source: 'MES CSR Rawalpindi 2-2025, Stone masonry 1:3'
    },
    gabion_netting: {
        perSqm: 925.65,
        label: 'GI wire netting (6" mesh, 10 SWG)',
        source: 'MES CSR Rawalpindi 2-2025, Gabion wire netting'
    },
    gabion_filling: {
        perCum: 2976.20,
        label: 'Stone filling in wire crates',
        source: 'MES CSR Rawalpindi 2-2025, Gabion stone filling'
    }
};

/* ============================================================
   TBTTP-ALIGNED AFFORESTATION DEFAULTS (separate from MES)
   ============================================================ */
const AFFOREST_DEFAULTS = {
    sapling_per_unit: 60,
    planting_labour_per_sapling: 40,
    maintenance_3yr_per_sapling: 75,
    site_prep_per_acre: 10000,
    overhead_pct: 20,
    source: 'Ten Billion Tree Tsunami Programme (Gov. Pakistan) unit-cost structure, scaled to 2025 MRS Punjab daily wage benchmarks.'
};

/* ============================================================
   Scenario meta — cost/complexity are DYNAMIC for B, D, E
   when auto-sync is enabled; fallback literature scores otherwise.
   ============================================================ */
const SCENARIO_META = {
    A: {
        cost_score_lit: 1,
        complexity_score: 1,
        implementation: 'No action. Current development trends continue. Zero capital, zero operational burden, but no mitigation benefit.'
    },
    B: {
        cost_score_lit: 5,
        complexity_score: 4,
        implementation: 'Watershed-scale check dam cascade across primary tributaries. Engineered cost computed from MES CSR Rawalpindi 2-2025 rates. Requires sediment-removal maintenance every 5-10 years to sustain trap efficiency.'
    },
    C: {
        cost_score_lit: 2,
        complexity_score: 7,
        implementation: 'Legislated 3km lake buffer plus slope-based development restrictions above 7 degrees. Low direct capital cost (regulatory framework + monitoring ~PKR 50M), but demands strong political will and displacement compensation.'
    },
    D: {
        cost_score_lit: 4,
        complexity_score: 3,
        implementation: 'Reforestation program reclaiming 300 acres/year of degraded watershed land. Engineered cost computed using TBTTP-aligned unit rates. Implementable through community forestry programs.'
    },
    E: {
        cost_score_lit: 8,
        complexity_score: 9,
        implementation: 'Integrated policy combining check dams, strict zoning, and afforestation simultaneously. Engineered cost = B + C + D + 10% multi-agency coordination overhead. Highest capital commitment and coordination burden.'
    }
};

/* ============================================================
   State for computed costs (fed into MCDA cost score)
   ============================================================ */
let computedCosts = {
    A: 0,
    B: 0,
    C: 50000000,
    D: 0,
    E: 0
};

/* ============================================================
   BOOTSTRAP
   ============================================================ */
document.addEventListener('rawal:ready', function (event) {
    pipelineData = event.detail;
    initSliders();
    initChart();
    buildChartToggles();
    buildDetailCards();
    initCostInputs();
    recomputeCosts();
    recomputeAll();
});

document.addEventListener('rawal:error', function (event) {
    console.error('Pipeline data failed to load:', event.detail);
});

/* ============================================================
   1. WEIGHT SLIDER WIRING
   ============================================================ */
function initSliders() {
    const ids = ['longevity', 'volume', 'cost', 'complexity'];
    ids.forEach(function (id) {
        const slider = document.getElementById('w-' + id);
        const label = document.getElementById('w-' + id + '-val');
        slider.addEventListener('input', function () {
            label.textContent = slider.value + '%';
            recomputeAll();
        });
    });

    document.getElementById('btn-reset-weights').addEventListener('click', function () {
        document.getElementById('w-longevity').value = 40;
        document.getElementById('w-longevity-val').textContent = '40%';
        document.getElementById('w-volume').value = 30;
        document.getElementById('w-volume-val').textContent = '30%';
        document.getElementById('w-cost').value = 15;
        document.getElementById('w-cost-val').textContent = '15%';
        document.getElementById('w-complexity').value = 15;
        document.getElementById('w-complexity-val').textContent = '15%';
        recomputeAll();
    });
}

function getNormalizedWeights() {
    const raw = {
        longevity: parseFloat(document.getElementById('w-longevity').value),
        volume: parseFloat(document.getElementById('w-volume').value),
        cost: parseFloat(document.getElementById('w-cost').value),
        complexity: parseFloat(document.getElementById('w-complexity').value)
    };
    const total = raw.longevity + raw.volume + raw.cost + raw.complexity;
    if (total === 0) return { longevity: 0.25, volume: 0.25, cost: 0.25, complexity: 0.25 };
    return {
        longevity: raw.longevity / total,
        volume: raw.volume / total,
        cost: raw.cost / total,
        complexity: raw.complexity / total
    };
}

/* ============================================================
   2. COST ESTIMATOR — CHECK DAM (Scenario B)
   ============================================================ */
function initCostInputs() {
    const damInputs = ['dam-count', 'dam-type', 'dam-height', 'dam-crest',
                       'dam-base', 'dam-top', 'dam-foundation'];
    const affInputs = ['aff-acres', 'aff-years', 'aff-density', 'aff-sapling',
                       'aff-labour', 'aff-maintenance', 'aff-siteprep', 'aff-overhead'];

    damInputs.concat(affInputs).forEach(function (id) {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', function () { recomputeCosts(); recomputeAll(); });
            el.addEventListener('change', function () { recomputeCosts(); recomputeAll(); });
        }
    });

    const scenC = document.getElementById('scen-c-cost');
    if (scenC) {
        scenC.addEventListener('input', function () { recomputeCosts(); recomputeAll(); });
    }

    const sync = document.getElementById('cost-autosync');
    if (sync) sync.addEventListener('change', function () { recomputeAll(); });
}

function computeCheckDamCost() {
    const n = parseInt(document.getElementById('dam-count').value) || 0;
    const type = document.getElementById('dam-type').value;
    const h = parseFloat(document.getElementById('dam-height').value) || 0;
    const L = parseFloat(document.getElementById('dam-crest').value) || 0;
    const b = parseFloat(document.getElementById('dam-base').value) || 0;
    const t = parseFloat(document.getElementById('dam-top').value) || 0;
    const fd = parseFloat(document.getElementById('dam-foundation').value) || 0;

    // Trapezoidal body volume per dam (cum)
    const crossSection = ((t + b) / 2) * h;
    const bodyVolume = crossSection * L;
    // Foundation trench
    const foundationVolume = fd * b * L;
    // Excavation = foundation + 10% working allowance
    const excavationVolume = foundationVolume * 1.10;
    // Approx upstream+downstream face surface (for gabion netting)
    const faceArea = 2 * (h * L) + 2 * (h * ((b + t) / 2));

    const items = [];
    let perDamCost = 0;

    // Excavation — all types
    const excCost = excavationVolume * MES_RATES.excavation.perCum;
    items.push({
        item: MES_RATES.excavation.label,
        qty: excavationVolume.toFixed(2),
        unit: 'cum',
        rate: MES_RATES.excavation.perCum,
        cost: excCost,
        source: MES_RATES.excavation.source
    });
    perDamCost += excCost;

    // PCC foundation — all types
    const pccCost = foundationVolume * MES_RATES.pcc_1_2_4.perCum;
    items.push({
        item: MES_RATES.pcc_1_2_4.label + ' (foundation)',
        qty: foundationVolume.toFixed(2),
        unit: 'cum',
        rate: MES_RATES.pcc_1_2_4.perCum,
        cost: pccCost,
        source: MES_RATES.pcc_1_2_4.source
    });
    perDamCost += pccCost;

    if (type === 'rcc') {
        const rccCost = bodyVolume * MES_RATES.rcc_m20_insitu.perCum;
        const steelQty = bodyVolume * 80; // 80 kg/cum standard
        const steelCost = steelQty * MES_RATES.steel_g60.perKg;
        items.push({ item: MES_RATES.rcc_m20_insitu.label, qty: bodyVolume.toFixed(2), unit: 'cum', rate: MES_RATES.rcc_m20_insitu.perCum, cost: rccCost, source: MES_RATES.rcc_m20_insitu.source });
        items.push({ item: MES_RATES.steel_g60.label + ' @ 80 kg/cum', qty: steelQty.toFixed(0), unit: 'kg', rate: MES_RATES.steel_g60.perKg, cost: steelCost, source: MES_RATES.steel_g60.source });
        perDamCost += rccCost + steelCost;
    } else if (type === 'gabion') {
        const gfCost = bodyVolume * MES_RATES.gabion_filling.perCum;
        const gnCost = faceArea * MES_RATES.gabion_netting.perSqm;
        items.push({ item: MES_RATES.gabion_filling.label, qty: bodyVolume.toFixed(2), unit: 'cum', rate: MES_RATES.gabion_filling.perCum, cost: gfCost, source: MES_RATES.gabion_filling.source });
        items.push({ item: MES_RATES.gabion_netting.label, qty: faceArea.toFixed(2), unit: 'sqm', rate: MES_RATES.gabion_netting.perSqm, cost: gnCost, source: MES_RATES.gabion_netting.source });
        perDamCost += gfCost + gnCost;
    } else if (type === 'masonry') {
        const msCost = bodyVolume * MES_RATES.stone_masonry_1_3.perCum;
        items.push({ item: MES_RATES.stone_masonry_1_3.label, qty: bodyVolume.toFixed(2), unit: 'cum', rate: MES_RATES.stone_masonry_1_3.perCum, cost: msCost, source: MES_RATES.stone_masonry_1_3.source });
        perDamCost += msCost;
    } else if (type === 'hybrid') {
        // 40% RCC (upper) + 40% gabion (apron) + 20% masonry (wings)
        const rccVol = bodyVolume * 0.40;
        const gabVol = bodyVolume * 0.40;
        const masVol = bodyVolume * 0.20;

        const rccCost = rccVol * MES_RATES.rcc_m20_insitu.perCum;
        const steelQty = rccVol * 80;
        const steelCost = steelQty * MES_RATES.steel_g60.perKg;
        const gfCost = gabVol * MES_RATES.gabion_filling.perCum;
        const gnArea = faceArea * 0.40;
        const gnCost = gnArea * MES_RATES.gabion_netting.perSqm;
        const msCost = masVol * MES_RATES.stone_masonry_1_3.perCum;

        items.push({ item: MES_RATES.rcc_m20_insitu.label + ' (upper 40%)', qty: rccVol.toFixed(2), unit: 'cum', rate: MES_RATES.rcc_m20_insitu.perCum, cost: rccCost, source: MES_RATES.rcc_m20_insitu.source });
        items.push({ item: MES_RATES.steel_g60.label + ' @ 80 kg/cum', qty: steelQty.toFixed(0), unit: 'kg', rate: MES_RATES.steel_g60.perKg, cost: steelCost, source: MES_RATES.steel_g60.source });
        items.push({ item: MES_RATES.gabion_filling.label + ' (apron 40%)', qty: gabVol.toFixed(2), unit: 'cum', rate: MES_RATES.gabion_filling.perCum, cost: gfCost, source: MES_RATES.gabion_filling.source });
        items.push({ item: MES_RATES.gabion_netting.label, qty: gnArea.toFixed(2), unit: 'sqm', rate: MES_RATES.gabion_netting.perSqm, cost: gnCost, source: MES_RATES.gabion_netting.source });
        items.push({ item: MES_RATES.stone_masonry_1_3.label + ' (wings 20%)', qty: masVol.toFixed(2), unit: 'cum', rate: MES_RATES.stone_masonry_1_3.perCum, cost: msCost, source: MES_RATES.stone_masonry_1_3.source });

        perDamCost += rccCost + steelCost + gfCost + gnCost + msCost;
    }

    const totalCost = perDamCost * n;
    return { perDamCost: perDamCost, numDams: n, totalCost: totalCost, items: items, excavationVolume: excavationVolume, bodyVolume: bodyVolume };
}

function computeAfforestCost() {
    const acresPerYr = parseFloat(document.getElementById('aff-acres').value) || 0;
    const years = parseInt(document.getElementById('aff-years').value) || 0;
    const density = parseFloat(document.getElementById('aff-density').value) || 0;
    const saplingRate = parseFloat(document.getElementById('aff-sapling').value) || 0;
    const labourRate = parseFloat(document.getElementById('aff-labour').value) || 0;
    const maintenanceRate = parseFloat(document.getElementById('aff-maintenance').value) || 0;
    const sitePrepRate = parseFloat(document.getElementById('aff-siteprep').value) || 0;
    const overheadPct = parseFloat(document.getElementById('aff-overhead').value) || 0;

    const totalAcres = acresPerYr * years;
    const totalSaplings = totalAcres * density;

    const saplingCost = totalSaplings * saplingRate;
    const labourCost = totalSaplings * labourRate;
    const maintenanceCost = totalSaplings * maintenanceRate;
    const sitePrepCost = totalAcres * sitePrepRate;

    const directSubtotal = saplingCost + labourCost + maintenanceCost + sitePrepCost;
    const overhead = directSubtotal * (overheadPct / 100);
    const totalCost = directSubtotal + overhead;

    const items = [
        { component: 'Saplings', basis: totalSaplings.toLocaleString() + ' units', unitRate: 'PKR ' + saplingRate + '/sapling', cost: saplingCost },
        { component: 'Planting labour', basis: totalSaplings.toLocaleString() + ' units', unitRate: 'PKR ' + labourRate + '/sapling', cost: labourCost },
        { component: '3-year maintenance', basis: totalSaplings.toLocaleString() + ' units', unitRate: 'PKR ' + maintenanceRate + '/sapling', cost: maintenanceCost },
        { component: 'Site preparation (fencing + earthwork)', basis: totalAcres.toLocaleString() + ' acres', unitRate: 'PKR ' + sitePrepRate.toLocaleString() + '/acre', cost: sitePrepCost },
        { component: 'Overhead / contractor profit', basis: overheadPct + '% of direct', unitRate: '—', cost: overhead }
    ];

    return {
        totalAcres: totalAcres,
        totalSaplings: totalSaplings,
        totalCost: totalCost,
        costPerAcre: totalAcres > 0 ? totalCost / totalAcres : 0,
        items: items
    };
}

function recomputeCosts() {
    // Check dam
    const damResult = computeCheckDamCost();
    renderDamBoq(damResult);

    // Afforestation
    const affResult = computeAfforestCost();
    renderAffBoq(affResult);

    // Scenario C (editable)
    const scenCmillions = parseFloat(document.getElementById('scen-c-cost').value) || 0;
    const scenCcost = scenCmillions * 1000000;

    // Scenario E = B + C + D + 10% coordination overhead
    const scenEcost = (damResult.totalCost + scenCcost + affResult.totalCost) * 1.10;

    computedCosts = {
        A: 0,
        B: damResult.totalCost,
        C: scenCcost,
        D: affResult.totalCost,
        E: scenEcost
    };

    renderCostRollup();
}

function renderDamBoq(result) {
    const tbody = document.getElementById('dam-boq-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    result.items.forEach(function (r) {
        const tr = document.createElement('tr');
        tr.innerHTML =
            '<td title="' + r.source + '">' + r.item + '</td>' +
            '<td>' + r.qty + '</td>' +
            '<td>' + r.unit + '</td>' +
            '<td>' + Math.round(r.rate).toLocaleString() + '</td>' +
            '<td>' + Math.round(r.cost).toLocaleString() + '</td>';
        tbody.appendChild(tr);
    });
    document.getElementById('dam-per-cost').textContent = 'PKR ' + formatMoney(result.perDamCost);
    document.getElementById('dam-exc-vol').textContent = result.excavationVolume.toFixed(2) + ' cum';
    document.getElementById('dam-total-cost').textContent = 'PKR ' + formatMoney(result.totalCost) + '  (' + result.numDams + ' dams)';
}

function renderAffBoq(result) {
    const tbody = document.getElementById('aff-boq-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    result.items.forEach(function (r) {
        const tr = document.createElement('tr');
        tr.innerHTML =
            '<td>' + r.component + '</td>' +
            '<td>' + r.basis + '</td>' +
            '<td>' + r.unitRate + '</td>' +
            '<td>' + Math.round(r.cost).toLocaleString() + '</td>';
        tbody.appendChild(tr);
    });
    document.getElementById('aff-total-acres').textContent = result.totalAcres.toLocaleString() + ' ac';
    document.getElementById('aff-total-saplings').textContent = result.totalSaplings.toLocaleString();
    document.getElementById('aff-per-acre').textContent = 'PKR ' + formatMoney(result.costPerAcre);
    document.getElementById('aff-total-cost').textContent = 'PKR ' + formatMoney(result.totalCost);
}

function renderCostRollup() {
    const grid = document.getElementById('cost-rollup-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const order = ['A', 'B', 'C', 'D', 'E'];
    order.forEach(function (sid) {
        const scen = pipelineData.scenarios[sid];
        const cost = computedCosts[sid];
        const card = document.createElement('div');
        card.className = 'cost-rollup-card';
        card.style.borderTopColor = scen.color;
        card.innerHTML =
            '<div class="cost-rollup-id" style="color:' + scen.color + '">' + sid + '</div>' +
            '<div class="cost-rollup-name">' + scen.name + '</div>' +
            '<div class="cost-rollup-value">PKR ' + formatMoney(cost) + '</div>';
        grid.appendChild(card);
    });
}

function formatMoney(x) {
    if (!x) return '0';
    if (x >= 1e9) return (x / 1e9).toFixed(2) + ' B';
    if (x >= 1e6) return (x / 1e6).toFixed(2) + ' M';
    if (x >= 1e3) return (x / 1e3).toFixed(1) + ' K';
    return Math.round(x).toLocaleString();
}

/* ============================================================
   3. COST SCORE FROM ACTUAL CURRENCY (feeds MCDA)
   ============================================================ */
function costScoreFromActual(sid) {
    const autoSyncEl = document.getElementById('cost-autosync');
    const useAuto = autoSyncEl ? autoSyncEl.checked : true;
    if (!useAuto) {
        // Fall back to original literature scores (inverted: lower cost = higher benefit)
        return 11 - SCENARIO_META[sid].cost_score_lit;
    }
    const values = Object.values(computedCosts);
    const maxCost = Math.max.apply(null, values);
    if (maxCost === 0) return 10;
    const cost = computedCosts[sid];
    // 10 at cost=0, 1 at cost=max. Linear inverse map.
    const score = 10 - (9 * cost / maxCost);
    return Math.max(1, Math.min(10, score));
}

/* ============================================================
   4. SCORE COMPUTATION
   ============================================================ */
function computeScoresForAllScenarios() {
    const scenarios = pipelineData.scenarios;
    const baselineEOL = pipelineData.metadata.baseline_eol_year;
    const deadStorage = pipelineData.metadata.dead_storage_mcm;

    let maxYearsGained = 0;
    let maxMCMPreserved = 0;

    ['A', 'B', 'C', 'D', 'E'].forEach(function (sid) {
        const scen = scenarios[sid];
        const yg = scen.years_gained_vs_baseline;
        let mcmAt2088 = deadStorage;
        for (let i = 0; i < scen.years.length; i++) {
            if (scen.years[i] === baselineEOL) { mcmAt2088 = scen.storage_mcm[i]; break; }
        }
        const preserved = Math.max(0, mcmAt2088 - deadStorage);
        if (yg > maxYearsGained) maxYearsGained = yg;
        if (preserved > maxMCMPreserved) maxMCMPreserved = preserved;
    });

    const results = {};
    ['A', 'B', 'C', 'D', 'E'].forEach(function (sid) {
        const scen = scenarios[sid];
        const meta = SCENARIO_META[sid];
        const yg = scen.years_gained_vs_baseline;
        let mcmAt2088 = deadStorage;
        for (let i = 0; i < scen.years.length; i++) {
            if (scen.years[i] === baselineEOL) { mcmAt2088 = scen.storage_mcm[i]; break; }
        }
        const preserved = Math.max(0, mcmAt2088 - deadStorage);
        const longevityScore = maxYearsGained > 0 ? 1 + (yg / maxYearsGained) * 9 : 1;
        const volumeScore = maxMCMPreserved > 0 ? 1 + (preserved / maxMCMPreserved) * 9 : 1;
        const costScore = costScoreFromActual(sid);
        const complexityScore = 11 - meta.complexity_score;

        results[sid] = {
            id: sid, name: scen.name, color: scen.color,
            eol: scen.eol_year, yearsGained: yg, mcmPreserved: preserved,
            actualCost: computedCosts[sid],
            scores: { longevity: longevityScore, volume: volumeScore, cost: costScore, complexity: complexityScore },
            rawMeta: meta
        };
    });
    return results;
}

function computeWeightedTotals(scoreResults, weights) {
    const withTotals = {};
    Object.keys(scoreResults).forEach(function (sid) {
        const r = scoreResults[sid];
        const total =
            r.scores.longevity * weights.longevity +
            r.scores.volume * weights.volume +
            r.scores.cost * weights.cost +
            r.scores.complexity * weights.complexity;
        withTotals[sid] = Object.assign({}, r, { total: total });
    });
    return withTotals;
}

function getSortedRanking(withTotals) {
    const arr = Object.values(withTotals);
    arr.sort(function (a, b) { return b.total - a.total; });
    return arr;
}

/* ============================================================
   5. RANKED WINNER STRIP
   ============================================================ */
function renderRankGrid(ranking) {
    const grid = document.getElementById('rank-grid');
    grid.innerHTML = '';
    ranking.forEach(function (r, idx) {
        const rank = idx + 1;
        const card = document.createElement('div');
        card.className = 'rank-card rank-' + rank;
        card.style.borderTopColor = r.color;
        const gainedSign = r.yearsGained > 0 ? '+' : '';
        card.innerHTML =
            '<div class="rank-badge">#' + rank + '</div>' +
            '<div class="rank-id" style="color:' + r.color + '">' + r.id + '</div>' +
            '<div class="rank-name">' + r.name + '</div>' +
            '<div class="rank-sep"></div>' +
            '<div class="rank-metric"><span>EOL year</span><strong>' + r.eol + '</strong></div>' +
            '<div class="rank-metric"><span>Years gained</span><strong>' + gainedSign + r.yearsGained + '</strong></div>' +
            '<div class="rank-metric"><span>MCM preserved</span><strong>' + r.mcmPreserved.toFixed(2) + '</strong></div>' +
            '<div class="rank-metric"><span>Cost (PKR)</span><strong>' + formatMoney(r.actualCost) + '</strong></div>' +
            '<div class="rank-score"><span>Weighted score</span><strong>' + r.total.toFixed(2) + '</strong></div>';
        grid.appendChild(card);
    });
}

/* ============================================================
   6. MCDA TABLE
   ============================================================ */
function renderMcdaTable(withTotals) {
    const tbody = document.getElementById('mcda-tbody');
    tbody.innerHTML = '';
    const arr = Object.values(withTotals);
    arr.sort(function (a, b) { return b.total - a.total; });
    arr.forEach(function (r) {
        const row = document.createElement('tr');
        row.innerHTML =
            '<td class="mcda-scen"><span class="mcda-dot" style="background:' + r.color + '"></span>' +
                r.id + ' · ' + r.name + '</td>' +
            '<td>' + r.scores.longevity.toFixed(1) + '</td>' +
            '<td>' + r.scores.volume.toFixed(1) + '</td>' +
            '<td>' + r.scores.cost.toFixed(1) + '</td>' +
            '<td>' + r.scores.complexity.toFixed(1) + '</td>' +
            '<td class="mcda-total">' + r.total.toFixed(2) + '</td>';
        tbody.appendChild(row);
    });
}

/* ============================================================
   7. CHART.JS (unchanged from Phase 7)
   ============================================================ */
function initChart() {
    const ctx = document.getElementById('scen-chart').getContext('2d');
    const scenarios = pipelineData.scenarios;
    const deadStorage = pipelineData.metadata.dead_storage_mcm;
    const ids = ['A', 'B', 'C', 'D', 'E'];
    let maxLen = 0;
    let longestYears = [];
    ids.forEach(function (sid) {
        if (scenarios[sid].years.length > maxLen) {
            maxLen = scenarios[sid].years.length;
            longestYears = scenarios[sid].years;
        }
    });
    const datasets = ids.map(function (sid) {
        const scen = scenarios[sid];
        const padded = scen.storage_mcm.slice();
        while (padded.length < maxLen) padded.push(null);
        return {
            label: sid + ' · ' + scen.name,
            data: padded,
            borderColor: scen.color,
            backgroundColor: scen.color + '20',
            borderWidth: 2.5,
            fill: false,
            pointRadius: 0,
            tension: 0.15,
            hidden: false,
            scenId: sid
        };
    });
    datasets.push({
        label: 'Dead-storage threshold',
        data: longestYears.map(function () { return deadStorage; }),
        borderColor: '#888', borderWidth: 2, borderDash: [2, 3],
        fill: false, pointRadius: 0, scenId: 'threshold'
    });
    chart = new Chart(ctx, {
        type: 'line',
        data: { labels: longestYears, datasets: datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (ctx) {
                            if (ctx.parsed.y == null) return null;
                            return ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(2) + ' MCM';
                        }
                    }
                }
            },
            scales: {
                x: { title: { display: true, text: 'Year', color: '#8e99b8' },
                     ticks: { color: '#8e99b8', maxTicksLimit: 14 },
                     grid: { color: 'rgba(255,255,255,0.04)' } },
                y: { title: { display: true, text: 'Storage capacity (MCM)', color: '#8e99b8' },
                     ticks: { color: '#8e99b8' },
                     grid: { color: 'rgba(255,255,255,0.04)' },
                     beginAtZero: false }
            }
        }
    });
}

function buildChartToggles() {
    const toggleContainer = document.getElementById('chart-toggles');
    const scenarios = pipelineData.scenarios;
    const ids = ['A', 'B', 'C', 'D', 'E'];
    toggleContainer.innerHTML = '';
    ids.forEach(function (sid) {
        const scen = scenarios[sid];
        const label = document.createElement('label');
        label.className = 'chart-toggle';
        label.innerHTML =
            '<input type="checkbox" data-toggle="' + sid + '" checked>' +
            '<span class="chart-toggle-dot" style="background:' + scen.color + '"></span>' +
            '<span class="chart-toggle-name">' + sid + '</span>';
        toggleContainer.appendChild(label);
    });
    toggleContainer.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
        cb.addEventListener('change', function (e) {
            const sid = e.target.getAttribute('data-toggle');
            datasetVisibility[sid] = e.target.checked;
            const ds = chart.data.datasets.find(function (d) { return d.scenId === sid; });
            if (ds) ds.hidden = !e.target.checked;
            chart.update('none');
        });
    });
}

/* ============================================================
   8. DETAIL CARDS (with cost now shown)
   ============================================================ */
function buildDetailCards() {
    const grid = document.getElementById('detail-cards');
    const scenarios = pipelineData.scenarios;
    const baselineEOL = pipelineData.metadata.baseline_eol_year;
    const deadStorage = pipelineData.metadata.dead_storage_mcm;
    grid.innerHTML = '';
    ['A', 'B', 'C', 'D', 'E'].forEach(function (sid) {
        const scen = scenarios[sid];
        const meta = SCENARIO_META[sid];
        let mcmAt2088 = deadStorage;
        for (let i = 0; i < scen.years.length; i++) {
            if (scen.years[i] === baselineEOL) { mcmAt2088 = scen.storage_mcm[i]; break; }
        }
        const preserved = Math.max(0, mcmAt2088 - deadStorage);
        const gainedSign = scen.years_gained_vs_baseline > 0 ? '+' : '';
        const card = document.createElement('div');
        card.className = 'detail-card';
        card.id = 'detail-card-' + sid;
        card.style.borderTopColor = scen.color;
        card.innerHTML =
            '<div class="detail-head">' +
                '<span class="detail-id" style="color:' + scen.color + '">' + sid + '</span>' +
                '<h3>' + scen.name + '</h3>' +
            '</div>' +
            '<p class="detail-desc">' + scen.description + '</p>' +
            '<div class="detail-metrics">' +
                '<div><span>EOL year</span><strong>' + scen.eol_year + '</strong></div>' +
                '<div><span>Years gained</span><strong>' + gainedSign + scen.years_gained_vs_baseline + '</strong></div>' +
                '<div><span>MCM preserved @ 2088</span><strong>' + preserved.toFixed(2) + '</strong></div>' +
                '<div><span>Engineered cost</span><strong class="detail-cost" data-sid="' + sid + '">—</strong></div>' +
                '<div><span>Complexity (lit.)</span><strong>' + meta.complexity_score + '/10</strong></div>' +
            '</div>' +
            '<p class="detail-impl">' + meta.implementation + '</p>';
        grid.appendChild(card);
    });
}

function updateDetailCostLabels() {
    document.querySelectorAll('.detail-cost').forEach(function (el) {
        const sid = el.getAttribute('data-sid');
        el.textContent = 'PKR ' + formatMoney(computedCosts[sid]);
    });
}

/* ============================================================
   9. RECOMMENDATION PANEL
   ============================================================ */
function renderRecommendation(ranking, weights) {
    const top = ranking[0];
    const runnerUp = ranking[1];
    const gainedSign = top.yearsGained > 0 ? '+' : '';

    document.getElementById('reco-neutral-id').textContent = '#1 · ' + top.id;
    document.getElementById('reco-neutral-id').style.color = top.color;
    document.getElementById('reco-neutral-name').textContent = top.name;
    document.getElementById('reco-neutral-eol').textContent = top.eol;
    document.getElementById('reco-neutral-gained').textContent = gainedSign + top.yearsGained + ' years';
    document.getElementById('reco-neutral-score').textContent = top.total.toFixed(2);

    const explicitEl = document.getElementById('reco-explicit-text');
    const wPct = {
        longevity: Math.round(weights.longevity * 100),
        volume: Math.round(weights.volume * 100),
        cost: Math.round(weights.cost * 100),
        complexity: Math.round(weights.complexity * 100)
    };
    const priorityEntries = Object.entries(wPct).sort(function (a, b) { return b[1] - a[1]; });
    const topPriority = priorityEntries[0][0];
    const topPriorityPct = priorityEntries[0][1];
    const priorityDescriptions = {
        longevity: 'maximum dam lifespan',
        volume: 'preserved reservoir capacity at the baseline failure year',
        cost: 'minimum implementation cost',
        complexity: 'simplest institutional implementation'
    };
    const margin = top.total - runnerUp.total;
    let confidenceText;
    if (margin > 1.5) confidenceText = 'decisively outperforms';
    else if (margin > 0.5) confidenceText = 'outperforms';
    else confidenceText = 'narrowly edges out';

    explicitEl.innerHTML =
        'Under your current weights (longevity ' + wPct.longevity + '%, volume ' + wPct.volume +
        '%, cost ' + wPct.cost + '%, complexity ' + wPct.complexity + '%), <strong>Scenario ' +
        top.id + ' — ' + top.name + '</strong> ' + confidenceText + ' the alternatives with a ' +
        'weighted score of ' + top.total.toFixed(2) + ' against ' + runnerUp.id + '\'s ' +
        runnerUp.total.toFixed(2) + '. ' +
        'Because your highest weighting (' + topPriorityPct + '%) is on ' +
        priorityDescriptions[topPriority] + ', Scenario ' + top.id + ' aligns best with that priority — ' +
        'delivering ' + gainedSign + top.yearsGained + ' years of added dam life, ' +
        top.mcmPreserved.toFixed(2) + ' MCM preserved at the 2088 baseline failure point, ' +
        'at an engineered cost of PKR ' + formatMoney(top.actualCost) + '. ' +
        'Runner-up Scenario ' + runnerUp.id + ' trails by ' + margin.toFixed(2) + ' points.';
}

/* ============================================================
   10. MASTER RECOMPUTE
   ============================================================ */
function recomputeAll() {
    const scoreResults = computeScoresForAllScenarios();
    const weights = getNormalizedWeights();
    const withTotals = computeWeightedTotals(scoreResults, weights);
    const ranking = getSortedRanking(withTotals);
    renderRankGrid(ranking);
    renderMcdaTable(withTotals);
    renderRecommendation(ranking, weights);
    updateDetailCostLabels();
}