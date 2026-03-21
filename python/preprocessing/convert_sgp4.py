"""
Convert raw OMM orbital data to propagated position/velocity ephemeris using SGP4.
Outputs data suitable for collision detection: ECI position (km) and velocity (km/s).
"""

import csv
import json
from datetime import datetime, timezone
from pathlib import Path

from sgp4 import omm
from sgp4.api import Satrec, jday

# Paths
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
COMBINED_CSV = PROJECT_DIR / "processed_data" / "combined_satellites.csv"
OUTPUT_DIR = PROJECT_DIR / "processed_data"
R_EARTH_KM = 6371.0

# OMM fields required by sgp4 (exclude OBJECT_TYPE - our custom column)
OMM_FIELDS = [
    "OBJECT_NAME", "OBJECT_ID", "EPOCH", "MEAN_MOTION", "ECCENTRICITY",
    "INCLINATION", "RA_OF_ASC_NODE", "ARG_OF_PERICENTER", "MEAN_ANOMALY",
    "EPHEMERIS_TYPE", "CLASSIFICATION_TYPE", "NORAD_CAT_ID", "ELEMENT_SET_NO",
    "REV_AT_EPOCH", "BSTAR", "MEAN_MOTION_DOT", "MEAN_MOTION_DDOT",
]


def parse_epoch(epoch_str: str) -> datetime:
    """Parse OMM epoch string (ISO format) to datetime."""
    # Handle optional microseconds
    s = epoch_str.strip()
    if "T" in s:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    else:
        dt = datetime.strptime(s[:19], "%Y-%m-%d %H:%M:%S")
        if len(s) > 19:
            dt = dt.replace(tzinfo=timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def row_to_omm_fields(row: dict) -> dict:
    """Build OMM fields dict from CSV row, with type conversions."""
    fields = {}
    for key in OMM_FIELDS:
        if key not in row:
            continue
        val = row[key]
        if key in ("MEAN_MOTION", "ECCENTRICITY", "INCLINATION", "RA_OF_ASC_NODE",
                   "ARG_OF_PERICENTER", "MEAN_ANOMALY", "BSTAR", "MEAN_MOTION_DOT", "MEAN_MOTION_DDOT"):
            try:
                fields[key] = float(val) if val not in ("", " ") else 0.0
            except (ValueError, TypeError):
                fields[key] = 0.0
        elif key in ("EPHEMERIS_TYPE", "ELEMENT_SET_NO", "REV_AT_EPOCH", "NORAD_CAT_ID"):
            try:
                fields[key] = int(float(val)) if val not in ("", " ") else 0
            except (ValueError, TypeError):
                fields[key] = 0
        else:
            fields[key] = str(val).strip()
    return fields


def create_satrec(row: dict):
    """Create and initialize a Satrec from a CSV row."""
    fields = row_to_omm_fields(row)
    sat = Satrec()
    omm.initialize(sat, fields)
    return sat


def propagate(sat: Satrec, dt: datetime) -> tuple[list[float], list[float]] | None:
    """
    Propagate satellite to given UTC time.
    Returns (position_km, velocity_kms) or None if propagation fails.
    """
    jd, fr = jday(dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second + dt.microsecond / 1e6)
    err, r, v = sat.sgp4(jd, fr)
    if err != 0:
        return None
    return (list(r), list(v))


def altitude_km(r: list[float]) -> float:
    """Compute altitude (km) from ECI position."""
    return (r[0]**2 + r[1]**2 + r[2]**2)**0.5 - R_EARTH_KM


def load_and_propagate(
    csv_path: Path,
    ref_time: datetime | None = None,
    limit: int | None = None,
) -> list[dict]:
    """
    Load combined CSV, propagate each object to ref_time, return list of ephemeris records.
    """
    if ref_time is None:
        ref_time = datetime.now(timezone.utc)

    records = []
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            if limit is not None and i >= limit:
                break
            try:
                sat = create_satrec(row)
            except Exception:
                continue
            result = propagate(sat, ref_time)
            if result is None:
                continue
            r, v = result
            obj_type = row.get("OBJECT_TYPE", "unknown")
            records.append({
                "norad_id": int(row.get("NORAD_CAT_ID", 0)),
                "object_name": row.get("OBJECT_NAME", "").strip(),
                "object_type": obj_type,
                "epoch_utc": ref_time.isoformat(),
                "x_km": round(r[0], 6),
                "y_km": round(r[1], 6),
                "z_km": round(r[2], 6),
                "vx_kms": round(v[0], 8),
                "vy_kms": round(v[1], 8),
                "vz_kms": round(v[2], 8),
                "altitude_km": round(altitude_km(r), 2),
            })
    return records


def find_close_approaches(
    records: list[dict],
    threshold_km: float = 5.0,
) -> list[dict]:
    """
    Find pairs of objects within threshold_km at the reference epoch.
    O(n²) - use for screening at a single epoch; for full conjunction analysis
    propagate over a time window and screen at each step.
    """
    close_pairs = []
    n = len(records)
    for i in range(n):
        ri = records[i]
        xi, yi, zi = ri["x_km"], ri["y_km"], ri["z_km"]
        for j in range(i + 1, n):
            rj = records[j]
            dx = xi - rj["x_km"]
            dy = yi - rj["y_km"]
            dz = zi - rj["z_km"]
            dist = (dx*dx + dy*dy + dz*dz) ** 0.5
            if dist <= threshold_km:
                close_pairs.append({
                    "object_a": ri["object_name"],
                    "norad_a": ri["norad_id"],
                    "object_b": rj["object_name"],
                    "norad_b": rj["norad_id"],
                    "distance_km": round(dist, 4),
                    "epoch_utc": ri["epoch_utc"],
                })
    return close_pairs


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Convert OMM CSV to SGP4 ephemeris for collision detection")
    parser.add_argument("--input", type=Path, default=COMBINED_CSV, help="Input combined CSV path")
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR, help="Output directory")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of objects (for testing)")
    parser.add_argument("--ref-time", type=str, default=None,
                        help="Reference time (ISO format, UTC). Default: now")
    parser.add_argument("--screen", action="store_true", help="Run collision screening at reference epoch")
    parser.add_argument("--threshold-km", type=float, default=5.0, help="Distance threshold for screening (km)")
    parser.add_argument("--format", choices=["csv", "json"], default="csv", help="Output format")
    args = parser.parse_args()

    if not args.input.exists():
        raise FileNotFoundError(f"Input file not found: {args.input}. Run combine_csvs.py first.")

    ref_time = datetime.now(timezone.utc)
    if args.ref_time:
        ref_time = datetime.fromisoformat(args.ref_time.replace("Z", "+00:00"))
        if ref_time.tzinfo is None:
            ref_time = ref_time.replace(tzinfo=timezone.utc)

    records = load_and_propagate(args.input, ref_time=ref_time, limit=args.limit)
    args.output_dir.mkdir(parents=True, exist_ok=True)

    # Write ephemeris
    ephem_path = args.output_dir / "sgp4_ephemeris"
    if args.format == "json":
        ephem_path = ephem_path.with_suffix(".json")
        with open(ephem_path, "w", encoding="utf-8") as f:
            json.dump({"epoch_utc": ref_time.isoformat(), "objects": records}, f, indent=2)
    else:
        ephem_path = ephem_path.with_suffix(".csv")
        fieldnames = ["norad_id", "object_name", "object_type", "epoch_utc",
                      "x_km", "y_km", "z_km", "vx_kms", "vy_kms", "vz_kms", "altitude_km"]
        with open(ephem_path, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames)
            w.writeheader()
            w.writerows(records)

    print(f"Propagated {len(records):,} objects to {ref_time.isoformat()}")
    print(f"Ephemeris written to {ephem_path}")

    if args.screen:
        close = find_close_approaches(records, threshold_km=args.threshold_km)
        screen_path = args.output_dir / "close_approaches.json"
        with open(screen_path, "w", encoding="utf-8") as f:
            json.dump({"threshold_km": args.threshold_km, "epoch_utc": ref_time.isoformat(), "pairs": close}, f, indent=2)
        print(f"Found {len(close)} pairs within {args.threshold_km} km -> {screen_path}")


if __name__ == "__main__":
    main()
