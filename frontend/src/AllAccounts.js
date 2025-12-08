import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CreateGroupModal, EditGroupModal, GroupRow, GroupAssignmentDropdown, useGroupManagement } from './GroupManager';
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

// --- Main AllAccounts Component ---

function AllAccounts({ onStatusChange }) {
    const [allAccountsData, setAllAccountsData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [showCreateGroup, setShowCreateGroup] = useState(false);
    const [showEditGroup, setShowEditGroup] = useState(false);
    const [editingGroup, setEditingGroup] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: 'marketValue', direction: 'descending' });
    const [globalNotes, setGlobalNotes] = useState({});
    const [loginLoading, setLoginLoading] = useState(false);
    const [loginMessage, setLoginMessage] = useState(null);
    const [showGroups, setShowGroups] = useState(() => {
        const saved = localStorage.getItem('showGroups_ALL');
        return saved !== null ? JSON.parse(saved) : true;
    });
    const [fetchingHistorical, setFetchingHistorical] = useState({});
    const [fetchingAllHistorical, setFetchingAllHistorical] = useState(false);
    const [fetchAllStatus, setFetchAllStatus] = useState(null);

    // RSI thresholds for position row coloring (shared from App.js or local state)
    const [rsiPositionBuy, setRsiPositionBuy] = useState(() => {
        const saved = localStorage.getItem('rsi-position-buy');
        return saved !== null ? parseInt(saved) : 35;
    });
    const [rsiPositionWarning, setRsiPositionWarning] = useState(() => {
        const saved = localStorage.getItem('rsi-position-warning');
        return saved !== null ? parseInt(saved) : 65;
    });
    const [rsiPositionSell, setRsiPositionSell] = useState(() => {
        const saved = localStorage.getItem('rsi-position-sell');
        return saved !== null ? parseInt(saved) : 75;
    });

    const settingsRef = useRef(null);

    // Group management for ALL account
    const {
        groups,
        groupMetrics,
        createGroup,
        updateGroup,
        deleteGroup,
        toggleGroupCollapse,
        assignPositionToGroup,
        organizePositionsByGroups
    } = useGroupManagement('ALL');

    // Notify parent component of status changes
    useEffect(() => {
        if (onStatusChange) {
            onStatusChange({
                loading,
                error,
                timestamp: allAccountsData?.timestamp
            });
        }
    }, [loading, error, allAccountsData?.timestamp, onStatusChange]);

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
            // For AllAccounts page, make account column visible by default
            if (parsed.account) {
                parsed.account = { ...parsed.account, visible: true };
            }
            return parsed;
        } catch (e) {
            // Make account column visible by default
            const defaultCols = { ...initialColumns };
            if (defaultCols.account) {
                defaultCols.account = { ...defaultCols.account, visible: true };
            }
            return defaultCols;
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

    // Summary comes directly from backend for ALL account
    const combinedSummary = useMemo(() => {
        return allAccountsData?.summary || null;
    }, [allAccountsData]);

    // Compute sorted data structure for rendering with group support
    const sortedData = useMemo(() => {
        if (!allAccountsData || !allAccountsData.positions) {
            return { sortedUnits: [] };
        }

        // If groups are hidden, just return all positions sorted
        if (!showGroups) {
            const allPositions = [...allAccountsData.positions];
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
        const { groupedPositions, ungroupedPositions } = organizePositionsByGroups(allAccountsData.positions);

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
                        const totalPortfolioValue = allAccountsData?.summary?.totalEquity || 0;
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
    }, [allAccountsData, sortConfig, groups, groupMetrics, organizePositionsByGroups, showGroups]);

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

    useEffect(() => {
        localStorage.setItem(config.cache.local_storage_keys.column_order, JSON.stringify(columnOrder));
    }, [columnOrder]);

    useEffect(() => {
        localStorage.setItem('showGroups_ALL', JSON.stringify(showGroups));
    }, [showGroups]);

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

    // Fetch global notes
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

    const handleSaveCell = useCallback(async (ticker, fieldName, value, accountName) => {
        try {
            const response = await fetch(`${config.api.base_url}${config.api.endpoints.notes}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticker, [fieldName]: value }),
            });
            if (!response.ok) throw new Error(`Failed to save ${fieldName}.`);

            // Update global notes
            setGlobalNotes(prev => ({
                ...prev,
                [ticker]: {
                    ...prev[ticker],
                    [fieldName]: value
                }
            }));

            // Update positions in allAccountsData
            setAllAccountsData(prevData => {
                if (!prevData) return prevData;
                return {
                    ...prevData,
                    positions: prevData.positions.map(p =>
                        p.ticker === ticker ? { ...p, [fieldName]: value } : p
                    )
                };
            });

        } catch (e) {
            console.error(`Failed to save ${fieldName}:`, e);
        }
    }, []);

    const fetchAllData = useCallback(async (force = false) => {
        const cacheKey = `${config.cache.local_storage_keys.portfolio_data_prefix}ALL`;

        // If not forcing a refresh, try to load from cache first
        if (!force) {
            try {
                const cached = localStorage.getItem(cacheKey);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    // Ensure cached positions have unique IDs
                    if (parsed.positions) {
                        parsed.positions = parsed.positions.map(pos => {
                            if (!pos.id) {
                                const isOption = pos.type === 'option';
                                const isCash = pos.type === 'cash';
                                const accountValue = pos.account;

                                // For merged stocks, account is an array - use just ticker as ID
                                // For non-merged positions, account is a string - append account to ID
                                let positionId;
                                if (Array.isArray(accountValue)) {
                                    // Merged stock - use just ticker
                                    positionId = pos.ticker;
                                } else {
                                    // Non-merged position - include account in ID
                                    const account = accountValue || 'UNKNOWN';
                                    if (isOption) {
                                        positionId = `${pos.ticker}-${pos.expiry}-${pos.strike}-${pos.option_type}-${account}`;
                                    } else if (isCash) {
                                        positionId = `${pos.ticker}-${account}`;
                                    } else {
                                        // Stock in single account
                                        positionId = `${pos.ticker}-${account}`;
                                    }
                                }
                                return { ...pos, id: positionId };
                            }
                            return pos;
                        });
                    }
                    setAllAccountsData(parsed);
                    setLoading(false);
                    return; // Exit early if using cache
                }
            } catch (e) {
                console.error("Failed to read from cache", e);
            }
        }

        setLoading(true);
        setError(null);

        try {
            // Fetch all accounts data with single API call
            const portfolioUrl = `${config.api.base_url}${config.api.endpoints.portfolio}/ALL${force ? '?force=true' : ''}`;
            const portfolioRes = await fetch(portfolioUrl);

            if (!portfolioRes.ok) {
                const errData = await portfolioRes.json();
                throw new Error(errData.error || `HTTP error! status: ${portfolioRes.status}`);
            }

            const portfolioResult = await portfolioRes.json();

            if (portfolioResult.error) throw new Error(portfolioResult.error);

            // Merge positions with global notes and add position IDs
            // For ALL page, merged stocks have array account (ID = ticker)
            // Non-merged positions have string account (ID includes account)
            const positionsWithNotesAndIds = portfolioResult.positions.map(pos => {
                const isOption = pos.type === 'option';
                const isCash = pos.type === 'cash';
                const accountValue = pos.account;

                // For merged stocks, account is an array - use just ticker as ID
                // For non-merged positions, account is a string - append account to ID
                let positionId;
                if (Array.isArray(accountValue)) {
                    // Merged stock - use just ticker
                    positionId = pos.ticker;
                } else {
                    // Non-merged position - include account in ID
                    const account = accountValue || 'UNKNOWN';
                    if (isOption) {
                        positionId = `${pos.ticker}-${pos.expiry}-${pos.strike}-${pos.option_type}-${account}`;
                    } else if (isCash) {
                        positionId = `${pos.ticker}-${account}`;
                    } else {
                        // Stock in single account
                        positionId = `${pos.ticker}-${account}`;
                    }
                }

                return {
                    ...pos,
                    id: positionId,  // Add unique ID for group matching
                    note: globalNotes[pos.ticker]?.note || '',
                    comment: globalNotes[pos.ticker]?.comment || ''
                };
            });

            const finalData = { ...portfolioResult, positions: positionsWithNotesAndIds };
            setAllAccountsData(finalData);

            // Save the fresh data to cache
            try {
                localStorage.setItem(cacheKey, JSON.stringify(finalData));
            } catch (e) {
                console.error("Failed to write to cache", e);
            }

        } catch (e) {
            setError(`Failed to fetch data for all accounts. Error: ${e.message}`);
        } finally {
            setLoading(false);
        }
    }, [globalNotes]);

    const fetchAllHistoricalData = async () => {
        setFetchingAllHistorical(true);
        setFetchAllStatus(null);
        try {
            // Fetch historical data for all accounts
            // We need to call the endpoint for each account
            const accountsList = Object.keys(allAccountsData?.accounts || {});
            const allResults = {
                total: 0,
                fetched: 0,
                failed: 0,
                tickers: []
            };

            for (const account of accountsList) {
                try {
                    const response = await fetch(
                        `${config.api.base_url}/api/fetch-all-historical/${account}`,
                        { method: 'POST' }
                    );
                    if (response.ok) {
                        const results = await response.json();
                        allResults.total += results.total;
                        allResults.fetched += results.fetched;
                        allResults.failed += results.failed;
                        allResults.tickers.push(...results.tickers);
                    }
                } catch (err) {
                    console.error(`Error fetching all historical data for ${account}:`, err);
                }
            }

            setFetchAllStatus({
                success: true,
                total: allResults.total,
                fetched: allResults.fetched,
                failed: allResults.failed,
                details: allResults.tickers
            });

            // Auto-dismiss notification after 10 seconds
            setTimeout(() => {
                setFetchAllStatus(null);
            }, 10000);

            // Refresh all accounts data after completion
            await fetchAllData();
        } catch (error) {
            console.error(`Error fetching all historical data:`, error);
            setFetchAllStatus({
                success: false,
                error: error.message
            });
        } finally {
            setFetchingAllHistorical(false);
        }
    };

    useEffect(() => {
        // Fetch global notes and data once on mount
        fetchGlobalNotes();
        fetchAllData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Only run on mount

    // Group modal handlers
    const handleCreateGroup = async (groupData) => {
        await createGroup(groupData);
        setShowCreateGroup(false);
    };

    const handleEditGroup = (groupId, group) => {
        setEditingGroup({ groupId, group });
        setShowEditGroup(true);
    };

    const handleUpdateGroup = async (groupData) => {
        if (editingGroup) {
            await updateGroup(editingGroup.groupId, groupData);
            setShowEditGroup(false);
            setEditingGroup(null);
        }
    };

    // Login handler
    const handleReLogin = async () => {
        setLoginLoading(true);
        setLoginMessage(null);
        try {
            const response = await fetch(`${config.api.base_url}${config.api.endpoints.auth_login}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            if (response.ok && data.success) {
                setLoginMessage({ type: 'success', text: 'Login successful!' });
                setTimeout(() => setLoginMessage(null), 3000);
            } else {
                setLoginMessage({ type: 'error', text: data.message || 'Login failed' });
            }
        } catch (e) {
            setLoginMessage({ type: 'error', text: `Login error: ${e.message}` });
        } finally {
            setLoginLoading(false);
        }
    };

    const fetchHistoricalData = async (ticker) => {
        setFetchingHistorical(prev => ({ ...prev, [ticker]: true }));
        try {
            console.log(`[1/3] Fetching historical data for ${ticker}...`);
            const response = await fetch(
                `${config.api.base_url}${config.api.endpoints.historical}/${ticker}`
            );
            if (!response.ok) {
                throw new Error(`Failed to fetch historical data for ${ticker}`);
            }
            await response.json();
            console.log(`[2/3] Historical data fetched successfully`);

            // Fetch just the metrics for this ticker (lightweight call)
            console.log(`[3/3] Fetching metrics for ${ticker}...`);
            const metricsResponse = await fetch(
                `${config.api.base_url}/api/metrics/${ticker}`
            );
            if (!metricsResponse.ok) {
                throw new Error(`Failed to fetch metrics for ${ticker}`);
            }
            const metrics = await metricsResponse.json();
            console.log(`[3/3] Metrics fetched:`, metrics);

            // Update the position(s) with this ticker in the current state
            setAllAccountsData(prevData => {
                if (!prevData || !prevData.positions) return prevData;

                const updatedPositions = prevData.positions.map(pos => {
                    if (pos.ticker === ticker) {
                        // Update this position with the new metrics
                        return {
                            ...pos,
                            current_rsi: metrics.current_rsi,
                            current_ps: metrics.current_ps,
                            ps_12m_max: metrics.ps_12m_max,
                            ps_12m_min: metrics.ps_12m_min,
                            pe_12m_max: metrics.pe_12m_max,
                            pe_12m_min: metrics.pe_12m_min
                        };
                    }
                    return pos;
                });

                const updatedData = {
                    ...prevData,
                    positions: updatedPositions
                };

                // Also update localStorage cache so metrics persist after refresh
                const cacheKey = `${config.cache.local_storage_keys.portfolio_data_prefix}ALL`;
                localStorage.setItem(cacheKey, JSON.stringify(updatedData));

                return updatedData;
            });

            console.log(`✓ Metrics updated for ${ticker} in table and localStorage`);
        } catch (error) {
            console.error(`Error fetching historical data for ${ticker}:`, error);
            alert(`Failed to fetch data for ${ticker}: ${error.message}`);
        } finally {
            setFetchingHistorical(prev => ({ ...prev, [ticker]: false }));
        }
    };

    // Custom assignment handler for ALL page
    // For merged stocks (account is array), assign just that position
    // For non-merged positions, also assign all positions with the same ticker
    const handleAssignPosition = useCallback(async (positionId, targetGroupId) => {
        if (!allAccountsData || !allAccountsData.positions) return;

        // Find the position being assigned
        const assignedPosition = allAccountsData.positions.find(p => p.id === positionId);
        if (!assignedPosition) return;

        // If position is already merged (account is array), just assign it directly
        if (Array.isArray(assignedPosition.account)) {
            await assignPositionToGroup(positionId, targetGroupId);
            return;
        }

        // For non-merged positions, find all related positions
        const ticker = assignedPosition.ticker;
        const isOption = assignedPosition.type === 'option';

        let relatedPositionIds;
        if (isOption) {
            // For options, match ticker, expiry, strike, and option_type across all accounts
            relatedPositionIds = allAccountsData.positions
                .filter(p =>
                    p.ticker === ticker &&
                    p.type === 'option' &&
                    p.expiry === assignedPosition.expiry &&
                    p.strike === assignedPosition.strike &&
                    p.option_type === assignedPosition.option_type
                )
                .map(p => p.id);
        } else {
            // For stocks, match just the ticker across all accounts
            relatedPositionIds = allAccountsData.positions
                .filter(p => p.ticker === ticker && p.type !== 'option')
                .map(p => p.id);
        }

        // Assign all related positions to the group (in parallel for better performance)
        await Promise.all(
            relatedPositionIds.map(id => assignPositionToGroup(id, targetGroupId))
        );
    }, [allAccountsData, assignPositionToGroup]);

    // Generate cells for a position (used by both renderPositionRow and GroupRow)
    const generatePositionCells = useCallback((pos) => {
        const isOption = pos.type === 'option';
        const isCash = pos.type === 'cash';

        return {
            ticker: <td className="p-4 font-bold text-white">{pos.ticker}</td>,
            name: <td className="p-4 text-gray-300">{pos.name}</td>,
            account: <td className="p-4 text-gray-300">{
                Array.isArray(pos.account)
                    ? pos.account.map(acc => acc.replace(/_/g, ' ')).join(', ')
                    : (pos.account ? pos.account.replace(/_/g, ' ') : '-')
            }</td>,
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
            group: <td className="p-4">
                <GroupAssignmentDropdown position={pos} groups={groups} onAssign={handleAssignPosition} />
            </td>,
            comment: <td className="p-4 font-mono"><EditableIndustryCell ticker={pos.ticker} initialIndustry={pos.comment} onSave={handleSaveCell} /></td>,
            industry: <td className="p-4 text-gray-300">{pos.industry}</td>,
            sector: <td className="p-4 text-gray-300">{pos.sector}</td>,
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
    }, [groups, handleAssignPosition, handleSaveCell, fetchingHistorical]);

    // Render a full position row
    const getPositionRowBackgroundColor = (pos) => {
        // Return background color based on RSI value and thresholds
        if (pos.type === 'cash' || pos.type === 'option' || pos.current_rsi == null) {
            return ''; // No coloring for cash, options, or positions without RSI data
        }

        const rsi = pos.current_rsi;

        // 0-35: Buy (Light Green)
        if (rsi < rsiPositionBuy) {
            return 'bg-green-900/40'; // Buy target zone - lighter green
        }
        // 35-65: Neutral (No color)
        else if (rsi < rsiPositionWarning) {
            return ''; // Neutral zone - no color
        }
        // 65-75: Warning (Yellow)
        else if (rsi < rsiPositionSell) {
            return 'bg-yellow-900/40'; // Warning zone - yellow
        }
        // 75+: Sell (Light Red)
        else {
            return 'bg-red-900/40'; // Sell target zone - lighter red
        }
    };

    const renderPositionRow = useCallback((pos) => {
        const cells = generatePositionCells(pos);
        const rowBgColor = getPositionRowBackgroundColor(pos);

        return (
            <tr key={pos.id || pos.ticker} className={`border-b border-gray-700 last:border-b-0 hover:bg-gray-700/50 transition-colors ${rowBgColor}`}>
                {columnOrder.map(key => {
                    const { visible } = columns[key];
                    return visible ? React.cloneElement(cells[key], { key }) : null
                })}
            </tr>
        );
    }, [generatePositionCells, columnOrder, columns]);

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
        <div className="flex flex-col h-screen">
            {/* Fixed Section: Header, Messages, Summary Cards, and Controls */}
            <div className="flex-none">
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
                {fetchAllStatus && (
                    <div className={`p-4 rounded-lg mb-6 border ${fetchAllStatus.success ? 'bg-blue-900/50 text-blue-200 border-blue-700' : 'bg-red-900/50 text-red-200 border-red-700'}`}>
                        {fetchAllStatus.success ? (
                            <div>
                                <p className="font-semibold">✓ Historical data fetch complete!</p>
                                <p className="text-sm mt-1">Fetched: {fetchAllStatus.fetched}/{fetchAllStatus.total} across all accounts</p>
                            </div>
                        ) : (
                            <div>
                                <p className="font-semibold">✗ Error fetching historical data</p>
                                <p className="text-sm mt-1">{fetchAllStatus.error}</p>
                            </div>
                        )}
                    </div>
                )}

                <header className="mb-8">
                    <h2 className="text-2xl font-bold text-white mb-2">All Accounts Overview</h2>
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
                    <div className="flex items-center space-x-4">
                        <h3 className="text-lg font-semibold text-white">Positions</h3>
                        <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={showGroups}
                                onChange={(e) => setShowGroups(e.target.checked)}
                                className="form-checkbox h-4 w-4 bg-gray-700 border-gray-500 rounded text-blue-500 focus:ring-offset-0 focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="text-base text-gray-300">Show Groups</span>
                        </label>
                        <div className="flex items-center space-x-3 pl-4 border-l border-gray-600">
                            <div className="flex items-center space-x-1">
                                <label className="text-sm text-gray-400">Buy:</label>
                                <input
                                    type="number"
                                    value={rsiPositionBuy}
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value);
                                        if (!isNaN(val)) setRsiPositionBuy(val);
                                    }}
                                    onBlur={(e) => {
                                        const val = parseInt(e.target.value) || 0;
                                        setRsiPositionBuy(val);
                                        localStorage.setItem('rsi-position-buy', val.toString());
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            const val = parseInt(e.target.value) || 0;
                                            setRsiPositionBuy(val);
                                            localStorage.setItem('rsi-position-buy', val.toString());
                                        }
                                    }}
                                    min="0"
                                    max="100"
                                    className="w-12 px-2 py-1 text-xs bg-gray-800 border border-green-600 text-green-400 rounded"
                                    title="Buy threshold - Press Enter or Tab to apply"
                                />
                            </div>
                            <div className="flex items-center space-x-1">
                                <label className="text-sm text-gray-400">Warn:</label>
                                <input
                                    type="number"
                                    value={rsiPositionWarning}
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value);
                                        if (!isNaN(val)) setRsiPositionWarning(val);
                                    }}
                                    onBlur={(e) => {
                                        const val = parseInt(e.target.value) || 0;
                                        setRsiPositionWarning(val);
                                        localStorage.setItem('rsi-position-warning', val.toString());
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            const val = parseInt(e.target.value) || 0;
                                            setRsiPositionWarning(val);
                                            localStorage.setItem('rsi-position-warning', val.toString());
                                        }
                                    }}
                                    min="0"
                                    max="100"
                                    className="w-12 px-2 py-1 text-xs bg-gray-800 border border-orange-600 text-orange-400 rounded"
                                    title="Warning threshold - Press Enter or Tab to apply"
                                />
                            </div>
                            <div className="flex items-center space-x-1">
                                <label className="text-sm text-gray-400">Sell:</label>
                                <input
                                    type="number"
                                    value={rsiPositionSell}
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value);
                                        if (!isNaN(val)) setRsiPositionSell(val);
                                    }}
                                    onBlur={(e) => {
                                        const val = parseInt(e.target.value) || 0;
                                        setRsiPositionSell(val);
                                        localStorage.setItem('rsi-position-sell', val.toString());
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            const val = parseInt(e.target.value) || 0;
                                            setRsiPositionSell(val);
                                            localStorage.setItem('rsi-position-sell', val.toString());
                                        }
                                    }}
                                    min="0"
                                    max="100"
                                    className="w-12 px-2 py-1 text-xs bg-gray-800 border border-red-600 text-red-400 rounded"
                                    title="Sell threshold - Press Enter or Tab to apply"
                                />
                            </div>
                        </div>
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
                        <button onClick={() => fetchAllData(true)} className="p-2 rounded-full hover:bg-gray-700 transition-colors" title="Force Refresh">
                            <RefreshIcon />
                        </button>
                        <button
                            onClick={fetchAllHistoricalData}
                            disabled={fetchingAllHistorical}
                            className="p-2 rounded-full hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Fetch all historical data (long operation)"
                        >
                            <span className="text-lg">📊</span>
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

            {/* Scrollable Section: Table */}
            <div className="flex-1 flex flex-col min-h-0 bg-gray-800/50 border border-gray-700 rounded-lg">
                {/* Fixed Title Bar */}
                <div className="flex-none flex justify-between items-center p-4 bg-gray-800 border-b border-gray-700">
                    <h4 className="text-lg font-semibold text-white">All Positions</h4>
                    <div className="text-sm text-gray-400">
                        {allAccountsData && allAccountsData.timestamp ?
                            `Updated: ${new Date(allAccountsData.timestamp).toLocaleString()}` :
                            'Loading...'
                        }
                    </div>
                </div>

                {/* Scrollable Table with Sticky Header */}
                <div className="flex-1 overflow-auto">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <table className="w-full text-left min-w-[1200px]">
                            <thead className="bg-gray-800 border-b border-gray-700 sticky top-0 z-10">
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
                        </thead>
                        <tbody>
                            {loading && !allAccountsData ? (
                                Array.from({ length: 10 }).map((_, i) => <TableRowSkeleton key={i} columns={columns} columnOrder={columnOrder} />)
                            ) : sortedData.sortedUnits && sortedData.sortedUnits.length > 0 ? (
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
                                                    totalPortfolioValue={allAccountsData?.summary?.totalEquity || 0}
                                                    onEdit={handleEditGroup}
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
                                        {allAccountsData ? 'No open positions found.' : 'Loading...'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </DndContext>
                </div>
            </div>

            {/* Group Modals */}
            <CreateGroupModal
                isOpen={showCreateGroup}
                onClose={() => setShowCreateGroup(false)}
                onSubmit={handleCreateGroup}
            />
            <EditGroupModal
                isOpen={showEditGroup}
                onClose={() => {
                    setShowEditGroup(false);
                    setEditingGroup(null);
                }}
                onSubmit={handleUpdateGroup}
                group={editingGroup?.group}
            />
        </div>
    );
}

export default AllAccounts;