import { useAuth } from "@/src/contexts/authProvider";
import { collection, getDocs, getFirestore } from "firebase/firestore";
import { useEffect, useState } from "react";

const DivisionInfo = () => {
  const [liveEvent, setLiveEvent] = useState<{
    id: string | null;
    lockDate: Date | null;
    timeLeft: string;
  }>({ id: null, lockDate: null, timeLeft: "" });

  const db = getFirestore();
  const { user } = useAuth();

  // Helper to fetch documents from Firestore
  const fetchFromFirestore = async (path: string) => {
    const ref = collection(db, path);
    const snapshot = await getDocs(ref);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  };
  // Fetch live event details
  useEffect(() => {
    const fetchLiveEvent = async () => {
      const events = await fetchFromFirestore("events");
      const live = events.find((e: any) => e.status === "live");
      if (live) {
        setLiveEvent({
          id: live.id,
          lockDate: new Date(),
          timeLeft: "",
        });
      }
    };
    fetchLiveEvent();
  }, []);

  // Update countdown timer
  useEffect(() => {
    const { lockDate } = liveEvent;
    if (!lockDate) return;

    const updateTimeLeft = () => {
      const now = new Date();
      const diff = lockDate.getTime() - now.getTime();
      if (diff <= 0) {
        setLiveEvent((prev) => ({ ...prev, timeLeft: "Picks locked!" }));
        return;
      }
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setLiveEvent((prev) => ({
        ...prev,
        timeLeft: `${hours}h ${minutes}m ${seconds}s`,
      }));
    };

    const interval = setInterval(updateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, [liveEvent.lockDate]);

  return (
    <section className="flex flex-col justify-center p-4 mt-6 w-full rounded-2xl bg-white bg-opacity-10 max-md:max-w-full">
      <div className="w-full max-md:max-w-full">
        <div className="flex flex-wrap gap-2 items-end w-full max-md:max-w-full">
          {/* <img
              src="https://cdn.builder.io/api/v1/image/assets/TEMP/e75f952a3ef1277b6a705f72dc10cf691223dfdf?placeholderIfAbsent=true&apiKey=15889098a2f64f5596f97e7e5322ac49"
              className="object-contain shrink-0 w-10 aspect-square"
              alt="Division icon"
            /> */}
          <div className="flex flex-1 shrink gap-10 justify-between items-end basis-0 min-w-60 max-md:max-w-full">
            <div className="text-sm font-bold leading-none text-white w-[74px]">
              <div className="flex items-center w-full">
                <span className="self-stretch whitespace-nowrap my-auto">
                  {liveEvent.id?.replace(/_/g, " ")} Leaderboards
                </span>
              </div>
              <div className="mt-1 w-full">
                <span style={{ color: "rgba(255,255,255,1)" }}>-/</span>
                <span style={{ fontWeight: 400, color: "rgba(255,255,255,1)" }}>
                  -
                </span>
              </div>
            </div>
            <div className="flex items-center w-[22px]">
              <div className="self-stretch my-auto w-[22px]">
                <div className="flex items-center w-full">
                  <span className="self-stretch my-auto text-sm font-bold leading-none text-white">
                    -
                  </span>
                  <div className="self-stretch my-auto w-4">
                    <div className="flex w-4 min-h-[18px]" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 w-full text-sm leading-none text-center text-white max-md:max-w-full">
          <div className="p-1 rounded-2xl border-solid bg-[#101010] border-[1px] border-[rgba(255,255,255,0.43)] w-[100%] max-md:max-w-full">
            <div className="flex justify-center items-center py-16 pr-48 pl-48 w-full min-h-[150px] max-md:px-5 max-md:max-w-full">
              <p className="self-stretch whitespace-nowrap my-auto">
                Not entered this week.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default DivisionInfo;
