import json, sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

d = json.load(open(sys.argv[1])); dest = sys.argv[2]
A="Arial"
HEAD=Font(name=A,bold=True,color="FFFFFF",size=10); HF=PatternFill("solid",fgColor="1F3B4D")
BODY=Font(name=A,size=10); BOLD=Font(name=A,size=10,bold=True); NOTE=Font(name=A,size=9,italic=True,color="555555")
GREEN=PatternFill("solid",fgColor="E3F4E1"); RED=PatternFill("solid",fgColor="FBE3E3")
AMBER=PatternFill("solid",fgColor="FFF6DA"); GREY=PatternFill("solid",fgColor="EEEEEE")
THIN=Border(bottom=Side(style="thin",color="DDDDDD"))
WRAP=Alignment(wrap_text=True, vertical="top")

def verdict(x):
    """My assessment of each difference, and why."""
    k, t, pair = x["key"], x["type"], x["pair"]
    teams, _, rnd = pair.partition("@")
    if k == "2024|Lone Star Major":
        return ("Signed off", "Workbook",
                "pbleagues' schedule contradicts its own rankings page, which puts Red Legion first. Known and agreed.",
                "None", GREY)
    if k == "2022|World Cup" and rnd == "prelims":
        return ("Keep the workbook", "Workbook",
                "The six games under code 11689 are a complete round-robin among exactly four teams "
                "(Dynasty, Heat, Impact, TonTons) and those four have no other prelim games. That is a group "
                "stage. pbleagues labels it 1/32, which does not fit a 24-team field.",
                "None — prelims is already what we record", GREEN)
    if k == "2022|World Cup" and rnd == "1/32":
        return ("Keep the workbook", "Workbook",
                "Same six games as the rows above, seen from the crawl. See those.",
                "None", GREEN)
    if k == "2022|World Cup" and rnd == "1/16":
        return ("Adopt the crawl", "Crawl",
                "These two games sit AFTER A Prelims and before Ochos: the winners (Uprising, Xtreme) went on "
                "to Ochos, the losers did not. That is a knockout round, not a group game.",
                "DMG and Red Legion reached the round of 16, so they made Sunday. We record them as Prelims.", RED)
    if t == "same pair and round twice":
        return ("Workbook error", "Crawl",
                "The workbook holds the identical row twice — same round, date, teams and score. The crawl has "
                "it once.",
                "Boom and Infamous each show one game more than they played.", RED)
    if t == "only in workbook":
        return ("Keep the workbook", "Workbook",
                "pbleagues' 2017 schedules carry prelims, quarters and semifinals but not the bracket's later "
                "games — while its own rankings name a champion. The source is incomplete, not us.",
                "None, provided we do not let the crawl delete matches it lacks.", GREEN)
    if t == "score differs":
        return ("Undetermined", "Neither proven",
                "The two sources differ by one digit and the winner is the same either way. Point-by-point data "
                "only exists from 2021, so there is nothing to adjudicate with.",
                "None — win, loss and every derived figure are identical under both.", AMBER)
    return ("Review", "", "", "", AMBER)

wb = Workbook(); ws = wb.active; ws.title = "Review"
cols = ["Event","Year","Teams","Round","Historic file","pbleagues crawl","My view","Which I trust","Why","What it affects"]
for i,c in enumerate(cols,1):
    x=ws.cell(row=1,column=i,value=c); x.font,x.fill=HEAD,HF; x.alignment=Alignment(horizontal="center",wrap_text=True)
ws.freeze_panes="A2"
order = {"2022|World Cup":0}
rows = sorted(d["differences"], key=lambda x: (order.get(x["key"], 1), x["key"], x["pair"]))
for r,x in enumerate(rows,2):
    teams,_,rnd = x["pair"].partition("@")
    v,trust,why,affects,fill = verdict(x)
    for c,val in enumerate([x["key"],x["year"],teams,rnd,x["ours"] or "—",x["crawl"] or "—",v,trust,why,affects],1):
        cell=ws.cell(row=r,column=c,value=val); cell.font=BODY; cell.border=THIN
        if c in (9,10): cell.alignment=WRAP
    ws.cell(row=r,column=7).fill=fill
for i,w in enumerate([24,7,30,10,14,14,18,15,62,46],1):
    ws.column_dimensions[get_column_letter(i)].width=w

n=len(rows)
sm=wb.create_sheet("Summary",0)
sm["A1"]="Match differences — my assessment against the historic file"
sm["A1"].font=Font(name=A,size=14,bold=True)
lines=[("Differences to review",f"=COUNTA(Review!A2:A{n+1})"),
 ("",""),
 ("Keep the workbook",f'=COUNTIF(Review!G2:G{n+1},"Keep the workbook")'),
 ("Adopt the crawl",f'=COUNTIF(Review!G2:G{n+1},"Adopt the crawl")'),
 ("Workbook error",f'=COUNTIF(Review!G2:G{n+1},"Workbook error")'),
 ("Undetermined",f'=COUNTIF(Review!G2:G{n+1},"Undetermined")'),
 ("Already signed off",f'=COUNTIF(Review!G2:G{n+1},"Signed off")'),
]
for i,(k,v) in enumerate(lines,3):
    sm.cell(row=i,column=1,value=k).font=BOLD if k else BODY
    sm.cell(row=i,column=2,value=v).font=BODY
notes=["","THE TWO THAT NEED A DECISION","",
 "1. 2022 World Cup, round code 42370 — two games I believe are a knockout round, not prelims.",
 "   Adopting it gives DMG and Red Legion a Sunday they do not currently have. Nothing else moves.",
 "",
 "2. 2017 World Cup — the workbook holds Infamous 5-2 Boom twice. If that is a duplicate, deleting it",
 "   reduces Boom's and Infamous's game counts by one each and changes their win/loss records.",
 "","EVERYTHING ELSE","",
 "The six 2022 games under code 11689 are a group stage and we already have them right.",
 "The six 2017 bracket games missing from pbleagues mean the crawl must never delete matches it lacks.",
 "The two remaining score differences change no derived figure — same winner either way.",
]
for i,t in enumerate(notes,12):
    sm.cell(row=i,column=1,value=t).font=BOLD if t and t.isupper() else NOTE
sm.column_dimensions["A"].width=100; sm.column_dimensions["B"].width=14
wb.save(dest); print("wrote",dest)
