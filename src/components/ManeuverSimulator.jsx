import { useState, useEffect } from 'react'

export default function ManeuverSimulator({ selectedAlert }) {
  const [maneuver, setManeuver] = useState({
    deltaAltKm: 2,
    delayMin: 10,
    deltaIncDeg: 0.2,
  })

  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setResult(null)
    setError('')
  }, [selectedAlert])

  const onChange = (field, value) => {
    setManeuver((prev) => ({
      ...prev,
      [field]: Number(value),
    }))
  }

  const runSimulation = async () => {
    if (!selectedAlert) {
      setError('Select a collision alert first.')
      return
    }

    setLoading(true)
    setError('')
    setResult(null)

    try {
      const response = await fetch('http://localhost:8000/api/simulate-maneuver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          objectA: selectedAlert.objectA,
          objectB: selectedAlert.objectB,
          noradA: selectedAlert.noradA,
          noradB: selectedAlert.noradB,
          probability: selectedAlert.probability,
          closestApproachKm: selectedAlert.closestApproachKm,
          relativeVelocityKms: selectedAlert.relativeVelocityKms,
          maneuver,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to run maneuver simulation.')
      }

      const data = await response.json()
      setResult(data)
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border-t border-blue-950 bg-space-900 px-4 py-3">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-wide text-slate-100">
          WHAT-IF MANEUVER SIMULATOR
        </h3>
      </div>

      {selectedAlert ? (
        <div className="mb-4 rounded-lg border border-blue-900 bg-space-800/70 p-3 text-xs">
          <div className="mb-1 text-slate-300">
            <span className="font-semibold text-white">Object A:</span> {selectedAlert.objectA}
          </div>
          <div className="mb-1 text-slate-300">
            <span className="font-semibold text-white">Object B:</span> {selectedAlert.objectB}
          </div>
          <div className="mb-1 text-slate-300">
            <span className="font-semibold text-white">Current Probability:</span>{' '}
            {selectedAlert.probability != null
              ? Number(selectedAlert.probability).toFixed(6)
              : '—'}
          </div>
          <div className="text-slate-300">
            <span className="font-semibold text-white">Closest Approach:</span>{' '}
            {selectedAlert.closestApproachKm != null
              ? Number(selectedAlert.closestApproachKm).toFixed(2)
              : '—'}{' '}
            km
          </div>
        </div>
      ) : (
        <div className="mb-4 rounded-lg border border-blue-900 bg-space-800/70 p-3 text-xs text-slate-400">
          Select an alert from the right panel to simulate a maneuver.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-blue-950 bg-space-800/60 p-3">
          <div className="mb-2 text-xs text-slate-300">Altitude Change (km)</div>
          <input
            type="range"
            min="-5"
            max="5"
            step="0.5"
            value={maneuver.deltaAltKm}
            onChange={(e) => onChange('deltaAltKm', e.target.value)}
            className="w-full"
          />
          <div className="mt-2 text-sm font-semibold text-blue-300">
            {maneuver.deltaAltKm} km
          </div>
        </div>

        <div className="rounded-lg border border-blue-950 bg-space-800/60 p-3">
          <div className="mb-2 text-xs text-slate-300">Delay Maneuver (min)</div>
          <input
            type="range"
            min="0"
            max="60"
            step="5"
            value={maneuver.delayMin}
            onChange={(e) => onChange('delayMin', e.target.value)}
            className="w-full"
          />
          <div className="mt-2 text-sm font-semibold text-blue-300">
            {maneuver.delayMin} min
          </div>
        </div>

        <div className="rounded-lg border border-blue-950 bg-space-800/60 p-3">
          <div className="mb-2 text-xs text-slate-300">Inclination Change (deg)</div>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={maneuver.deltaIncDeg}
            onChange={(e) => onChange('deltaIncDeg', e.target.value)}
            className="w-full"
          />
          <div className="mt-2 text-sm font-semibold text-blue-300">
            {maneuver.deltaIncDeg}°
          </div>
        </div>
      </div>

      <button
        onClick={runSimulation}
        disabled={loading}
        className="mt-4 w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? 'Running Simulation...' : 'Run Simulation'}
      </button>

      {error && (
        <div className="mt-3 rounded-lg border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-lg border border-green-900 bg-green-950/20 p-4 text-xs">
          <div className="mb-2 text-sm font-semibold text-green-300">Simulation Result</div>

          <div className="grid grid-cols-2 gap-2 text-slate-200 md:grid-cols-3">
            <div>
              <div className="text-slate-400">Old Risk</div>
              <div className="font-semibold font-mono">
                {result.oldRisk != null ? Number(result.oldRisk).toFixed(6) : '—'}
              </div>
            </div>
            <div>
              <div className="text-slate-400">New Risk</div>
              <div className="font-semibold text-green-300 font-mono">
                {result.newRisk != null ? Number(result.newRisk).toFixed(6) : '—'}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Δv</div>
              <div className="font-semibold">{result.deltaV} m/s</div>
            </div>
            <div>
              <div className="text-slate-400">Old Closest Approach</div>
              <div className="font-semibold">{result.oldDistanceKm} km</div>
            </div>
            <div>
              <div className="text-slate-400">New Closest Approach</div>
              <div className="font-semibold text-green-300">{result.newDistanceKm} km</div>
            </div>
            <div>
              <div className="text-slate-400">Relative Velocity</div>
              <div className="font-semibold">{result.relativeVelocityKms} km/s</div>
            </div>
          </div>

          <div className="mt-3 rounded-md border border-green-800 bg-green-900/20 p-3 text-green-200">
            {result.recommendation}
          </div>
        </div>
      )}
    </div>
  )
}