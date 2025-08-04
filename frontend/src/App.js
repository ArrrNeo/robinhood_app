import React, { useState, useEffect } from 'react';
import './index.css';

// --- Helper Components ---

// Loading Skeleton for a more professional loading state
const MetricCardSkeleton = () => (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 animate-pulse">
        <div className="h-4 bg-gray-600 rounded w-3/4 mb-3"></div>
        <div className="h-8 bg-gray-600 rounded w-1/2"></div>
    </div>
);

const TableRowSkeleton = () => (
    <tr className="border-b border-gray-700">
        <td className="p-4"><div className="h-5 bg-gray-600 rounded"></div></td>
        <td className="p-4"><div className="h-5 bg-gray-600 rounded"></div></td>
        <td className="p-4"><div className="h-5 bg-gray-600 rounded"></div></td>
        <td className="p-4"><div className="h-5 bg-gray-600 rounded"></div></td>
        <td className="p-4"><div className="h-5 bg-gray-600 rounded"></div></td>
        <td className="p-4"><div className="h-5 bg-gray-600 rounded"></div></td>
        <td className="p-4"><div className="h-5 bg-gray-600 rounded"></div></td>
    </tr>
);

// Formatter for numbers to add commas and signs
const formatCurrency = (value, sign = false) => {
    if (typeof value !== 'number') return '$0.00';
    const options = { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 };
    const formatted = new Intl.NumberFormat('en-US', options).format(value);
    if (sign && value > 0) {
        return `+${formatted}`;
    }
    return formatted;
};

const formatPercent = (value) => {
    if (typeof value !== 'number') return '0.00%';
    const sign = value > 0 ? '+' : '';
    return `${sign}${(value).toFixed(2)}%`;
};

// --- Main App Component ---

function App() {
    const [accounts, setAccounts] = useState([]);
    const [selectedAccount, setSelectedAccount] = useState('');
    const [portfolioData, setPortfolioData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Fetch the list of available accounts on component mount
    useEffect(() => {
        const fetchAccounts = async () => {
            try {
                const response = await fetch('http://192.168.4.42:5001/api/accounts');
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                setAccounts(data);
                if (data.length > 0) {
                    setSelectedAccount(data[0]); // Select the first account by default
                } else {
                    setLoading(false);
                }
            } catch (e) {
                setError('Failed to fetch accounts. Is the backend server running?');
                setLoading(false);
                console.error(e);
            }
        };
        fetchAccounts();
    }, []);

    // Fetch portfolio data whenever the selected account changes
    useEffect(() => {
        if (!selectedAccount) return;

        const fetchData = async () => {
            setLoading(true);
            setError(null);
            setPortfolioData(null);
            try {
                const response = await fetch(`http://192.168.4.42:5001/api/portfolio/${selectedAccount}`);
                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.error || `HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                if (data.error) {
                    throw new Error(data.error);
                }
                setPortfolioData(data);
            } catch (e) {
                setError(`Failed to fetch portfolio data for ${selectedAccount}. Error: ${e.message}`);
                console.error(e);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [selectedAccount]);

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

    return (
        <div className="bg-gray-900 text-gray-200 font-sans flex min-h-screen" style={{fontFamily: "'Inter', sans-serif"}}>
            {/* --- Sidebar --- */}
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

            {/* --- Main Content --- */}
            <main className="flex-1 p-8 overflow-auto">
                {error && <div className="bg-red-800/50 text-red-200 p-4 rounded-lg mb-6 border border-red-700">{error}</div>}

                <header className="mb-8">
                    <h2 className="text-2xl font-bold text-white capitalize">{selectedAccount.replace(/_/g, ' ')} Overview</h2>
                    <p className="text-gray-400">Last updated: {new Date().toLocaleString()}</p>
                </header>

                {/* --- Metric Cards --- */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    {loading || !portfolioData ? (
                        <>
                            <MetricCardSkeleton />
                            <MetricCardSkeleton />
                            <MetricCardSkeleton />
                            <MetricCardSkeleton />
                        </>
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
                        </>
                    )}
                </div>

                {/* --- Positions Table --- */}
                <div className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-x-auto">
                    <table className="w-full text-left min-w-[800px]">
                        <thead className="bg-gray-800 border-b border-gray-700">
                            <tr>
                                <th className="p-4 text-sm font-semibold text-gray-400 tracking-wider">Ticker</th>
                                <th className="p-4 text-sm font-semibold text-gray-400 tracking-wider">Market Value</th>
                                <th className="p-4 text-sm font-semibold text-gray-400 tracking-wider">Quantity</th>
                                <th className="p-4 text-sm font-semibold text-gray-400 tracking-wider">Avg Cost</th>
                                <th className="p-4 text-sm font-semibold text-gray-400 tracking-wider">P/L</th>
                                <th className="p-4 text-sm font-semibold text-gray-400 tracking-wider">% Return</th>
                                <th className="p-4 text-sm font-semibold text-gray-400 tracking-wider">Annualized %</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading || !portfolioData ? (
                                Array.from({ length: 4 }).map((_, i) => <TableRowSkeleton key={i} />)
                            ) : (
                                portfolioData.positions.length > 0 ? portfolioData.positions.map(pos => (
                                    <tr key={pos.ticker} className="border-b border-gray-700 last:border-b-0 hover:bg-gray-700/50 transition-colors">
                                        <td className="p-4 font-bold text-white">{pos.ticker}</td>
                                        <td className="p-4 font-mono">{formatCurrency(pos.marketValue)}</td>
                                        <td className="p-4 font-mono">{pos.quantity.toFixed(2)}</td>
                                        <td className="p-4 font-mono">{formatCurrency(pos.avgCost)}</td>
                                        <td className="p-4 font-mono"><PnlIndicator value={pos.unrealizedPnl} /></td>
                                        <td className="p-4 font-mono"><PctIndicator value={pos.returnPct} /></td>
                                        <td className="p-4 font-mono"><PctIndicator value={pos.annualizedPct} /></td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan="7" className="text-center p-8 text-gray-400">No open positions found in this account.</td>
                                    </tr>
                                )
                            )}
                        </tbody>
                    </table>
                </div>
            </main>
        </div>
    );
}

export default App;
