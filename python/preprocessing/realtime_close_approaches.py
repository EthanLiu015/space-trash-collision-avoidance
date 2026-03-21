"""
Real-time close approach detection using SGP4 propagation and spatial indexing.
Uses scipy's cKDTree for O(n log n) screening instead of O(n²) pairwise comparison.
Threshold: 5 km (configurable).
"""

import csv
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Paths - use absolute path so we always write to the correct file
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
OUTPUT_DIR = PROJECT_DIR / "processed_data"
# Use distinct filename to avoid conflict with any other process writing 50km data
OUTPUT_FILE = OUTPUT_DIR / "close_approaches_5km.json"
sys.path.insert(0, str(SCRIPT_DIR))

from convert_sgp4 import (
    COMBINED_CSV,
    load_and_propagate,
)

try:
    from scipy.spatial import cKDTree
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False

# Fixed threshold for close approach screening (km)
THRESHOLD_KM = 5.0
# Minimum distance: exclude pairs at or below this (e.g. docked/combined objects)
MIN_DISTANCE_KM = 0.01
# Minimum relative velocity (km/s): exclude formation-flying pairs (low v_rel = intentional proximity)
MIN_RELATIVE_VELOCITY_KM_S = 0.3  # Formation flyers typically < 0.1 km/s; true close approaches >> 0.5 km/s


def find_close_approaches_optimized(
    records: list[dict],
    threshold_km: float = THRESHOLD_KM,
) -> list[dict]:
    """
    Find pairs within threshold_km using spatial indexing (cKDTree).
    Complexity: O(n log n) build + O(n * k) query, where k = avg neighbors in radius.
    For sparse LEO, k << n, so effectively O(n log n) vs O(n²) brute force.
    """
    if not records:
        return []

    if not HAS_SCIPY:
        raise ImportError("scipy is required for optimized screening. Install with: pip install scipy")

    n = len(records)
    points = [(r["x_km"], r["y_km"], r["z_km"]) for r in records]

    tree = cKDTree(points)

    # Batch query: for each point, find all points within threshold
    # query_ball_point with array returns list of lists
    neighbor_lists = tree.query_ball_point(points, r=threshold_km)

    close_pairs = []
    seen = set()

    for i, neighbors in enumerate(neighbor_lists):
        ri = records[i]
        for j in neighbors:
            if j <= i:
                continue  # Avoid duplicates: only count (i, j) with j > i
            pair_key = (i, j)
            if pair_key in seen:
                continue
            seen.add(pair_key)

            rj = records[j]
            dx = ri["x_km"] - rj["x_km"]
            dy = ri["y_km"] - rj["y_km"]
            dz = ri["z_km"] - rj["z_km"]
            dist = (dx * dx + dy * dy + dz * dz) ** 0.5

            # Exclude formation-flying pairs (low relative velocity = intentional proximity)
            dvx = ri["vx_kms"] - rj["vx_kms"]
            dvy = ri["vy_kms"] - rj["vy_kms"]
            dvz = ri["vz_kms"] - rj["vz_kms"]
            v_rel = (dvx * dvx + dvy * dvy + dvz * dvz) ** 0.5

            if MIN_DISTANCE_KM < dist <= threshold_km and v_rel >= MIN_RELATIVE_VELOCITY_KM_S:
                close_pairs.append({
                    "object_a": ri["object_name"],
                    "norad_a": ri["norad_id"],
                    "object_b": rj["object_name"],
                    "norad_b": rj["norad_id"],
                    "distance_km": round(dist, 4),
                    "relative_velocity_km_s": round(v_rel, 4),
                    "epoch_utc": ri["epoch_utc"],
                })

    return close_pairs


def run_screen(limit: int | None, output_path: Path) -> int:
    """Propagate to now, run screening, write results. Returns count of close pairs."""
    ref_time = datetime.now(timezone.utc)
    records = load_and_propagate(COMBINED_CSV, ref_time=ref_time, limit=limit)
    close = find_close_approaches_optimized(records, threshold_km=THRESHOLD_KM)

    # Strict filter: 0.01 km < distance <= 5 km (exclude docked/combined objects)
    close_filtered = [p for p in close if MIN_DISTANCE_KM < p["distance_km"] <= 5.0]

    out_path = Path(output_path).resolve()  # Ensure absolute path
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({
            "threshold_km": 5.0,
            "min_distance_km": MIN_DISTANCE_KM,
            "min_relative_velocity_km_s": MIN_RELATIVE_VELOCITY_KM_S,
            "epoch_utc": ref_time.isoformat(),
            "objects_screened": len(records),
            "close_pairs": len(close_filtered),
            "pairs": close_filtered,
        }, f, indent=2)

    return len(close_filtered)


def main():
    import argparse
    parser = argparse.ArgumentParser(
        description="Real-time close approach detection (optimized with spatial indexing)"
    )
    parser.add_argument("--limit", type=int, default=None,
                        help="Limit objects for testing")
    parser.add_argument("--interval", type=float, default=2,
                        help="Run continuously, re-screen every N seconds (default: 2, use 0 to run once)")
    parser.add_argument("--output", "-o", type=Path,
                        default=OUTPUT_FILE,
                        help="Output JSON path (default: close_approaches_5km.json)")
    args = parser.parse_args()

    if not COMBINED_CSV.exists():
        raise FileNotFoundError(f"Run combine_csvs.py first. Missing: {COMBINED_CSV}")

    if not HAS_SCIPY:
        print("scipy is required for optimized screening. Install with: pip install scipy")
        sys.exit(1)

    if args.interval > 0:  # 0 = run once
        print(f"Running real-time screening every {args.interval}s (Ctrl+C to stop)")
        print(f"Threshold: {THRESHOLD_KM} km")
        while True:
            start = time.perf_counter()
            count = run_screen(args.limit, args.output)
            elapsed = time.perf_counter() - start
            ref = datetime.now(timezone.utc).strftime("%H:%M:%S UTC")
            print(f"[{ref}] {count} pairs within {THRESHOLD_KM} km | {elapsed:.2f}s | -> {args.output}")
            time.sleep(args.interval)
    else:
        start = time.perf_counter()
        count = run_screen(args.limit, args.output)
        elapsed = time.perf_counter() - start
        out_path = Path(args.output).resolve()
        print(f"Found {count} pairs within {THRESHOLD_KM} km in {elapsed:.2f}s")
        print(f"Written to {out_path}")


if __name__ == "__main__":
    main()
