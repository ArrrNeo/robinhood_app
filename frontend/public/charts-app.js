// Get ticker from URL parameter
const urlParams = new URLSearchParams(window.location.search);
const ticker = urlParams.get('ticker');
const API_BASE = 'http://192.168.4.42:5001';

// State
let historicalData = null;
let currentValuation = 'ps';
let rsiOversold = 30;
let rsiOverbought = 70;
let globalHoverX = null;

// Chart dimensions
const CHART_WIDTH = 1200;
const CHART_HEIGHT = 250;
const PADDING = { top: 40, right: 80, bottom: 50, left: 80 };

// Global crosshair lines
let globalCrosshairLines = [];

// Initialize
document.getElementById('ticker').textContent = ticker || 'N/A';

// Event listeners
document.querySelectorAll('input[name="valuation"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        currentValuation = e.target.value;
        renderCharts();
    });
});

document.getElementById('rsi-oversold').addEventListener('change', (e) => {
    rsiOversold = parseInt(e.target.value);
    renderCharts();
});

document.getElementById('rsi-overbought').addEventListener('change', (e) => {
    rsiOverbought = parseInt(e.target.value);
    renderCharts();
});

// Fetch data
async function fetchData() {
    try {
        const response = await fetch(`${API_BASE}/api/historical/${ticker}`);
        if (!response.ok) throw new Error('Failed to fetch data');

        historicalData = await response.json();
        renderCharts();
    } catch (error) {
        document.getElementById('content').innerHTML = `
            <div class="error">
                <h3>Error Loading Data</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

// Filter data to last 1 year
function filterToOneYear(data) {
    if (!data || data.length === 0) return data;

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    return data.filter(d => {
        const itemDate = new Date(d.date);
        return itemDate >= oneYearAgo;
    });
}

// Render all charts
function renderCharts() {
    if (!historicalData) return;

    const html = `
        <div class="chart-container" id="price-chart"></div>
        <div class="chart-container" id="valuation-chart"></div>
        <div class="chart-container" id="rsi-chart"></div>
        <div class="chart-container" id="revenue-growth-chart"></div>
    `;

    document.getElementById('content').innerHTML = html;

    renderPriceChart();
    renderValuationChart();
    renderRSIChart();
    renderRevenueGrowthChart();
    setupGlobalHover();
}

// Create SVG
function createSVG(containerId, title) {
    const container = document.getElementById(containerId);

    const headerHTML = `
        <div class="chart-header">
            <div class="chart-title">${title}</div>
            <div class="chart-legend" id="${containerId}-legend"></div>
        </div>
    `;

    container.innerHTML = headerHTML;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', CHART_WIDTH);
    svg.setAttribute('height', CHART_HEIGHT);
    svg.setAttribute('class', 'chart-svg');
    svg.setAttribute('id', `${containerId}-svg`);

    container.appendChild(svg);

    return svg;
}

// Price Chart
function renderPriceChart() {
    const allData = historicalData.price_data;
    if (!allData || allData.length === 0) return;

    const data = filterToOneYear(allData);
    if (!data || data.length === 0) return;

    const svg = createSVG('price-chart', 'Price vs Time (1 Year)');
    const { chartWidth, chartHeight } = getChartDimensions();

    const prices = data.map(d => d.price);
    const { min, max, range } = getDataRange(prices);

    drawAxes(svg, chartWidth, chartHeight, min, max, data);
    drawLine(svg, data, 'price', min, range, chartWidth, chartHeight, '#60a5fa');

    // Add crosshair line
    const crosshair = createLine(0, PADDING.top, 0, PADDING.top + chartHeight, '#64748b', 1);
    crosshair.setAttribute('class', 'crosshair-line');
    crosshair.style.display = 'none';
    svg.appendChild(crosshair);
    globalCrosshairLines.push(crosshair);
}

// Valuation Chart (P/S or P/E)
function renderValuationChart() {
    const dataKey = currentValuation === 'ps' ? 'ps_data' : 'pe_data';
    const valueKey = currentValuation === 'ps' ? 'ps_ratio' : 'pe_ratio';
    const title = currentValuation === 'ps' ? 'P/S Ratio vs Time (1 Year)' : 'P/E Ratio vs Time (1 Year)';
    const color = currentValuation === 'ps' ? '#10b981' : '#f59e0b';

    const allData = historicalData[dataKey];
    if (!allData || allData.length === 0) {
        document.getElementById('valuation-chart').innerHTML = `
            <div class="chart-header">
                <div class="chart-title">${title}</div>
            </div>
            <p style="text-align: center; color: #64748b; padding: 40px;">No ${currentValuation.toUpperCase()} data available</p>
        `;
        return;
    }

    const data = filterToOneYear(allData);
    if (!data || data.length === 0) {
        document.getElementById('valuation-chart').innerHTML = `
            <div class="chart-header">
                <div class="chart-title">${title}</div>
            </div>
            <p style="text-align: center; color: #64748b; padding: 40px;">No ${currentValuation.toUpperCase()} data available for the last year</p>
        `;
        return;
    }

    const svg = createSVG('valuation-chart', title);
    const { chartWidth, chartHeight } = getChartDimensions();

    const values = data.map(d => d[valueKey]);
    const { min, max, range} = getDataRange(values);

    drawAxes(svg, chartWidth, chartHeight, min, max, data);
    drawLine(svg, data, valueKey, min, range, chartWidth, chartHeight, color);

    // Add crosshair line
    const crosshair = createLine(0, PADDING.top, 0, PADDING.top + chartHeight, '#64748b', 1);
    crosshair.setAttribute('class', 'crosshair-line');
    crosshair.style.display = 'none';
    svg.appendChild(crosshair);
    globalCrosshairLines.push(crosshair);
}

// RSI Chart
function renderRSIChart() {
    const allData = historicalData.rsi_data;
    if (!allData || allData.length === 0) return;

    const data = filterToOneYear(allData);
    if (!data || data.length === 0) return;

    const svg = createSVG('rsi-chart', 'RSI (14 days) vs Time (1 Year)');
    const { chartWidth, chartHeight } = getChartDimensions();

    const min = 0;
    const max = 100;
    const range = 100;

    drawAxes(svg, chartWidth, chartHeight, min, max, data);

    // Draw threshold lines
    drawThresholdLine(svg, rsiOversold, min, range, chartWidth, chartHeight, '#ef4444', 'Oversold');
    drawThresholdLine(svg, rsiOverbought, min, range, chartWidth, chartHeight, '#22c55e', 'Overbought');

    drawLine(svg, data, 'rsi', min, range, chartWidth, chartHeight, '#8b5cf6');

    // Add crosshair line
    const crosshair = createLine(0, PADDING.top, 0, PADDING.top + chartHeight, '#64748b', 1);
    crosshair.setAttribute('class', 'crosshair-line');
    crosshair.style.display = 'none';
    svg.appendChild(crosshair);
    globalCrosshairLines.push(crosshair);
}

// Revenue Growth Chart
function renderRevenueGrowthChart() {
    const allData = historicalData.revenue_growth_data;
    if (!allData || allData.length === 0) {
        document.getElementById('revenue-growth-chart').innerHTML = `
            <div class="chart-header">
                <div class="chart-title">TTM YoY Revenue Growth (1 Year)</div>
            </div>
            <p style="text-align: center; color: #64748b; padding: 40px;">No revenue growth data available</p>
        `;
        return;
    }

    const data = filterToOneYear(allData);
    if (!data || data.length === 0) {
        document.getElementById('revenue-growth-chart').innerHTML = `
            <div class="chart-header">
                <div class="chart-title">TTM YoY Revenue Growth (1 Year)</div>
            </div>
            <p style="text-align: center; color: #64748b; padding: 40px;">No revenue growth data available for the last year</p>
        `;
        return;
    }

    const svg = createSVG('revenue-growth-chart', 'TTM YoY Revenue Growth (1 Year)');
    const { chartWidth, chartHeight } = getChartDimensions();

    const growthValues = data.map(d => d.growth_pct);
    const { min, max, range } = getDataRange(growthValues);

    drawAxes(svg, chartWidth, chartHeight, min, max, data);

    // Draw zero line (0% growth)
    drawThresholdLine(svg, 0, min, range, chartWidth, chartHeight, '#64748b', '0% Growth');

    drawLine(svg, data, 'growth_pct', min, range, chartWidth, chartHeight, '#ec4899');

    // Add crosshair line
    const crosshair = createLine(0, PADDING.top, 0, PADDING.top + chartHeight, '#64748b', 1);
    crosshair.setAttribute('class', 'crosshair-line');
    crosshair.style.display = 'none';
    svg.appendChild(crosshair);
    globalCrosshairLines.push(crosshair);
}

// Setup global hover that works across all charts
function setupGlobalHover() {
    globalCrosshairLines = [];
    const allSvgs = document.querySelectorAll('.chart-svg');
    const { chartWidth, chartHeight } = getChartDimensions();
    const priceData = historicalData.price_data;

    allSvgs.forEach(svg => {
        svg.addEventListener('mousemove', (e) => {
            const rect = svg.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            if (mouseX < PADDING.left || mouseX > PADDING.left + chartWidth ||
                mouseY < PADDING.top || mouseY > PADDING.top + chartHeight) {
                hideAllCrosshairs();
                return;
            }

            const chartX = mouseX - PADDING.left;
            // Always use price_data length as reference since it has all dates
            const index = Math.round((chartX / chartWidth) * (priceData.length - 1));

            if (index >= 0 && index < priceData.length) {
                const x = PADDING.left + (index / (priceData.length - 1)) * chartWidth;
                globalHoverX = x;
                updateAllCrosshairs(x);
                updateAllLegends(index);
                highlightPoints(index);
            }
        });

        svg.addEventListener('mouseleave', () => {
            hideAllCrosshairs();
        });
    });
}

function updateAllCrosshairs(x) {
    document.querySelectorAll('.crosshair-line').forEach(line => {
        line.setAttribute('x1', x);
        line.setAttribute('x2', x);
        line.style.display = 'block';
    });
}

function hideAllCrosshairs() {
    globalHoverX = null;
    document.querySelectorAll('.crosshair-line').forEach(line => {
        line.style.display = 'none';
    });
    updateAllLegends(null);
    document.querySelectorAll('circle').forEach(circle => {
        circle.setAttribute('opacity', '0');
        circle.setAttribute('r', '3');
    });
}

function highlightPoints(priceIndex) {
    const targetDate = historicalData.price_data[priceIndex].date;

    document.querySelectorAll('circle').forEach(circle => {
        const circleDate = circle.getAttribute('data-date');
        const chartType = circle.getAttribute('data-chart');

        let shouldHighlight = false;

        if (chartType === 'price') {
            // Exact date match for price
            shouldHighlight = circleDate === targetDate;
        } else if (chartType === 'valuation') {
            // Find closest valuation date
            const dataKey = currentValuation === 'ps' ? 'ps_data' : 'pe_data';
            const valuationData = historicalData[dataKey];
            if (valuationData && valuationData.length > 0) {
                const closest = valuationData.reduce((prev, curr) => {
                    return Math.abs(new Date(curr.date) - new Date(targetDate)) <
                           Math.abs(new Date(prev.date) - new Date(targetDate)) ? curr : prev;
                });
                shouldHighlight = circleDate === closest.date;
            }
        } else if (chartType === 'rsi') {
            // Find closest RSI date
            const rsiData = historicalData.rsi_data;
            if (rsiData && rsiData.length > 0) {
                const closest = rsiData.reduce((prev, curr) => {
                    return Math.abs(new Date(curr.date) - new Date(targetDate)) <
                           Math.abs(new Date(prev.date) - new Date(targetDate)) ? curr : prev;
                });
                shouldHighlight = circleDate === closest.date;
            }
        }

        if (shouldHighlight) {
            circle.setAttribute('opacity', '1');
            circle.setAttribute('r', '5');
        } else {
            circle.setAttribute('opacity', '0');
            circle.setAttribute('r', '3');
        }
    });
}

function updateAllLegends(priceIndex) {
    if (priceIndex === null) {
        document.getElementById('price-chart-legend').textContent = '';
        document.getElementById('valuation-chart-legend').textContent = '';
        document.getElementById('rsi-chart-legend').textContent = '';
        return;
    }

    // Price
    const priceData = historicalData.price_data[priceIndex];
    if (priceData) {
        document.getElementById('price-chart-legend').textContent =
            `${priceData.date} | Price: $${priceData.price.toFixed(2)}`;
    }

    // Valuation
    const dataKey = currentValuation === 'ps' ? 'ps_data' : 'pe_data';
    const valueKey = currentValuation === 'ps' ? 'ps_ratio' : 'pe_ratio';
    const valuationData = historicalData[dataKey];

    if (valuationData && valuationData.length > 0) {
        // Find closest date to the hovered price date
        const targetDate = historicalData.price_data[priceIndex].date;
        const closest = valuationData.reduce((prev, curr) => {
            return Math.abs(new Date(curr.date) - new Date(targetDate)) <
                   Math.abs(new Date(prev.date) - new Date(targetDate)) ? curr : prev;
        });

        document.getElementById('valuation-chart-legend').textContent =
            `${closest.date} | ${currentValuation.toUpperCase()}: ${closest[valueKey].toFixed(2)}`;
    }

    // RSI
    const rsiData = historicalData.rsi_data;
    if (rsiData && rsiData.length > 0) {
        const targetDate = historicalData.price_data[priceIndex].date;
        const closest = rsiData.reduce((prev, curr) => {
            return Math.abs(new Date(curr.date) - new Date(targetDate)) <
                   Math.abs(new Date(prev.date) - new Date(targetDate)) ? curr : prev;
        });

        document.getElementById('rsi-chart-legend').textContent =
            `${closest.date} | RSI: ${closest.rsi.toFixed(1)}`;
    }
}

// Helper functions
function getChartDimensions() {
    return {
        chartWidth: CHART_WIDTH - PADDING.left - PADDING.right,
        chartHeight: CHART_HEIGHT - PADDING.top - PADDING.bottom
    };
}

function getDataRange(values) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const padding = range * 0.1;
    return {
        min: min - padding,
        max: max + padding,
        range: max - min + 2 * padding
    };
}

function drawAxes(svg, chartWidth, chartHeight, min, max, data) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

    // Y-axis
    const yAxis = createLine(PADDING.left, PADDING.top, PADDING.left, PADDING.top + chartHeight, '#475569', 2);
    g.appendChild(yAxis);

    // X-axis
    const xAxis = createLine(PADDING.left, PADDING.top + chartHeight, PADDING.left + chartWidth, PADDING.top + chartHeight, '#475569', 2);
    g.appendChild(xAxis);

    // Y-axis ticks
    const yTicks = 5;
    for (let i = 0; i < yTicks; i++) {
        const value = min + (max - min) * (i / (yTicks - 1));
        const y = PADDING.top + chartHeight - ((value - min) / (max - min)) * chartHeight;

        const tick = createLine(PADDING.left - 5, y, PADDING.left, y, '#475569', 1);
        g.appendChild(tick);

        const label = createText(PADDING.left - 10, y + 4, value.toFixed(2), '#94a3b8', 11, 'end');
        g.appendChild(label);
    }

    // X-axis ticks
    const xTicks = 6;
    for (let i = 0; i < xTicks; i++) {
        const index = Math.floor((data.length - 1) * (i / (xTicks - 1)));
        const x = PADDING.left + (index / (data.length - 1)) * chartWidth;

        const tick = createLine(x, PADDING.top + chartHeight, x, PADDING.top + chartHeight + 5, '#475569', 1);
        g.appendChild(tick);

        const label = createText(x, PADDING.top + chartHeight + 20, data[index].date, '#94a3b8', 10, 'middle');
        g.appendChild(label);
    }

    svg.appendChild(g);
}

function drawLine(svg, data, valueKey, min, range, chartWidth, chartHeight, color) {
    // Determine chart type based on valueKey
    let chartType = 'price';
    if (valueKey === 'ps_ratio' || valueKey === 'pe_ratio') {
        chartType = 'valuation';
    } else if (valueKey === 'rsi') {
        chartType = 'rsi';
    }

    // Get date range from price data for consistent X-axis
    const priceData = historicalData.price_data;
    const firstDate = new Date(priceData[0].date);
    const lastDate = new Date(priceData[priceData.length - 1].date);
    const dateRange = lastDate - firstDate;

    // Convert dates to X positions and draw line
    const points = data.map((d, i) => {
        const date = new Date(d.date);
        const dateOffset = date - firstDate;
        const x = PADDING.left + (dateOffset / dateRange) * chartWidth;
        const y = PADDING.top + chartHeight - ((d[valueKey] - min) / range) * chartHeight;
        return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
    }).join(' ');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', points);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '2');

    svg.appendChild(path);

    // Add circles for hover - positioned by date
    data.forEach((d, i) => {
        const date = new Date(d.date);
        const dateOffset = date - firstDate;
        const x = PADDING.left + (dateOffset / dateRange) * chartWidth;
        const y = PADDING.top + chartHeight - ((d[valueKey] - min) / range) * chartHeight;

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', y);
        circle.setAttribute('r', '3');
        circle.setAttribute('fill', color);
        circle.setAttribute('opacity', '0');
        circle.setAttribute('data-index', i);
        circle.setAttribute('data-chart', chartType);
        circle.setAttribute('data-date', d.date);

        svg.appendChild(circle);
    });

    return path;
}

function drawThresholdLine(svg, value, min, range, chartWidth, chartHeight, color, label) {
    const y = PADDING.top + chartHeight - ((value - min) / range) * chartHeight;

    const line = createLine(PADDING.left, y, PADDING.left + chartWidth, y, color, 1);
    line.setAttribute('class', 'threshold-line');
    svg.appendChild(line);

    const text = createText(PADDING.left + chartWidth + 10, y + 4, `${label} (${value})`, color, 11, 'start');
    text.setAttribute('class', 'threshold-label');
    svg.appendChild(text);
}

// SVG helper functions
function createLine(x1, y1, x2, y2, color, width) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', width);
    return line;
}

function createText(x, y, text, color, size, anchor) {
    const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textEl.setAttribute('x', x);
    textEl.setAttribute('y', y);
    textEl.setAttribute('fill', color);
    textEl.setAttribute('font-size', size);
    textEl.setAttribute('text-anchor', anchor);
    textEl.textContent = text;
    return textEl;
}

// Start
if (ticker) {
    fetchData();
} else {
    document.getElementById('content').innerHTML = `
        <div class="error">
            <h3>No Ticker Specified</h3>
            <p>Please provide a ticker symbol in the URL.</p>
        </div>
    `;
}
