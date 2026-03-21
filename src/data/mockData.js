// Mock satellite data - will be replaced by live CelesTrak/SGP4 API calls
export const mockSatellites = [
  { id: 'STARLINK-2318', norad: 47861, type: 'active', altitude: 550, inclination: 53.0, raan: 45.2, color: '#3b82f6' },
  { id: 'COSMOS-2251-DEB', norad: 33442, type: 'debris', altitude: 798, inclination: 74.0, raan: 120.5, color: '#ef4444' },
  { id: 'ISS', norad: 25544, type: 'active', altitude: 408, inclination: 51.6, raan: 200.1, color: '#22c55e' },
  { id: 'FENGYUN-1C-DEB', norad: 29228, type: 'debris', altitude: 840, inclination: 98.8, raan: 300.0, color: '#ef4444' },
  { id: 'STARLINK-3012', norad: 49289, type: 'active', altitude: 540, inclination: 53.0, raan: 88.4, color: '#3b82f6' },
  { id: 'COSMOS-2251', norad: 22675, type: 'debris', altitude: 780, inclination: 74.0, raan: 150.3, color: '#f97316' },
  { id: 'TERRA', norad: 25994, type: 'active', altitude: 705, inclination: 98.2, raan: 45.0, color: '#22c55e' },
  { id: 'IRIDIUM-33-DEB', norad: 33442, type: 'debris', altitude: 776, inclination: 86.4, raan: 270.0, color: '#ef4444' },
]

export const mockCollisionAlerts = [
  {
    id: 'alert-001',
    objectA: 'STARLINK-2318',
    objectB: 'COSMOS-2251 Debris',
    probability: 82,
    closestApproach: '02m 15s',
    relativeVelocity: 12.6,
    risk: 'CRITICAL',
    timeToEvent: 142,
    deltaV: 2.4,
    altitudeChange: 2.1,
    riskAfterManeuver: 3,
  },
  {
    id: 'alert-002',
    objectA: 'ISS',
    objectB: 'FENGYUN-1C-DEB #847',
    probability: 34,
    closestApproach: '18m 42s',
    relativeVelocity: 9.2,
    risk: 'HIGH',
    timeToEvent: 892,
    deltaV: 1.1,
    altitudeChange: 1.2,
    riskAfterManeuver: 8,
  },
  {
    id: 'alert-003',
    objectA: 'TERRA',
    objectB: 'IRIDIUM-33-DEB',
    probability: 12,
    closestApproach: '1h 23m',
    relativeVelocity: 14.1,
    risk: 'MEDIUM',
    timeToEvent: 4980,
    deltaV: 0.6,
    altitudeChange: 0.8,
    riskAfterManeuver: 2,
  },
]

export const mockLiveFeed = [
  { id: 1, time: '14:32:01', type: 'warning', message: 'STARLINK-2318 Position Updated', icon: '⚠️' },
  { id: 2, time: '14:31:58', type: 'alert', message: 'Debris Fragment #4218 Detected', icon: '🔴' },
  { id: 3, time: '14:31:45', type: 'info', message: 'ISS Orbit Recalculated', icon: '🛸' },
  { id: 4, time: '14:31:30', type: 'warning', message: 'COSMOS-2251 Fragment SNAP Tracked', icon: '⚠️' },
  { id: 5, time: '14:31:12', type: 'info', message: 'FENGYUN-1C Debris Analysis Running', icon: '📡' },
  { id: 6, time: '14:30:58', type: 'alert', message: 'New TLE Data: 2,847 objects updated', icon: '🔴' },
  { id: 7, time: '14:30:45', type: 'success', message: 'STARLINK-3012 Maneuver Complete', icon: '✅' },
  { id: 8, time: '14:30:22', type: 'info', message: 'Conjunction screen interval: 7 days', icon: '📡' },
]

export const mockDistanceData = Array.from({ length: 60 }, (_, i) => ({
  t: i,
  distance: Math.max(0.1, 50 - 45 * Math.exp(-Math.pow((i - 30) / 8, 2)) + (Math.random() - 0.5) * 3),
  threshold: 5,
}))

export const mockProbabilityData = Array.from({ length: 60 }, (_, i) => ({
  t: i,
  probability: Math.min(95, Math.max(0, 82 * Math.exp(-Math.pow((i - 25) / 7, 2)) + (Math.random() - 0.5) * 4)),
  safe: 10,
}))
