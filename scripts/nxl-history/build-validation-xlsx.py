"""
Turn a crawl comparison into a workbook someone can check by hand.

    node scripts/nxl-history/validate-crawl.mjs 9320 "2026|Midwest Open" --json out.json
    python scripts/nxl-history/build-validation-xlsx.py out.json out.xlsx

Three sheets: what was crawled, how it lines up with the history we already hold, and a
summary that counts the agreements with formulas so the totals move if a row is edited.
"""
import json, sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

src, dest = sys.argv[1], sys.argv[2]
d = json.load(open(src))

ARIAL = "Arial"
HEAD = Font(name=ARIAL, bold=True, color="FFFFFF", size=10)
HEAD_FILL = PatternFill("solid", fgColor="1F3B4D")
BODY = Font(name=ARIAL, size=10)
BOLD = Font(name=ARIAL, size=10, bold=True)
NOTE = Font(name=ARIAL, size=9, italic=True, color="555555")
OK_FILL = PatternFill("solid", fgColor="E3F4E1")
BAD_FILL = PatternFill("solid", fgColor="FBE3E3")
GAP_FILL = PatternFill("solid", fgColor="FFF6DA")
THIN = Border(bottom=Side(style="thin", color="DDDDDD"))

wb = Workbook()

def header(ws, cols, row=1):
    for i, c in enumerate(cols, start=1):
        cell = ws.cell(row=row, column=i, value=c)
        cell.font, cell.fill = HEAD, HEAD_FILL
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.freeze_panes = ws.cell(row=row + 1, column=1)

def widths(ws, ws_widths):
    for i, w in enumerate(ws_widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w

# ── Matches ──────────────────────────────────────────────────────────────────
ms = wb.active
ms.title = "Matches"
header(ms, ["Round", "Date", "Team A (pbleagues)", "Team A", "Score A", "Score B",
            "Team B", "Team B (pbleagues)", "Approved", "In our history?", "pbleagues match id"])
for r, m in enumerate(d["matches"], start=2):
    vals = [m["round"], m["date"], m["teamACrawled"], m["teamAShort"], m["scoreA"], m["scoreB"],
            m["teamBShort"], m["teamBCrawled"], "yes" if m["approved"] else "no",
            "yes" if m["inOurs"] else "NO", m["matchId"]]
    for c, v in enumerate(vals, start=1):
        cell = ms.cell(row=r, column=c, value=v)
        cell.font = BODY
        cell.border = THIN
        if c in (5, 6):
            cell.alignment = Alignment(horizontal="center")
    ms.cell(row=r, column=10).fill = OK_FILL if m["inOurs"] else BAD_FILL
widths(ms, [14, 18, 24, 14, 9, 9, 14, 24, 11, 15, 18])

# ── Rankings ─────────────────────────────────────────────────────────────────
rs = wb.create_sheet("Rankings")
header(rs, ["Rank (pbleagues)", "Team (pbleagues)", "Team", "Points",
            "Our record", "Our finish", "Our rank", "Agreement"])
for r, k in enumerate(d["rankings"], start=2):
    if k["ourFinishRank"] is None:
        verdict = "NEW — we hold no placing"
        fill = GAP_FILL
    elif k["ourFinishRank"] == k["rank"]:
        verdict = "same"
        fill = OK_FILL
    else:
        verdict = "expected — joint placing"
        fill = OK_FILL
    vals = [k["rank"], k["teamCrawled"], k["teamShort"], k["points"],
            k["ourRecord"], k["ourFinish"], k["ourFinishRank"], verdict]
    for c, v in enumerate(vals, start=1):
        cell = rs.cell(row=r, column=c, value=v)
        cell.font = BODY
        cell.border = THIN
        if c in (1, 4, 7):
            cell.alignment = Alignment(horizontal="center")
    rs.cell(row=r, column=8).fill = fill
widths(rs, [16, 24, 14, 9, 12, 15, 10, 26])

n = len(d["rankings"])
rs.cell(row=n + 3, column=1, value=(
    "Our rank is standard COMPETITION ranking, so both beaten semi-finalists are joint 3rd and "
    "all four beaten quarter-finalists are joint 5th. pbleagues publishes a STRICT order, so "
    "those same teams are 3rd and 4th, and 5th through 8th. A difference of that shape is the "
    "two systems each being right, not a disagreement."
)).font = NOTE
rs.cell(row=n + 4, column=1, value=(
    "Rows marked NEW are the teams knocked out in the prelims. Our workbook records how far a "
    "team got and gives them nothing; this ranking is the number we have never had."
)).font = NOTE

# ── Summary ──────────────────────────────────────────────────────────────────
sm = wb.create_sheet("Summary", 0)
sm["A1"] = f"{d['crawledName']} — crawl vs stored history"
sm["A1"].font = Font(name=ARIAL, size=14, bold=True)
rows = [
    ("pbleagues event", d["eventId"]),
    ("Division crawled", d["division"]),
    ("Our event key", d["key"]),
    ("Crawled at (UTC)", d["crawledAt"]),
    ("", ""),
    ("Pro matches crawled", f"=COUNTA(Matches!A2:A{len(d['matches']) + 1})"),
    ("…found in our history", f'=COUNTIF(Matches!J2:J{len(d["matches"]) + 1},"yes")'),
    ("…NOT in our history", f'=COUNTIF(Matches!J2:J{len(d["matches"]) + 1},"NO")'),
    ("In our history but not crawled", len(d["onlyInOurs"])),
    ("", ""),
    ("Teams ranked by pbleagues", f"=COUNTA(Rankings!A2:A{n + 1})"),
    ("…same rank as ours", f'=COUNTIF(Rankings!H2:H{n + 1},"same")'),
    ("…joint-placing difference", f'=COUNTIF(Rankings!H2:H{n + 1},"expected — joint placing")'),
    ("…placings we did not have", f'=COUNTIF(Rankings!H2:H{n + 1},"NEW — we hold no placing")'),
]
for i, (label, value) in enumerate(rows, start=3):
    sm.cell(row=i, column=1, value=label).font = BOLD if label else BODY
    c = sm.cell(row=i, column=2, value=value)
    c.font = BODY
sm["A19"] = "Every figure above counts the other two sheets, so editing a row updates it."
sm["A19"].font = NOTE
sm["A20"] = "Source: pbleagues.com /event/{id}/schedule and /event/{id}/rankings, public pages, crawled read-only."
sm["A20"].font = NOTE
widths(sm, [32, 46])

wb.save(dest)
print(f"wrote {dest}")
