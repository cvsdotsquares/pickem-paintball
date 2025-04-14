"use client";
import * as React from "react";

const CardSection = () => {
  return (
    <>
      

      <section className="flex flex-col justify-center mt-6 w-full max-md:max-w-full">
        <div className="flex justify-between items-center self-center px-3">
          <h3 className="self-stretch my-auto text-2xl font-bold leading-tight text-center text-white">
            Your Picks
          </h3>
          
        </div>
        <div className="flex flex-col flex-1 justify-center items-center px-32 mt-10 w-full max-md:px-5 max-md:max-w-full">
          {/* <img
            src="https://cdn.builder.io/api/v1/image/assets/TEMP/2c54b30d43f236bbe0b998bfe09eab9031380861?placeholderIfAbsent=true&apiKey=15889098a2f64f5596f97e7e5322ac49"
            className="object-contain max-w-full aspect-[0.98] w-[312px]"
            alt="Hall of Fame card"
          /> */}
        </div>
      </section>
    </>
  );
};

export default CardSection;
