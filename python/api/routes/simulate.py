import sys
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter()

API_DIR = Path(__file__).resolve().parent.parent
PYTHON_DIR = API_DIR.parent
PREPROCESSING_DIR = PYTHON_DIR / "preprocessing"
COMBINED_CSV = PYTHON_DIR / "processed_data" / "combined_satellites.csv"

sys.path.insert(0, str(PREPROCESSING_DIR))


class ManeuverInput(BaseModel):
    deltaAltKm: float = 0
    delayMin: float = 0
    deltaIncDeg: float = 0


class SimulationRequest(BaseModel):
    objectA: str
    objectB: str
    noradA: int | None = None
    noradB: int | None = None
    probability: float | None = None
    closestApproachKm: float
    relativeVelocityKms: float
    maneuver: ManeuverInput


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _compute_new_distance_via_sgp4(
    norad_a: int,
    norad_b: int,
    delta_alt: float,
    delta_inc: float,
) -> tuple[float, float] | None:
    """
    Use SGP4 propagation to compute pre- and post-maneuver miss distances.
    Returns (old_miss_km, new_miss_km) or None if SGP4 unavailable.
    """
    if not COMBINED_CSV.exists():
        return None
    try:
        from convert_sgp4 import (
            create_satrec,
            create_maneuvered_satrec,
            find_miss_distance_and_tca,
            load_row_by_norad,
        )
    except ImportError:
        return None

    row_a = load_row_by_norad(COMBINED_CSV, norad_a)
    row_b = load_row_by_norad(COMBINED_CSV, norad_b)
    if not row_a or not row_b:
        return None

    ref_time = datetime.now(timezone.utc)
    sat_a = create_satrec(row_a)
    sat_b = create_satrec(row_b)

    _, old_miss_km, _ = find_miss_distance_and_tca(sat_a, sat_b, ref_time)
    sat_a_maneuvered = create_maneuvered_satrec(row_a, delta_alt, delta_inc)
    _, new_miss_km, _ = find_miss_distance_and_tca(sat_a_maneuvered, sat_b, ref_time)

    return (old_miss_km, new_miss_km)


def _delta_v(delta_alt: float, delta_inc: float, delay: float) -> float:
    """Rough Δv estimate (m/s)."""
    return delta_alt * 0.04 + delta_inc * 0.12 + delay * 0.002


@router.post("/simulate-maneuver")
def simulate_maneuver(req: SimulationRequest, request: Request):
    old_distance = req.closestApproachKm  # from screening; may be overwritten by SGP4
    rel_vel = req.relativeVelocityKms

    delta_alt = req.maneuver.deltaAltKm
    delay = abs(req.maneuver.delayMin)
    delta_inc = req.maneuver.deltaIncDeg

    # Use SGP4 to compute actual miss distance change from maneuver
    # If no orbital change (alt=0, inc=0), new = old — skip SGP4
    new_distance = None
    if abs(delta_alt) > 1e-6 or abs(delta_inc) > 1e-6:
        if req.noradA is not None and req.noradB is not None:
            sgp4_result = _compute_new_distance_via_sgp4(
                req.noradA, req.noradB, delta_alt, delta_inc
            )
            if sgp4_result is not None:
                _, new_distance = sgp4_result
                new_distance = max(0.001, new_distance)
        if new_distance is None:
            # SGP4 unavailable → heuristic fallback
            distance_gain = abs(delta_alt) * 1.2 + abs(delta_inc) * 2.5
            new_distance = max(0.001, old_distance + distance_gain)
    else:
        new_distance = old_distance  # no maneuver → unchanged

    # Fallback heuristic if SGP4 fails (no orbital data or propagation error)
    if new_distance is None:
        distance_gain = abs(delta_alt) * 1.2 + abs(delta_inc) * 2.5
        new_distance = max(0.001, old_distance + distance_gain)
    delta_v = _delta_v(abs(delta_alt), abs(delta_inc), delay)

    old_probability = req.probability if req.probability is not None else None
    new_probability = None

    # Try XGBoost model if we have NORAD IDs and orbital data
    orbital_by_norad = getattr(request.app.state, "orbital_by_norad", None) or {}
    model_path = PYTHON_DIR / "ml" / "risk_model.json"

    if (
        req.noradA is not None
        and req.noradB is not None
        and orbital_by_norad
        and model_path.exists()
    ):
        orb_a = orbital_by_norad.get(req.noradA)
        orb_b = orbital_by_norad.get(req.noradB)

        if orb_a and orb_b:
            try:
                from ml.risk_model import (
                    build_features_from_pair,
                    build_features_for_maneuver,
                    predict_probability,
                )

                base_features = build_features_from_pair(
                    old_distance,
                    rel_vel,
                    orb_a,
                    orb_b,
                )
                # Base (pre-maneuver) and post-maneuver from XGBoost
                old_probability = predict_probability(base_features)

                maneuver_features = build_features_for_maneuver(
                    base_features,
                    new_miss_distance_km=new_distance,
                    delta_alt_km=delta_alt,
                    delta_inc_deg=delta_inc,
                )
                new_probability = predict_probability(maneuver_features)
                new_probability = round(new_probability, 6)
            except Exception:
                pass

    # Fallback heuristic if XGBoost fails or orbital data missing
    if new_probability is None:
        base_prob = old_probability if old_probability is not None else (req.probability or 0.0)
        old_probability = base_prob
        risk_reduction = abs(delta_alt) * 0.015 + delay * 0.004 + abs(delta_inc) * 0.03
        rel_vel_penalty = min(rel_vel / 100.0, 0.15)
        new_probability = base_prob - risk_reduction + rel_vel_penalty
        new_probability = clamp(new_probability, 0.000001, 0.99)
        new_probability = round(new_probability, 6)
        old_probability = round(old_probability, 6)
    else:
        old_probability = round(old_probability, 6)

    recommendation = "No maneuver needed"
    if new_probability < old_probability:
        recommendation = (
            f"Applying a maneuver of {req.maneuver.deltaAltKm:+.1f} km altitude, "
            f"{req.maneuver.delayMin:+.0f} min timing shift, and "
            f"{req.maneuver.deltaIncDeg:+.2f}° inclination change "
            f"reduces estimated collision probability."
        )

    return {
        "objectA": req.objectA,
        "objectB": req.objectB,
        "oldRisk": round(old_probability, 6),
        "newRisk": round(new_probability, 6),
        "oldDistanceKm": round(old_distance, 3),
        "newDistanceKm": round(new_distance, 3),
        "relativeVelocityKms": round(rel_vel, 4),
        "deltaV": round(delta_v, 3),
        "recommendation": recommendation,
    }
