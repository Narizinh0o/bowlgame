"""Снапшот игроков КЛБ из данных сайта bowlrus -> public/data/roster.json.

Запуск:  python scripts/build_roster.py [путь к репо bowlrus]
По умолчанию ищет соседнюю папку ../bowlrus. Сайт и его данные НЕ трогает (только чтение).

Поля на игрока: id, name, gender (М/Ж/U), hand (R/L), club (последний, по max seq),
avg (Σss/Σg, с гандикапом — формула сайта), games (Σg).
Весь геймбаланс (рейтинги, коэффициенты) считается в движке игры, не здесь.
"""

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BOWLRUS = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE.parent.parent / "bowlrus"
DATA = BOWLRUS / "frontend" / "public" / "data" / "klb"
OUT = HERE.parent / "public" / "data" / "roster.json"


def load(name: str):
    with open(DATA / name, encoding="utf-8") as f:
        return json.load(f)


def main():
    lookup = load("players_lookup.json")          # {pid: {name, gender, hand}}
    facts = load("player_facts.json")             # [{pid, tid, season, st, g, ss, club, ...}]
    tournaments = load("tournaments.json")        # {tid: {name, year, season, seq, ...}}

    tseq = {int(tid): t["seq"] for tid, t in tournaments.items()}

    agg = {}  # pid -> {g, ss, club, club_seq}
    for f in facts:
        pid = f["pid"]
        a = agg.setdefault(pid, {"g": 0, "ss": 0, "club": None, "club_seq": -1})
        a["g"] += f["g"]
        a["ss"] += f["ss"]
        seq = tseq.get(f["tid"], -1)
        if f.get("club") and seq >= a["club_seq"]:
            a["club"] = f["club"]
            a["club_seq"] = seq

    roster = []
    for pid, a in agg.items():
        info = lookup.get(str(pid))
        if not info or a["g"] == 0:
            continue
        roster.append({
            "id": pid,
            "name": info["name"],
            "gender": info.get("gender") or "U",
            "hand": info.get("hand") or "R",
            "club": a["club"] or "—",
            "avg": round(a["ss"] / a["g"], 2),
            "games": a["g"],
        })

    roster.sort(key=lambda r: -r["avg"])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(roster, f, ensure_ascii=False, separators=(",", ":"))

    avgs = [r["avg"] for r in roster]
    games = [r["games"] for r in roster]
    n = len(roster)
    pct = lambda p: sorted(avgs)[min(n - 1, int(n * p / 100))]
    print(f"Игроков: {n}")
    print(f"avg: min={min(avgs)} p2={pct(2)} p25={pct(25)} p50={pct(50)} p75={pct(75)} p80={pct(80)} max={max(avgs)}")
    print(f"games: min={min(games)} p50={sorted(games)[n // 2]} max={max(games)}")
    print(f"мало игр (<10): {sum(1 for g in games if g < 10)} игроков")
    print(f"-> {OUT}")


if __name__ == "__main__":
    main()
