import { useState, useEffect } from 'react'
import { fetchSatelliteEncounters } from '../api/satellites.js'

function formatMinutes(min) {
  if (min < 0) return `${Math.abs(Math.round(min))} min ago`
  if (min < 60) return `in ${Math.round(min)} min`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (m === 0) return `in ${h}h`
  return `in ${h}h ${m}m`
}

export default function SearchEncounters({ searchedSatellite }) {
  const [encounters, setEncounters] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!searchedSatellite?.norad) {
      setEncounters([])
      return
    }
    const norad = searchedSatellite.norad
    const t = setTimeout(() => {
      setLoading(true)
      fetchSatelliteEncounters(norad, 1)
        .then(setEncounters)
        .catch(() => setEncounters([]))
        .finally(() => setLoading(false))
    }, 400)
    return () => clearTimeout(t)
  }, [searchedSatellite?.norad])

  if (!searchedSatellite) return null

  return (
    <div className="border-b border-blue-900/40 bg-space-800/80 px-4 py-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-300">
          Close encounters (&lt;5 km) for <span className="text-blue-300">{searchedSatellite.id}</span> — next hour
        </span>
        {loading && <span className="text-[10px] text-amber-400">Loading...</span>}
      </div>
      {!loading && encounters.length === 0 && (
        <div className="text-xs text-slate-500 mt-1">No close encounters in the next hour.</div>
      )}
      {!loading && encounters.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {encounters.map((enc, i) => (
            <div
              key={`${enc.norad_b}-${enc.tca_utc}`}
              className="rounded border border-blue-900/50 bg-space-900/80 px-3 py-1.5 text-xs"
            >
              <span className="text-slate-400">{enc.object_b}</span>
              <span className="text-slate-500 mx-1">·</span>
              <span className="text-amber-400 font-mono">{enc.distance_km.toFixed(2)} km</span>
              <span className="text-slate-500 mx-1">·</span>
              <span className="text-green-400">{formatMinutes(enc.minutes_from_now)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
