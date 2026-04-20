/* ============================================================
   RAWAL DSS — DASHBOARD SCRIPT
   Handles tab switching and renders all Plotly charts using
   pipeline data exposed via window.RAWAL.
   ============================================================ */

// ------------------------------------------------------------
// Shared Plotly theme — applied to every chart for consistency
// ------------------------------------------------------------
const RAWAL_PLOTLY_LAYOUT = {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: {
        family: 'Inter, sans-serif',
        color: '#e6ecff',
        size: 12
    },
    margin: { t: 30, r: 30, b: 50, l: 60 },
    xaxis: {
        gridcolor: '#2a3358',
        linecolor: '#2a3358',
        zerolinecolor: '#2a3358',
        tickfont: { family: 'JetBrains Mono, monospace', size: 11 }
    },
    yaxis: {
        gridcolor: '#2a3358',
        linecolor: '#2a3358',
        zerolinecolor: '#2a3358',
        tickfont: { family: 'JetBrains Mono, monospace', size: 11 }
    },
    legend: {
        bgcolor: 'rgba(0,0,0,0)',
        font: { size: 11 }
    },
    hoverlabel: {
        bgcolor: '#1c2340',
        bordercolor: '#14b8a6',
        font: { family: 'JetBrains Mono, monospace', color: '#e6ecff' }
    }
};

const RAWAL_PLOTLY_CONFIG = {
    responsive: true,
    displaylogo: false,
    modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'],
    toImageButtonOptions: {
        format: 'png',
        filename: 'rawal-dss-chart',
        scale: 2
    }
};

// ------------------------------------------------------------
// TAB SWITCHING
// ------------------------------------------------------------
function initTabs() {
    const buttons = document.querySelectorAll('.tab-button');
    const panels = document.querySelectorAll('.tab-panel');

    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');

            buttons.forEach(b => b.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            const targetPanel = document.getElementById('panel-' + targetTab);
            if (targetPanel) {
                targetPanel.classList.add('active');
                // Trigger Plotly resize because hidden plots don't size correctly
                window.dispatchEvent(new Event('resize'));
            }
        });
    });
}

// ------------------------------------------------------------
// SIDEBAR STATUS INDICATOR
// ------------------------------------------------------------
function updateSidebarStatus(state, text) {
    const el = document.getElementById('sidebar-status-box');
    if (!el) return;
    el.className = 'status-pill ' + state;
    el.textContent = text;
}

// ------------------------------------------------------------
// HELPER: Build a stat card HTML string
// ------------------------------------------------------------
function statCard(value, label) {
    return '<div class="stat-card">' +
           '<span class="stat-value">' + value + '</span>' +
           '<span class="stat-label">' + label + '</span>' +
           '</div>';
}

// ------------------------------------------------------------
// CHART 1: Reservoir Surface Area
// ------------------------------------------------------------
function drawHydroArea(historical) {
    const trace = {
        x: historical.years,
        y: historical.water_area_acres,
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Surface Area',
        line: { color: '#14b8a6', width: 3, shape: 'spline' },
        marker: { size: 10, color: '#14b8a6', line: { color: '#e6ecff', width: 2 } },
        fill: 'tozeroy',
        fillcolor: 'rgba(20, 184, 166, 0.15)',
        hovertemplate: '<b>%{x}</b><br>Area: %{y:.1f} acres<extra></extra>'
    };

    const layout = Object.assign({}, RAWAL_PLOTLY_LAYOUT, {
        xaxis: Object.assign({}, RAWAL_PLOTLY_LAYOUT.xaxis, { title: 'Year', type: 'category' }),
        yaxis: Object.assign({}, RAWAL_PLOTLY_LAYOUT.yaxis, { title: 'Acres' })
    });

    Plotly.newPlot('chart-hydro-area', [trace], layout, RAWAL_PLOTLY_CONFIG);
}

// ------------------------------------------------------------
// CHART 2: Storage Capacity
// ------------------------------------------------------------
function drawHydroStorage(historical) {
    const trace = {
        x: historical.years,
        y: historical.storage_mcm,
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Storage',
        line: { color: '#e53935', width: 3, shape: 'spline' },
        marker: { size: 10, color: '#e53935', symbol: 'square', line: { color: '#e6ecff', width: 2 } },
        fill: 'tozeroy',
        fillcolor: 'rgba(229, 57, 53, 0.12)',
        hovertemplate: '<b>%{x}</b><br>Storage: %{y:.2f} MCM<extra></extra>'
    };

    const layout = Object.assign({}, RAWAL_PLOTLY_LAYOUT, {
        xaxis: Object.assign({}, RAWAL_PLOTLY_LAYOUT.xaxis, { title: 'Year', type: 'category' }),
        yaxis: Object.assign({}, RAWAL_PLOTLY_LAYOUT.yaxis, { title: 'MCM' })
    });

    Plotly.newPlot('chart-hydro-storage', [trace], layout, RAWAL_PLOTLY_CONFIG);
}

