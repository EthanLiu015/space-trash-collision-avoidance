"""
Space Debris Collision Avoidance — FastAPI backend

Endpoints:
  GET /satellites/active          All objects (pre-computed ephemeris)
  GET /satellites/propagate       Re-propagate all objects to current UTC time
  GET /satellites/{norad_id}      Single object detail by NORAD ID
  GET /collisions/alerts          Close-approach pairs (5 km, min 0.01 km)
  GET /collisions/refresh         Re-run close-approach screening (live)
"""

import csv
import json
import logging
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from api.routes.simulate import router as simulate_router


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
API_DIR = Path(__file__).resolve().parent
PYTHON_DIR = API_DIR.parent
PREPROCESSING_DIR = PYTHON_DIR / "preprocessing"
PROCESSED_DIR = PYTHON_DIR / "processed_data"

EPHEMERIS_CSV = PROCESSED_DIR / "sgp4_ephemeris.csv"
CLOSE_APPROACHES_5KM_JSON = PROCESSED_DIR / "close_approaches_5km.json"
COMBINED_CSV = PROCESSED_DIR / "combined_satellites.csv"

# Add preprocessing dir to path
sys.path.insert(0, str(PREPROCESSING_DIR))
sys.path.insert(0, str(PYTHON_DIR))
from convert_sgp4 import load_and_propagate  # noqa: E402
from realtime_close_approaches import (  # noqa: E402
    find_close_approaches_optimized,
    MIN_DISTANCE_KM,
    MIN_RELATIVE_VELOCITY_KM_S,
    THRESHOLD_KM,
)

# ---------------------------------------------------------------------------
# Startup cache
# ---------------------------------------------------------------------------
_cache: dict = {}
_orbital_by_norad: dict = {}


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


