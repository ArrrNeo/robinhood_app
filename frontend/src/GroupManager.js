import React, { useState, useEffect, useCallback } from 'react';
import config from './config.json';

// Utility functions
const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(value);
};

// Available colors for groups
const GROUP_COLORS = [
    { name: 'Blue', value: 'bg-blue-500' },
    { name: 'Green', value: 'bg-green-500' },
    { name: 'Red', value: 'bg-red-500' },
    { name: 'Purple', value: 'bg-purple-500' },
    { name: 'Orange', value: 'bg-orange-500' },
    { name: 'Pink', value: 'bg-pink-500' },
    { name: 'Yellow', value: 'bg-yellow-500' },
    { name: 'Indigo', value: 'bg-indigo-500' }
];

// Icons
const ChevronDownIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
);

const ChevronRightIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
);

// Group Assignment Dropdown
export const GroupAssignmentDropdown = ({ position, groups, onAssign }) => {
    const [isOpen, setIsOpen] = useState(false);
    const positionId = position.id || position.ticker;

    // Find which group this position belongs to
    const findPositionGroup = () => {
        for (const [groupId, group] of Object.entries(groups.groups || {})) {
            if (group.positions && group.positions.includes(positionId)) {
                return { groupId, groupName: group.name, groupColor: group.color };
            }
        }
        return null;
    };

    const currentGroup = findPositionGroup();

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center px-2 py-1 text-xs bg-gray-600 text-gray-300 rounded hover:bg-gray-500 transition-colors"
                title="Assign to Group"
            >
                {currentGroup ? (
                    <>
                        <div className={`w-2 h-2 rounded-full ${currentGroup.groupColor} mr-1`} />
                        <span className="max-w-20 truncate">{currentGroup.groupName}</span>
                    </>
                ) : (
                    <span>Ungrouped</span>
                )}
                <span className="ml-1">▼</span>
            </button>
            {isOpen && (
                <>
                    {/* Backdrop to close dropdown when clicking outside */}
                    <div
                        className="fixed inset-0 z-10"
                        onClick={() => setIsOpen(false)}
                    />
                    <div className="absolute right-0 mt-1 w-40 bg-gray-800 border border-gray-600 rounded-md shadow-lg z-20">
                        <div className="py-1">
                            <button
                                onClick={() => {
                                    onAssign(positionId, null); // Remove from any group
                                    setIsOpen(false);
                                }}
                                className={`block w-full text-left px-3 py-1 text-sm transition-colors ${
                                    !currentGroup ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-700'
                                }`}
                            >
                                ✓ Ungrouped
                            </button>
                            {Object.entries(groups.groups || {}).map(([groupId, group]) => (
                                <button
                                    key={groupId}
                                    onClick={() => {
                                        onAssign(positionId, groupId);
                                        setIsOpen(false);
                                    }}
                                    className={`flex items-center w-full text-left px-3 py-1 text-sm transition-colors ${
                                        currentGroup?.groupId === groupId ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-700'
                                    }`}
                                >
                                    <div className={`w-2 h-2 rounded-full ${group.color} mr-2`} />
                                    {currentGroup?.groupId === groupId && <span className="mr-1">✓</span>}
                                    {group.name}
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

// Create Group Modal
export const CreateGroupModal = ({ isOpen, onClose, onSubmit }) => {
    const [name, setName] = useState('');
    const [color, setColor] = useState(GROUP_COLORS[0].value);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!name.trim()) return;

        onSubmit({
            name: name.trim(),
            color: color
        });

        setName('');
        setColor(GROUP_COLORS[0].value);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 w-96">
                <h3 className="text-lg font-semibold text-white mb-4">Create New Group</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">
                            Group Name
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Enter group name"
                            autoFocus
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">
                            Color
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {GROUP_COLORS.map((colorOption) => (
                                <button
                                    key={colorOption.value}
                                    type="button"
                                    onClick={() => setColor(colorOption.value)}
                                    className={`w-8 h-8 rounded-full ${colorOption.value} ${
                                        color === colorOption.value ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-800' : ''
                                    }`}
                                    title={colorOption.name}
                                />
                            ))}
                        </div>
                    </div>
                    <div className="flex justify-end space-x-2 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                        >
                            Create Group
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Edit Group Modal
export const EditGroupModal = ({ isOpen, onClose, onSubmit, group }) => {
    const [name, setName] = useState('');
    const [color, setColor] = useState(GROUP_COLORS[0].value);

    // Reset form when modal opens with group data
    React.useEffect(() => {
        if (isOpen && group) {
            setName(group.name || '');
            setColor(group.color || GROUP_COLORS[0].value);
        }
    }, [isOpen, group]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!name.trim()) return;

        onSubmit({
            name: name.trim(),
            color: color
        });

        setName('');
        setColor(GROUP_COLORS[0].value);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 w-96">
                <h3 className="text-lg font-semibold text-white mb-4">Edit Group</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">
                            Group Name
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Enter group name"
                            autoFocus
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">
                            Color
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {GROUP_COLORS.map((colorOption) => (
                                <button
                                    key={colorOption.value}
                                    type="button"
                                    onClick={() => setColor(colorOption.value)}
                                    className={`w-8 h-8 rounded-full ${colorOption.value} ${
                                        color === colorOption.value ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-800' : ''
                                    }`}
                                    title={colorOption.name}
                                />
                            ))}
                        </div>
                    </div>
                    <div className="flex justify-end space-x-2 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                        >
                            Save Changes
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Group Row Component for rendering groups in the table
export const GroupRow = ({ group, groupId, metrics, positions, columns, columnOrder, onToggleCollapse, renderPositionCells, totalPortfolioValue, onEdit }) => {
    // Calculate group metrics
    const totalMarketValue = metrics?.total_market_value || 0;
    const totalPnl = metrics?.total_pnl || 0;
    const totalCost = totalMarketValue - totalPnl;
    const returnPct = totalCost !== 0 ? (totalPnl / totalCost) * 100 : 0;
    const portfolioPct = totalPortfolioValue > 0 ? (totalMarketValue / totalPortfolioValue) * 100 : 0;


    return (
        <>
            {/* Group Header Row */}
            <tr className="bg-gray-700 border-b border-gray-600">
                {columnOrder.map(key => {
                    if (!columns[key].visible) return null;

                    let content = '';
                    let className = "p-4 text-gray-300 font-semibold";

                    switch(key) {
                        case 'ticker':
                        case 'name':
                            if (key === columnOrder.find(k => columns[k].visible)) {
                                // First column - show group info
                                content = (
                                    <div className="flex items-center space-x-2">
                                        <button
                                            onClick={() => onToggleCollapse(groupId)}
                                            className="text-gray-400 hover:text-white transition-colors"
                                        >
                                            {group.collapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
                                        </button>
                                        <div className={`w-3 h-3 rounded-full ${group.color}`} />
                                        <span className="text-white">{group.name}</span>
                                        <span className="text-sm text-gray-400">({positions.length})</span>
                                        {onEdit && (
                                            <button
                                                onClick={() => onEdit(groupId, group)}
                                                className="text-gray-400 hover:text-white transition-colors ml-1"
                                                title="Edit Group"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>
                                );
                            }
                            break;
                        case 'marketValue':
                            content = (
                                <span className="text-white font-mono">
                                    {formatCurrency(totalMarketValue)}
                                </span>
                            );
                            break;
                        case 'unrealizedPnl':
                            content = (
                                <span className={`font-mono ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {formatCurrency(totalPnl)}
                                </span>
                            );
                            break;
                        case 'returnPct':
                            content = (
                                <span className={`font-mono ${returnPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {returnPct.toFixed(2)}%
                                </span>
                            );
                            break;
                        case 'portfolio_percent':
                            content = (
                                <span className="font-mono text-gray-300">
                                    {portfolioPct.toFixed(2)}%
                                </span>
                            );
                            break;
                        default:
                            content = '';
                    }

                    return (
                        <td key={key} className={className}>
                            {content}
                        </td>
                    );
                })}
            </tr>

            {/* Group Positions (when expanded) */}
            {!group.collapsed && positions.map((position, index) => {
                const cells = renderPositionCells ? renderPositionCells(position) : {};
                const isOption = position.type === 'option';

                return (
                    <tr key={`${groupId}-${position.ticker || position.id}-${index}`} className="border-b border-gray-700 hover:bg-gray-800/50 transition-colors">
                        {columnOrder.map(key => {
                            if (!columns[key].visible) return null;

                            const cell = cells[key];
                            if (!cell) return <td key={key} className="p-4 text-gray-300"></td>;

                            // Clone the cell and add indentation to the first visible column
                            const isFirstColumn = key === columnOrder.find(k => columns[k].visible);
                            if (isFirstColumn) {
                                return React.cloneElement(cell, {
                                    key,
                                    className: `${cell.props.className || 'p-4 text-gray-300'} pl-12`
                                });
                            } else {
                                return React.cloneElement(cell, { key });
                            }
                        })}
                    </tr>
                );
            })}
        </>
    );
};

// Main Group Management Hook
export const useGroupManagement = (selectedAccount) => {
    const [groups, setGroups] = useState({ groups: {}, ungrouped: [], settings: {} });
    const [groupMetrics, setGroupMetrics] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Load groups data
    const loadGroups = useCallback(async () => {
        if (!selectedAccount) return;

        try {
            setLoading(true);
            const response = await fetch(`${config.api.base_url}${config.api.endpoints.groups}/${selectedAccount}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            setGroups(data);
        } catch (e) {
            setError(`Failed to load groups: ${e.message}`);
        } finally {
            setLoading(false);
        }
    }, [selectedAccount]);

    // Load group metrics
    const loadGroupMetrics = useCallback(async () => {
        if (!selectedAccount) return;

        try {
            const response = await fetch(`${config.api.base_url}${config.api.endpoints.group_metrics}/${selectedAccount}/metrics`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            setGroupMetrics(data);
        } catch (e) {
            console.error('Failed to load group metrics:', e);
        }
    }, [selectedAccount]);

    useEffect(() => {
        loadGroups();
        loadGroupMetrics();
    }, [loadGroups, loadGroupMetrics]);

    // Create new group
    const createGroup = async (groupData) => {
        try {
            const response = await fetch(`${config.api.base_url}${config.api.endpoints.groups}/${selectedAccount}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(groupData)
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            loadGroups();
            loadGroupMetrics();
        } catch (e) {
            setError(`Failed to create group: ${e.message}`);
        }
    };

    // Update existing group
    const updateGroup = async (groupId, groupData) => {
        try {
            const response = await fetch(`${config.api.base_url}${config.api.endpoints.groups}/${selectedAccount}/${groupId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(groupData)
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            loadGroups();
            loadGroupMetrics();
        } catch (e) {
            setError(`Failed to update group: ${e.message}`);
        }
    };

    // Toggle group collapse
    const toggleGroupCollapse = async (groupId) => {
        try {
            const group = groups.groups[groupId];
            const response = await fetch(`${config.api.base_url}${config.api.endpoints.groups}/${selectedAccount}/${groupId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ collapsed: !group.collapsed })
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            loadGroups();
        } catch (e) {
            setError(`Failed to update group: ${e.message}`);
        }
    };

    // Assign position to group
    const assignPositionToGroup = async (positionId, targetGroupId) => {
        try {
            const response = await fetch(`${config.api.base_url}${config.api.endpoints.groups}/${selectedAccount}/assign`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    position_id: positionId,
                    group_id: targetGroupId // null for ungrouped
                })
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            loadGroups();
            loadGroupMetrics();
        } catch (e) {
            setError(`Failed to assign position: ${e.message}`);
        }
    };

    // Organize positions by groups for rendering
    const organizePositionsByGroups = (positions) => {
        if (!positions) return { groupedPositions: {}, ungroupedPositions: [] };

        const groupedPositions = {};
        const ungroupedPositions = [];

        // Initialize grouped positions
        Object.keys(groups.groups).forEach(groupId => {
            groupedPositions[groupId] = [];
        });

        // Organize positions
        positions.forEach(position => {
            const positionId = position.id || position.ticker;
            let assigned = false;

            // Check if position belongs to any group
            Object.entries(groups.groups).forEach(([groupId, group]) => {
                if (group.positions && group.positions.includes(positionId)) {
                    groupedPositions[groupId].push(position);
                    assigned = true;
                }
            });

            // If not assigned to any group, add to ungrouped
            if (!assigned) {
                ungroupedPositions.push(position);
            }
        });

        return { groupedPositions, ungroupedPositions };
    };

    return {
        groups,
        groupMetrics,
        loading,
        error,
        createGroup,
        updateGroup,
        toggleGroupCollapse,
        assignPositionToGroup,
        organizePositionsByGroups
    };
};