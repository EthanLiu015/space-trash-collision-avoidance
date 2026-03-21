"""
Space Debris Collision Avoidance — FastAPI backend

Endpoints:
  GET /satellites/active          All objects (pre-computed ephemeris)
  GET /satellites/propagate       Re-propagate all objects to current UTC time
  GET /satellites/{norad_id}      Single object detail by NORAD ID
  GET /collisions/alerts          Close-approach pairs with collision probability
"""

import csv
import json
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
FASTAPI_DIR = Path(__file__).resolve().parent
PYTHON_DIR = FASTAPI_DIR.parent
PREPROCESSING_DIR = PYTHON_DIR / "preprocessing"
PROCESSED_DIR = PYTHON_DIR / "processed_data"

EPHEMERIS_CSV = PROCESSED_DIR / "sgp4_ephemeris.csv"
CLOSE_APPROACHES_JSON = PROCESSED_DIR / "close_approaches.json"
COMBINED_CSV = PROCESSED_DIR / "combined_satellites.csv"

# Add preprocessing dir to path so we can import convert_sgp4
sys.path.insert(0, str(PREPROCESSING_DIR))
from convert_sgp4 import load_and_propagate, find_close_approaches  # noqa: E402

# ---------------------------------------------------------------------------
# Startup cache
# ---------------------------------------------------------------------------
_cache: dict = {}


def _load_ephemeris_csv() -> list[dict]:
    records = []
    with open(EPHEMERIS_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            records.append({
                "norad_id": int(row["norad_id"]),
                "object_name": row["object_name"],
                "object_type": row["object_type"],
                "epoch_utc": row["epoch_utc"],
                "x_km": float(row["x_km"]),
                "y_km": float(row["y_km"]),
                "z_km": float(row["z_km"]),
                "vx_kms": float(row["vx_kms"]),
                "vy_kms": float(row["vy_kms"]),
                "vz_kms": float(row["vz_kms"]),
                "altitude_km": float(row["altitude_km"]),
            })
    return records


def _load_close_approaches() -> dict:
    with open(CLOSE_APPROACHES_JSON, encoding="utf-8") as f:
        data = json.load(f)
    # Attach a simple collision probability to each pair
    threshold = data.get("threshold_km", 5.0)
    for pair in data.get("pairs", []):
        d = pair["distance_km"]
        # Exponential decay: P=1 at 0 km, falls to ~0 near threshold
        # characteristic scale = threshold / 5 so P(threshold) ≈ 0.007
        scale = max(threshold / 5.0, 0.1)
        pair["collision_probability"] = round(
            __import__("math").exp(-d / scale), 6
        )
    return data


@asynccontextmanager
async def lifespan(app: FastAPI):
    _cache["ephemeris"] = _load_ephemeris_csv()
    _cache["ephemeris_by_norad"] = {r["norad_id"]: r for r in _cache["ephemeris"]}
    _cache["close_approaches"] = _load_close_approaches()
    yield
    _cache.clear()


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Space Debris Collision Avoidance API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Routes — order matters: /satellites/propagate before /satellites/{norad_id}
# ---------------------------------------------------------------------------

@app.get("/satellites/propagate")
def propagate_satellites(
    threshold_km: float = Query(default=5.0, ge=0.1, le=100.0),
):
    """
    Re-propagate all objects to the current UTC time using SGP4.
    Also runs close-approach screening at the new epoch.
    This is slower than /satellites/active (reads combined CSV + runs SGP4).
    """
    if not COMBINED_CSV.exists():
        raise HTTPException(status_code=503, detail="combined_satellites.csv not found")

    now = datetime.now(timezone.utc)
    records = load_and_propagate(COMBINED_CSV, ref_time=now)
    pairs = find_close_approaches(records, threshold_km=threshold_km)

    import math
    scale = max(threshold_km / 5.0, 0.1)
    for pair in pairs:
        pair["collision_probability"] = round(math.exp(-pair["distance_km"] / scale), 6)

    return {
        "epoch_utc": now.isoformat(),
        "object_count": len(records),
        "objects": records,
        "close_approaches": {
            "threshold_km": threshold_km,
            "pair_count": len(pairs),
            "pairs": pairs,
        },
    }


@app.get("/satellites/active")
def get_active_satellites(
    object_type: Optional[str] = Query(default=None, description="Filter by type: Active, Debris, Decaying"),
    min_altitude_km: Optional[float] = Query(default=None),
    max_altitude_km: Optional[float] = Query(default=None),
):
    """Return all objects from the pre-computed ephemeris snapshot."""
    records = _cache.get("ephemeris", [])

    if object_type:
        ot = object_type.lower()
        records = [r for r in records if r["object_type"].lower() == ot]
    if min_altitude_km is not None:
        records = [r for r in records if r["altitude_km"] >= min_altitude_km]
    if max_altitude_km is not None:
        records = [r for r in records if r["altitude_km"] <= max_altitude_km]

    return {
        "epoch_utc": records[0]["epoch_utc"] if records else None,
        "object_count": len(records),
        "objects": records,
    }


@app.get("/satellites/{norad_id}")
def get_satellite(norad_id: int):
    """Return a single satellite's ephemeris by NORAD catalog ID."""
    record = _cache.get("ephemeris_by_norad", {}).get(norad_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"NORAD ID {norad_id} not found")
    return record


@app.get("/collisions/alerts")
def get_collision_alerts(
    min_probability: float = Query(default=0.0, ge=0.0, le=1.0),
    max_distance_km: Optional[float] = Query(default=None),
):
    """Return close-approach pairs from the pre-computed screening run."""
    data = _cache.get("close_approaches", {})
    pairs = data.get("pairs", [])

    if min_probability > 0:
        pairs = [p for p in pairs if p["collision_probability"] >= min_probability]
    if max_distance_km is not None:
        pairs = [p for p in pairs if p["distance_km"] <= max_distance_km]

    return {
        "threshold_km": data.get("threshold_km"),
        "epoch_utc": data.get("epoch_utc"),
        "pair_count": len(pairs),
        "pairs": pairs,
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "ephemeris_loaded": len(_cache.get("ephemeris", [])),
        "close_approaches_loaded": len(_cache.get("close_approaches", {}).get("pairs", [])),
    }