def _load_orbital_lookup() -> None:
    """Load combined_satellites for orbital element lookup (MEAN_MOTION, ECCENTRICITY, INCLINATION)."""
    global _orbital_by_norad
    if not COMBINED_CSV.exists():
        return
    with open(COMBINED_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                norad = int(row.get("NORAD_CAT_ID", 0))
                _orbital_by_norad[norad] = {
                    "MEAN_MOTION": float(row.get("MEAN_MOTION", 0)),
                    "ECCENTRICITY": float(row.get("ECCENTRICITY", 0)),
                    "INCLINATION": float(row.get("INCLINATION", 0)),
                }
            except (ValueError, TypeError):
                continue


def _try_ml_probability(pair: dict) -> float | None:
    """Use ML model for collision probability if orbital data available. Returns None on failure."""
    log = logging.getLogger("api.ml")
    if not _orbital_by_norad:
        log.info("ml probability skipped: no orbital lookup loaded")
        return None
    if "relative_velocity_km_s" not in pair:
        log.info("ml probability skipped: pair missing relative_velocity_km_s")
        return None
    orb_a = _orbital_by_norad.get(pair["norad_a"])
    orb_b = _orbital_by_norad.get(pair["norad_b"])
    if not orb_a or not orb_b:
        log.info("ml probability skipped: NORAD %s or %s not in orbital lookup",
                 pair.get("norad_a"), pair.get("norad_b"))
        return None
    if not (PYTHON_DIR / "ml" / "risk_model.json").exists():
        log.info("ml probability skipped: risk_model.json not found")
        return None
    try:
        from ml.risk_model import build_features_from_pair, predict_probability
        feat = build_features_from_pair(
            pair["distance_km"],
            pair["relative_velocity_km_s"],
            orb_a,
            orb_b,
        )
        prob = predict_probability(feat)
        log.debug("ml probability for %s/%s: %.6f", pair.get("norad_a"), pair.get("norad_b"), prob)
        return prob
    except Exception as e:
        log.warning("ml probability failed for pair %s/%s: %s",
                    pair.get("norad_a"), pair.get("norad_b"), e)
        return None


def _add_collision_probability(pairs: list[dict], threshold_km: float = THRESHOLD_KM) -> None:
    """Add collision probability = e^risk using XGBoost model only. No heuristic fallback."""
    for pair in pairs:
        prob = _try_ml_probability(pair)
        if prob is not None:
            pair["collision_probability"] = round(prob, 6)
            pair["probability_source"] = "ml"
        else:
            pair["collision_probability"] = None
            pair["probability_source"] = None


def _load_close_approaches_from_file() -> dict | None:
    """Load from close_approaches_5km.json if it exists."""
    if not CLOSE_APPROACHES_5KM_JSON.exists():
        return None
    try:
        with open(CLOSE_APPROACHES_5KM_JSON, encoding="utf-8") as f:
            data = json.load(f)
        _add_collision_probability(data.get("pairs", []), data.get("threshold_km", THRESHOLD_KM))
        return data
    except (json.JSONDecodeError, IOError):
        return None


def _run_close_approach_screening() -> dict:
    """Run SGP4 propagation + optimized close-approach screening (5 km, min 0.01 km)."""
    now = datetime.now(timezone.utc)
    records = load_and_propagate(COMBINED_CSV, ref_time=now)
    pairs = find_close_approaches_optimized(records, threshold_km=THRESHOLD_KM)
    # Apply min distance filter (optimized fn already does this, but ensure)
    pairs = [p for p in pairs if MIN_DISTANCE_KM < p["distance_km"] <= THRESHOLD_KM]
    _add_collision_probability(pairs)
    return {
        "threshold_km": THRESHOLD_KM,
        "min_distance_km": MIN_DISTANCE_KM,
        "min_relative_velocity_km_s": MIN_RELATIVE_VELOCITY_KM_S,
        "epoch_utc": now.isoformat(),
        "objects_screened": len(records),
        "close_pairs": len(pairs),
        "pairs": pairs,
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.getLogger("api.ml").setLevel(logging.INFO)
    _load_orbital_lookup()
    _cache["ephemeris"] = _load_ephemeris_csv()
    _cache["ephemeris_by_norad"] = {r["norad_id"]: r for r in _cache["ephemeris"]}
    # Load close approaches: try file first, else run screening on startup
    data = _load_close_approaches_from_file()
    if data is None:
        if COMBINED_CSV.exists():
            data = _run_close_approach_screening()
        else:
            data = {"threshold_km": THRESHOLD_KM, "min_distance_km": MIN_DISTANCE_KM, "epoch_utc": None, "pairs": []}
    _cache["close_approaches"] = data
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
app.include_router(simulate_router, prefix="/api")

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
def propagate_satellites():
    """
    Re-propagate all objects to the current UTC time using SGP4.
    Also runs optimized close-approach screening (5 km, min 0.01 km).
    Slower than /satellites/active (~1s for 24k objects).
    """
    if not COMBINED_CSV.exists():
        raise HTTPException(status_code=503, detail="combined_satellites.csv not found")

    now = datetime.now(timezone.utc)
    records = load_and_propagate(COMBINED_CSV, ref_time=now)
    pairs = find_close_approaches_optimized(records, threshold_km=THRESHOLD_KM)
    pairs = [p for p in pairs if MIN_DISTANCE_KM < p["distance_km"] <= THRESHOLD_KM]
    _add_collision_probability(pairs)

    close_data = {
        "threshold_km": THRESHOLD_KM,
        "min_distance_km": MIN_DISTANCE_KM,
        "min_relative_velocity_km_s": MIN_RELATIVE_VELOCITY_KM_S,
        "pair_count": len(pairs),
        "pairs": pairs,
    }
    # Update in-memory cache for /collisions/alerts
    _cache["close_approaches"] = {
        "threshold_km": THRESHOLD_KM,
        "min_distance_km": MIN_DISTANCE_KM,
        "min_relative_velocity_km_s": MIN_RELATIVE_VELOCITY_KM_S,
        "epoch_utc": now.isoformat(),
        "pairs": pairs,
    }

    return {
        "epoch_utc": now.isoformat(),
        "object_count": len(records),
        "objects": records,
        "close_approaches": close_data,
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
    """Return close-approach pairs (5 km threshold, min 0.01 km, excludes docked objects)."""
    data = _cache.get("close_approaches", {})
    pairs = data.get("pairs", [])

    if min_probability > 0:
        pairs = [p for p in pairs if p.get("collision_probability", 0) >= min_probability]
    if max_distance_km is not None:
        pairs = [p for p in pairs if p["distance_km"] <= max_distance_km]

    return {
        "threshold_km": data.get("threshold_km", THRESHOLD_KM),
        "min_distance_km": data.get("min_distance_km", MIN_DISTANCE_KM),
        "min_relative_velocity_km_s": data.get("min_relative_velocity_km_s", MIN_RELATIVE_VELOCITY_KM_S),
        "epoch_utc": data.get("epoch_utc"),
        "pair_count": len(pairs),
        "pairs": pairs,
    }


@app.get("/collisions/refresh")
def refresh_collision_alerts():
    """Re-run close-approach screening and update the cache."""
    if not COMBINED_CSV.exists():
        raise HTTPException(status_code=503, detail="combined_satellites.csv not found")
    data = _run_close_approach_screening()
    _cache["close_approaches"] = data
    return {
        "threshold_km": data["threshold_km"],
        "min_distance_km": data["min_distance_km"],
        "min_relative_velocity_km_s": data.get("min_relative_velocity_km_s", MIN_RELATIVE_VELOCITY_KM_S),
        "epoch_utc": data["epoch_utc"],
        "pair_count": len(data["pairs"]),
        "pairs": data["pairs"],
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "ephemeris_loaded": len(_cache.get("ephemeris", [])),
        "close_approaches_loaded": len(_cache.get("close_approaches", {}).get("pairs", [])),
    }
