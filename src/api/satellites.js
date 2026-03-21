import { loadAllSatellites } from '../data/loadSatellites.js'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ---------------------------------------------------------------------------
// Satellite transform
// Backend: { norad_id, object_name, object_type, x_km, y_km, z_km,
//            vx_kms, vy_kms, vz_kms, altitude_km, epoch_utc }
// Frontend: { id, norad, type, altitude, inclination, raan, x_km, y_km, z_km }
// ---------------------------------------------------------------------------

function inclinationFromECI(x, y, z, vx, vy, vz) {
  const hx = y * vz - z * vy
  const hy = z * vx - x * vz
  const hz = x * vy - y * vx
  const hMag = Math.sqrt(hx * hx + hy * hy + hz * hz)
  if (hMag === 0) return 0
  return (Math.acos(Math.max(-1, Math.min(1, hz / hMag))) * 180) / Math.PI
}

function raanFromECI(x, y, z, vx, vy, vz) {
  const hx = y * vz - z * vy
  const hy = z * vx - x * vz
  return ((Math.atan2(hx, -hy) * 180) / Math.PI + 360) % 360
}

function transformSatellite(obj) {
  const typeMap = { active: 'active', debris: 'debris', decaying: 'decaying' }
  return {
    id: obj.object_name,
    norad: obj.norad_id,
    type: typeMap[obj.object_type?.toLowerCase()] ?? 'active',
    altitude: Math.round(obj.altitude_km),
    inclination: Math.round(inclinationFromECI(obj.x_km, obj.y_km, obj.z_km, obj.vx_kms, obj.vy_kms, obj.vz_kms) * 10) / 10,
    raan: Math.round(raanFromECI(obj.x_km, obj.y_km, obj.z_km, obj.vx_kms, obj.vy_kms, obj.vz_kms) * 10) / 10,
    // ECI state for Globe (km, km/s)
    x_km: obj.x_km,
    y_km: obj.y_km,
    z_km: obj.z_km,
    vx_kms: obj.vx_kms,
    vy_kms: obj.vy_kms,
    vz_kms: obj.vz_kms,
    epoch_utc: obj.epoch_utc,
  }
}

// ---------------------------------------------------------------------------
// Alert transform
// Backend: { object_a, norad_a, object_b, norad_b, distance_km,
//            epoch_utc, collision_probability }
// Frontend: { id, objectA, objectB, risk, probability, closestApproach,
//             relativeVelocity, altitudeChange, riskAfterManeuver, deltaV, timeToEvent }
// ---------------------------------------------------------------------------

function classifyRisk(probability) {
  if (probability >= 0.7) return 'CRITICAL'
  if (probability >= 0.3) return 'HIGH'
  if (probability >= 0.1) return 'MEDIUM'
  return 'LOW'
}

function transformAlert(pair) {
  const prob = pair.collision_probability ?? 0
  const probPct = Math.round(prob * 100)

  // Suggest a maneuver: boost by enough to double the miss distance (min 0.5 km)
  const altChange = Math.max(0.5, pair.distance_km).toFixed(1)
  // After the maneuver the effective miss distance grows, reducing probability
  const newProb = prob * Math.exp(-parseFloat(altChange))
  const riskAfterPct = Math.round(newProb * 100)

  return {
    id: `${pair.norad_a}_${pair.norad_b}`,
    objectA: pair.object_a,
    objectB: pair.object_b,
    risk: classifyRisk(prob),
    probability: probPct,
    closestApproach: `${pair.distance_km.toFixed(2)} km`,
    relativeVelocity: null,       // not in static snapshot; computed when live propagation is used
    altitudeChange: parseFloat(altChange),
    riskAfterManeuver: riskAfterPct,
    deltaV: parseFloat((parseFloat(altChange) * 1.0).toFixed(1)), // ~1 m/s per km altitude change
    timeToEvent: 3600,             // placeholder; real TCA requires window propagation
    epoch_utc: pair.epoch_utc,
    noradA: pair.norad_a,
    noradB: pair.norad_b,
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function fetchActiveSatellites() {
  try {
    const res = await fetch(`${API_BASE}/satellites/active`)
    if (!res.ok) throw new Error('API unavailable')
    const data = await res.json()
    return data.objects.map(transformSatellite)
  } catch {
    return loadAllSatellites()
  }
}

export async function fetchCollisionAlerts() {
  try {
    const res = await fetch(`${API_BASE}/collisions/alerts`)
    if (!res.ok) throw new Error('API unavailable')
    const data = await res.json()
    return data.pairs.map(transformAlert)
  } catch {
    return []
  }
}

export async function fetchSatelliteDetail(norad) {
  try {
    const res = await fetch(`${API_BASE}/satellites/${norad}`)
    if (!res.ok) throw new Error('API unavailable')
    const obj = await res.json()
    return transformSatellite(obj)
  } catch {
    return null
  }
}
