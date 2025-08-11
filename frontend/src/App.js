import React, { useState, useEffect, useRef, useCallback } from 'react';
import './index.css';

// --- Helper Components ---

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

const TableRowSkeleton = ({ columns }) => (
    <tr className="border-b border-gray-700">
        {Object.values(columns).map((col, i) => (
            col.visible ? <td key={i} className="p-4"><div className="h-5 bg-gray-600 rounded"></div></td> : null
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

const EditableNoteCell = ({ ticker, initialNote, onSave }) => {
    const [note, setNote] = useState(initialNote);
    const textareaRef = useRef(null);

    useEffect(() => {
        setNote(initialNote);
    }, [initialNote]);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [note]);

    const handleBlur = () => {
        if (note !== initialNote) {
            onSave(ticker, note);
        }
    };

    return (
        <textarea
            ref={textareaRef}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={handleBlur}
            className="w-full bg-transparent resize-none border-none focus:ring-0 focus:outline-none p-0 m-0"
            placeholder="Add a note..."
            rows="1"
        />
    );
};


// --- Main App Component ---

function App() {
    const [accounts, setAccounts] = useState([]);
    const [selectedAccount, setSelectedAccount] = useState('');
    const [portfolioData, setPortfolioData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const settingsRef = useRef(null);

    const initialColumns = {
        ticker: { label: 'Ticker', visible: true },
        marketValue: { label: 'Market Value', visible: true },
        quantity: { label: 'Quantity', visible: true },
        avgCost: { label: 'Avg Cost', visible: true },
        unrealizedPnl: { label: 'P/L', visible: true },
        returnPct: { label: '% Return', visible: true },
        type: { label: 'Type', visible: true },
        strike: { label: 'Strike', visible: true },
        expiry: { label: 'Expiry', visible: true },
        notes: { label: 'Notes', visible: true },
    };

    const [columns, setColumns] = useState(() => {
        try {
            const saved = localStorage.getItem('portfolio-columns');
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

    useEffect(() => {
        localStorage.setItem('portfolio-columns', JSON.stringify(columns));
    }, [columns]);

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

    useEffect(() => {
        const fetchAccounts = async () => {
            try {
                const response = await fetch('http://192.168.4.42:5001/api/accounts');
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const data = await response.json();
                setAccounts(data);
                if (data.length > 0) setSelectedAccount(data[0]);
                else setLoading(false);
            } catch (e) {
                setError('Failed to fetch accounts. Is the backend server running?');
                setLoading(false);
                console.error(e);
            }
        };
        fetchAccounts();
    }, []);

    const handleSaveNote = useCallback(async (ticker, note) => {
        if (!selectedAccount) return;
        try {
            const response = await fetch(`http://192.168.4.42:5001/api/notes/${selectedAccount}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticker, note }),
            });
            if (!response.ok) throw new Error('Failed to save note.');

            // Optimistically update local state
            setPortfolioData(prevData => {
                if (!prevData) return null;
                const updatedPositions = prevData.positions.map(p =>
                    p.ticker === ticker ? { ...p, note } : p
                );
                return { ...prevData, positions: updatedPositions };
            });

        } catch (e) {
            console.error("Failed to save note:", e);
            // Optionally show an error to the user
        }
    }, [selectedAccount]);

    useEffect(() => {
        if (!selectedAccount) return;

        const fetchData = async () => {
            setLoading(true);
            setError(null);
            setPortfolioData(null);
            try {
                const [portfolioRes, notesRes] = await Promise.all([
                    fetch(`http://192.168.4.42:5001/api/portfolio/${selectedAccount}`),
                    fetch(`http://192.168.4.42:5001/api/notes/${selectedAccount}`)
                ]);

                if (!portfolioRes.ok) {
                    const errData = await portfolioRes.json();
                    throw new Error(errData.error || `HTTP error! status: ${portfolioRes.status}`);
                }
                if (!notesRes.ok) {
                    // Don't throw, notes might not exist, which is fine
                    console.warn(`Could not fetch notes for ${selectedAccount}. Status: ${notesRes.status}`);
                }

                const portfolioResult = await portfolioRes.json();
                const notesResult = notesRes.ok ? await notesRes.json() : {};

                if (portfolioResult.error) throw new Error(portfolioResult.error);

                const positionsWithNotes = portfolioResult.positions.map(pos => ({
                    ...pos,
                    note: notesResult[pos.ticker] || ''
                }));

                setPortfolioData({ ...portfolioResult, positions: positionsWithNotes });

            } catch (e) {
                setError(`Failed to fetch portfolio data for ${selectedAccount}. Error: ${e.message}`);
                console.error(e);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [selectedAccount]);

    const renderPositionRow = (pos) => {
        const isOption = pos.type === 'option';
        const isCash = pos.type === 'cash';

        return (
            <tr key={isOption ? `${pos.ticker}-${pos.expiry}-${pos.strike}-${pos.option_type}` : pos.ticker} className="border-b border-gray-700 last:border-b-0 hover:bg-gray-700/50 transition-colors">
                {columns.ticker.visible && <td className="p-4 font-bold text-white">{pos.ticker}</td>}
                {columns.marketValue.visible && <td className="p-4 font-mono">{formatCurrency(pos.marketValue)}</td>}
                {columns.quantity.visible && <td className="p-4 font-mono">{isCash ? '-' : pos.quantity.toFixed(2)}</td>}
                {columns.avgCost.visible && <td className="p-4 font-mono">{isCash ? '-' : formatCurrency(pos.avgCost)}</td>}
                {columns.unrealizedPnl.visible && <td className="p-4 font-mono"><PnlIndicator value={pos.unrealizedPnl} /></td>}
                {columns.returnPct.visible && <td className="p-4 font-mono"><PctIndicator value={pos.returnPct} /></td>}
                {columns.type.visible && <td className="p-4 font-mono capitalize">{isOption ? pos.option_type : (isCash ? '-' : 'Stock')}</td>}
                {columns.strike.visible && <td className="p-4 font-mono">{isOption ? formatCurrency(pos.strike) : '-'}</td>}
                {columns.expiry.visible && <td className="p-4 font-mono">{isOption ? pos.expiry : '-'}</td>}
                {columns.notes.visible && <td className="p-4 font-mono"><EditableNoteCell ticker={pos.ticker} initialNote={pos.note} onSave={handleSaveNote} /></td>}
            </tr>
        );
    };

    return (
        <div className="bg-gray-900 text-gray-200 font-sans flex min-h-screen" style={{fontFamily: "'Inter', sans-serif"}}>
            <aside className="w-60 bg-black/30 p-6 border-r border-gray-700 flex flex-col flex-shrink-0">
                <h1 className="text-xl font-bold mb-8 text-white">Portfolio Tracker</h1>
                <nav className="flex flex-col space-y-2">
                    {accounts.map(acc => (
                        <button
                            key={acc}
                            onClick={() => setSelectedAccount(acc)}
                            className={`text-left px-4 py-2 rounded-md text-gray-300 hover:bg-gray-700 transition-colors w-full ${selectedAccount === acc ? 'bg-gray-700 font-semibold text-white' : ''}`}
                        >
                            {acc.replace(/_/g, ' ')}
                        </button>
                    ))}
                </nav>
            </aside>

            <main className="flex-1 p-8 overflow-auto">
                {error && <div className="bg-red-800/50 text-red-200 p-4 rounded-lg mb-6 border border-red-700">{error}</div>}

                <header className="mb-8">
                    <h2 className="text-2xl font-bold text-white capitalize">{selectedAccount.replace(/_/g, ' ')} Overview</h2>
                    <p className="text-gray-400">Last updated: {new Date().toLocaleString()}</p>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
                    {loading || !portfolioData ? (
                        [...Array(5)].map((_, i) => <MetricCardSkeleton key={i} />)
                    ) : (
                        <>
                            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                                <h3 className="text-gray-400 text-sm mb-2">Total Equity</h3>
                                <p className="text-3xl font-semibold text-white">{formatCurrency(portfolioData.summary.totalEquity)}</p>
                            </div>
                            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                                <h3 className="text-gray-400 text-sm mb-2">Day's P/L</h3>
                                <p className={`text-3xl font-semibold ${portfolioData.summary.changeTodayAbs >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {formatCurrency(portfolioData.summary.changeTodayAbs, true)}
                                </p>
                            </div>
                            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                                <h3 className="text-gray-400 text-sm mb-2">Total P/L</h3>
                                <p className={`text-3xl font-semibold ${portfolioData.summary.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {formatCurrency(portfolioData.summary.totalPnl, true)}
                                </p>
                            </div>
                            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                                <h3 className="text-gray-400 text-sm mb-2">Day's P/L %</h3>
                                <p className={`text-3xl font-semibold ${portfolioData.summary.changeTodayPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {formatPercent(portfolioData.summary.changeTodayPct)}
                                </p>
                            </div>
                            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                                <h3 className="text-gray-400 text-sm mb-2">Total Tickers</h3>
                                <p className="text-3xl font-semibold text-white">{portfolioData.summary.totalTickers}</p>
                            </div>
                        </>
                    )}
                </div>

                <div className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-x-auto">
                    <div className="flex justify-between items-center p-4 bg-gray-800 border-b border-gray-700">
                        <h3 className="text-lg font-semibold text-white">Positions</h3>
                        <div className="relative" ref={settingsRef}>
                            <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className="p-2 rounded-full hover:bg-gray-700 transition-colors">
                                <GearIcon />
                            </button>
                            {isSettingsOpen && (
                                <div className="absolute right-0 mt-2 w-56 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-20">
                                    <div className="p-3 border-b border-gray-600">
                                        <h4 className="font-semibold text-white">Display Columns</h4>
                                    </div>
                                    <div className="p-2">
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
                    <div className="overflow-x-auto">
                        <table className="w-full text-left min-w-[1200px]">
                            <thead className="bg-gray-800 border-b border-gray-700">
                                <tr>
                                    {Object.entries(columns).map(([key, { label, visible }]) =>
                                        visible ? <th key={key} className="p-4 text-sm font-semibold text-gray-400 tracking-wider">{label}</th> : null
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {loading || !portfolioData ? (
                                    Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} columns={columns} />)
                                ) : (
                                    portfolioData.positions.length > 0 ? portfolioData.positions.map(renderPositionRow) : (
                                        <tr>
                                            <td colSpan={Object.values(columns).filter(c => c.visible).length} className="text-center p-8 text-gray-400">No open positions found in this account.</td>
                                        </tr>
                                    )
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </div>
    );
}

export default App;
