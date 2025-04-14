import React from "react";

interface Column {
  header: string;
  accessor: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column[];
}

const DataTable = <T extends Record<string, any>>({
  data,
  columns,
}: DataTableProps<T>) => {
  return (
    <div className="overflow-auto">
      <table className="w-full text-left text-sm text-gray-400 border-separate space-y-6">
        <thead className="bg-gray-800 text-gray-500">
          <tr>
            {columns.map((column) => (
              <th
                key={column.accessor}
                className="p-3 first:rounded-l-lg last:rounded-r-lg"
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr
              key={index}
              className="bg-gray-800 rounded-lg"
            >
              {columns.map((column, colIndex) => (
                <td
                  key={column.accessor}
                  className={`p-3 ${colIndex === 0 ? "rounded-l-lg" : ""} ${
                    colIndex === columns.length - 1 ? "rounded-r-lg" : ""
                  }`}
                >
                  {row[column.accessor]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DataTable;
