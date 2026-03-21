# Risk Prediction Model

XGBoost regressor predicting collision risk (log-probability) from close-approach features.
**probability = exp(risk)**

## Setup

```bash
pip install xgboost pandas scikit-learn
```

## Training

1. (One-time) Create the small training dataset from `train_data.csv`:
   ```bash
   cd python && python preprocessing/create_risk_train.py
   ```
   This writes `processed_data/risk_train_clean.csv` (13 columns). Then `raw_data/train_data.csv` can be deleted.

2. Train the model:
   ```bash
   cd python && python -m ml.risk_model --train
   ```

3. Test prediction:

   ```bash
   python -m ml.risk_model --test-predict
   ```

## Features (aligned with collision pipeline)

- `miss_distance` (m) ← distance_km × 1000
- `relative_speed` (m/s) ← relative_velocity_km_s × 1000
- `t_j2k_sma`, `t_j2k_ecc`, `t_j2k_inc` — target orbit (from norad_a)
- `c_j2k_sma`, `c_j2k_ecc`, `c_j2k_inc` — conjunction orbit (from norad_b)
- `t_h_apo`, `t_h_per`, `c_h_apo`, `c_h_per` — apogee/perigee altitudes (km)
