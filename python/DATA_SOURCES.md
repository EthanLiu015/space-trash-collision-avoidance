# Data Sources

## Current Pipeline (Real Data)

The program uses **real orbital data** from NORAD/18th Space Defense Squadron, in OMM (Orbital Mean-element Message) CSV format. There is no fake or sample data path in the pipeline.

### Data Flow

```
raw_data/
├── active_satellites.csv   (14,765 objects)  → Active payloads
├── debris.csv              (9,872 objects)   → Cataloged debris
└── decaying.csv            (112 objects)     → Recently launched / decaying
        │
        ▼  combine_csvs.py
processed_data/combined_satellites.csv
        │
        ▼  convert_sgp4.py
processed_data/sgp4_ephemeris.csv
processed_data/close_approaches_5km.json
```

### Verification

- **Format**: Standard OMM CSV (OBJECT_NAME, NORAD_CAT_ID, EPOCH, orbital elements)
- **Source**: Matches [CelesTrak](https://celestrak.org/NORAD/elements/) format
- **Objects**: Real satellites (CALSPHERE 1, STARLINK, TERRASAR-X, ISS, etc.) and debris (ECHO 1 DEB, CZ-2F DEB, etc.)
- **Close approaches**: Pairs like TERRASAR-X/TANDEM-X, PIESAT constellation, etc. are real operational satellites

### Refreshing Data

Run the download script to fetch the latest from CelesTrak:

```bash
cd python
.venv/bin/python preprocessing/download_celestrak.py
```

**Note:** The download script fetches active (~15k), last-30-days (~350), and merged debris from 4 major fragmentation events (~1–2k). Your current `debris.csv` (~10k objects) may have come from a bulk source (e.g., Space-Track). To keep that larger debris set, either retain your existing `raw_data/debris.csv` or obtain a bulk export from [Space-Track](https://www.space-track.org/) (requires free account).

Then rebuild the pipeline:

```bash
.venv/bin/python preprocessing/combine_csvs.py
.venv/bin/python preprocessing/convert_sgp4.py
```

Or use the backend's `/collisions/refresh` endpoint after updating `raw_data/`.
