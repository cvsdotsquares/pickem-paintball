import Link from "next/link";
import * as React from "react";

const ActionButtons = () => {
  return (
    <div className="relative flex md:flex-row gap-2 md:justify-evenly justify-center items-center px-4 lg:px-12 mt-2 w-full text-sm whitespace-nowrap text-center m-auto font-bold leading-none text-white ">
      <Link
        href={"/dashboard/pick-em"}
        className="self-stretch px-2 py-2.5 my-auto bg-white bg-opacity-10 min-h-8 min-w-10 rounded-[32px] w-[263px]"
      >
        Edit Picks
      </Link>
      <Link
        href={"/dashboard/stats"}
        className="self-stretch px-2 py-2.5 my-auto border border-solid bg-stone-950 border-white border-opacity-20 min-h-8 min-w-10 rounded-[32px] w-[263px] max-md:px-5"
      >
        See Player Stats
      </Link>
    </div>
  );
};

export default ActionButtons;
