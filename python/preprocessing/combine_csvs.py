"""
Combine active_satellites, debris, and decaying CSVs into a single dataset
with an OBJECT_TYPE column indicating the source: "Active", "debris", or "decaying".
"""

import csv
from pathlib import Path

# Paths relative to this script
SCRIPT_DIR = Path(__file__).resolve().parent
RAW_DATA_DIR = SCRIPT_DIR.parent / "raw_data"
OUTPUT_DIR = SCRIPT_DIR.parent / "processed_data"

# Input files and their corresponding object type labels
SOURCES = [
    ("active_satellites.csv", "Active"),
    ("debris.csv", "debris"),
    ("decaying.csv", "decaying"),
]


def combine_csvs() -> tuple[list[str], list[dict]]:
    """Load all three CSVs, add OBJECT_TYPE, and combine into one list of dicts."""
    all_rows = []
    fieldnames = None

    for filename, object_type in SOURCES:
        filepath = RAW_DATA_DIR / filename
        if not filepath.exists():
            raise FileNotFoundError(f"Expected file not found: {filepath}")

        with open(filepath, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            if fieldnames is None:
                fieldnames = reader.fieldnames + ["OBJECT_TYPE"]
            for row in reader:
                row["OBJECT_TYPE"] = object_type
                all_rows.append(row)

    return fieldnames, all_rows


def main():
    fieldnames, rows = combine_csvs()

    # Create output directory if it doesn't exist
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / "combined_satellites.csv"

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    # Print summary
    counts = {}
    for row in rows:
        t = row["OBJECT_TYPE"]
        counts[t] = counts.get(t, 0) + 1

    print(f"Combined {len(rows):,} rows -> {output_path}")
    for obj_type, count in sorted(counts.items()):
        print(f"  {obj_type}: {count:,}")


if __name__ == "__main__":
    main()