// ------------------------------------------------------------
// CHART 3: Precipitation
// ------------------------------------------------------------
function drawClimatePrecip(historical, baseline) {
    const trace = {
        x: historical.years,
        y: historical.precip_mm,
        type: 'bar',
        name: 'Annual Precipitation',
        marker: { color: '#1e88e5', line: { color: '#1976d2', width: 1 } },
        hovertemplate: '<b>%{x}</b><br>%{y:.0f} mm<extra></extra>'
    };

    const baselineLine = {
        type: 'line',
        x0: -0.5, x1: historical.years.length - 0.5,
        y0: baseline, y1: baseline,
        line: { color: '#14b8a6', width: 2, dash: 'dash' },
        xref: 'x', yref: 'y'
    };

    const layout = Object.assign({}, RAWAL_PLOTLY_LAYOUT, {
        xaxis: Object.assign({}, RAWAL_PLOTLY_LAYOUT.xaxis, { title: 'Year', type: 'category' }),
        yaxis: Object.assign({}, RAWAL_PLOTLY_LAYOUT.yaxis, { title: 'mm' }),
        shapes: [baselineLine],
        annotations: [{
            x: historical.years[historical.years.length - 1],
            y: baseline,
            xref: 'x', yref: 'y',
            text: 'PMD Baseline: ' + baseline + ' mm',
            showarrow: false,
            font: { color: '#14b8a6', size: 10, family: 'JetBrains Mono, monospace' },
            xanchor: 'right',
            yanchor: 'bottom',
            bgcolor: 'rgba(11, 16, 32, 0.85)',
            borderpad: 4
        }]
    });

    Plotly.newPlot('chart-climate-precip', [trace], layout, RAWAL_PLOTLY_CONFIG);
}

// ------------------------------------------------------------
// CHART 4: Tmax
// ------------------------------------------------------------
function drawClimateTmax(historical) {
    const trace = {
        x: historical.years,
        y: historical.tmax_celsius,
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Mean Tmax',
        line: { color: '#fb8c00', width: 3, shape: 'spline' },
        marker: { size: 9, color: '#fb8c00' },
        hovertemplate: '<b>%{x}</b><br>Tmax: %{y:.1f} °C<extra></extra>'
    };

    const layout = Object.assign({}, RAWAL_PLOTLY_LAYOUT, {
        xaxis: Object.assign({}, RAWAL_PLOTLY_LAYOUT.xaxis, { title: 'Year', type: 'category' }),
        yaxis: Object.assign({}, RAWAL_PLOTLY_LAYOUT.yaxis, { title: '°C' })
    });

    Plotly.newPlot('chart-climate-tmax', [trace], layout, RAWAL_PLOTLY_CONFIG);
}

// ------------------------------------------------------------
// CHART 5: Evaporation
// ------------------------------------------------------------
function drawClimateEvap(historical) {
    const trace = {
        x: historical.years,
        y: historical.evap_mcm,
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Evaporation',
        line: { color: '#8e24aa', width: 3, shape: 'spline' },
        marker: { size: 9, color: '#8e24aa', symbol: 'square' },
        hovertemplate: '<b>%{x}</b><br>%{y:.2f} MCM<extra></extra>'
    };

    const layout = Object.assign({}, RAWAL_PLOTLY_LAYOUT, {
        xaxis: Object.assign({}, RAWAL_PLOTLY_LAYOUT.xaxis, { title: 'Year', type: 'category' }),
        yaxis: Object.assign({}, RAWAL_PLOTLY_LAYOUT.yaxis, { title: 'MCM' })
    });

    Plotly.newPlot('chart-climate-evap', [trace], layout, RAWAL_PLOTLY_CONFIG);
}

