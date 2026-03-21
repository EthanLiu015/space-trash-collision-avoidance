const MU = 398600.4418 // km³/s²
const R_EARTH = 6371 // km

// TLE format uses leading-dot notation and E-notation without a leading digit:
//   .60048683E-3  ->  6.0048683e-4
//   -.43731952E-3 -> -4.3731952e-4
//   .0024656      ->  0.0024656
function parseTleFloat(value) {
  value = value.trim()
  if (!value || value === '0') return 0.0
  let sign = 1
  if (value.startsWith('-')) { sign = -1; value = value.slice(1) }
  else if (value.startsWith('+')) { value = value.slice(1) }
  if (value.startsWith('.')) value = '0' + value
  return sign * parseFloat(value)
}

function altitudeFromMeanMotion(meanMotion) {
  const n = (meanMotion * 2 * Math.PI) / 86400 // rad/s
  const a = Math.cbrt(MU / (n * n)) // semi-major axis in km
  return Math.round(a - R_EARTH)
}

// TLE-format columns that need special parsing
const TLE_COLS = new Set(['ECCENTRICITY', 'BSTAR', 'MEAN_MOTION_DOT', 'MEAN_MOTION_DDOT'])
// Constant columns to drop
const DROP_COLS = new Set(['EPHEMERIS_TYPE', 'CLASSIFICATION_TYPE'])

function cleanRow(headers, vals) {
  const row = {}
  headers.forEach((h, i) => {
    if (DROP_COLS.has(h)) return
    const val = (vals[i] ?? '').trim()
    row[h] = TLE_COLS.has(h) ? parseTleFloat(val) : val
  })

  // Fill missing OBJECT_ID
  if (!row.OBJECT_ID) {
    const norad = row.NORAD_CAT_ID ? String(parseInt(row.NORAD_CAT_ID)) : 'UNKNOWN'
    row.OBJECT_ID = `NORAD-${norad}`
  }

  return row
}

function parseCSV(text, type) {
  const lines = text.trim().split('\n')
  const headers = lines[0].split(',').map((h) => h.trim())
  return lines.slice(1).map((line) => {
    const vals = line.split(',')
    const row = cleanRow(headers, vals)
    const meanMotion = parseFloat(row.MEAN_MOTION)
    const inclination = parseFloat(row.INCLINATION)
    const raan = parseFloat(row.RA_OF_ASC_NODE)
    const altitude = altitudeFromMeanMotion(meanMotion)
    if (isNaN(altitude) || isNaN(inclination) || isNaN(raan)) return null
    return {
      id: row.OBJECT_NAME,
      norad: parseInt(row.NORAD_CAT_ID),
      type,
      altitude,
      inclination,
      raan,
    }
  }).filter(Boolean)
}

export async function loadAllSatellites() {
  const [activeTxt, debrisTxt, decayingTxt] = await Promise.all([
    fetch('/data/active_satellites.csv').then((r) => r.text()),
    fetch('/data/debris.csv').then((r) => r.text()),
    fetch('/data/decaying.csv').then((r) => r.text()),
  ])
  return [
    ...parseCSV(activeTxt, 'active'),
    ...parseCSV(debrisTxt, 'debris'),
    ...parseCSV(decayingTxt, 'decaying'),
  ]
}
