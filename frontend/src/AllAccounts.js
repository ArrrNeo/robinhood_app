import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import config from './config.json';
import tableConfig from './table-columns.json';

// --- Helper Components (copied from App.js) ---

const SortIcon = ({ direction }) => (
    <svg className="w-4 h-4 inline-block ml-1 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={direction === 'ascending' ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"}></path>
    </svg>
);

const RefreshIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0011.664 0l3.181-3.183m-11.664 0l3.181-3.183a8.25 8.25 0 00-11.664 0l3.181 3.183" />
    </svg>
);

const GearIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.438.995s.145.755.438.995l1.003.827c.424.35.534.954.26 1.431l-1.296-2.247a1.125 1.125 0 01-1.37.49l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.332.183-.582.495-.645.87l-.213 1.28c-.09.543-.56.94-1.11.94h-2.593c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.063-.374-.313-.686-.645-.87a6.52 6.52 0 01-.22-.127c-.324-.196-.72-.257-1.075-.124l-1.217.456a1.125 1.125 0 01-1.37-.49l-1.296-2.247a1.125 1.125 0 01.26-1.431l1.003-.827c.293-.24.438.613.438.995s-.145-.755-.438-.995l-1.003-.827a1.125 1.125 0 01-.26-1.431l1.296-2.247a1.125 1.125 0 011.37-.49l1.217.456c.355.133.75.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.645-.87l.213-1.281z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

const MetricCardSkeleton = () => (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 animate-pulse">
        <div className="h-4 bg-gray-600 rounded w-3/4 mb-3"></div>
        <div className="h-8 bg-gray-600 rounded w-1/2"></div>
    </div>
);

const TableRowSkeleton = ({ columns, columnOrder }) => (
    <tr className="border-b border-gray-700">
        {columnOrder.map(key => (
            columns[key].visible ? <td key={key} className="p-4"><div className="h-5 bg-gray-600 rounded"></div></td> : null
        ))}
    </tr>
);

const formatCurrency = (value, sign = false) => {
    if (typeof value !== 'number') return '$0.00';
    const options = { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 };
    const formatted = new Intl.NumberFormat('en-US', options).format(value);
    return sign && value > 0 ? `+${formatted}` : formatted;
};

const formatPercent = (value) => {
    if (typeof value !== 'number') return '0.00%';
    return `${value > 0 ? '+' : ''}${(value).toFixed(2)}%`;
};

const PnlIndicator = ({ value }) => (
    <span className={value >= 0 ? 'text-green-400' : 'text-red-400'}>
        {formatCurrency(value, true)}
    </span>
);

const PctIndicator = ({ value }) => (
    <span className={value >= 0 ? 'text-green-400' : 'text-red-400'}>
        {formatPercent(value)}
    </span>
);

const EditableTextCell = ({ ticker, initialValue, onSave, fieldName, placeholder }) => {
    const [value, setValue] = useState(initialValue);
    const textareaRef = useRef(null);

    useEffect(() => {
        setValue(initialValue);
    }, [initialValue]);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [value]);

    const handleBlur = () => {
        if (value !== initialValue) {
            onSave(ticker, fieldName, value);
        }
    };

    return (
        <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={handleBlur}
            className="w-full bg-transparent resize-none border-none focus:ring-0 focus:outline-none p-0 m-0 align-middle"
            placeholder={placeholder}
            rows="1"
        />
    );
};

const EditableNoteCell = ({ ticker, initialNote, onSave }) => (
    <EditableTextCell ticker={ticker} initialValue={initialNote} onSave={onSave} fieldName="note" placeholder="Add a note..." />
);

const EditableIndustryCell = ({ ticker, initialIndustry, onSave }) => (
    <EditableTextCell ticker={ticker} initialValue={initialIndustry} onSave={onSave} fieldName="comment" placeholder="Add comment..." />
);

const DraggableHeaderCell = ({ id, children, onClick, ...props }) => {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };
    return (
        <th ref={setNodeRef} style={style} {...props}>
            <div className="flex items-center">
                <span onClick={onClick} className="flex-1 cursor-pointer">
                    {children}
                </span>
                <span {...attributes} {...listeners} className="ml-2 cursor-move p-1">
                    ⋮⋮
                </span>
            </div>
        </th>
    );
};

// --- Main AllAccounts Component ---

