import React, { useState, useEffect } from 'react';
import config from './config.json';

const CloseIcon = () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
);

const LineChart = ({ data, label, valueKey, color = '#3b82f6' }) => {
    if (!data || data.length === 0) {
        return (
            <div className="flex items-center justify-center h-64 text-gray-500">
                No data available
            </div>
        );
    }

    const values = data.map(d => d[valueKey]).filter(v => v !== null && v !== undefined);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = maxValue - minValue;

    const width = 800;
    const height = 200;
    const padding = { top: 20, right: 40, bottom: 40, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const points = data.map((d, i) => {
        const x = padding.left + (i / (data.length - 1)) * chartWidth;
        const value = d[valueKey];
        const y = value !== null && value !== undefined
            ? padding.top + chartHeight - ((value - minValue) / range) * chartHeight
            : null;
        return { x, y, value, date: d.date };
    }).filter(p => p.y !== null);

    const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');

    const yAxisTicks = 5;
    const yTicks = Array.from({ length: yAxisTicks }, (_, i) => {
        const value = minValue + (range / (yAxisTicks - 1)) * i;
        const y = padding.top + chartHeight - ((value - minValue) / range) * chartHeight;
        return { value, y };
    });

    const xAxisTicks = 6;
    const xTicks = Array.from({ length: xAxisTicks }, (_, i) => {
        const index = Math.floor((data.length - 1) * (i / (xAxisTicks - 1)));
        const x = padding.left + (index / (data.length - 1)) * chartWidth;
        return { date: data[index].date, x };
    });

    return (
        <div className="w-full">
            <h3 className="text-lg font-semibold mb-2 text-gray-200">{label}</h3>
            <svg width={width} height={height} className="bg-gray-800 rounded">
                {/* Y-axis */}
                <line
                    x1={padding.left}
                    y1={padding.top}
                    x2={padding.left}
                    y2={height - padding.bottom}
                    stroke="#4b5563"
                    strokeWidth="1"
                />
                {/* X-axis */}
                <line
                    x1={padding.left}
                    y1={height - padding.bottom}
                    x2={width - padding.right}
                    y2={height - padding.bottom}
                    stroke="#4b5563"
                    strokeWidth="1"
                />

                {/* Y-axis ticks and labels */}
                {yTicks.map((tick, i) => (
                    <g key={i}>
                        <line
                            x1={padding.left - 5}
                            y1={tick.y}
                            x2={padding.left}
                            y2={tick.y}
                            stroke="#4b5563"
                            strokeWidth="1"
                        />
                        <text
                            x={padding.left - 10}
                            y={tick.y + 4}
                            textAnchor="end"
                            fill="#9ca3af"
                            fontSize="10"
                        >
                            {tick.value.toFixed(2)}
                        </text>
                    </g>
                ))}

                {/* X-axis ticks and labels */}
                {xTicks.map((tick, i) => (
                    <g key={i}>
                        <line
                            x1={tick.x}
                            y1={height - padding.bottom}
                            x2={tick.x}
                            y2={height - padding.bottom + 5}
                            stroke="#4b5563"
                            strokeWidth="1"
                        />
                        <text
                            x={tick.x}
                            y={height - padding.bottom + 18}
                            textAnchor="middle"
                            fill="#9ca3af"
                            fontSize="10"
                        >
                            {tick.date}
                        </text>
                    </g>
                ))}

                {/* Line chart */}
                <path
                    d={pathData}
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                />

                {/* Data points */}
                {points.map((p, i) => (
                    <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r="3"
                        fill={color}
                    >
                        <title>{`${p.date}: ${p.value.toFixed(2)}`}</title>
                    </circle>
                ))}
            </svg>
        </div>
    );
};

const ChartsPage = ({ ticker, onClose }) => {
    const [historicalData, setHistoricalData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchHistoricalData = async () => {
            try {
                setLoading(true);
                setError(null);

                const response = await fetch(
                    `${config.api.base_url}${config.api.endpoints.historical}/${ticker}`
                );

                if (!response.ok) {
                    throw new Error(`Failed to fetch data: ${response.statusText}`);
                }

                const data = await response.json();
                setHistoricalData(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        if (ticker) {
            fetchHistoricalData();
        }
    }, [ticker]);

    if (loading) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
                <div className="bg-gray-900 p-8 rounded-lg shadow-xl max-w-6xl w-full max-h-screen overflow-y-auto">
                    <div className="flex justify-center items-center h-64">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
                <div className="bg-gray-900 p-8 rounded-lg shadow-xl max-w-6xl w-full">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold text-red-400">Error</h2>
                        <button onClick={onClose} className="text-gray-400 hover:text-white">
                            <CloseIcon />
                        </button>
                    </div>
                    <p className="text-gray-300">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-gray-900 p-8 rounded-lg shadow-xl max-w-6xl w-full max-h-screen overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-white">
                        {ticker} - Historical Charts (2 Years)
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors"
                    >
                        <CloseIcon />
                    </button>
                </div>

                <div className="space-y-8">
                    <LineChart
                        data={historicalData?.price_data || []}
                        label="Price vs Time"
                        valueKey="price"
                        color="#3b82f6"
                    />

                    <LineChart
                        data={historicalData?.ps_data || []}
                        label="P/S Ratio vs Time"
                        valueKey="ps_ratio"
                        color="#10b981"
                    />

                    <LineChart
                        data={historicalData?.pe_data || []}
                        label="P/E Ratio vs Time"
                        valueKey="pe_ratio"
                        color="#f59e0b"
                    />

                    <LineChart
                        data={historicalData?.rsi_data || []}
                        label="RSI (14 days) vs Time"
                        valueKey="rsi"
                        color="#8b5cf6"
                    />
                </div>

                {historicalData?.last_updated && (
                    <p className="text-sm text-gray-500 mt-6 text-center">
                        Last updated: {new Date(historicalData.last_updated).toLocaleString()}
                    </p>
                )}
            </div>
        </div>
    );
};

export default ChartsPage;
