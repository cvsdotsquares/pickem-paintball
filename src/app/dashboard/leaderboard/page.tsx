'use client';

import { useState, useEffect } from "react";
import { db } from "@/src/lib/firebaseClient";
import { collection, getDocs } from "firebase/firestore";
import { Event } from "../page";
import { FaGreaterThan } from "react-icons/fa6";

interface User {
  id: string;
  displayName: string;
  totalPoints: number;
}

export default function Leaderboard() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [liveEvent, setLiveEvent] = useState<Event | null>(null);

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

        // Select the first live event by default, or fallback to the first
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
        console.log("Fetching top 15 users for leaderboard...");
        const usersCollection = collection(db, "users");
        const querySnapshot = await getDocs(usersCollection);

        // Map data and initialize defaults if values are missing
        const userData: User[] = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          displayName: doc.get("displayName") || "Unknown User", // Default display name
          totalPoints: doc.get("total_points") ?? 0, // Default to 0 points
        }));

        // Sort users by total points in descending order and take the top 15
        const sortedUsers = userData
          .sort((a, b) => b.totalPoints - a.totalPoints)
          .slice(0, 15);

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

  return (
    <div className=" flex flex-col p-4 min-h-screen font-inter bg-white">
      <h1 className="text-2xl font-bold m-4 text-left">Leaderboard </h1>
      <div className="flex flex-row w-full justify-evenly m-auto">
        <div className="w-1/2 rounded-lg p-4 m-4 bg-slate-200 overflow-x-auto">
          {liveEvent ? (
            <>
              <span >
                {liveEvent.name}{" "}
                <span className="text-green-600">(live)</span>
              </span>
            </>
          ) : (
            <span className="text-gray-400">(No live event)</span>
          )}
          <table className=" border-collapse border border-gray-300">
            <thead className="bg-gray-100 ">
              <tr>
                <th className="border-b border-l border-gray-300 px-4 py-2 text-left bg-slate-600 text-white">Rank</th>
                <th className="border-b border-l border-gray-300 px-4 py-2 text-left bg-slate-600 text-white">Name</th>
                <th className="border-b border-l border-gray-300 px-4 py-2 text-left bg-slate-600 text-white">Points</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, index) => (
                <tr key={user.id} className={`${index % 2 === 0 ? "bg-gray-50" : "bg-white"} text-balance whitespace-break-spaces`}>
                  <td className="border-b border-gray-300 px-4 py-2">{index + 1}</td>
                  <td className="border-b border-gray-300 px-4 py-2">{user.displayName}</td>
                  <td className="border-b border-gray-300 px-4 py-2">{user.totalPoints}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="w-1/2 rounded-lg p-4 m-4 bg-slate-200 overflow-x-auto">
          All Time Leaderboard
          <table className="table border-collapse border border-gray-300">
            <thead className="bg-gray-100 ">
              <tr>
                <th className="border-b border-l border-gray-300 px-4 py-2 text-left bg-slate-600 text-white">Rank</th>
                <th className="border-b border-l border-gray-300 px-4 py-2 text-left bg-slate-600 text-white">Name</th>
                <th className="border-b border-l border-gray-300 px-4 py-2 text-left bg-slate-600 text-white">Points</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, index) => (
                <tr key={user.id} className={`${index % 2 === 0 ? "bg-gray-50" : "bg-white"} text-balance whitespace-break-spaces`}>
                  <td className="border-b  border-gray-300 px-4 py-2">{index + 1}</td>
                  <td className="border-b border-gray-300 px-4 py-2">{user.displayName}</td>
                  <td className="border-b border-gray-300 px-4 py-2">{user.totalPoints}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
