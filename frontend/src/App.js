import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import './index.css';
import OrdersPage from './Orders';
import AllAccounts from './AllAccounts';
import { CreateGroupModal, EditGroupModal, GroupRow, GroupAssignmentDropdown, useGroupManagement } from './GroupManager';
import config from './config.json';
import tableConfig from './table-columns.json';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// --- Helper Components ---

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

const PlusIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
    </svg>
);

const LoginIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
    </svg>
);

const SpinnerIcon = () => (
    <svg className="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

const StatusPill = ({ loading, error, timestamp }) => {
    const getRelativeTime = (ts) => {
        if (!ts) return null;
        const now = new Date();
        const then = new Date(ts);
        const diffMs = now - then;
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHour = Math.floor(diffMin / 60);

        if (diffSec < 60) return 'just now';
        if (diffMin < 60) return `${diffMin}m ago`;
        if (diffHour < 24) return `${diffHour}h ago`;
        return then.toLocaleDateString();
    };

    if (error) {
        return (
            <div className="flex items-center space-x-2 px-3 py-1.5 bg-red-900/30 border border-red-700 rounded-full text-red-400 text-sm">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>Error</span>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center space-x-2 px-3 py-1.5 bg-blue-900/30 border border-blue-700 rounded-full text-blue-400 text-sm">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Loading...</span>
            </div>
        );
    }

    const relativeTime = getRelativeTime(timestamp);
    return (
        <div className="flex items-center space-x-2 px-3 py-1.5 bg-green-900/30 border border-green-700 rounded-full text-green-400 text-sm">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>{relativeTime || 'Ready'}</span>
        </div>
    );
};

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


// --- Main App Component ---

function App() {
    const [accounts, setAccounts] = useState([]);
    const [selectedAccount, setSelectedAccount] = useState('');
    const [portfolioData, setPortfolioData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [showCreateGroup, setShowCreateGroup] = useState(false);
    const [showEditGroup, setShowEditGroup] = useState(false);
    const [editingGroup, setEditingGroup] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: 'marketValue', direction: 'descending' });
    const [loginLoading, setLoginLoading] = useState(false);
    const [loginMessage, setLoginMessage] = useState(null);
    const [globalNotes, setGlobalNotes] = useState({});
    const [showRefreshDone, setShowRefreshDone] = useState(false);
    const [showGroups, setShowGroups] = useState(() => {
        const saved = localStorage.getItem(`showGroups_${selectedAccount}`);
        return saved !== null ? JSON.parse(saved) : true;
    });
    const [fetchingHistorical, setFetchingHistorical] = useState({});

    // Group management
    const {
        groups,
        groupMetrics,
        createGroup,
        updateGroup,
        deleteGroup,
        toggleGroupCollapse,
        assignPositionToGroup,
        organizePositionsByGroups
    } = useGroupManagement(selectedAccount);
    const [currentPage, setCurrentPage] = useState(() => {
        try {
            const saved = localStorage.getItem(config.cache.local_storage_keys.current_page);
            return saved || 'portfolio';
        } catch (e) {
            return 'portfolio';
        }
    }); // 'portfolio', 'orders', or 'all'
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
                // Remove duplicates
                const uniqueOrder = [...new Set(parsedOrder)];
                // Add any missing columns from the config
                const allKeys = Object.keys(tableConfig.default_columns);
                const missingKeys = allKeys.filter(key => !uniqueOrder.includes(key));
                const finalOrder = [...uniqueOrder, ...missingKeys];

                // Validate that all keys exist in the config
                if (finalOrder.every(key => allKeys.includes(key))) {
                    return finalOrder;
                }
            }
            return initialOrder;
        } catch (e) {
            return tableConfig.default_order;
        }
    });

    useEffect(() => {
        localStorage.setItem(config.cache.local_storage_keys.column_order, JSON.stringify(columnOrder));
    }, [columnOrder]);

    useEffect(() => {
        if (selectedAccount) {
            localStorage.setItem(`showGroups_${selectedAccount}`, JSON.stringify(showGroups));
        }
    }, [showGroups, selectedAccount]);

    // Update showGroups when account changes
    useEffect(() => {
        if (selectedAccount) {
            const saved = localStorage.getItem(`showGroups_${selectedAccount}`);
            setShowGroups(saved !== null ? JSON.parse(saved) : true);
        }
    }, [selectedAccount]);


    // Compute sorted data structure for rendering
    const sortedData = useMemo(() => {
        if (!portfolioData || !portfolioData.positions) {
            return { sortedGroups: [], sortedUngrouped: [] };
        }

        // If groups are hidden, just return all positions sorted
        if (!showGroups) {
            const allPositions = [...portfolioData.positions];
            if (sortConfig.key) {
                allPositions.sort((a, b) => {
                    if (a[sortConfig.key] < b[sortConfig.key]) {
                        return sortConfig.direction === 'ascending' ? -1 : 1;
                    }
                    if (a[sortConfig.key] > b[sortConfig.key]) {
                        return sortConfig.direction === 'ascending' ? 1 : -1;
                    }
                    return 0;
                });
            }
            return { sortedUnits: allPositions.map(position => ({ type: 'position', position })) };
        }

        // Group-applicable sorting keys
        const groupSortableKeys = ['marketValue', 'unrealizedPnl', 'returnPct', 'portfolio_percent'];
        const isGroupSortable = groupSortableKeys.includes(sortConfig.key);

        // Organize positions into groups
        const { groupedPositions, ungroupedPositions } = organizePositionsByGroups(portfolioData.positions);

        if (!sortConfig.key || !isGroupSortable) {
            // For non-group-applicable keys or no sorting, sort positions individually within groups
            const sortedUnits = [];

            // Add groups (positions sorted within each group)
            Object.entries(groups.groups).forEach(([groupId, group]) => {
                let positions = [...(groupedPositions[groupId] || [])];
                if (sortConfig.key) {
                    positions.sort((a, b) => {
                        if (a[sortConfig.key] < b[sortConfig.key]) {
                            return sortConfig.direction === 'ascending' ? -1 : 1;
                        }
                        if (a[sortConfig.key] > b[sortConfig.key]) {
                            return sortConfig.direction === 'ascending' ? 1 : -1;
                        }
                        return 0;
                    });
                }
                if (positions.length > 0) {
                    sortedUnits.push({
                        type: 'group',
                        groupId,
                        group,
                        positions
                    });
                }
            });

            // Add ungrouped positions
            let sortedUngrouped = [...ungroupedPositions];
            if (sortConfig.key) {
                sortedUngrouped.sort((a, b) => {
                    if (a[sortConfig.key] < b[sortConfig.key]) {
                        return sortConfig.direction === 'ascending' ? -1 : 1;
                    }
                    if (a[sortConfig.key] > b[sortConfig.key]) {
                        return sortConfig.direction === 'ascending' ? 1 : -1;
                    }
                    return 0;
                });
            }
            sortedUngrouped.forEach(position => {
                sortedUnits.push({
                    type: 'position',
                    position
                });
            });

            return { sortedUnits };
        }

        // For group-applicable keys, create sortable units (groups + ungrouped positions)
        const sortableUnits = [];

        // Add each group as a unit with its aggregate value
        Object.entries(groups.groups).forEach(([groupId, group]) => {
            let positions = [...(groupedPositions[groupId] || [])];
            if (positions.length > 0) {
                const metrics = groupMetrics[groupId];
                let sortValue = 0;

                // Calculate the appropriate sort value based on the key
                switch(sortConfig.key) {
                    case 'marketValue':
                        sortValue = metrics?.total_market_value || 0;
                        break;
                    case 'unrealizedPnl':
                        sortValue = metrics?.total_pnl || 0;
                        break;
                    case 'returnPct':
                        const totalMarketValue = metrics?.total_market_value || 0;
                        const totalPnl = metrics?.total_pnl || 0;
                        const totalCost = totalMarketValue - totalPnl;
                        sortValue = totalCost !== 0 ? (totalPnl / totalCost) * 100 : 0;
                        break;
                    case 'portfolio_percent':
                        const totalPortfolioValue = portfolioData?.summary?.totalEquity || 0;
                        const groupMarketValue = metrics?.total_market_value || 0;
                        sortValue = totalPortfolioValue > 0 ? (groupMarketValue / totalPortfolioValue) * 100 : 0;
                        break;
                    default:
                        sortValue = 0;
                }

                // Sort positions within the group by the same key
                positions.sort((a, b) => {
                    if (a[sortConfig.key] < b[sortConfig.key]) {
                        return sortConfig.direction === 'ascending' ? -1 : 1;
                    }
                    if (a[sortConfig.key] > b[sortConfig.key]) {
                        return sortConfig.direction === 'ascending' ? 1 : -1;
                    }
                    return 0;
                });

                sortableUnits.push({
                    type: 'group',
                    groupId,
                    group,
                    positions,
                    sortValue
                });
            }
        });

        // Add ungrouped positions as individual units
        ungroupedPositions.forEach(position => {
            sortableUnits.push({
                type: 'position',
                position,
                sortValue: position[sortConfig.key] || 0
            });
        });

        // Sort the units
        sortableUnits.sort((a, b) => {
            if (a.sortValue < b.sortValue) {
                return sortConfig.direction === 'ascending' ? -1 : 1;
            }
            if (a.sortValue > b.sortValue) {
                return sortConfig.direction === 'ascending' ? 1 : -1;
            }
            return 0;
        });

        // Return sorted units as-is for interleaved rendering
        return { sortedUnits: sortableUnits };
    }, [portfolioData, sortConfig, groups, groupMetrics, organizePositionsByGroups, showGroups]);

    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };


    useEffect(() => {
        localStorage.setItem(config.cache.local_storage_keys.columns, JSON.stringify(columns));
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
                const response = await fetch(`${config.api.base_url}${config.api.endpoints.accounts}`);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const data = await response.json();
                setAccounts(data);

                // Check local storage for the last selected account
                const lastSelected = localStorage.getItem(config.cache.local_storage_keys.selected_account);
                if (lastSelected && data.includes(lastSelected)) {
                    setSelectedAccount(lastSelected);
                } else if (data.length > 0) {
                    setSelectedAccount(data[0]);
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

    useEffect(() => {
        if (selectedAccount) {
            localStorage.setItem(config.cache.local_storage_keys.selected_account, selectedAccount);
        }
    }, [selectedAccount]);

    useEffect(() => {
        localStorage.setItem(config.cache.local_storage_keys.current_page, currentPage);
    }, [currentPage]);

    // Fetch global notes (ticker-based, not account-based)
    const fetchGlobalNotes = useCallback(async () => {
        try {
            const response = await fetch(`${config.api.base_url}${config.api.endpoints.notes}`);
            if (response.ok) {
                const notes = await response.json();
                setGlobalNotes(notes);
                return notes;
            }
        } catch (e) {
            console.error('Failed to fetch global notes:', e);
        }
        return {};
    }, []);

    // Fetch global notes on mount
    useEffect(() => {
        fetchGlobalNotes();
    }, [fetchGlobalNotes]);

    const handleSaveCell = useCallback(async (ticker, fieldName, value) => {
        try {
            const response = await fetch(`${config.api.base_url}${config.api.endpoints.notes}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticker, [fieldName]: value }),
            });
            if (!response.ok) throw new Error(`Failed to save ${fieldName}.`);

            // Update global notes state
            setGlobalNotes(prev => ({
                ...prev,
                [ticker]: {
                    ...prev[ticker],
                    [fieldName]: value
                }
            }));

            // Optimistically update portfolioData
            setPortfolioData(prevData => {
                if (!prevData) return null;
                const updatedPositions = prevData.positions.map(p =>
                    p.ticker === ticker ? { ...p, [fieldName]: value } : p
                );
                return { ...prevData, positions: updatedPositions };
            });

        } catch (e) {
            console.error(`Failed to save ${fieldName}:`, e);
        }
    }, []);

    const fetchData = useCallback(async (force = false) => {
        if (!selectedAccount) return;

        const cacheKey = `${config.cache.local_storage_keys.portfolio_data_prefix}${selectedAccount}`;

        // If not forcing a refresh, try to load from cache first
        if (!force) {
            try {
                const cached = localStorage.getItem(cacheKey);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    // Optional: Add a timestamp to invalidate cache after some time
                    setPortfolioData(parsed);
                    setLoading(false); // Stop initial loading, but we'll still fetch in background
                } else {
                    setLoading(true);
                }
            } catch (e) {
                console.error("Failed to read from cache", e);
                setLoading(true);
            }
        } else {
            setLoading(true);
        }

        setError(null);

        try {
            const portfolioUrl = `${config.api.base_url}${config.api.endpoints.portfolio}/${selectedAccount}${force ? '?force=true' : ''}`;

            // Fetch portfolio data and global notes in parallel
            const [portfolioRes, notes] = await Promise.all([
                fetch(portfolioUrl),
                force ? fetchGlobalNotes() : Promise.resolve(globalNotes)
            ]);

            if (!portfolioRes.ok) {
                const errData = await portfolioRes.json();
                throw new Error(errData.error || `HTTP error! status: ${portfolioRes.status}`);
            }

            const portfolioResult = await portfolioRes.json();

            if (portfolioResult.error) throw new Error(portfolioResult.error);

            // Merge positions with global notes
            const positionsWithNotes = portfolioResult.positions.map(pos => ({
                ...pos,
                note: notes[pos.ticker]?.note || '',
                comment: notes[pos.ticker]?.comment || ''
            }));

            const finalData = { ...portfolioResult, positions: positionsWithNotes };
            setPortfolioData(finalData);

            // Save the fresh data to cache
            try {
                localStorage.setItem(cacheKey, JSON.stringify(finalData));
            } catch (e) {
                console.error("Failed to write to cache", e);
            }

        } catch (e) {
            setError(`Failed to fetch portfolio data for ${selectedAccount}. Error: ${e.message}`);
            console.error(e);
        } finally {
            setLoading(false);
            if (force) {
                setShowRefreshDone(true);
                setTimeout(() => setShowRefreshDone(false), 3000);
            }
        }
    }, [selectedAccount, globalNotes, fetchGlobalNotes]);


    useEffect(() => {
        fetchData();
    }, [selectedAccount, fetchData]);

    const handleReLogin = async () => {
        setLoginLoading(true);
        setLoginMessage(null);
        setError(null);
        try {
            const response = await fetch(`${config.api.base_url}${config.api.endpoints.auth_login}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();

            if (response.ok && data.success) {
                setLoginMessage({ type: 'success', text: 'Login successful! You can now refresh your data.' });
                // Auto-hide success message after 5 seconds
                setTimeout(() => setLoginMessage(null), 5000);
            } else {
                setLoginMessage({ type: 'error', text: data.error || 'Login failed' });
            }
        } catch (e) {
            setLoginMessage({ type: 'error', text: `Login failed: ${e.message}` });
        } finally {
            setLoginLoading(false);
        }
    };

    const fetchHistoricalData = async (ticker) => {
        setFetchingHistorical(prev => ({ ...prev, [ticker]: true }));
        try {
            const response = await fetch(
                `${config.api.base_url}${config.api.endpoints.historical}/${ticker}`
            );
            if (!response.ok) {
                throw new Error(`Failed to fetch historical data for ${ticker}`);
            }
            const data = await response.json();
            console.log(`Successfully fetched historical data for ${ticker}`);
        } catch (error) {
            console.error(`Error fetching historical data for ${ticker}:`, error);
            alert(`Failed to fetch data for ${ticker}: ${error.message}`);
        } finally {
            setFetchingHistorical(prev => ({ ...prev, [ticker]: false }));
        }
    };

    const generatePositionCells = (pos) => {
        const isOption = pos.type === 'option';
        const isCash = pos.type === 'cash';

        return {
            ticker: <td className="p-4 font-bold text-white">{pos.ticker}</td>,
            name: <td className="p-4 text-gray-300">{pos.name}</td>,
            account: <td className="p-4 text-gray-300">-</td>,
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
            current_rsi: <td className="p-4 font-mono">{!isCash && !isOption && pos.current_rsi != null ? pos.current_rsi.toFixed(1) : '-'}</td>,
            current_ps: <td className="p-4 font-mono">{!isCash && !isOption && pos.current_ps != null ? pos.current_ps.toFixed(2) : '-'}</td>,
            ps_12m_max: <td className="p-4 font-mono">{!isCash && !isOption && pos.ps_12m_max != null ? pos.ps_12m_max.toFixed(2) : '-'}</td>,
            ps_12m_min: <td className="p-4 font-mono">{!isCash && !isOption && pos.ps_12m_min != null ? pos.ps_12m_min.toFixed(2) : '-'}</td>,
            pe_12m_max: <td className="p-4 font-mono">{!isCash && !isOption && pos.pe_12m_max != null ? pos.pe_12m_max.toFixed(2) : '-'}</td>,
            pe_12m_min: <td className="p-4 font-mono">{!isCash && !isOption && pos.pe_12m_min != null ? pos.pe_12m_min.toFixed(2) : '-'}</td>,
            high_52_weeks: <td className="p-4 font-mono">{formatCurrency(pos.high_52_weeks)}</td>,
            low_52_weeks: <td className="p-4 font-mono">{formatCurrency(pos.low_52_weeks)}</td>,
            position_52_week: <td className="p-4 font-mono">{formatPercent(pos.position_52_week)}</td>,
            one_week_change: <td className="p-4 font-mono"><PctIndicator value={pos.one_week_change} /></td>,
            one_month_change: <td className="p-4 font-mono"><PctIndicator value={pos.one_month_change} /></td>,
            three_month_change: <td className="p-4 font-mono"><PctIndicator value={pos.three_month_change} /></td>,
            one_year_change: <td className="p-4 font-mono"><PctIndicator value={pos.one_year_change} /></td>,
            yearly_revenue_change: <td className="p-4 font-mono"><PctIndicator value={pos.yearly_revenue_change} /></td>,
            notes: <td className="p-4 font-mono"><EditableNoteCell ticker={pos.ticker} initialNote={pos.note} onSave={handleSaveCell} /></td>,
            comment: <td className="p-4 font-mono"><EditableIndustryCell ticker={pos.ticker} initialIndustry={pos.comment} onSave={handleSaveCell} /></td>,
            industry: <td className="p-4 text-gray-300">{pos.industry}</td>,
            sector: <td className="p-4 text-gray-300">{pos.sector}</td>,
            group: <td className="p-4">
                <GroupAssignmentDropdown
                    position={pos}
                    groups={groups}
                    onAssign={assignPositionToGroup}
                />
            </td>,
            fetch_charts: <td className="p-4">
                {!isCash && !isOption && (
                    <button
                        onClick={() => fetchHistoricalData(pos.ticker)}
                        disabled={fetchingHistorical[pos.ticker]}
                        className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
                        title="Fetch 2-year historical data"
                    >
                        {fetchingHistorical[pos.ticker] ? 'Fetching...' : 'Fetch Data'}
                    </button>
                )}
            </td>,
            view_charts: <td className="p-4">
                {!isCash && !isOption && (
                    <button
                        onClick={() => window.open(`/charts.html?ticker=${pos.ticker}`, '_blank')}
                        className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors"
                        title="View historical charts"
                    >
                        View Charts
                    </button>
                )}
            </td>
        };
    };

    const renderPositionRow = (pos) => {
        const cells = generatePositionCells(pos);
        const isOption = pos.type === 'option';

        return (
            <tr key={isOption ? `${pos.ticker}-${pos.expiry}-${pos.strike}-${pos.option_type}` : pos.ticker} className="border-b border-gray-700 last:border-b-0 hover:bg-gray-700/50 transition-colors">
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
        <div className="bg-gray-900 text-gray-200 font-sans flex flex-col h-screen overflow-hidden" style={{fontFamily: "'Inter', sans-serif"}}>
            {/* Header with Tabs */}
            <header className="bg-black/30 border-b border-gray-700 flex-shrink-0">
                <div className="px-6 py-4">
                    <div className="flex items-center justify-between mb-4">
                        <h1 className="text-xl font-bold text-white">Portfolio Tracker</h1>
                        <StatusPill
                            loading={loading}
                            error={error}
                            timestamp={currentPage === 'portfolio' ? portfolioData?.timestamp : null}
                        />
                    </div>

                    {/* Main Account Tabs */}
                    <div className="flex space-x-1 mb-3">
                        <button
                            onClick={() => setCurrentPage('all')}
                            className={`px-4 py-2 rounded-t-md transition-colors ${
                                currentPage === 'all'
                                    ? 'bg-gray-700 text-white font-semibold border-b-2 border-blue-500'
                                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                            }`}
                        >
                            All
                        </button>
                        {accounts.map(acc => (
                            <button
                                key={acc}
                                onClick={() => {
                                    setSelectedAccount(acc);
                                    setCurrentPage('portfolio');
                                }}
                                className={`px-4 py-2 rounded-t-md transition-colors ${
                                    selectedAccount === acc && currentPage !== 'all'
                                        ? 'bg-gray-700 text-white font-semibold border-b-2 border-blue-500'
                                        : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                                }`}
                            >
                                {acc.replace(/_/g, ' ')}
                            </button>
                        ))}
                    </div>

                    {/* Sub-tabs for Portfolio/Orders (only show when not on "All" page) */}
                    {currentPage !== 'all' && selectedAccount && (
                        <div className="flex space-x-1 border-t border-gray-700 pt-2">
                            <button
                                onClick={() => setCurrentPage('portfolio')}
                                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                                    currentPage === 'portfolio'
                                        ? 'bg-gray-600 text-white font-medium'
                                        : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                                }`}
                            >
                                Portfolio
                            </button>
                            <button
                                onClick={() => setCurrentPage('orders')}
                                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                                    currentPage === 'orders'
                                        ? 'bg-gray-600 text-white font-medium'
                                        : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                                }`}
                            >
                                Orders
                            </button>
                        </div>
                    )}
                </div>
            </header>

            <main className="flex-1 flex flex-col overflow-hidden">
                {currentPage === 'all' ? (
                    <div className="p-8 overflow-auto">
                        <AllAccounts />
                    </div>
                ) : currentPage === 'portfolio' ? (
                    <>
                        {/* Fixed Header Section */}
                        <div className="flex-shrink-0 p-8 pb-0">
                            {error && <div className="bg-red-800/50 text-red-200 p-4 rounded-lg mb-6 border border-red-700">{error}</div>}
                            {loginMessage && (
                                <div className={`p-4 rounded-lg mb-6 border ${
                                    loginMessage.type === 'success'
                                        ? 'bg-green-800/50 text-green-200 border-green-700'
                                        : 'bg-red-800/50 text-red-200 border-red-700'
                                }`}>
                                    {loginMessage.text}
                                </div>
                            )}

                            <header className="mb-8">
                                <h2 className="text-2xl font-bold text-white capitalize">{selectedAccount.replace(/_/g, ' ')} Overview</h2>
                                <p className="text-gray-400">Last updated: {portfolioData && portfolioData.timestamp ? new Date(portfolioData.timestamp).toLocaleString() : '...'}</p>
                            </header>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
                            {loading && !portfolioData ? (
                                [...Array(5)].map((_, i) => <MetricCardSkeleton key={i} />)
                            ) : portfolioData ? (
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
                            ) : null}
                            </div>

                            {/* Table Controls */}
                            <div className="flex justify-between items-center mb-4">
                                <div className="flex items-center space-x-4">
                                    <h3 className="text-lg font-semibold text-white">Positions</h3>
                                    <label className="flex items-center space-x-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={showGroups}
                                            onChange={(e) => setShowGroups(e.target.checked)}
                                            className="form-checkbox h-4 w-4 bg-gray-700 border-gray-500 rounded text-blue-500 focus:ring-offset-0 focus:ring-2 focus:ring-blue-500"
                                        />
                                        <span className="text-sm text-gray-300">Show Groups</span>
                                    </label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <button
                                        onClick={() => setShowCreateGroup(true)}
                                        className="flex items-center space-x-2 px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
                                        title="Create Group"
                                    >
                                        <PlusIcon />
                                        <span>Create Group</span>
                                    </button>
                                    <button
                                        onClick={handleReLogin}
                                        disabled={loginLoading}
                                        className="p-2 rounded-full hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        title="Re-login to Robinhood"
                                    >
                                        <LoginIcon />
                                    </button>
                                    <button onClick={() => fetchData(true)} className="p-2 rounded-full hover:bg-gray-700 transition-colors" title="Force Refresh">
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
                        </div>

                        {/* Scrollable Table Section */}
                        <div className="flex-1 overflow-hidden px-8">
                            <div className="bg-gray-800/50 border border-gray-700 rounded-lg h-full flex flex-col">
                                <div className="overflow-x-auto flex-1">
                                    <table className="w-full text-left min-w-[1200px]">
                                        <thead className="bg-gray-800 border-b border-gray-700 sticky top-0 z-10">
                                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                                <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
                                                    <tr>
                                                        {columnOrder.map(key => {
                                                            const { label, visible } = columns[key];
                                                            return visible ? (
                                                                <DraggableHeaderCell key={key} id={key} className="p-4 text-sm font-semibold text-gray-400 tracking-wider" onClick={() => requestSort(key)}>
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
                                        {loading && !portfolioData ? (
                                            Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} columns={columns} columnOrder={columnOrder} />)
                                        ) : portfolioData && portfolioData.positions.length > 0 ? (
                                            <>
                                                {/* Render sorted units (groups and positions interleaved) */}
                                                {sortedData.sortedUnits.map((unit, index) => {
                                                    if (unit.type === 'group') {
                                                        return (
                                                            <GroupRow
                                                                key={unit.groupId}
                                                                group={unit.group}
                                                                groupId={unit.groupId}
                                                                metrics={groupMetrics[unit.groupId]}
                                                                positions={unit.positions}
                                                                columns={columns}
                                                                columnOrder={columnOrder}
                                                                onToggleCollapse={toggleGroupCollapse}
                                                                renderPositionCells={generatePositionCells}
                                                                totalPortfolioValue={portfolioData?.summary?.totalEquity || 0}
                                                                onEdit={(groupId, group) => {
                                                                    setEditingGroup({ id: groupId, ...group });
                                                                    setShowEditGroup(true);
                                                                }}
                                                                onDelete={deleteGroup}
                                                            />
                                                        );
                                                    } else {
                                                        return renderPositionRow(unit.position);
                                                    }
                                                })}
                                            </>
                                        ) : (
                                            <tr>
                                                <td colSpan={Object.values(columns).filter(c => c.visible).length} className="text-center p-8 text-gray-400">
                                                    {portfolioData ? 'No open positions found in this account.' : ''}
                                                </td>
                                            </tr>
                                        )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* Create Group Modal */}
                        <CreateGroupModal
                            isOpen={showCreateGroup}
                            onClose={() => setShowCreateGroup(false)}
                            onSubmit={(groupData) => {
                                createGroup(groupData);
                                setShowCreateGroup(false);
                            }}
                        />

                        {/* Edit Group Modal */}
                        <EditGroupModal
                            isOpen={showEditGroup}
                            onClose={() => {
                                setShowEditGroup(false);
                                setEditingGroup(null);
                            }}
                            onSubmit={(groupData) => {
                                updateGroup(editingGroup.id, groupData);
                                setShowEditGroup(false);
                                setEditingGroup(null);
                            }}
                            group={editingGroup}
                        />
                    </>
                ) : (
                    <div className="p-8 overflow-auto">
                        <OrdersPage selectedAccount={selectedAccount} />
                    </div>
                )}
            </main>
        </div>
    );
}

export default App;