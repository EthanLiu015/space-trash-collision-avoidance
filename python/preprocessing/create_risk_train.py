"""
Create a small training dataset from train_data.csv with only features we can
compute from our collision pipeline. Run once, then train_data.csv can be deleted.

Usage:
  python preprocessing/create_risk_train.py
  # Output: processed_data/risk_train_clean.csv (~13 columns, ~162k rows)
  # Then: python -m ml.risk_model --train
  # Then: delete python/raw_data/train_data.csv
"""

import csv
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PYTHON_DIR = SCRIPT_DIR.parent
RAW_DIR = PYTHON_DIR / "raw_data"
PROCESSED_DIR = PYTHON_DIR / "processed_data"

INPUT_CSV = RAW_DIR / "train_data.csv"
OUTPUT_CSV = PROCESSED_DIR / "risk_train_clean.csv"

# Must match ml/risk_model.FEATURES and collision pipeline capabilities
FEATURES = [
    "miss_distance",
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
    missing = [c for c in KEPT if c not in header]
    if missing:
        print(f"Error: columns not found in {INPUT_CSV}: {missing}")
        sys.exit(1)

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    kept_idx = [header.index(c) for c in KEPT]
    rows_written = 0
    rows_skipped = 0

    with open(INPUT_CSV, newline="", encoding="utf-8") as fin:
        reader = csv.reader(fin)
        next(reader)  # skip header
        with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as fout:
            writer = csv.writer(fout)
            writer.writerow(KEPT)
            for row in reader:
                if len(row) <= max(kept_idx):
                    rows_skipped += 1
                    continue
                try:
                    out = [row[i] for i in kept_idx]
                    # Validate numeric
                    float(out[0])  # risk
                    for v in out[1:]:
                        if v == "" or v is None:
                            raise ValueError("empty")
                        float(v)
                    writer.writerow(out)
                    rows_written += 1
                except (ValueError, IndexError):
                    rows_skipped += 1

    print(f"Wrote {OUTPUT_CSV}")
    print(f"  Rows: {rows_written}, skipped: {rows_skipped}")
    print(f"  Columns: {KEPT}")
    print("Next: python -m ml.risk_model --train")
    print("Then: you can delete python/raw_data/train_data.csv")


if __name__ == "__main__":
    main()
