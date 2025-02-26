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
    const [selectedPlayers, setSelectedPlayers] = useState<any[]>([]); // Stores selected player objects
    const [yourPicks, setYourPicks] = useState<any[]>([]); // Stores players to be saved

    const [sortStatus, setSortStatus] = useState<DataTableSortStatus>({
        columnAccessor: Object.keys(data[0] || {})[0] || 'Player',
        direction: 'asc',
    });

    const db = getFirestore();
    const { user } = useAuth();

    // NEW: State to hold the live event ID
    const [liveEventId, setLiveEventId] = useState<string | null>(null);

    // NEW: Fetch the live event (where status == "live") from Firestore
    useEffect(() => {
        const fetchLiveEvent = async () => {
            try {
                const eventsRef = collection(db, 'events');
                const q = query(eventsRef, where('status', '==', 'live'));
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) {
                    // Assume the first live event is the one to use
                    const liveEventDoc = querySnapshot.docs[0];
                    setLiveEventId(liveEventDoc.id);
                }
            } catch (error) {
                console.error('Error fetching live event:', error);
            }
        };

        fetchLiveEvent();
    }, [db]);

    // On mount, fetch the saved picks from Firestore (if any) for the live event
    useEffect(() => {
        if (user && liveEventId) {
            const fetchPicks = async () => {
                try {
                    const userRef = doc(db, 'users', user.uid);
                    const userSnap = await getDoc(userRef);
                    if (userSnap.exists()) {
                        const userData = userSnap.data();
                        if (userData.pickems && userData.pickems[liveEventId]) {
                            // Expecting an array of player IDs
                            const savedPicksIds: string[] = userData.pickems[liveEventId];
                            // Get the full player objects from the provided data array
                            const savedPicks = data.filter((player) =>
                                savedPicksIds.includes(player.player_id)
                            );
                            setYourPicks(savedPicks);
                            setSelectedPlayers(savedPicks);
                        }
                    }
                } catch (error) {
                    console.error('Error fetching saved picks:', error);
                }
            };
            fetchPicks();
        }
    }, [user, db, data, liveEventId]);

    // Filter, sort, and paginate the main table data
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
        const to = from + pageSize;
        return sortedData.slice(from, to);
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

    // Create column definitions dynamically
    const columns = useMemo(() => {
        if (data.length === 0) return [];
        const keys = Object.keys(data[0]);

        // Filter out "player_id" from the keys
        const filteredKeys = keys.filter(key => key !== 'player_id');

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

            return column;
        });
    }, [data]);


    // Handle checkbox click: add or remove a player from picks
    const handleSelectPlayer = (player: any) => {
        const isSelected = selectedPlayers.some((p) => p.player_id === player.player_id);

        if (isSelected) {
            setSelectedPlayers((prev) => prev.filter((p) => p.player_id !== player.player_id));
            setYourPicks((prev) => prev.filter((p) => p.player_id !== player.player_id));
        } else {
            if (yourPicks.length < 8) {
                setSelectedPlayers((prev) => [...prev, player]);
                setYourPicks((prev) => [...prev, player]);
            } else {
                alert('You can only pick 8 players.');
            }
        }
    };

    // Save the current picks to Firestore under users/{uid}/pickems/{liveEventId}
    const handleSavePicks = async () => {
        if (!user) {
            alert('You must be logged in to save picks.');
            return;
        }
        if (!liveEventId) {
            alert('No live event available.');
            return;
        }
        const picksIds = yourPicks.map((player) => player.player_id);
        try {
            await updateDoc(doc(db, 'users', user.uid), {
                [`pickems.${liveEventId}`]: picksIds,
            });
            alert('Picks saved successfully!');
        } catch (error) {
            console.error('Error saving picks:', error);
            alert('Error saving picks. Please try again.');
        }
    };

    return (
        <div className="flex gap-10">
            {/* Main Table: Available Players */}
            <div className="w-1/2">
                <div className="bg-slate-100 p-4 rounded-lg overflow-hidden">
                    <div className="mb-5 flex flex-col gap-5 md:flex-row items-center md:justify-between">
                        <div className="text-lg font-semibold text-slate-600 flex flex-row items-center gap-3 justify-start my-auto">
                            {heading}
                        </div>
                        <div className="flex">
                            <input
                                type="text"
                                className="form-input text-white placeholder-slate-300 bg-slate-600 border-black border rounded-md p-2 w-auto"
                                placeholder="Search Player/Teams...."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="datatables w-auto">
                        <DataTable
                            highlightOnHover
                            className="table-hover whitespace-nowrap rounded-lg"
                            records={paginatedData}
                            columns={[
                                {
                                    accessor: 'picks',
                                    title: 'Picks',
                                    render: (item: any) => (
                                        <input
                                            type="checkbox"
                                            checked={selectedPlayers.some((p) => p.player_id === item.player_id)}
                                            onChange={() => handleSelectPlayer(item)}
                                        />
                                    ),
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
                            paginationText={({ from, to, totalRecords }) =>
                                `Showing ${from} to ${to} of ${totalRecords} entries`
                            }
                        />
                    </div>
                </div>
            </div>

            {/* Your Picks Section */}
            <div className="w-1/2">
                <div className="bg-slate-100 p-4 rounded-lg overflow-hidden">
                    <div className='flex flex-row mx-4 items-center justify-between'>
                        <div className="text-lg font-semibold text-slate-600 flex flex-row items-center gap-3 justify-start my-auto">
                            Your Picks
                        </div>
                        <div >
                            <button
                                onClick={handleSavePicks}
                                className="bg-blue-500 text-white px-4 py-2 rounded"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                    <div className="datatables w-auto p-4">
                        <div className="datatables w-auto p-4">
                            <DataTable
                                highlightOnHover
                                className="table-hover whitespace-nowrap rounded-lg"
                                records={yourPicks}
                                columns={columns}
                                totalRecords={yourPicks.length}
                                minHeight={200}
                                withTableBorder
                                striped
                                stripedColor="gray"
                                // Dummy pagination props for a table with no pagination needs:
                                page={1}
                                onPageChange={() => { }}
                                recordsPerPage={yourPicks.length || 1}
                                onRecordsPerPageChange={() => { }}
                                recordsPerPageOptions={[yourPicks.length || 1]}
                                paginationText={({ from, to, totalRecords }) =>
                                    `Showing ${from} to ${to} of ${totalRecords} entries`
                                }
                            />
                        </div>

                    </div>

                </div>
            </div>
        </div>
    );
};

export default PickTableData;