// ------------------------------------------------------------
// CHART 6: Urban Sprawl (dual series)
// ------------------------------------------------------------
function drawSprawlDual(historical) {
    const absoluteTrace = {
        x: historical.years,
        y: historical.sprawl_absolute_acres,
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Absolute Total Urban Footprint',
        line: { color: '#e6ecff', width: 3 },
        marker: { size: 10, color: '#e6ecff' },
        hovertemplate: '<b>%{x}</b><br>%{y:.0f} acres (total)<extra></extra>'
    };

    const newSprawlTrace = {
        x: historical.years,
        y: historical.sprawl_new_acres_since_2000,
        type: 'bar',
        name: 'New Sprawl Since 2000',
        marker: { color: 'rgba(229, 57, 53, 0.7)', line: { color: '#e53935', width: 1 } },
        hovertemplate: '<b>%{x}</b><br>+%{y:.0f} acres (new)<extra></extra>'
    };

    const layout = Object.assign({}, RAWAL_PLOTLY_LAYOUT, {
        xaxis: Object.assign({}, RAWAL_PLOTLY_LAYOUT.xaxis, { title: 'Year', type: 'category' }),
        yaxis: Object.assign({}, RAWAL_PLOTLY_LAYOUT.yaxis, { title: 'Acres' }),
        barmode: 'overlay',
        legend: Object.assign({}, RAWAL_PLOTLY_LAYOUT.legend, { orientation: 'h', y: -0.2 })
    });

    Plotly.newPlot('chart-sprawl-dual', [newSprawlTrace, absoluteTrace], layout, RAWAL_PLOTLY_CONFIG);
}

// ------------------------------------------------------------
// CHART 7: EOL Forecast
// ------------------------------------------------------------
function drawForecast(historical, forecast, metadata) {
    const histTrace = {
        x: historical.years,
        y: historical.storage_mcm,
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Historical Observation',
        line: { color: '#e6ecff', width: 3 },
        marker: { size: 9, color: '#e6ecff', symbol: 'square' },
        hovertemplate: '<b>%{x}</b><br>Storage: %{y:.2f} MCM<extra></extra>'
    };

    const forecastTrace = {
        x: forecast.years,
        y: forecast.storage_mcm,
        type: 'scatter',
        mode: 'lines',
        name: 'Forecast (Unmitigated)',
        line: { color: '#e53935', width: 4 },
        fill: 'tozeroy',
        fillcolor: 'rgba(229, 57, 53, 0.08)',
        hovertemplate: '<b>%{x}</b><br>%{y:.2f} MCM<extra></extra>'
    };

    const deadStorage = metadata.dead_storage_mcm;
    const eolYear = metadata.baseline_eol_year;

    const deadLine = {
        type: 'line',
        x0: historical.years[0], x1: eolYear + 2,
        y0: deadStorage, y1: deadStorage,
        line: { color: '#ff5252', width: 2, dash: 'dash' },
        xref: 'x', yref: 'y'
    };

    const layout = Object.assign({}, RAWAL_PLOTLY_LAYOUT, {
        xaxis: Object.assign({}, RAWAL_PLOTLY_LAYOUT.xaxis, { title: 'Year' }),
        yaxis: Object.assign({}, RAWAL_PLOTLY_LAYOUT.yaxis, { title: 'Storage (MCM)' }),
        shapes: [deadLine],
        annotations: [
            {
                x: eolYear + 1, y: deadStorage,
                text: 'Dead Storage (' + deadStorage + ' MCM)',
                showarrow: false,
                font: { color: '#ff5252', size: 10, family: 'JetBrains Mono, monospace' },
                xanchor: 'right', yanchor: 'bottom',
                bgcolor: 'rgba(11, 16, 32, 0.85)', borderpad: 4
            },
            {
                x: eolYear, y: deadStorage,
                text: 'EOL: ' + eolYear,
                showarrow: true, arrowhead: 3, arrowcolor: '#e53935',
                ax: -40, ay: -60,
                font: { color: '#e53935', size: 13, family: 'JetBrains Mono, monospace' },
                bgcolor: 'rgba(11, 16, 32, 0.9)',
                bordercolor: '#e53935', borderpad: 6
            }
        ]
    });

    Plotly.newPlot('chart-forecast-main', [histTrace, forecastTrace], layout, RAWAL_PLOTLY_CONFIG);
}

