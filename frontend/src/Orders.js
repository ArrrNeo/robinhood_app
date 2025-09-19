import React, { useState, useEffect, useMemo } from 'react';
import config from './config.json';

const SortIcon = ({ direction }) => (
    <svg className="w-4 h-4 inline-block ml-1 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={direction === 'ascending' ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"}></path>
    </svg>
);

const TableRowSkeleton = ({ columns }) => (
    <tr className="border-b border-gray-700">
        {columns.map((_, i) => (
            <td key={i} className="p-4"><div className="h-5 bg-gray-600 rounded"></div></td>
        ))}
    </tr>
);

const formatCurrency = (value) => {
    if (typeof value !== 'number') return '$0.00';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
};

const OrdersPage = ({ selectedAccount }) => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: 'last_transaction_at', direction: 'descending' });
    const [dateRange, setDateRange] = useState('7d');

    useEffect(() => {
        const fetchOrders = async () => {
            if (!selectedAccount) return;
            setLoading(true);
            setError(null);

            let url = `${config.api.base_url}${config.api.endpoints.orders}/${selectedAccount}`;
            const params = new URLSearchParams();

            if (dateRange !== 'all') {
                const endDate = new Date();
                let startDate;
                if (dateRange === '7d') {
                    startDate = new Date();
                    startDate.setDate(endDate.getDate() - 7);
                } else if (dateRange === '30d') {
                    startDate = new Date();
                    startDate.setMonth(endDate.getMonth() - 1);
                } else if (dateRange === '1y') {
                    startDate = new Date();
                    startDate.setFullYear(endDate.getFullYear() - 1);
                }
                if (startDate) {
                    params.append('start_date', startDate.toISOString());
                }
            }
            
            url += `?${params.toString()}`;

            try {
                const response = await fetch(url);
                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.error || `HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                setOrders(data);
            } catch (e) {
                setError(`Failed to fetch orders. Error: ${e.message}`);
                console.error(e);
            } finally {
                setLoading(false);
            }
        };

        fetchOrders();
    }, [selectedAccount, dateRange]);

    const sortedOrders = useMemo(() => {
        let sortableItems = [...orders].filter(order => order.state === 'filled');
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
    }, [orders, sortConfig]);

    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const columns = [
        { key: 'updated_at', label: 'Date' },
        { key: 'ticker', label: 'Ticker' },
        { key: 'type', label: 'Type' },
        { key: 'side', label: 'Side' },
        { key: 'quantity', label: 'Quantity' },
        { key: 'average_price', label: 'Avg. Price' },
        { key: 'net_amount', label: 'Net Amount' },
        { key: 'state', label: 'State' },
    ];

    return (
        <div className="p-8">
            <header className="mb-8">
                <h2 className="text-2xl font-bold text-white">Orders</h2>
                <div className="mt-4">
                    <select
                        value={dateRange}
                        onChange={(e) => setDateRange(e.target.value)}
                        className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="all">All Time</option>
                        <option value="7d">Last 7 Days</option>
                        <option value="30d">Last 30 Days</option>
                        <option value="1y">Last 1 Year</option>
                    </select>
                </div>
            </header>

            {error && <div className="bg-red-800/50 text-red-200 p-4 rounded-lg mb-6 border border-red-700">{error}</div>}

            <div className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-x-auto">
                <table className="w-full text-left min-w-[1000px]">
                    <thead className="bg-gray-800 border-b border-gray-700">
                        <tr>
                            {columns.map(({ key, label }) => (
                                <th key={key} className="p-4 text-sm font-semibold text-gray-400 tracking-wider cursor-pointer" onClick={() => requestSort(key)}>
                                    {label}
                                    {sortConfig.key === key && <SortIcon direction={sortConfig.direction} />}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            Array.from({ length: 10 }).map((_, i) => <TableRowSkeleton key={i} columns={columns} />)
                        ) : sortedOrders.length > 0 ? (
                            sortedOrders.map((order) => (
                                <tr key={order.id} className="border-b border-gray-700 last:border-b-0 hover:bg-gray-700/50 transition-colors">
                                    <td className="p-4 font-mono">{new Date(order.last_transaction_at).toLocaleString()}</td>
                                    <td className="p-4 font-bold text-white">{order.ticker || 'N/A'}</td>
                                    <td className="p-4 font-mono capitalize">{order.legs ? 'Option' : 'Stock'}</td>
                                    <td className="p-4 font-mono capitalize">{order.side}</td>
                                    <td className="p-4 font-mono">{parseFloat(order.quantity).toFixed(2)}</td>
                                    <td className="p-4 font-mono">{formatCurrency(parseFloat(order.average_price))}</td>
                                    <td className="p-4 font-mono">{formatCurrency(parseFloat(order.net_amount))}</td>
                                    <td className="p-4 font-mono capitalize">{order.state}</td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={columns.length} className="text-center p-8 text-gray-400">No orders found for the selected period.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default OrdersPage;