function AllAccounts() {
    const [accounts] = useState(['INDIVIDUAL', 'ROTH_IRA', 'TRADITIONAL_IRA']);
    const [portfolioData, setPortfolioData] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [sortConfigs, setSortConfigs] = useState({
        INDIVIDUAL: { key: 'marketValue', direction: 'descending' },
        ROTH_IRA: { key: 'marketValue', direction: 'descending' },
        TRADITIONAL_IRA: { key: 'marketValue', direction: 'descending' }
    });
    const settingsRef = useRef(null);

    const initialColumns = tableConfig.default_columns;

    const [columns, setColumns] = useState(() => {
        try {
            const saved = localStorage.getItem(config.cache.local_storage_keys.columns);
            const parsed = saved ? JSON.parse(saved) : initialColumns;
            for (const key in initialColumns) {
                if (!parsed.hasOwnProperty(key)) {
                    parsed[key] = initialColumns[key];
                }
            }
            return parsed;
        } catch (e) {
            return initialColumns;
        }
    });

    const [columnOrder, setColumnOrder] = useState(() => {
        try {
            const savedOrder = localStorage.getItem(config.cache.local_storage_keys.column_order);
            const initialOrder = tableConfig.default_order;

            if (savedOrder) {
                const parsedOrder = JSON.parse(savedOrder);
                if (
                    parsedOrder.length === initialOrder.length &&
                    parsedOrder.every(key => initialOrder.includes(key))
                ) {
                    return parsedOrder;
                }
            }
            return initialOrder;
        } catch (e) {
            return tableConfig.default_order;
        }
    });

    // Calculate combined summary metrics
    const combinedSummary = useMemo(() => {
        const allData = Object.values(portfolioData).filter(data => data && data.summary);
        if (allData.length === 0) return null;

        const totalEquity = allData.reduce((sum, data) => sum + (data.summary.totalEquity || 0), 0);
        const changeTodayAbs = allData.reduce((sum, data) => sum + (data.summary.changeTodayAbs || 0), 0);
        const totalPnl = allData.reduce((sum, data) => sum + (data.summary.totalPnl || 0), 0);

        // Calculate unique tickers across all accounts
        const allTickers = new Set();
        Object.values(portfolioData).forEach(data => {
            if (data && data.positions) {
                data.positions.forEach(pos => {
                    // Exclude cash positions from ticker count
                    if (pos.ticker && pos.ticker !== 'USD Cash') {
                        allTickers.add(pos.ticker);
                    }
                });
            }
        });
        const totalTickers = allTickers.size;

        // Calculate combined percentage for today's change
        const totalPreviousEquity = allData.reduce((sum, data) => {
            const todayChange = data.summary.changeTodayAbs || 0;
            const currentEquity = data.summary.totalEquity || 0;
            return sum + (currentEquity - todayChange);
        }, 0);

        const changeTodayPct = totalPreviousEquity !== 0 ? (changeTodayAbs / totalPreviousEquity) * 100 : 0;

        return {
            totalEquity,
            changeTodayAbs,
            changeTodayPct,
            totalPnl,
            totalTickers
        };
    }, [portfolioData]);

    const getSortedPositions = (accountName) => {
        const data = portfolioData[accountName];
        if (!data || !data.positions) return [];

        let sortableItems = [...data.positions];
        const sortConfig = sortConfigs[accountName];
        if (sortConfig.key) {
            sortableItems.sort((a, b) => {
                if (a[sortConfig.key] < b[sortConfig.key]) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (a[sortConfig.key] > b[sortConfig.key]) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    };

    const requestSort = (accountName, key) => {
        setSortConfigs(prev => {
            const currentConfig = prev[accountName];
            let direction = 'ascending';
            if (currentConfig.key === key && currentConfig.direction === 'ascending') {
                direction = 'descending';
            }
            return {
                ...prev,
                [accountName]: { key, direction }
            };
        });
    };

    useEffect(() => {
        localStorage.setItem(config.cache.local_storage_keys.columns, JSON.stringify(columns));
    }, [columns]);

    useEffect(() => {
        localStorage.setItem(config.cache.local_storage_keys.column_order, JSON.stringify(columnOrder));
    }, [columnOrder]);

    const handleColumnToggle = (key) => {
        setColumns(prev => ({
            ...prev,
            [key]: { ...prev[key], visible: !prev[key].visible }
        }));
    };

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (settingsRef.current && !settingsRef.current.contains(event.target)) {
                setIsSettingsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSaveCell = useCallback(async (ticker, fieldName, value, accountName) => {
        if (!accountName) return;
        try {
            const response = await fetch(`${config.api.base_url}${config.api.endpoints.notes}/${accountName}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticker, [fieldName]: value }),
            });
            if (!response.ok) throw new Error(`Failed to save ${fieldName}.`);

            // Optimistically update local state
            setPortfolioData(prevData => {
                if (!prevData[accountName]) return prevData;
                const updatedPositions = prevData[accountName].positions.map(p =>
                    p.ticker === ticker ? { ...p, [fieldName]: value } : p
                );
                return {
                    ...prevData,
                    [accountName]: {
                        ...prevData[accountName],
                        positions: updatedPositions
                    }
                };
            });

        } catch (e) {
            console.error(`Failed to save ${fieldName}:`, e);
        }
    }, []);

    const fetchDataForAccount = useCallback(async (accountName, force = false) => {
        const cacheKey = `${config.cache.local_storage_keys.portfolio_data_prefix}${accountName}`;

        // If not forcing a refresh, try to load from cache first
        if (!force) {
            try {
                const cached = localStorage.getItem(cacheKey);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    setPortfolioData(prev => ({ ...prev, [accountName]: parsed }));
                }
            } catch (e) {
                console.error("Failed to read from cache", e);
            }
        }

        try {
            const portfolioUrl = `${config.api.base_url}${config.api.endpoints.portfolio}/${accountName}${force ? '?force=true' : ''}`;
            const notesUrl = `${config.api.base_url}${config.api.endpoints.notes}/${accountName}`;

            const [portfolioRes, notesRes] = await Promise.all([
                fetch(portfolioUrl),
                fetch(notesUrl)
            ]);

            if (!portfolioRes.ok) {
                const errData = await portfolioRes.json();
                throw new Error(errData.error || `HTTP error! status: ${portfolioRes.status}`);
            }

            const portfolioResult = await portfolioRes.json();
            const notesResult = notesRes.ok ? await notesRes.json() : {};

            if (portfolioResult.error) throw new Error(portfolioResult.error);

            const positionsWithNotes = portfolioResult.positions.map(pos => ({
                ...pos,
                note: notesResult[pos.ticker]?.note || '',
                comment: notesResult[pos.ticker]?.comment || ''
            }));

            const finalData = { ...portfolioResult, positions: positionsWithNotes };
            setPortfolioData(prev => ({ ...prev, [accountName]: finalData }));

            // Save the fresh data to cache
            try {
                localStorage.setItem(cacheKey, JSON.stringify(finalData));
            } catch (e) {
                console.error("Failed to write to cache", e);
            }

        } catch (e) {
            setError(`Failed to fetch portfolio data for ${accountName}. Error: ${e.message}`);
            console.error(e);
        }
    }, []);

    const fetchAllData = useCallback(async (force = false) => {
        setLoading(true);
        setError(null);

        try {
            await Promise.all(accounts.map(account => fetchDataForAccount(account, force)));
        } catch (e) {
            setError(`Failed to fetch data for all accounts. Error: ${e.message}`);
        } finally {
            setLoading(false);
        }
    }, [accounts, fetchDataForAccount]);

    useEffect(() => {
        fetchAllData();
    }, [fetchAllData]);

    const renderPositionRow = (pos, accountName) => {
        const isOption = pos.type === 'option';
        const isCash = pos.type === 'cash';

        const cells = {
            ticker: <td className="p-4 font-bold text-white">{pos.ticker}</td>,
            name: <td className="p-4 text-gray-300">{pos.name}</td>,
            marketValue: <td className="p-4 font-mono">{formatCurrency(pos.marketValue)}</td>,
            quantity: <td className="p-4 font-mono">{isCash ? '-' : pos.quantity.toFixed(2)}</td>,
            avgCost: <td className="p-4 font-mono">{isCash ? '-' : formatCurrency(pos.avgCost)}</td>,
            latest_price: <td className="p-4 font-mono">{isCash ? '-' : formatCurrency(pos.latest_price)}</td>,
            unrealizedPnl: <td className="p-4 font-mono"><PnlIndicator value={pos.unrealizedPnl} /></td>,
            returnPct: <td className="p-4 font-mono"><PctIndicator value={pos.returnPct} /></td>,
            intraday_percent_change: <td className="p-4 font-mono"><PctIndicator value={pos.intraday_percent_change} /></td>,
            earnedPremium: <td className="p-4 font-mono">{isCash ? '-' : formatCurrency(pos.earnedPremium)}</td>,
            portfolio_percent: <td className="p-4 font-mono">{formatPercent(pos.portfolio_percent)}</td>,
            side: <td className="p-4 font-mono capitalize">{pos.side}</td>,
            type: <td className="p-4 font-mono capitalize">{isOption ? pos.option_type : (isCash ? '-' : 'Stock')}</td>,
            strike: <td className="p-4 font-mono">{isOption ? formatCurrency(pos.strike) : '-'}</td>,
            expiry: <td className="p-4 font-mono">{isOption ? pos.expiry : '-'}</td>,
            pe_ratio: <td className="p-4 font-mono">{pos.pe_ratio ? pos.pe_ratio.toFixed(2) : '-'}</td>,
            high_52_weeks: <td className="p-4 font-mono">{formatCurrency(pos.high_52_weeks)}</td>,
            low_52_weeks: <td className="p-4 font-mono">{formatCurrency(pos.low_52_weeks)}</td>,
            position_52_week: <td className="p-4 font-mono">{formatPercent(pos.position_52_week)}</td>,
            one_week_change: <td className="p-4 font-mono"><PctIndicator value={pos.one_week_change} /></td>,
            one_month_change: <td className="p-4 font-mono"><PctIndicator value={pos.one_month_change} /></td>,
            three_month_change: <td className="p-4 font-mono"><PctIndicator value={pos.three_month_change} /></td>,
            one_year_change: <td className="p-4 font-mono"><PctIndicator value={pos.one_year_change} /></td>,
            yearly_revenue_change: <td className="p-4 font-mono"><PctIndicator value={pos.yearly_revenue_change} /></td>,
            notes: <td className="p-4 font-mono"><EditableNoteCell ticker={pos.ticker} initialNote={pos.note} onSave={(ticker, fieldName, value) => handleSaveCell(ticker, fieldName, value, accountName)} /></td>,
            group: <td className="p-4 text-gray-300">{pos.group || '-'}</td>,
            comment: <td className="p-4 font-mono"><EditableIndustryCell ticker={pos.ticker} initialIndustry={pos.comment} onSave={(ticker, fieldName, value) => handleSaveCell(ticker, fieldName, value, accountName)} /></td>,
            industry: <td className="p-4 text-gray-300">{pos.industry}</td>,
            sector: <td className="p-4 text-gray-300">{pos.sector}</td>
        };

        return (
            <tr key={`${accountName}-${isOption ? `${pos.ticker}-${pos.expiry}-${pos.strike}-${pos.option_type}` : pos.ticker}`} className="border-b border-gray-700 last:border-b-0 hover:bg-gray-700/50 transition-colors">
                {columnOrder.map(key => {
                    const { visible } = columns[key];
                    return visible ? React.cloneElement(cells[key], { key }) : null
                })}
            </tr>
        );
    };

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (active.id !== over.id) {
            setColumnOrder((items) => {
                const oldIndex = items.indexOf(active.id);
                const newIndex = items.indexOf(over.id);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };

    return (
        <div className="space-y-8">
            {error && <div className="bg-red-800/50 text-red-200 p-4 rounded-lg mb-6 border border-red-700">{error}</div>}

            <header className="mb-8">
                <h2 className="text-2xl font-bold text-white">All Accounts Overview</h2>
                <p className="text-gray-400">Combined portfolio view across all account types</p>
            </header>

            {/* Combined Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
                {loading && !combinedSummary ? (
                    [...Array(5)].map((_, i) => <MetricCardSkeleton key={i} />)
                ) : combinedSummary ? (
                    <>
                        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                            <h3 className="text-gray-400 text-sm mb-2">Total Equity</h3>
                            <p className="text-3xl font-semibold text-white">{formatCurrency(combinedSummary.totalEquity)}</p>
                        </div>
                        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                            <h3 className="text-gray-400 text-sm mb-2">Day's P/L</h3>
                            <p className={`text-3xl font-semibold ${combinedSummary.changeTodayAbs >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {formatCurrency(combinedSummary.changeTodayAbs, true)}
                            </p>
                        </div>
                        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                            <h3 className="text-gray-400 text-sm mb-2">Total P/L</h3>
                            <p className={`text-3xl font-semibold ${combinedSummary.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {formatCurrency(combinedSummary.totalPnl, true)}
                            </p>
                        </div>
                        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                            <h3 className="text-gray-400 text-sm mb-2">Day's P/L %</h3>
                            <p className={`text-3xl font-semibold ${combinedSummary.changeTodayPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {formatPercent(combinedSummary.changeTodayPct)}
                            </p>
                        </div>
                        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                            <h3 className="text-gray-400 text-sm mb-2">Total Tickers</h3>
                            <p className="text-3xl font-semibold text-white">{combinedSummary.totalTickers}</p>
                        </div>
                    </>
                ) : null}
            </div>

            {/* Global Controls */}
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-white">Account Positions</h3>
                <div className="flex items-center space-x-2">
                    <button onClick={() => fetchAllData(true)} className="p-2 rounded-full hover:bg-gray-700 transition-colors" title="Force Refresh All">
                        <RefreshIcon />
                    </button>
                    <div className="relative" ref={settingsRef}>
                        <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className="p-2 rounded-full hover:bg-gray-700 transition-colors">
                            <GearIcon />
                        </button>
                        {isSettingsOpen && (
                            <div className="absolute right-0 mt-2 w-56 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-20">
                                <div className="p-3 border-b border-gray-600">
                                    <h4 className="font-semibold text-white">Display Columns</h4>
                                </div>
                                <div className="p-2 max-h-96 overflow-y-auto">
                                    {Object.entries(columns).map(([key, { label, visible }]) => (
                                        <label key={key} className="flex items-center space-x-3 px-3 py-2 cursor-pointer hover:bg-gray-700 rounded-md">
                                            <input
                                                type="checkbox"
                                                checked={visible}
                                                onChange={() => handleColumnToggle(key)}
                                                className="form-checkbox h-4 w-4 bg-gray-700 border-gray-500 rounded text-blue-500 focus:ring-offset-0 focus:ring-2 focus:ring-blue-500"
                                            />
                                            <span className="text-gray-300 select-none">{label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Individual Account Tables */}
            {accounts.map(accountName => {
                const accountData = portfolioData[accountName];
                const sortedPositions = getSortedPositions(accountName);
                const sortConfig = sortConfigs[accountName];

                return (
                    <div key={accountName} className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-x-auto mb-8">
                        <div className="flex justify-between items-center p-4 bg-gray-800 border-b border-gray-700">
                            <h4 className="text-lg font-semibold text-white capitalize">{accountName.replace(/_/g, ' ')}</h4>
                            <div className="text-sm text-gray-400">
                                {accountData && accountData.timestamp ?
                                    `Updated: ${new Date(accountData.timestamp).toLocaleString()}` :
                                    'Loading...'
                                }
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left min-w-[1200px]">
                                <thead className="bg-gray-800 border-b border-gray-700">
                                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                        <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
                                            <tr>
                                                {columnOrder.map(key => {
                                                    const { label, visible } = columns[key];
                                                    return visible ? (
                                                        <DraggableHeaderCell key={key} id={key} className="p-4 text-sm font-semibold text-gray-400 tracking-wider" onClick={() => requestSort(accountName, key)}>
                                                            {label}
                                                            {sortConfig.key === key && <SortIcon direction={sortConfig.direction} />}
                                                        </DraggableHeaderCell>
                                                    ) : null
                                                })}
                                            </tr>
                                        </SortableContext>
                                    </DndContext>
                                </thead>
                                <tbody>
                                    {loading && !accountData ? (
                                        Array.from({ length: 3 }).map((_, i) => <TableRowSkeleton key={i} columns={columns} columnOrder={columnOrder} />)
                                    ) : sortedPositions.length > 0 ? (
                                        sortedPositions.map(pos => renderPositionRow(pos, accountName))
                                    ) : (
                                        <tr>
                                            <td colSpan={Object.values(columns).filter(c => c.visible).length} className="text-center p-8 text-gray-400">
                                                {accountData ? 'No open positions found in this account.' : 'Loading...'}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default AllAccounts;