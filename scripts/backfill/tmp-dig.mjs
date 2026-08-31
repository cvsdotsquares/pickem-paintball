import admin from "firebase-admin";
import path from "node:path";
import { parseEvent } from "./parse.mjs";
admin.initializeApp({ projectId: "fantasy-paintball" });
const db=admin.firestore();
const DIR="/Users/jamesgreen/Documents/PickEm Paintball/historic data";
const EV="tampa_bay_open_2025";
const { rows } = parseEvent(path.join(DIR,"Archived PickEm Paintball - Tampa Bay 2025 Data.xlsx"));
const names=new Set(rows.map(r=>r.player));
const snap=await db.collection(`events/${EV}/players`).get();

console.log("=== the three players with deltas ===");
for(const n of ["Matt Askren","Frank Antetomaso","Ivan Lopez"]){
  const d=snap.docs.find(x=>String(x.get("Player"))===n);
  const inLong=[...names].filter(x=>x.toLowerCase().includes(n.split(" ").pop().toLowerCase()));
  console.log(`  ${n}: roster kills=${d?.get("Confirmed Kills")}  similar names in long data: ${JSON.stringify(inLong)}`);
}
console.log("\n=== unresolved nickname ===");
const frey=snap.docs.filter(x=>/fre|fry/i.test(String(x.get("Player")))).map(x=>`${x.id} ${x.get("Player")} (${x.get("Confirmed Kills")} kills)`);
console.log("  roster names matching fre/fry:", frey);

console.log("\n=== the 4 split games: what rounds do their teams appear in? ===");
for(const pair of [["IMF","UPR"],["ACD","SDA"],["HUR","NRG"],["ACD","IMP"]]){
  const rs=rows.filter(r=>{
    const t=[r.team,r.opponent];
    return true;
  });
}
// group by team-pair ignoring round, to see if one game got split across two rounds
const byPair=new Map();
rows.forEach(r=>{
  const key=[r.team,r.opponent].sort().join(" v ");
  if(!byPair.has(key)) byPair.set(key,new Map());
  const m=byPair.get(key);
  if(!m.has(r.round)) m.set(r.round,new Set());
  m.get(r.round).add(r.point);
});
let split=0;
for(const [pair,byRound] of byPair){
  if(byRound.size>1){
    const parts=[...byRound].map(([rd,pts])=>`${rd}:pts{${[...pts].sort((a,b)=>a-b).join(",")}}`);
    console.log(`  ${pair}  ->  ${parts.join("   ")}`);
    split++;
  }
}
console.log(`  team pairs appearing under more than one round: ${split}`);
process.exit(0);
