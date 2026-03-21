"""
Data cleaning script for space trash collision avoidance project.

Cleans raw TLE-derived CSV data files:
- active_satellites.csv
- debris.csv
- decaying.csv

Cleaning steps:
1. Normalize leading-dot floats (e.g. .0024 -> 0.0024)
2. Normalize TLE scientific notation (e.g. .598E-5 -> 5.98e-6)
3. Strip whitespace from string fields
4. Fill missing OBJECT_ID with NORAD_CAT_ID (prefixed with 'NORAD-')
5. Drop constant columns: EPHEMERIS_TYPE, CLASSIFICATION_TYPE
6. Output to python/cleaned_data/
"""

import csv
import os

RAW_DIR = os.path.join(os.path.dirname(__file__), "raw_data")
CLEAN_DIR = os.path.join(os.path.dirname(__file__), "cleaned_data")

# Columns that contain TLE-style numeric strings
LEADING_DOT_COLS = {"ECCENTRICITY"}
TLE_SCIENTIFIC_COLS = {"BSTAR", "MEAN_MOTION_DOT", "MEAN_MOTION_DDOT"}
NUMERIC_COLS = {
    "MEAN_MOTION", "ECCENTRICITY", "INCLINATION", "RA_OF_ASC_NODE",
    "ARG_OF_PERICENTER", "MEAN_ANOMALY", "BSTAR", "MEAN_MOTION_DOT",
    "MEAN_MOTION_DDOT", "NORAD_CAT_ID", "ELEMENT_SET_NO", "REV_AT_EPOCH",
}

# Columns that are constant across all rows in all files — drop them
DROP_COLS = {"EPHEMERIS_TYPE", "CLASSIFICATION_TYPE"}

STRING_COLS = {"OBJECT_NAME", "OBJECT_ID", "EPOCH"}


def parse_tle_float(value: str) -> float:
    """Parse a TLE-style numeric string to a Python float.

    TLE format uses leading-dot notation and E-notation without a leading digit:
      .60048683E-3  ->  6.0048683e-4
      -.43731952E-3 -> -4.3731952e-4
      .598E-5       ->  5.98e-6
      0             ->  0.0
    """
    value = value.strip()
    if not value or value == "0":
        return 0.0

    # Handle sign
    sign = 1
    if value.startswith("-"):
        sign = -1
        value = value[1:]
    elif value.startswith("+"):
        value = value[1:]

    # Add leading zero for leading-dot notation
    if value.startswith("."):
        value = "0" + value

    return sign * float(value)


def clean_row(row: dict) -> dict:
    cleaned = {}
    for col, val in row.items():
        if col in DROP_COLS:
            continue

        val = val.strip()

        if col in STRING_COLS:
            cleaned[col] = val

        elif col in TLE_SCIENTIFIC_COLS or col in LEADING_DOT_COLS:
            cleaned[col] = parse_tle_float(val)

        elif col in NUMERIC_COLS:
            try:
                cleaned[col] = float(val)
            except ValueError:
                cleaned[col] = val  # keep as-is if unparseable

        else:
            cleaned[col] = val

    return cleaned


def clean_file(filename: str) -> tuple[int, int]:
    """Clean a single CSV file. Returns (total_rows, fixed_rows)."""
    in_path = os.path.join(RAW_DIR, filename)
    out_path = os.path.join(CLEAN_DIR, filename)
    fixed = 0

    with open(in_path, newline="") as f:
        reader = csv.DictReader(f)
        raw_rows = list(reader)

    out_cols = [c for c in reader.fieldnames if c not in DROP_COLS]
    cleaned_rows = []

    for raw in raw_rows:
        row = clean_row(raw)

        # Fill missing OBJECT_ID
        if not row.get("OBJECT_ID", "").strip():
            norad = str(int(row["NORAD_CAT_ID"])) if row.get("NORAD_CAT_ID") else "UNKNOWN"
            row["OBJECT_ID"] = f"NORAD-{norad}"
            fixed += 1

        cleaned_rows.append(row)

    with open(out_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=out_cols)
        writer.writeheader()
        writer.writerows(cleaned_rows)

    return len(cleaned_rows), fixed


def main():
    os.makedirs(CLEAN_DIR, exist_ok=True)

    files = ["active_satellites.csv", "debris.csv", "decaying.csv"]
    print(f"Cleaning {len(files)} files from {RAW_DIR}/")
    print(f"Output directory: {CLEAN_DIR}/\n")

    total_rows = 0
    for filename in files:
        rows, fixed = clean_file(filename)
        total_rows += rows
        status = f"  {rows} rows written"
        if fixed:
            status += f", {fixed} row(s) with missing OBJECT_ID filled"
        print(f"{filename}: {status}")

    print(f"\nDone. {total_rows} total rows cleaned.")
    print(f"Dropped constant columns: {sorted(DROP_COLS)}")


if __name__ == "__main__":
    main()
