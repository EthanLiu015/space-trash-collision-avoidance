"""
XGBoost risk prediction model for collision probability.

Risk (log-probability) is predicted from features; probability = exp(risk).
Trained on risk_train_clean.csv (13 columns: risk + 12 features we can compute
from our collision pipeline). Create via: python preprocessing/create_risk_train.py
"""

import sys
from pathlib import Path
from typing import Tuple

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, mean_absolute_error

ML_DIR = Path(__file__).resolve().parent
PYTHON_DIR = ML_DIR.parent
PROCESSED_DIR = PYTHON_DIR / "processed_data"
MODEL_PATH = ML_DIR / "risk_model.json"

TRAIN_DATA_CSV = PROCESSED_DIR / "risk_train_clean.csv"

FEATURES = [
    "miss_distance",
    "log_miss_distance",   # ln(d_m); higher when farther → lower prob
    "inv_miss_distance",   # 1000/d_m; higher when closer → higher prob
    "relative_speed",
    "t_j2k_sma", "t_j2k_ecc", "t_j2k_inc",
    "c_j2k_sma", "c_j2k_ecc", "c_j2k_inc",
    "t_h_apo", "t_h_per", "c_h_apo", "c_h_per",
]
TARGET = "risk"

# Exclude censored samples: risk=-30 is a floor cap, not true risk
EXCLUDE_RISK_FLOOR = -29.5  # Drop rows with risk <= this (censored)


def load_and_preprocess() -> Tuple[pd.DataFrame, pd.Series]:
    """
    Load risk_train_clean.csv (created by preprocessing/create_risk_train.py).
    Excludes censored risk=-30 samples so the model learns true distance–risk relationship.
    """
    if not TRAIN_DATA_CSV.exists():
        raise FileNotFoundError(
            f"{TRAIN_DATA_CSV} not found. Run: python preprocessing/create_risk_train.py"
        )
    df = pd.read_csv(TRAIN_DATA_CSV)
    kept = [TARGET] + FEATURES
    missing = [c for c in kept if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns in {TRAIN_DATA_CSV.name}: {missing}")
    df = df[kept].dropna()
    # Exclude censored samples (risk capped at -30)
    df = df[df[TARGET] > EXCLUDE_RISK_FLOOR]
    X = df[FEATURES]
    y = df[TARGET]
    return X, y


def train(
    test_size: float = 0.2,
    random_state: int = 42,
    n_estimators: int = 200,
    max_depth: int = 6,
    learning_rate: float = 0.1,
):
    """Train XGBoost regressor and save model."""
    X, y = load_and_preprocess()
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=random_state
    )
    model = xgb.XGBRegressor(
        n_estimators=n_estimators,
        max_depth=max_depth,
        learning_rate=learning_rate,
        random_state=random_state,
        objective="reg:squarederror",
    )
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
    mae = mean_absolute_error(y_test, y_pred)
    print(f"RMSE: {rmse:.4f}, MAE: {mae:.4f}")
    ML_DIR.mkdir(parents=True, exist_ok=True)
    model.save_model(str(MODEL_PATH))
    print(f"Saved model to {MODEL_PATH}")
    return model


def load_model():
    """Load trained model from disk."""
    model = xgb.XGBRegressor()
    model.load_model(str(MODEL_PATH))
    return model


def predict_risk(features: dict) -> float:
    """
    Predict risk (log-probability) for a close-approach pair.
    features: dict with keys in FEATURES
    """
    model = load_model()
    row = pd.DataFrame([{k: features[k] for k in FEATURES}])
    risk = float(model.predict(row)[0])
    return risk


def risk_to_probability(risk: float) -> float:
    """Convert risk (log-prob) to probability: p = exp(risk)."""
    return float(np.exp(risk))


def predict_probability(features: dict) -> float:
    """Predict collision probability for a close-approach pair."""
    risk = predict_risk(features)
    return risk_to_probability(risk)


