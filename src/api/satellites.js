const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export async function fetchActiveSatellites() {
  try {
    const res = await fetch(`${API_BASE}/satellites/active`)
    if (!res.ok) throw new Error('API unavailable')
    return res.json()
  } catch {
    // Return mock data when backend not available
    const { mockSatellites } = await import('../data/mockData.js')
    return mockSatellites
  }
}

export async function fetchCollisionAlerts() {
  try {
    const res = await fetch(`${API_BASE}/collisions/alerts`)
    if (!res.ok) throw new Error('API unavailable')
    return res.json()
  } catch {
    const { mockCollisionAlerts } = await import('../data/mockData.js')
    return mockCollisionAlerts
  }
}

export async function fetchSatelliteDetail(norad) {
  try {
    const res = await fetch(`${API_BASE}/satellites/${norad}`)
    if (!res.ok) throw new Error('API unavailable')
    return res.json()
  } catch {
    return null
  }
}
