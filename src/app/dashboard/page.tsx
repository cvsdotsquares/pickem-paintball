'use client';

import TableData from "@/src/components/table";



export default function Dashboard() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white ">
      <div className=" p-4 w-full text-center ">
        <TableData />
      </div>
    </div>
  );
}