def build_features_from_pair(
    distance_km: float,
    relative_velocity_km_s: float,
    orb_a: dict,
    orb_b: dict,
) -> dict:
    """
    Build feature dict from close-approach pair and orbital data.
    orb_a, orb_b: dicts with MEAN_MOTION (rev/day), ECCENTRICITY, INCLINATION.
    """
    GM = 398600.4418  # km³/s²
    R_EARTH = 6371.0  # km

    def sma_from_mean_motion(n_rev_per_day: float) -> float:
        n_rad_per_sec = n_rev_per_day * (2 * np.pi) / 86400
        return (GM / (n_rad_per_sec ** 2)) ** (1 / 3)

    def h_apo_per(sma: float, ecc: float) -> Tuple[float, float]:
        r_apo = sma * (1 + ecc)
        r_per = sma * (1 - ecc)
        h_apo = r_apo - R_EARTH
        h_per = r_per - R_EARTH
        return h_apo, h_per

    sma_a = sma_from_mean_motion(float(orb_a["MEAN_MOTION"]))
    ecc_a = float(orb_a["ECCENTRICITY"])
    h_apo_a, h_per_a = h_apo_per(sma_a, ecc_a)

    sma_b = sma_from_mean_motion(float(orb_b["MEAN_MOTION"]))
    ecc_b = float(orb_b["ECCENTRICITY"])
    h_apo_b, h_per_b = h_apo_per(sma_b, ecc_b)

    miss_m = distance_km * 1000  # m
    return {
        "miss_distance": miss_m,
        "log_miss_distance": float(np.log(max(miss_m, 1))),  # avoid log(0)
        "inv_miss_distance": 1000.0 / max(miss_m, 1),  # 1/d_km scale
        "relative_speed": relative_velocity_km_s * 1000,  # m/s
        "t_j2k_sma": sma_a,
        "t_j2k_ecc": ecc_a,
        "t_j2k_inc": float(orb_a["INCLINATION"]),
        "c_j2k_sma": sma_b,
        "c_j2k_ecc": ecc_b,
        "c_j2k_inc": float(orb_b["INCLINATION"]),
        "t_h_apo": h_apo_a,
        "t_h_per": h_per_a,
        "c_h_apo": h_apo_b,
        "c_h_per": h_per_b,
    }


def build_features_for_maneuver(
    base_features: dict,
    new_miss_distance_km: float,
    delta_alt_km: float,
    delta_inc_deg: float,
) -> dict:
    """
    Build features for maneuver-modified scenario. Target (t_*) is the maneuvering object.
    Altitude change shifts SMA and apogee/perigee; inclination change updates inc.
    """
    miss_m = new_miss_distance_km * 1000  # m
    out = base_features.copy()
    out["miss_distance"] = miss_m
    out["log_miss_distance"] = float(np.log(max(miss_m, 1)))
    out["inv_miss_distance"] = 1000.0 / max(miss_m, 1)
    out["t_j2k_sma"] = base_features["t_j2k_sma"] + delta_alt_km
    out["t_j2k_inc"] = base_features["t_j2k_inc"] + delta_inc_deg
    out["t_h_apo"] = base_features["t_h_apo"] + delta_alt_km
    out["t_h_per"] = base_features["t_h_per"] + delta_alt_km
    return out


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Train XGBoost risk prediction model")
    parser.add_argument("--train", action="store_true", help="Train and save model")
    parser.add_argument("--test-predict", action="store_true",
                        help="Run a test prediction with sample features")
    args = parser.parse_args()

    if args.train:
        train()
    elif args.test_predict:
        if not MODEL_PATH.exists():
            print("Model not found. Run with --train first.")
            sys.exit(1)
        feat = {
            "miss_distance": 2392.0,
            "log_miss_distance": np.log(2392.0),
            "inv_miss_distance": 1000.0 / 2392.0,
            "relative_speed": 3434.0,
            "t_j2k_sma": 7001.53,
            "t_j2k_ecc": 0.00103,
            "t_j2k_inc": 97.77,
            "c_j2k_sma": 6880.65,
            "c_j2k_ecc": 0.01749,
            "c_j2k_inc": 82.43,
            "t_h_apo": 630.6,
            "t_h_per": 616.18,
            "c_h_apo": 622.86,
            "c_h_per": 382.17,
        }
        risk = predict_risk(feat)
        prob = risk_to_probability(risk)
        print(f"Sample prediction: risk={risk:.4f}, probability={prob:.6f}")
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
