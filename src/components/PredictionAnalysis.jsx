import { useMemo, useEffect, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer,
} from 'recharts'

const R_EARTH_KM = 6371
const MU = 398600

function orbitalToXYZkm(altitude, inclination, raan, trueAnomaly) {
  const r = R_EARTH_KM + altitude
  const incRad = (inclination * Math.PI) / 180
  const raanRad = (raan * Math.PI) / 180
  const tRad = (trueAnomaly * Math.PI) / 180
  const x = r * (Math.cos(raanRad) * Math.cos(tRad) - Math.sin(raanRad) * Math.sin(tRad) * Math.cos(incRad))
  const y = r * Math.sin(tRad) * Math.sin(incRad)
  const z = r * (Math.sin(raanRad) * Math.cos(tRad) + Math.cos(raanRad) * Math.sin(tRad) * Math.cos(incRad))
  return [x, y, z]
}

function trueAnomalyFromECI(x, y, z, incDeg, raanDeg) {
  const r = Math.sqrt(x * x + y * y + z * z)
  if (r < 100) return 0
  const incRad = (incDeg * Math.PI) / 180
  const raanRad = (raanDeg * Math.PI) / 180
  const sinInc = Math.sin(incRad)
  if (Math.abs(sinInc) < 0.01) return ((Math.atan2(y, x) - raanRad) * 180) / Math.PI
  const cosNu = (x * Math.cos(raanRad) + z * Math.sin(raanRad)) / r
  const sinNu = z / (r * sinInc)
  return (Math.atan2(sinNu, cosNu) * 180) / Math.PI
}

function orbitalSpeedDegPerSec(altitude) {
  const a = R_EARTH_KM + altitude
  const T = 2 * Math.PI * Math.sqrt(Math.pow(a, 3) / MU)
  return 360 / T
}

const CustomTooltip = ({ active, payload, label, unit }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-space-800 border border-blue-800 rounded px-2 py-1 text-xs">
        <p className="text-slate-400">t = {label}s</p>
        {payload.map((p) => (
          <p key={p.dataKey} style={{ color: p.color }}>
            {p.dataKey}: {p.value?.toFixed(2)} {unit}
          </p>
        ))}
      </div>
    )
  }
  return null
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// Inner component — only mounts when selectedSat is defined, so hooks are safe
function PredictionAnalysisInner({ selectedSat, satellites }) {
  const { closestSat, distanceData, relativeVelocity } = useMemo(() => {
    const sx = selectedSat.x_km ?? 0
    const sy = selectedSat.y_km ?? 0
    const sz = selectedSat.z_km ?? 0

    let closest = null
    let minDist = Infinity
    for (const sat of satellites) {
      if (sat.norad === selectedSat.norad) continue
      const dx = (sat.x_km ?? 0) - sx
      const dy = (sat.y_km ?? 0) - sy
      const dz = (sat.z_km ?? 0) - sz
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (d < minDist) { minDist = d; closest = sat }
    }

    if (!closest) return { closestSat: null, distanceData: [], relativeVelocity: 0 }

    const speedA = orbitalSpeedDegPerSec(selectedSat.altitude)
    const speedB = orbitalSpeedDegPerSec(closest.altitude)
    const nuA0 = trueAnomalyFromECI(selectedSat.x_km ?? 0, selectedSat.y_km ?? 0, selectedSat.z_km ?? 0, selectedSat.inclination, selectedSat.raan)
    const nuB0 = trueAnomalyFromECI(closest.x_km ?? 0, closest.y_km ?? 0, closest.z_km ?? 0, closest.inclination, closest.raan)

    const data = []
    for (let t = 0; t <= 60; t++) {
      const [ax, ay, az] = orbitalToXYZkm(selectedSat.altitude, selectedSat.inclination, selectedSat.raan, nuA0 + speedA * t)
      const [bx, by, bz] = orbitalToXYZkm(closest.altitude, closest.inclination, closest.raan, nuB0 + speedB * t)
      const dist = Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2)
      data.push({ t, distance: parseFloat(dist.toFixed(2)), threshold: 5 })
    }

    // Approximate relative velocity from velocity vectors
    const dvx = (selectedSat.vx_kms ?? 0) - (closest.vx_kms ?? 0)
    const dvy = (selectedSat.vy_kms ?? 0) - (closest.vy_kms ?? 0)
    const dvz = (selectedSat.vz_kms ?? 0) - (closest.vz_kms ?? 0)
    const relVel = Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz)

    return { closestSat: closest, distanceData: data, relativeVelocity: relVel }
  }, [selectedSat.norad, satellites])

  // Fetch ML probabilities from backend for each time step
  const [probabilityData, setProbabilityData] = useState([])
  useEffect(() => {
    if (!closestSat || distanceData.length === 0) return
    const distances = distanceData.map((d) => d.distance)
    fetch(`${API_BASE}/api/probability-timeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        noradA: selectedSat.norad,
        noradB: closestSat.norad,
        relativeVelocityKms: relativeVelocity,
        distances,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.probabilities) {
          setProbabilityData(
            data.probabilities.map((prob, i) => ({
              t: i,
              probability: parseFloat((prob * 100).toFixed(4)),
              safe: 1,
            }))
          )
        }
      })
      .catch(() => {})
  }, [selectedSat.norad, closestSat?.norad])

  return (
    <div className="h-48 shrink-0 bg-space-900 border-t border-blue-900/40 px-4 py-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-widest">Prediction Analysis</span>
        <div className="flex gap-2 text-xs">
          <span className="text-slate-500">Pair:</span>
          <span className="text-blue-300 font-mono truncate max-w-xs">
            {selectedSat.id}{closestSat ? ` vs ${closestSat.id}` : ''}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 h-32">
        {/* Distance Chart — real propagated data */}
        <div className="flex flex-col h-full">
          <div className="shrink-0 text-xs text-slate-500 mb-1 flex items-center gap-2">
            <span className="w-2 h-0.5 bg-blue-400 inline-block" />
            Distance to nearest (km)
            <span className="text-red-400 ml-auto">— 5 km threshold</span>
          </div>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={distanceData} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="distGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e3a6e30" />
                <XAxis dataKey="t" tick={{ fill: '#64748b', fontSize: 9 }} interval={14} label={{ value: 'sec', position: 'insideBottomRight', offset: 0, fill: '#475569', fontSize: 9 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 9 }} />
                <Tooltip content={<CustomTooltip unit="km" />} />
                <ReferenceLine y={5} stroke="#ef4444" strokeDasharray="3 3" />
                <Area type="monotone" dataKey="distance" stroke="#3b82f6" fill="url(#distGrad)" dot={false} strokeWidth={1.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Probability Chart — makeshift */}
        <div className="flex flex-col h-full">
          <div className="shrink-0 text-xs text-slate-500 mb-1 flex items-center gap-2">
            <span className="w-2 h-0.5 bg-red-400 inline-block" />
            Collision Probability (%) — ML Model
          </div>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={probabilityData} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="probGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e3a6e30" />
                <XAxis dataKey="t" tick={{ fill: '#64748b', fontSize: 9 }} interval={14} label={{ value: 'sec', position: 'insideBottomRight', offset: 0, fill: '#475569', fontSize: 9 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 9 }} />
                <Tooltip content={<CustomTooltip unit="%" />} />
                <Area type="monotone" dataKey="probability" stroke="#ef4444" fill="url(#probGrad)" dot={false} strokeWidth={1.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PredictionAnalysis({ selectedSat, satellites }) {
  if (!selectedSat || !satellites?.length) return null
  return <PredictionAnalysisInner selectedSat={selectedSat} satellites={satellites} />
}
