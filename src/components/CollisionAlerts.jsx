import { useState, useEffect } from 'react'

const RISK_STYLES = {
  CRITICAL: 'bg-red-900/30 border-red-600 text-red-400',
  HIGH: 'bg-orange-900/30 border-orange-600 text-orange-400',
  MEDIUM: 'bg-yellow-900/30 border-yellow-600 text-yellow-400',
  LOW: 'bg-green-900/30 border-green-600 text-green-400',
}

const RISK_BADGE = {
  CRITICAL: 'bg-red-600 text-white',
  HIGH: 'bg-orange-600 text-white',
  MEDIUM: 'bg-yellow-600 text-white',
  LOW: 'bg-green-700 text-white',
}

function AlertCard({ alert, onSelect, isSelected }) {
  const isCritical = alert.risk === 'CRITICAL'
  return (
    <div
      onClick={() => onSelect(alert)}
      className={`rounded border p-3 cursor-pointer transition-all mb-2 ${
        isSelected ? 'border-blue-500 bg-blue-900/20' : `${RISK_STYLES[alert.risk]} hover:opacity-90`
      } ${isCritical ? 'risk-critical' : ''}`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-bold text-slate-200">&#9888; High Risk of Collision!</span>
        <span className={`text-xs px-2 py-0.5 rounded font-bold ${RISK_BADGE[alert.risk]}`}>
          RISK: {alert.risk}
        </span>
      </div>
      <div className="space-y-0.5 text-xs">
        <div className="flex justify-between">
          <span className="text-slate-400">Object A:</span>
          <span className="text-slate-200 font-mono">{alert.objectA}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Object B:</span>
          <span className="text-slate-200 font-mono truncate ml-2">{alert.objectB}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Probability:</span>
          <span className={`font-bold font-mono ${alert.probability != null && alert.probability > 0.5 ? 'text-red-400' : alert.probability != null && alert.probability > 0.2 ? 'text-orange-400' : 'text-yellow-400'}`}>
            {alert.probability != null ? Number(alert.probability).toFixed(6) : '—'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Closest Approach:</span>
          <span className="text-slate-200 font-mono">{alert.closestApproach}</span>
        </div>
        {alert.relativeVelocity != null && (
          <div className="flex justify-between">
            <span className="text-slate-400">Relative Velocity:</span>
            <span className="text-slate-200">{alert.relativeVelocity} km/s</span>
          </div>
        )}
      </div>
    </div>
  )
}

function AvoidanceCard({ alert }) {
  return (
    <div className="rounded border border-blue-800/50 bg-blue-900/10 p-3 mt-2">
      <div className="text-xs font-semibold text-blue-300 mb-2 uppercase tracking-wider">Recommended Maneuver</div>
      <div className="text-xs text-slate-300 space-y-1">
        <div className="flex items-start gap-2">
          <span className="text-green-400 mt-0.5">&#8594;</span>
          <span>Move <strong className="text-white">+{alert.altitudeChange} km altitude</strong> &rarr; risk drops <strong className="text-green-400">{alert.probability != null ? Number(alert.probability).toFixed(6) : '—'} &rarr; {alert.riskAfterManeuver != null ? Number(alert.riskAfterManeuver).toFixed(6) : '—'}</strong></span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-blue-400 mt-0.5">&Delta;v</span>
          <span>Required &Delta;v: <strong className="text-white">{alert.deltaV} m/s</strong></span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-yellow-400 mt-0.5">&#9201;</span>
          <span>Window: <strong className="text-white">{Math.floor(alert.timeToEvent / 60)}m {alert.timeToEvent % 60}s</strong></span>
        </div>
      </div>
      <button className="mt-2 w-full text-xs bg-green-700 hover:bg-green-600 text-white rounded py-1.5 transition-colors font-semibold">
        Execute Maneuver
      </button>
      <button className="mt-1 w-full text-xs border border-blue-700 hover:bg-blue-900/40 text-blue-300 rounded py-1.5 transition-colors">
        Explain with AI
      </button>
    </div>
  )
}

export default function CollisionAlerts({ alerts, live = false }) {
  const [selectedAlert, setSelectedAlert] = useState(alerts[0] || null)

  // Sync selected alert when alerts refresh — keep selection if still present, else pick first
  useEffect(() => {
    if (alerts.length === 0) {
      setSelectedAlert(null)
      return
    }
    const stillPresent = selectedAlert && alerts.some((a) => a.id === selectedAlert.id)
    if (!stillPresent) setSelectedAlert(alerts[0])
  }, [alerts, selectedAlert])

  return (
    <div className="w-72 shrink-0 flex flex-col bg-space-800 border-l border-blue-900/40 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-blue-900/40 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-300 tracking-widest uppercase">Collision Alerts</span>
        <span className="flex items-center gap-2">
          <span className={`text-[10px] ${live ? 'text-green-400' : 'text-amber-400'}`}>
            {live ? 'Live' : 'Cached'}
          </span>
          <span className="bg-red-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
            {alerts.length}
          </span>
        </span>
      </div>

      {/* Alert cards */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {alerts.map((alert) => (
          <AlertCard
            key={alert.id}
            alert={alert}
            onSelect={setSelectedAlert}
            isSelected={selectedAlert?.id === alert.id}
          />
        ))}

        {/* Avoidance recommendation for selected alert */}
        {selectedAlert && <AvoidanceCard alert={selectedAlert} />}
      </div>

      {/* Summary footer */}
      <div className="px-3 py-2 border-t border-blue-900/40">
        <div className="text-xs text-slate-500 text-center">
          {live ? (
            <>Refreshes every <span className="text-green-400">2s</span></>
          ) : (
            <>Run backend for live data</>
          )}
        </div>
      </div>
    </div>
  )
}