// ------------------------------------------------------------
// STAT ROWS for each tab
// ------------------------------------------------------------
function renderHydrologyStats(data) {
    const h = data.historical;
    const areaStart = h.water_area_acres[0];
    const areaEnd = h.water_area_acres[h.water_area_acres.length - 1];
    const storageStart = h.storage_mcm[0];
    const storageEnd = h.storage_mcm[h.storage_mcm.length - 1];

    const areaLost = (areaStart - areaEnd).toFixed(1);
    const storageLost = (storageStart - storageEnd).toFixed(2);
    const pctStorageLost = (((storageStart - storageEnd) / storageStart) * 100).toFixed(1);

    const html =
        statCard(areaEnd.toFixed(1), 'Current Area (Acres)') +
        statCard(storageEnd.toFixed(2) + ' MCM', 'Current Storage') +
        statCard(areaLost, 'Area Lost Since 2000 (Ac)') +
        statCard(pctStorageLost + '%', 'Storage Lost Since 2000');

    document.getElementById('stats-hydrology').innerHTML = html;
}

function renderSprawlStats(data) {
    const w = data.watershed;

    const html =
        statCard(w.total_acres.toFixed(0), 'Watershed Area (Ac)') +
        statCard(w.baseline_urban_acres_2000.toFixed(0), 'Urban 2000 (Ac)') +
        statCard(w.current_urban_acres_2024.toFixed(0), 'Urban 2024 (Ac)') +
        statCard(w.urbanization_percent_2024.toFixed(1) + '%', 'Urbanized % (2024)');

    document.getElementById('stats-sprawl').innerHTML = html;
}

function renderForecastStats(data) {
    const meta = data.metadata;
    const forecast = data.forecast_baseline;
    const currentYear = 2024;
    const yearsRemaining = meta.baseline_eol_year - currentYear;
    const annualLoss = (forecast.storage_mcm[0] - forecast.storage_mcm[forecast.storage_mcm.length - 1]) /
                      (forecast.years[forecast.years.length - 1] - forecast.years[0]);

    const html =
        statCard(meta.baseline_eol_year, 'Forecast EOL Year') +
        statCard(yearsRemaining + ' yrs', 'Time Remaining') +
        statCard(annualLoss.toFixed(2) + ' MCM', 'Annual Loss Rate') +
        statCard(meta.dead_storage_mcm + ' MCM', 'Dead Storage Threshold');

    document.getElementById('stats-forecast').innerHTML = html;
}

// ------------------------------------------------------------
// CLIMATE INSIGHT BOX
// ------------------------------------------------------------
function renderClimateInsight(data) {
    const c = data.climate_regression;
    const el = document.getElementById('insight-climate');
    if (!el) return;

    const slopeText = c.slope_mm_per_year >= 0
        ? '+' + c.slope_mm_per_year.toFixed(2) + ' mm/year'
        : c.slope_mm_per_year.toFixed(2) + ' mm/year';

    el.innerHTML =
        '<strong>Rainfall Trend:</strong> ' + slopeText +
        ' (linear regression over calibration years).<br>' +
        '<strong>Projected 2050:</strong> ' + c.projected_2050_precip_mm.toFixed(0) + ' mm. ' +
        '<strong>Projected 2100:</strong> ' + c.projected_2100_precip_mm.toFixed(0) + ' mm.<br>' +
        '<em>Interpretation:</em> The forecast engine applies this slope as a forward-looking climate multiplier against the PMD baseline of ' +
        data.metadata.pmd_baseline_precip_mm + ' mm.';
}

// ------------------------------------------------------------
// MAIN ENTRY — wait for data, then render everything
// ------------------------------------------------------------
function renderAll(data) {
    try {
        drawHydroArea(data.historical);
        drawHydroStorage(data.historical);
        drawClimatePrecip(data.historical, data.metadata.pmd_baseline_precip_mm);
        drawClimateTmax(data.historical);
        drawClimateEvap(data.historical);
        drawSprawlDual(data.historical);
        drawForecast(data.historical, data.forecast_baseline, data.metadata);

        renderHydrologyStats(data);
        renderSprawlStats(data);
        renderForecastStats(data);
        renderClimateInsight(data);

        updateSidebarStatus('loaded', 'Pipeline loaded · EOL ' + data.metadata.baseline_eol_year);
    } catch (err) {
        console.error('[DASHBOARD] Render error:', err);
        updateSidebarStatus('error', 'Render error — see console');
    }
}

// Listen for data-loader events
document.addEventListener('rawal:ready', function (evt) {
    initTabs();
    renderAll(evt.detail);
});

document.addEventListener('rawal:error', function (evt) {
    updateSidebarStatus('error', 'Data load failed');
    console.error('[DASHBOARD] Data load failed:', evt.detail);
});

// If data loaded before this script (cached), render immediately
if (window.RAWAL && window.RAWAL.ready) {
    initTabs();
    renderAll(window.RAWAL.data);
}