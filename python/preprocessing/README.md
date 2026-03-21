# Preprocessing Scripts

## combine_csvs.py

Merges `active_satellites.csv`, `debris.csv`, and `decaying.csv` into a single CSV with an `OBJECT_TYPE` column (`"Active"`, `"debris"`, or `"decaying"`).

```bash
python preprocessing/combine_csvs.py
```

Output: `processed_data/combined_satellites.csv`

## convert_sgp4.py

Uses SGP4 to propagate OMM orbital elements to ECI position/velocity. Output is suitable for collision detection and visualization.

**Requirements:** `pip install sgp4` (or `pip install -r requirements.txt`)

```bash
# Full run - propagate all objects to current time
python preprocessing/convert_sgp4.py

# Limit objects (for testing)
python preprocessing/convert_sgp4.py --limit 500

# Run collision screening (find pairs within 5 km)
python preprocessing/convert_sgp4.py --screen

# Custom reference time and threshold
python preprocessing/convert_sgp4.py --ref-time "2026-03-21T00:00:00Z" --screen --threshold-km 10

# JSON output
python preprocessing/convert_sgp4.py --format json
```

**Outputs:**
- `processed_data/sgp4_ephemeris.csv` — ECI position (x, y, z km) and velocity (vx, vy, vz km/s) for each object
- `processed_data/close_approaches.json` — Pairs within threshold (when `--screen` is used)

**Ephemeris columns:** `norad_id`, `object_name`, `object_type`, `epoch_utc`, `x_km`, `y_km`, `z_km`, `vx_kms`, `vy_kms`, `vz_kms`, `altitude_km`
