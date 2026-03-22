from pathlib import Path

from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter()

API_DIR = Path(__file__).resolve().parent.parent
PYTHON_DIR = API_DIR.parent


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


def _distance_gain(delta_alt: float, delay: float, delta_inc: float) -> float:
    """Heuristic: maneuver increases miss distance."""
    return delta_alt * 1.2 + delay * 0.03 + delta_inc * 2.5


def _delta_v(delta_alt: float, delta_inc: float, delay: float) -> float:
    """Rough Δv estimate (m/s)."""
    return delta_alt * 0.04 + delta_inc * 0.12 + delay * 0.002


@router.post("/simulate-maneuver")
def simulate_maneuver(req: SimulationRequest, request: Request):
    old_distance = req.closestApproachKm
    rel_vel = req.relativeVelocityKms

    delta_alt = req.maneuver.deltaAltKm
    delay = abs(req.maneuver.delayMin)
    delta_inc = req.maneuver.deltaIncDeg

    distance_gain = _distance_gain(abs(delta_alt), delay, abs(delta_inc))
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
