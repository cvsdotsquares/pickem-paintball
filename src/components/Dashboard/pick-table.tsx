"use client";
import { sortBy } from "lodash";
import { DataTable, DataTableSortStatus } from "mantine-datatable";
import { useEffect, useMemo, useState } from "react";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { useAuth } from "@/src/contexts/authProvider";

interface TableDataProps {
  heading: string;
  data: any[];
}

const PickTableData = ({ heading, data }: TableDataProps) => {
  const [page, setPage] = useState(1);
  const PAGE_SIZES = [10, 20, 30, 50, 100];
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [search, setSearch] = useState("");
  const [selectedPlayers, setSelectedPlayers] = useState<any[]>([]);
  const [yourPicks, setYourPicks] = useState<any[]>([]);
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus>({
    columnAccessor: Object.keys(data[0] || {})[0] || "Rank",
    direction: "asc",
  });

  const db = getFirestore();
  const { user } = useAuth();

  // Live event ID and total cost
  const [liveEventId, setLiveEventId] = useState<string | null>(null);
  const [totalCost, setTotalCost] = useState(0);
  const [lockDate, setLockDate] = useState<Date | null>(null); // New state for lock date
  const [timeLeft, setTimeLeft] = useState<string>("");

  // Start countdown timer
  useEffect(() => {
    const fetchLiveEvent = async () => {
      try {
        const eventsRef = collection(db, "events");
        const q = query(eventsRef, where("status", "==", "live"));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const liveEventDoc = querySnapshot.docs[0];
          setLiveEventId(liveEventDoc.id);
          const eventData = liveEventDoc.data();
          const fetchedLockDate = eventData.lockDate;

          // Ensure the fetchedLockDate is a valid Firestore Timestamp or ISO string
          if (fetchedLockDate && fetchedLockDate.toDate) {
            // Firestore Timestamp has a toDate() method that converts it to a JavaScript Date object
            const lockDateObject = fetchedLockDate.toDate();
            setLockDate(lockDateObject);
          } else {
            setLockDate(null);
          }
        } else {
          console.log("No live event found");
          setLockDate(null);
        }
      } catch (error) {
        console.error("Error fetching live event:", error);
      }
    };
    fetchLiveEvent();
  }, [db]);

  useEffect(() => {
    if (!lockDate || isNaN(lockDate.getTime())) {
      setTimeLeft("Invalid lock date");
      return;
    }

    const interval = setInterval(() => {
      const now = new Date();
      const timeRemaining = lockDate.getTime() - now.getTime();

      if (timeRemaining <= 0) {
        clearInterval(interval);
        setTimeLeft("Picks locked!");
      } else {
        const hours = Math.floor(
          (timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
        );
        const minutes = Math.floor(
          (timeRemaining % (1000 * 60 * 60)) / (1000 * 60)
        );
        const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      }
    }, 1000);

    return () => clearInterval(interval); // Cleanup interval on component unmount
  }, [lockDate]);

  // Fetch saved picks from Firebase on mount or when liveEventId updates
  useEffect(() => {
    if (user && liveEventId) {
      const fetchPicks = async () => {
        try {
          console.log(
            "Fetching picks for user:",
            user.uid,
            "and event:",
            liveEventId
          );

          const userRef = doc(db, "users", user.uid);
          const userSnap = await getDoc(userRef);

          if (userSnap.exists()) {
            const userData = userSnap.data();
            console.log("User data fetched:", userData);

            if (
              userData.pickems &&
              Array.isArray(userData.pickems[liveEventId])
            ) {
              const savedPicksIds = userData.pickems[liveEventId];
              console.log(
                "Saved picks IDs for event:",
                liveEventId,
                savedPicksIds
              );

              const savedPicks = data.filter((player) =>
                savedPicksIds.includes(player.player_id)
              );
              console.log("Resolved saved picks:", savedPicks);

              setYourPicks(savedPicks);
              setSelectedPlayers(savedPicks);

              const total = savedPicks.reduce((sum, player) => {
                const cost = Number(player.Cost);
                console.log("Adding player cost:", player, cost);
                return sum + (isNaN(cost) ? 0 : cost);
              }, 0);

              setTotalCost(total);
              console.log("Total cost calculated:", total);
            } else {
              console.warn(
                `No picks found for event ${liveEventId} in user's pickems map.`
              );
            }
          } else {
            console.warn("User document does not exist in Firestore.");
          }
        } catch (error) {
          console.error("Error fetching picks:", error);
        }
      };

      fetchPicks();
    }
  }, [user, liveEventId, db, data]); // Removed `yourPicks.length` from dependencies

  // New check to see if we are before lockDate
  const isBeforeLockDate = lockDate && new Date() < lockDate;

  // Filter, sort, and paginate data
  const filteredData = useMemo(() => {
    return data.filter((item) =>
      Object.keys(item).some((key) => {
        const value = item[key];
        if (typeof value === "string") {
          return value.toLowerCase().includes(search.toLowerCase());
        } else if (typeof value === "number" || typeof value === "boolean") {
          return value.toString().toLowerCase().includes(search.toLowerCase());
        }
        return false;
      })
    );
  }, [data, search]);

  const sortedData = useMemo(() => {
    const sorted = sortBy(filteredData, sortStatus.columnAccessor);
    return sortStatus.direction === "desc" ? sorted.reverse() : sorted;
  }, [filteredData, sortStatus]);

  const paginatedData = useMemo(() => {
    const from = (page - 1) * pageSize;
    return sortedData.slice(from, from + pageSize);
  }, [sortedData, page, pageSize]);

  const formatDate = (date: any) => {
    if (date) {
      const dt = new Date(date);
      const month =
        dt.getMonth() + 1 < 10 ? "0" + (dt.getMonth() + 1) : dt.getMonth() + 1;
      const day = dt.getDate() < 10 ? "0" + dt.getDate() : dt.getDate();
      return day + "/" + month + "/" + dt.getFullYear();
    }
    return "";
  };

  // Dynamically create column definitions
  const columns = useMemo(() => {
    if (data.length === 0) return [];
    const keys = Object.keys(data[0]);
    const filteredKeys = keys.filter(
      (key) => key !== "player_id" && key !== "Player Number"
    );
    return filteredKeys.map((key) => {
      const formattedTitle = key
        .replace(/([A-Z])/g, " $1")
        .replace(/_/g, " ")
        .replace(/(^\w|\s\w)/g, (m) => m.toUpperCase());
      const column: any = {
        accessor: key,
        title: formattedTitle,
        sortable: true,
      };
      if (key === "dob") {
        column.render = (item: any) => formatDate(item[key]);
      }
      if (key === "Cost") {
        column.render = (item: any) => formatCost(Number(item[key]));
      }
      return column;
    });
  }, [data]);

  // Handle player selection and update cost
  const handleSelectPlayer = async (player: any) => {
    if (!isBeforeLockDate) {
      alert("The time to make picks has passed. Please try again later.");
      return;
    }

    const isSelected = selectedPlayers.some(
      (p) => p.player_id === player.player_id
    );
    const playerCost = Number(player.Cost);
    if (isNaN(playerCost)) {
      console.error("Invalid player cost for:", player);
      alert("This player has an invalid cost and cannot be selected.");
      return;
    }

    let updatedSelectedPlayers = [];
    let updatedYourPicks = [];
    let updatedTotalCost = totalCost;

    if (isSelected) {
      updatedSelectedPlayers = selectedPlayers.filter(
        (p) => p.player_id !== player.player_id
      );
      updatedYourPicks = yourPicks.filter(
        (p) => p.player_id !== player.player_id
      );
      updatedTotalCost = totalCost - playerCost;
    } else {
      if (yourPicks.length < 8 && totalCost + playerCost <= 500000) {
        updatedSelectedPlayers = [...selectedPlayers, player];
        updatedYourPicks = [...yourPicks, player];
        updatedTotalCost = totalCost + playerCost;
      } else if (yourPicks.length >= 8) {
        alert("You can only pick 8 players.");
        return;
      } else {
        alert("You have exceeded the budget of $500,000.");
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
        await updateDoc(doc(db, "users", user.uid), {
          [`pickems.${liveEventId}`]: picksIds,
        });
        console.log("Saved picks:", picksIds);
      } catch (error) {
        console.error("Error saving picks:", error);
      }
    }
  };

  const formatCost = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const [picksSortStatus, setPicksSortStatus] = useState<DataTableSortStatus>({
    columnAccessor: columns[0]?.accessor || "Player",
    direction: "asc",
  });

  const sortedYourPicks = useMemo(() => {
    const sorted = sortBy(yourPicks, picksSortStatus.columnAccessor);
    return picksSortStatus.direction === "desc" ? sorted.reverse() : sorted;
  }, [yourPicks, picksSortStatus]);

  return (
    <div className="flex md:flex-row flex-col justify-evenly mx-auto">
      {/* Main Table: Available Players */}

      <div className="relative p-4 rounded-lg z-10 overflow-hidden">
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
        <div className="datatables w-auto">
          <DataTable
            highlightOnHover
            className="whitespace-nowrap text-xs rounded-lg"
            records={paginatedData}
            columns={[
              {
                accessor: "picks",
                title: "Picks",
                render: (item: any) => {
                  const uniqueId = `choose-me-${item.player_id}`;
                  return (
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id={uniqueId}
                        checked={selectedPlayers.some(
                          (p) => p.player_id === item.player_id
                        )}
                        onChange={() => handleSelectPlayer(item)}
                        className="peer hidden"
                      />
                      <label
                        htmlFor={uniqueId}
                        className="cursor-pointer rounded-lg border-2 border-gray-200 bg-green-500 py-1 px-2 font-bold text-gray-200 transition-colors duration-200 ease-in-out select-none peer-checked:bg-red-500 peer-checked:text-white peer-checked:border-red-500"
                      >
                        {selectedPlayers.some(
                          (p) => p.player_id === item.player_id
                        )
                          ? "Remove"
                          : "Pick"}
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
            paginationText={({ from, to, totalRecords }) =>
              `${from} to ${to} of ${totalRecords}`
            }
          />
        </div>
      </div>
      <div className="flex flex-col gap-10 relative w-auto">
        <div className="flex flex-row mx-4 items-center justify-between bg-white p-4 rounded-xl border border-blue-950">
          <div className="flex flex-col text-slate-600">
            <div className="flex justify-between">
              <span className="font-medium">Remaining Budget:</span>
              <span>{formatCost(500000 - totalCost)}</span>
            </div>

            <div className="flex justify-between">
              <span className="font-medium">Remaining Picks:</span>
              <span>{8 - yourPicks.length}</span>
            </div>
            {lockDate && (
              <div className="mt-4 text-center text-sm text-red-600">
                <strong>Time left to lock in your picks: </strong> {timeLeft}
              </div>
            )}
          </div>
        </div>

        <div className="bg-slate-100 pt-3 rounded-lg overflow-hidden">
          <div className="datatables px-4 pt-4 w-full">
            <div className="table-responsive mb-5">
              <table className="table-striped p-4">
                <thead>
                  <tr>
                    {columns.map((column) => (
                      <th
                        key={column.accessor}
                        className="p-3 text-justify text-xs whitespace-nowrap items-center cursor-pointer"
                        onClick={() =>
                          setPicksSortStatus((prev) => ({
                            columnAccessor: column.accessor,
                            direction:
                              prev.columnAccessor === column.accessor &&
                              prev.direction === "asc"
                                ? "desc"
                                : "asc",
                          }))
                        }
                      >
                        {column.title}{" "}
                        {picksSortStatus.columnAccessor === column.accessor ? (
                          picksSortStatus.direction === "asc" ? (
                            <span className="ml-1">↑</span>
                          ) : (
                            <span className="ml-1">↓</span>
                          )
                        ) : (
                          <span className="ml-1">↕</span>
                        )}
                      </th>
                    ))}
                    {/* Add a column for Remove button */}
                    <th className="p-3 text-xs">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedYourPicks.map((pick, index) => (
                    <tr key={index}>
                      {columns.map((column) => (
                        <td
                          key={column.accessor}
                          className="whitespace-break-spaces text-xs"
                        >
                          {column.render
                            ? column.render(pick)
                            : pick[column.accessor]}
                        </td>
                      ))}
                      {/* Add Remove button in Action column */}
                      <td className="whitespace-nowrap text-center">
                        <button
                          className="bg-red-500 text-white px-2 text-xs font-bold py-1.5 rounded-lg hover:bg-red-600"
                          onClick={() => handleSelectPlayer(pick)}
                        >
                          Remove
                        </button>
                      </td>
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
