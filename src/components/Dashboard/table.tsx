'use client';
import { sortBy } from 'lodash';
import { DataTable, DataTableSortStatus } from 'mantine-datatable';
import { useEffect, useMemo, useState } from 'react';
import { FaCaretDown } from 'react-icons/fa6';
import Dropdown from '../ui/dropdown';

interface TableDataProps {
    heading: string;
    data: any[];
}

const TableData = ({ heading, data }: TableDataProps) => {
    const [page, setPage] = useState(1);
    const PAGE_SIZES = [10, 20, 30, 50, 100];
    const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
    const [search, setSearch] = useState('');

    // Initialize hideCols as an empty array, meaning no columns are hidden by default
    const [hideCols, setHideCols] = useState<any>([]);

    const [sortStatus, setSortStatus] = useState<DataTableSortStatus>({
        columnAccessor: Object.keys(data[0] || {})[0] || 'player_id',
        direction: 'asc',
    });

    const showHideColumns = (col: string) => {
        setHideCols((prev: string[]) =>
            prev.includes(col) ? prev.filter((d) => d !== col) : [...prev, col]
        );
    };


    const filteredData = useMemo(() => {
        return data.filter((item) => {
            return Object.keys(item).some((key) => {
                const value = item[key];
                if (typeof value === 'string') {
                    return value.toLowerCase().includes(search.toLowerCase());
                } else if (typeof value === 'number' || typeof value === 'boolean') {
                    return value.toString().toLowerCase().includes(search.toLowerCase());
                }
                return false;
            });
        });
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

    const columns = useMemo(() => {
        if (data.length === 0) return [];
        const keys = Object.keys(data[0]);
        return keys.map((key) => {
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

    // Update hideCols if the columns change
    useEffect(() => {
        setHideCols([]); // Start with all columns visible
    }, [columns]);

    return (
        <div className="bg-slate-100 p-4 rounded-lg overflow-hidden">
            <div className="mb-5 flex flex-col gap-5 md:flex-row items-center md:justify-between">
                <div className="text-lg font-semibold text-slate-600 flex flex-row items-center gap-3 justify-start my-auto">
                    {heading}
                </div>
                <div className="flex flex-col gap-5 md:flex-row md:items-center">
                    <div className="dropdown">
                        <Dropdown
                            placement={'bottom-start'}
                            btnClassName="!flex items-center border font-semibold border-[#253b5c] rounded-md px-4 py-2 text-sm bg-slate-800 text-white"
                            button={
                                <>
                                    <span className="ltr:mr-1 rtl:ml-1">Show/Hide Columns</span>
                                    <FaCaretDown className="h-5 w-5" />
                                </>
                            }
                        >
                            <ul className="!min-w-[140px] bg-slate-400 rounded-lg">
                                {columns.map((col, i) => (
                                    <li
                                        key={i}
                                        className="flex flex-col border-b-2 border-white"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div className="flex items-center px-4 py-1">
                                            <label className="mb-0 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={!hideCols.includes(col.accessor)}
                                                    className="form-checkbox"
                                                    onChange={() => showHideColumns(col.accessor)}
                                                />
                                                <span className="ltr:ml-2 rtl:mr-2">{col.title}</span>
                                            </label>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </Dropdown>
                    </div>
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
                    columns={columns.filter((col) => !hideCols.includes(col.accessor))}
                    totalRecords={sortedData.length}
                    recordsPerPage={pageSize}
                    page={page}
                    onPageChange={setPage}
                    recordsPerPageOptions={PAGE_SIZES}
                    onRecordsPerPageChange={setPageSize}
                    sortStatus={sortStatus}
                    onSortStatusChange={setSortStatus}
                    minHeight={200}
                    paginationText={({ from, to, totalRecords }) => `Showing ${from} to ${to} of ${totalRecords} entries`}
                />
            </div>
        </div>
    );
};

export default TableData;
