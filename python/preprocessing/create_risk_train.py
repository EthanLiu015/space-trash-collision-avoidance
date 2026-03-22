"""
Create a small training dataset from train_data.csv with only features we can
compute from our collision pipeline. Run once, then train_data.csv can be deleted.

Usage:
  python preprocessing/create_risk_train.py
  # Output: processed_data/risk_train_clean.csv
  # Then: python -m ml.risk_model --train
  # Then: delete python/raw_data/train_data.csv

Derived distance features (log_miss_distance, inv_miss_distance) encode the
physical relationship: closer approach → higher collision probability.
"""

import csv
import math
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PYTHON_DIR = SCRIPT_DIR.parent
RAW_DIR = PYTHON_DIR / "raw_data"
PROCESSED_DIR = PYTHON_DIR / "processed_data"

INPUT_CSV = RAW_DIR / "train_data.csv"
OUTPUT_CSV = PROCESSED_DIR / "risk_train_clean.csv"

# Base columns from train_data.csv (must exist)
BASE_COLS = [
    "risk", "miss_distance", "relative_speed",
    "t_j2k_sma", "t_j2k_ecc", "t_j2k_inc",
    "c_j2k_sma", "c_j2k_ecc", "c_j2k_inc",
    "t_h_apo", "t_h_per", "c_h_apo", "c_h_per",
]
# Must match ml/risk_model.FEATURES (includes derived distance features)
FEATURES = [
    "miss_distance",
    "log_miss_distance",   # ln(d_m); higher when farther
    "inv_miss_distance",   # 1000/d_m = 1/d_km; higher when closer
    "relative_speed",
    "t_j2k_sma", "t_j2k_ecc", "t_j2k_inc",
    "c_j2k_sma", "c_j2k_ecc", "c_j2k_inc",
    "t_h_apo", "t_h_per", "c_h_apo", "c_h_per",
]
TARGET = "risk"
KEPT = [TARGET] + FEATURES


def main():
    if not INPUT_CSV.exists():
        print(f"Error: {INPUT_CSV} not found. Place train_data.csv there first.")
        sys.exit(1)

    with open(INPUT_CSV, encoding="utf-8") as f:
        header = next(csv.reader(f))
    missing = [c for c in BASE_COLS if c not in header]
    if missing:
        print(f"Error: columns not found in {INPUT_CSV}: {missing}")
        sys.exit(1)

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    base_idx = {c: header.index(c) for c in BASE_COLS}
    rows_written = 0
    rows_skipped = 0

    with open(INPUT_CSV, newline="", encoding="utf-8") as fin:
        reader = csv.reader(fin)
        next(reader)  # skip header
        with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as fout:
            writer = csv.writer(fout)
            writer.writerow(KEPT)
            for row in reader:
                if len(row) <= max(base_idx.values()):
                    rows_skipped += 1
                    continue
                try:
                    risk = float(row[base_idx["risk"]])
                    miss_m = float(row[base_idx["miss_distance"]])
                    if miss_m <= 0:
                        rows_skipped += 1
                        continue
                    # Derived features: encode closer → higher probability
                    log_miss = math.log(miss_m)
                    inv_miss = 1000.0 / miss_m  # 1/d_km scale
                    out = [
                        risk,
                        miss_m,
                        log_miss,
                        inv_miss,
                        float(row[base_idx["relative_speed"]]),
                        float(row[base_idx["t_j2k_sma"]]),
                        float(row[base_idx["t_j2k_ecc"]]),
                        float(row[base_idx["t_j2k_inc"]]),
                        float(row[base_idx["c_j2k_sma"]]),
                        float(row[base_idx["c_j2k_ecc"]]),
                        float(row[base_idx["c_j2k_inc"]]),
                        float(row[base_idx["t_h_apo"]]),
                        float(row[base_idx["t_h_per"]]),
                        float(row[base_idx["c_h_apo"]]),
                        float(row[base_idx["c_h_per"]]),
                    ]
                    writer.writerow(out)
                    rows_written += 1
                except (ValueError, IndexError, ZeroDivisionError):
                    rows_skipped += 1

    print(f"Wrote {OUTPUT_CSV}")
    print(f"  Rows: {rows_written}, skipped: {rows_skipped}")
    print(f"  Columns: {KEPT}")
    print("Next: python -m ml.risk_model --train")
    print("Then: you can delete python/raw_data/train_data.csv")


if __name__ == "__main__":
    main()
