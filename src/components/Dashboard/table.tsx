"use client";
import { useEffect, useMemo, useState } from "react";
import { FaCaretDown } from "react-icons/fa6";
import DisplayTable from "./table/displaytable";

interface TableDataProps {
  heading: string;
  data: any[];
}

const TableData = ({ heading, data }: TableDataProps) => {
  const [page, setPage] = useState(1);
  const PAGE_SIZES = [10, 20, 30, 50, 100];
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [search, setSearch] = useState("");
  const [hideCols, setHideCols] = useState<string[]>([]);

  useEffect(() => {
    setPage(1);
  }, [data, search]);

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

  interface ColumnDefinition {
    id: string;
    accessor: string;
    title: string;
    width: string;
  }

  const columns = useMemo(() => {
    if (data.length === 0) return [];
    return Object.keys(data[0]).map((key) => ({
      id: key, // Ensuring a unique id
      accessor: key,
      title: key
        .replace(/([A-Z])/g, " $1")
        .replace(/_/g, " ")
        .replace(/(^\w|\s\w)/g, (m) => m.toUpperCase()),
      width: "1fr",
      header: key, // Adding the missing 'header' property
    }));
  }, [data]);

  useEffect(() => {
    setHideCols(["player_id"]);
  }, [columns]);

  return (
    <div className="bg-slate-100 p-4 rounded-lg overflow-hidden absolute md:w-[80vw]">
      <div className="mb-5 flex flex-col gap-5 md:flex-row items-center md:justify-between">
        <div className="text-lg font-semibold text-slate-600 flex flex-row items-center gap-3 justify-start my-auto">
          {heading}
        </div>
        <div className="flex flex-col gap-5 md:flex-row md:items-center"></div>
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
      <DisplayTable
        columns={columns.filter((col) => !hideCols.includes(col.accessor))}
        data={filteredData}
        gridTemplateColumns={columns.map((col) => col.width || "1fr").join(" ")}
        headerClassName="bg-stone-900 text-white text-xs uppercase py-3"
        showHeader={true}
        emptyMessage={
          <div className="flex flex-col items-center gap-4">
            <p className="text-lg">No player statistics available</p>
            <button className="px-4 py-2 bg-white text-stone-950 rounded-md">
              Refresh Data
            </button>
          </div>
        }
      />
    </div>
  );
};

export default TableData;
