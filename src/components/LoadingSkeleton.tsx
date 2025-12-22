export function LeaderboardRowSkeleton() {
  return (
    <tr className="bg-gray-800/30 animate-pulse">
      <td className="px-2 py-2 whitespace-nowrap">
        <div className="h-4 w-8 bg-gray-700 rounded"></div>
      </td>
      <td className="px-2 py-2 whitespace-nowrap">
        <div className="flex items-center">
          <div className="w-8 h-8 rounded-full bg-gray-700 mr-2"></div>
          <div className="h-4 w-24 bg-gray-700 rounded"></div>
        </div>
      </td>
      <td className="px-2 py-2 whitespace-nowrap">
        <div className="h-4 w-12 bg-gray-700 rounded"></div>
      </td>
      <td className="px-2 py-2 whitespace-nowrap hidden sm:table-cell">
        <div className="h-4 w-20 bg-gray-700 rounded"></div>
      </td>
      <td className="px-2 py-2 whitespace-nowrap">
        <div className="h-4 w-4 bg-gray-700 rounded mx-auto"></div>
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
