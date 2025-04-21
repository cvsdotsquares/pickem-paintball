import Link from "next/link";
import * as React from "react";

const ActionButtons = () => {
  return (
    <div className="flex flex-col md:flex-row gap-2 justify-between items-center px-3 mt-6 w-full text-xs whitespace-nowrap text-center  p-auto font-bold leading-none text-white max-md:max-w-full">
      <Link
        href={"/dashboard/pick-em"}
        className="self-stretch px-2 py-2.5 my-auto bg-white bg-opacity-10 min-h-10 min-w-10 rounded-[32px] w-[263px]"
      >
        Change Picks
      </Link>
      <Link
        href={"/dashboard/stats"}
        className="self-stretch px-2 py-2.5 my-auto border border-solid bg-stone-950 border-white border-opacity-20 min-h-10 min-w-10 rounded-[32px] w-[263px] max-md:px-5"
      >
        See Player Stats
      </Link>
    </div>
  );
};

export default ActionButtons;
