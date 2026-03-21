"""
Download real orbital data from CelesTrak (NORAD/18th Space Defense Squadron).

Fetches OMM CSV format for:
  - active_satellites.csv: Active payloads (GROUP=active)
  - decaying.csv: Last 30 days' launches (GROUP=last-30-days)
  - debris.csv: Merged debris from major fragmentation events
    (iridium-33, cosmos-2251, fengyun-1c, cosmos-1408)

Requires: requests (pip install requests)
"""

import csv
import io
import sys
from pathlib import Path

try:
    import requests
except ImportError:
    print("Install requests: pip install requests")
    sys.exit(1)

SCRIPT_DIR = Path(__file__).resolve().parent
RAW_DIR = SCRIPT_DIR.parent / "raw_data"
BASE_URL = "https://celestrak.org/NORAD/elements/gp.php"

SOURCES = [
    ("active", "active_satellites.csv"),
    ("last-30-days", "decaying.csv"),
]

# CelesTrak debris groups (major fragmentation events)
DEBRIS_GROUPS = [
    "iridium-33-debris",
    "cosmos-2251-debris",
    "fengyun-1c-debris",
    "cosmos-1408-debris",
]


def fetch_csv(group: str) -> str:
    """Fetch CSV from CelesTrak."""
    url = f"{BASE_URL}?GROUP={group}&FORMAT=csv"
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    return r.text


def merge_csvs(texts: list[str], output_path: Path) -> int:
    """Merge multiple CSV payloads, deduplicating by NORAD_CAT_ID."""
    all_rows = []
    seen_norad = set()
    fieldnames = None

    for text in texts:
        reader = csv.DictReader(io.StringIO(text))
        if fieldnames is None:
            fieldnames = list(reader.fieldnames)
        for row in reader:
            norad = row.get("NORAD_CAT_ID", "").strip()
            if norad and norad not in seen_norad:
                seen_norad.add(norad)
                all_rows.append(row)

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_rows)
    return len(all_rows)


def main():
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    for group, filename in SOURCES:
        print(f"Fetching {group}...")
        text = fetch_csv(group)
        path = RAW_DIR / filename
        rows = merge_csvs([text], path)
        print(f"  -> {path.name}: {rows:,} objects")

    print("Fetching debris (merging debris groups)...")
    texts = []
    for group in DEBRIS_GROUPS:
        try:
            texts.append(fetch_csv(group))
        except Exception as e:
            print(f"  Warning: {group}: {e}")

    if texts:
        rows = merge_csvs(texts, RAW_DIR / "debris.csv")
        print(f"  -> debris.csv: {rows:,} objects")
    else:
        print("  -> No debris data fetched")

    print("\nDone. Run combine_csvs.py and convert_sgp4.py to rebuild.")


if __name__ == "__main__":
    main()
