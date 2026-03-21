# Preprocessing Scripts

## download_celestrak.py

Downloads real orbital data from [CelesTrak](https://celestrak.org/) (NORAD/18th Space Defense Squadron) into `raw_data/`:
- `active_satellites.csv` — Active payloads
- `decaying.csv` — Last 30 days' launches
- `debris.csv` — Merged debris from major fragmentation events

**Requirements:** `pip install requests`

```bash
python preprocessing/download_celestrak.py
```

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

## realtime_close_approaches.py

Real-time close approach detection with **O(n log n)** spatial indexing (scipy cKDTree). Pairs included: 0.01 km < distance ≤ 5 km (excludes docked/combined objects). Default: updates every 2 seconds.

**Requirements:** `pip install sgp4 scipy`

```bash
# Default: run every 2 seconds (real-time)
python preprocessing/realtime_close_approaches.py

# Single run only
python preprocessing/realtime_close_approaches.py --interval 0

# Custom interval (e.g. every 30 seconds)
python preprocessing/realtime_close_approaches.py --interval 30

# Limit for testing
python preprocessing/realtime_close_approaches.py --limit 1000
```

**Output:** `processed_data/close_approaches_5km.json` (5 km pairs only). Use `-o realtime_close_approaches.json` to override.
