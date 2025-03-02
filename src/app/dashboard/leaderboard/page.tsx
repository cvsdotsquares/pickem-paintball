'use client';

import { useState, useEffect } from "react";
import { db } from "@/src/lib/firebaseClient";
import { collection, getDocs } from "firebase/firestore";
import { Event } from "../page";
import { DataTable } from "mantine-datatable";

interface User {
  id: string;
  displayName: string;
  totalPoints: number;
}

export default function Leaderboard() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [liveEvent, setLiveEvent] = useState<Event | null>(null);

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const PAGE_SIZES = [10, 50, 100];

  // Fetch all events from Firebase
  useEffect(() => {
    async function fetchEvents() {
      try {
        console.log("Fetching events list...");
        const eventsCollection = collection(db, "events");
        const querySnapshot = await getDocs(eventsCollection);
        const events: Event[] = querySnapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.get("name") || "Unnamed Event",
          status: doc.get("status") || "archived",
        }));
        const activeEvent = events.find(e => e.status === "live");
        setLiveEvent(activeEvent || null);
      } catch (error: any) {
        console.error("Error fetching events:", error.message);
      }
    }
    fetchEvents();
  }, []);

  // Fetch user data from Firebase
  useEffect(() => {
    async function fetchLeaderboardData() {
      try {
        console.log("Fetching users for leaderboard...");
        const usersCollection = collection(db, "users");
        const querySnapshot = await getDocs(usersCollection);

        const userData: User[] = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          displayName: doc.get("name") || "Unknown User",
          totalPoints: doc.get("total_points") ?? 0,
        }));

        // Sort users by points in descending order without slicing to only 15 users.
        const sortedUsers = userData.sort((a, b) => b.totalPoints - a.totalPoints);

        setUsers(sortedUsers);
      } catch (error) {
        console.error("Error fetching leaderboard data:", (error as Error).message);
      } finally {
        setLoading(false);
      }
    }

    fetchLeaderboardData();
  }, []);

  if (loading) {
    return <p className="text-center mt-4">Loading leaderboard...</p>;
  }

  // Slice the users array for current page display
  const paginatedUsers = users.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="flex flex-col p-4 min-h-screen font-inter bg-white">
      <h1 className="text-2xl font-bold m-4 text-left">Leaderboard</h1>
      <div className="flex flex-row w-full justify-evenly m-auto">
        <div className=" w-full  p-4 m-4 bg-slate-200 rounded-lg overflow-hidden">
          {liveEvent ? (
            <span className="ml-3 ">
              {liveEvent.name}{" "}
              <span className="text-green-600">(live)</span>
            </span>
          ) : (
            <span className="text-gray-400">(No live event)</span>
          )}
          <div className="datatables m-2">
            <DataTable
              className="rounded-lg"
              records={paginatedUsers}
              columns={[
                {
                  accessor: "rank",
                  title: "Rank",
                  render: (record, index) => (page - 1) * pageSize + index + 1
                },
                { accessor: "displayName", title: "Name" },
                { accessor: "totalPoints", title: "Points" },
              ]}
              totalRecords={users.length}
              recordsPerPage={pageSize}
              page={page}
              onPageChange={setPage}
              recordsPerPageOptions={PAGE_SIZES}
              onRecordsPerPageChange={(newPageSize: number) => {
                setPageSize(newPageSize);
                setPage(1);
              }}
            />
          </div>
        </div>
        {/* <div className=" w-full p-4 m-4 bg-slate-200 rounded-lg overflow-hidden">
          <span className="ml-3 "> All Time Leaderboards</span>
          <div className="datatables m-2">
            <DataTable
              className="rounded-lg"
              records={paginatedUsers}
              columns={[
                {
                  accessor: "rank",
                  title: "Rank",
                  render: (record, index) => (page - 1) * pageSize + index + 1
                },
                { accessor: "displayName", title: "Name" },
                { accessor: "totalPoints", title: "Points" },
              ]}
              totalRecords={users.length}
              recordsPerPage={pageSize}
              page={page}
              onPageChange={setPage}
              recordsPerPageOptions={PAGE_SIZES}
              onRecordsPerPageChange={(newPageSize: number) => {
                setPageSize(newPageSize);
                setPage(1);
              }}
            />
          </div>
        </div> */}
      </div>
    </div>
  );
}
