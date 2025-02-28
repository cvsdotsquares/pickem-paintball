'use client';
import { sortBy } from 'lodash';
import { DataTable, DataTableSortStatus } from 'mantine-datatable';
import { useEffect, useMemo, useState } from 'react';
import { getFirestore, doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { useAuth } from '@/src/contexts/authProvider';

interface TableDataProps {
    heading: string;
    data: any[];
}

const PickTableData = ({ heading, data }: TableDataProps) => {
    const [page, setPage] = useState(1);
    const PAGE_SIZES = [10, 20, 30, 50, 100];
    const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
    const [search, setSearch] = useState('');
    const [selectedPlayers, setSelectedPlayers] = useState<any[]>([]);
    const [yourPicks, setYourPicks] = useState<any[]>([]);
    const [sortStatus, setSortStatus] = useState<DataTableSortStatus>({
        columnAccessor: Object.keys(data[0] || {})[0] || 'Player',
        direction: 'asc',
    });

    const db = getFirestore();
    const { user } = useAuth();

    // Live event ID and total cost
    const [liveEventId, setLiveEventId] = useState<string | null>(null);
    const [totalCost, setTotalCost] = useState(0);

    // Fetch live event from Firestore
    useEffect(() => {
        const fetchLiveEvent = async () => {
            try {
                const eventsRef = collection(db, 'events');
                const q = query(eventsRef, where('status', '==', 'live'));
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) {
                    const liveEventDoc = querySnapshot.docs[0];
                    setLiveEventId(liveEventDoc.id);
                }
            } catch (error) {
                console.error('Error fetching live event:', error);
            }
        };
        fetchLiveEvent();
    }, [db]);

    // Fetch saved picks from Firebase on mount or when liveEventId updates
    useEffect(() => {
        if (user && liveEventId && yourPicks.length === 0) {
            const fetchPicks = async () => {
                try {
                    const userRef = doc(db, 'users', user.uid);
                    const userSnap = await getDoc(userRef);
                    if (userSnap.exists()) {
                        const userData = userSnap.data();
                        if (userData.pickems && Array.isArray(userData.pickems[liveEventId])) {
                            const savedPicksIds = userData.pickems[liveEventId];
                            const savedPicks = data.filter((player) =>
                                savedPicksIds.includes(player.player_id)
                            );
                            setYourPicks(savedPicks);
                            setSelectedPlayers(savedPicks);
                            const total = savedPicks.reduce((sum, player) => {
                                const cost = Number(player.Cost); // Make sure to use 'Cost' (capital C)
                                return sum + (isNaN(cost) ? 0 : cost);
                            }, 0);
                            setTotalCost(total);
                        }
                    }
                } catch (error) {
                    console.error('Error fetching saved picks:', error);
                }
            };
            fetchPicks();
        }
    }, [user, liveEventId, db, data, yourPicks.length]);


    // Filter, sort, and paginate data
    const filteredData = useMemo(() => {
        return data.filter((item) =>
            Object.keys(item).some((key) => {
                const value = item[key];
                if (typeof value === 'string') {
                    return value.toLowerCase().includes(search.toLowerCase());
                } else if (typeof value === 'number' || typeof value === 'boolean') {
                    return value.toString().toLowerCase().includes(search.toLowerCase());
                }
                return false;
            })
        );
    }, [data, search]);

    const sortedData = useMemo(() => {
        const sorted = sortBy(filteredData, sortStatus.columnAccessor);
        return sortStatus.direction === 'desc' ? sorted.reverse() : sorted;
    }, [filteredData, sortStatus]);

    const paginatedData = useMemo(() => {
        const from = (page - 1) * pageSize;
        return sortedData.slice(from, from + pageSize);
    }, [sortedData, page, pageSize]);

    const formatDate = (date: any) => {
        if (date) {
            const dt = new Date(date);
            const month = dt.getMonth() + 1 < 10 ? '0' + (dt.getMonth() + 1) : dt.getMonth() + 1;
            const day = dt.getDate() < 10 ? '0' + dt.getDate() : dt.getDate();
            return day + '/' + month + '/' + dt.getFullYear();
        }
        return '';
    };

    // Dynamically create column definitions
    const columns = useMemo(() => {
        if (data.length === 0) return [];
        const keys = Object.keys(data[0]);
        const filteredKeys = keys.filter(key => key !== 'player_id' && key !== 'Player Number');
        return filteredKeys.map((key) => {
            const formattedTitle = key
                .replace(/([A-Z])/g, ' $1')
                .replace(/_/g, ' ')
                .replace(/(^\w|\s\w)/g, (m) => m.toUpperCase());
            const column: any = {
                accessor: key,
                title: formattedTitle,
                sortable: true,
            };
            if (key === 'dob') {
                column.render = (item: any) => formatDate(item[key]);
            }
            if (key === 'Cost') {
                column.render = (item: any) => formatCost(Number(item[key]));
            }
            return column;
        });
    }, [data]);


    // Handle player selection and update cost
    const handleSelectPlayer = async (player: any) => {
        const isSelected = selectedPlayers.some((p) => p.player_id === player.player_id);
        const playerCost = Number(player.Cost);
        if (isNaN(playerCost)) {
            console.error('Invalid player cost for:', player);
            alert('This player has an invalid cost and cannot be selected.');
            return;
        }

        let updatedSelectedPlayers = [];
        let updatedYourPicks = [];
        let updatedTotalCost = totalCost;

        if (isSelected) {
            updatedSelectedPlayers = selectedPlayers.filter((p) => p.player_id !== player.player_id);
            updatedYourPicks = yourPicks.filter((p) => p.player_id !== player.player_id);
            updatedTotalCost = totalCost - playerCost;
        } else {
            if (yourPicks.length < 8 && totalCost + playerCost <= 500000) {
                updatedSelectedPlayers = [...selectedPlayers, player];
                updatedYourPicks = [...yourPicks, player];
                updatedTotalCost = totalCost + playerCost;
            } else if (yourPicks.length >= 8) {
                alert('You can only pick 8 players.');
                return;
            } else {
                alert('You have exceeded the budget of $500,000.');
                return;
            }
        }

        // Update the local state
        setSelectedPlayers(updatedSelectedPlayers);
        setYourPicks(updatedYourPicks);
        setTotalCost(updatedTotalCost);

        // Immediately save the updated picks to Firebase
        if (user && liveEventId) {
            const picksIds = updatedYourPicks.map((player) => player.player_id);
            try {
                await updateDoc(doc(db, 'users', user.uid), {
                    [`pickems.${liveEventId}`]: picksIds,
                });
                console.log('Saved picks:', picksIds);
            } catch (error) {
                console.error('Error saving picks:', error);
            }
        }
    };

    const formatCost = (value: number) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
    };

    const [picksSortStatus, setPicksSortStatus] = useState<DataTableSortStatus>({
        columnAccessor: columns[0]?.accessor || 'Player',
        direction: 'asc',
    });

    const sortedYourPicks = useMemo(() => {
        const sorted = sortBy(yourPicks, picksSortStatus.columnAccessor);
        return picksSortStatus.direction === 'desc' ? sorted.reverse() : sorted;
    }, [yourPicks, picksSortStatus]);

    return (
        <div className="flex md:flex-row flex-col gap-10">
            {/* Main Table: Available Players */}
            <div className="md:w-[80vw]">
                <div className="bg-slate-100 p-4 rounded-lg overflow-hidden">
                    <div className="mb-5 flex flex-col gap-5 md:flex-row items-center md:justify-between">
                        <div className="text-lg font-semibold text-slate-600 flex flex-row items-center gap-3">
                            {heading}
                        </div>
                        <div className="flex">
                            <input
                                type="text"
                                className="form-input text-white placeholder-slate-300 bg-slate-600 border-black border rounded-md p-2 w-auto"
                                placeholder="Search Player/Teams..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="datatables w-auto ">
                        <DataTable
                            highlightOnHover
                            className="whitespace-nowrap text-xs rounded-lg"
                            records={paginatedData}
                            columns={[
                                {
                                    accessor: 'picks',
                                    title: 'Picks',
                                    render: (item: any) => {
                                        const uniqueId = `choose-me-${item.player_id}`;
                                        return (
                                            <div className="flex items-center">
                                                <input
                                                    type="checkbox"
                                                    id={uniqueId}
                                                    checked={selectedPlayers.some((p) => p.player_id === item.player_id)}
                                                    onChange={() => handleSelectPlayer(item)}
                                                    className="peer hidden"
                                                />
                                                <label
                                                    htmlFor={uniqueId}
                                                    className="cursor-pointer rounded-lg border-2 border-gray-200 bg-green-500 py-1 px-2 font-bold text-gray-200 transition-colors duration-200 ease-in-out select-none peer-checked:bg-red-500 peer-checked:text-white peer-checked:border-red-500"
                                                >
                                                    {selectedPlayers.some((p) => p.player_id === item.player_id) ? "Remove" : "Pick"}
                                                </label>
                                            </div>
                                        );
                                    },
                                },
                                ...columns,
                            ]}
                            totalRecords={sortedData.length}
                            recordsPerPage={pageSize}
                            page={page}
                            onPageChange={setPage}
                            recordsPerPageOptions={PAGE_SIZES}
                            onRecordsPerPageChange={setPageSize}
                            sortStatus={sortStatus}
                            onSortStatusChange={setSortStatus}
                            minHeight={200}
                            paginationText={({ from, to, totalRecords }) => `${from} to ${to} of ${totalRecords}`}
                        />
                    </div>
                </div>
            </div>

            {/* Your Picks Section */}
            <div className="w-auto md:max-w-sm">
                <div className="bg-slate-100 pt-3 rounded-lg overflow-hidden">
                    <div className="flex flex-row mx-4 items-center justify-between">
                        <div className="text-md font-semibold text-slate-600 flex flex-row items-center gap-3">
                            Your Picks
                        </div>
                        <div className="text-md font-semibold text-slate-600">
                            Remaining Budget: {formatCost(500000 - totalCost)}
                        </div>
                    </div>
                    <div className="datatables px-4 pt-4 w-auto">
                        <div className="table-responsive mb-5">
                            <table className="table-striped w-auto p-4">
                                <thead>
                                    <tr>
                                        {columns.map((column) => (
                                            <th
                                                key={column.accessor}
                                                className="p-3 text-justify text-xs whitespace-nowrap items-center cursor-pointer"
                                                onClick={() =>
                                                    setPicksSortStatus((prev) => ({
                                                        columnAccessor: column.accessor,
                                                        direction: prev.columnAccessor === column.accessor && prev.direction === 'asc' ? 'desc' : 'asc',
                                                    }))
                                                }
                                            >
                                                {column.title}{' '}
                                                {picksSortStatus.columnAccessor === column.accessor ? (
                                                    picksSortStatus.direction === 'asc' ? <span className="ml-1">↑</span> : <span className="ml-1">↓</span>
                                                ) : (
                                                    <span className="ml-1">↕</span>
                                                )}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedYourPicks.map((pick, index) => (
                                        <tr key={index}>
                                            {columns.map((column) => (
                                                <td key={column.accessor} className="whitespace-break-spaces text-xs">
                                                    {column.render ? column.render(pick) : pick[column.accessor]}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PickTableData;
