export function LeaderboardRowSkeleton() {
  return (
    <tr className="bg-gray-800/30 animate-pulse">
      <td className="w-14 px-3 py-2.5 align-middle whitespace-nowrap sm:w-16">
        <div className="h-4 w-8 rounded bg-gray-700"></div>
      </td>
      <td className="min-w-0 px-3 py-2.5 align-middle">
        <div className="flex min-w-0 items-center">
          <div className="mr-2 h-8 w-8 shrink-0 rounded-full bg-gray-700"></div>
          <div className="h-4 min-w-0 flex-1 max-w-[8rem] rounded bg-gray-700"></div>
        </div>
      </td>
      <td className="w-24 px-3 py-2.5 text-right align-middle whitespace-nowrap sm:w-28">
        <div className="ml-auto h-4 w-12 rounded bg-gray-700"></div>
      </td>
      <td className="hidden min-w-0 px-3 py-2.5 align-middle sm:table-cell">
        <div className="h-4 max-w-full rounded bg-gray-700"></div>
      </td>
      <td className="w-16 max-w-16 px-2 py-2.5 text-left align-middle">
        <div className="h-4 w-4 rounded bg-gray-700"></div>
      </td>
    </tr>
  );
}

export function LeaderboardSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <LeaderboardRowSkeleton key={i} />
      ))}
    </>
  );
}
