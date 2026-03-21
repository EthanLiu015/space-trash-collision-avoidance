from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

router = APIRouter()


class ManeuverInput(BaseModel):
    deltaAltKm: float = 0
    delayMin: float = 0
    deltaIncDeg: float = 0


class SimulationRequest(BaseModel):
    objectA: str
    objectB: str
    probability: float
    closestApproachKm: float
    relativeVelocityKms: float
    maneuver: ManeuverInput


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


@router.post("/simulate-maneuver")
def simulate_maneuver(req: SimulationRequest):
    old_risk = req.probability
    old_distance = req.closestApproachKm
    rel_vel = req.relativeVelocityKms

    delta_alt = abs(req.maneuver.deltaAltKm)
    delay = abs(req.maneuver.delayMin)
    delta_inc = abs(req.maneuver.deltaIncDeg)

    # --- HACKATHON MVP HEURISTIC MODEL ---
    # These are demo-friendly approximations, not full astrodynamics.
    distance_gain = (
        delta_alt * 1.2 +
        delay * 0.03 +
        delta_inc * 2.5
    )

    new_distance = old_distance + distance_gain

    risk_reduction = (
        delta_alt * 0.015 +
        delay * 0.004 +
        delta_inc * 0.03
    )

    # Higher relative velocity keeps some residual risk
    rel_vel_penalty = min(rel_vel / 100.0, 0.15)

    new_risk = old_risk - risk_reduction + rel_vel_penalty
    new_risk = clamp(new_risk, 0.001, 0.99)

    # Simple Δv estimate for demo
    delta_v = (
        delta_alt * 0.04 +
        delta_inc * 0.12 +
        delay * 0.002
    )

    recommendation = "No maneuver needed"
    if new_risk < old_risk:
        recommendation = (
            f"Applying a maneuver of {req.maneuver.deltaAltKm:+.1f} km altitude, "
            f"{req.maneuver.delayMin:+.0f} min timing shift, and "
            f"{req.maneuver.deltaIncDeg:+.2f}° inclination change "
            f"reduces estimated collision probability."
        )

    return {
        "objectA": req.objectA,
        "objectB": req.objectB,
        "oldRisk": round(old_risk * 100, 2),
        "newRisk": round(new_risk * 100, 2),
        "oldDistanceKm": round(old_distance, 3),
        "newDistanceKm": round(new_distance, 3),
        "relativeVelocityKms": round(rel_vel, 4),
        "deltaV": round(delta_v, 3),
        "recommendation": recommendation
    }