// Derive inclination from ECI state vector
function inclinationFromECI(x, y, z, vx, vy, vz) {
  const hx = y * vz - z * vy
  const hy = z * vx - x * vz
  const hz = x * vy - y * vx
  const hMag = Math.sqrt(hx * hx + hy * hy + hz * hz)
  if (hMag === 0) return 0
  return (Math.acos(Math.max(-1, Math.min(1, hz / hMag))) * 180) / Math.PI
}

// Derive RAAN from ECI state vector
function raanFromECI(x, y, z, vx, vy, vz) {
  const hx = y * vz - z * vy
  const hy = z * vx - x * vz
  return ((Math.atan2(hx, -hy) * 180) / Math.PI + 360) % 360
}

function parseEphemerisCSV(text) {
  const lines = text.trim().split('\n')
  const headers = lines[0].split(',').map((h) => h.trim())
  return lines.slice(1).map((line) => {
    const vals = line.split(',')
    const row = {}
    headers.forEach((h, i) => { row[h] = vals[i]?.trim() })

    const x = parseFloat(row.x_km)
    const y = parseFloat(row.y_km)
    const z = parseFloat(row.z_km)
    const vx = parseFloat(row.vx_kms)
    const vy = parseFloat(row.vy_kms)
    const vz = parseFloat(row.vz_kms)
    const altitude = Math.round(parseFloat(row.altitude_km))
    if (isNaN(altitude) || isNaN(x)) return null

    const typeRaw = row.object_type?.toLowerCase() ?? 'active'
    const type = typeRaw === 'debris' ? 'debris' : typeRaw === 'decaying' ? 'decaying' : 'active'

    return {
      id: row.object_name,
      norad: parseInt(row.norad_id),
      type,
      altitude,
      inclination: Math.round(inclinationFromECI(x, y, z, vx, vy, vz) * 10) / 10,
      raan: Math.round(raanFromECI(x, y, z, vx, vy, vz) * 10) / 10,
      x_km: x,
      y_km: y,
      z_km: z,
      epoch_utc: row.epoch_utc,
    }
  }).filter(Boolean)
}

export async function loadAllSatellites() {
  const text = await fetch('/data/sgp4_ephemeris.csv').then((r) => r.text())
  return parseEphemerisCSV(text)
}
