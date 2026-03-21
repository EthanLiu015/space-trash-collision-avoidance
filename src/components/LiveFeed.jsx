import { useState, useEffect, useRef } from 'react'

const MAX_FEED_ITEMS = 50

const TYPE_COLORS = {
  alert: 'text-red-400',
  warning: 'text-yellow-400',
  info: 'text-blue-400',
  success: 'text-green-400',
}

const TYPE_BG = {
  alert: 'bg-red-900/20 border-red-800/40',
  warning: 'bg-yellow-900/20 border-yellow-800/40',
  info: 'bg-blue-900/10 border-blue-800/20',
  success: 'bg-green-900/10 border-green-800/20',
}

function alertToFeedType(alert) {
  if (alert.risk === 'CRITICAL') return 'alert'
  if (alert.risk === 'HIGH') return 'warning'
  if (alert.risk === 'MEDIUM') return 'info'
  return 'success'
}

function feedTypeIcon(type) {
  if (type === 'alert') return '🔴'
  if (type === 'warning') return '⚠️'
  if (type === 'info') return '📡'
  return '✅'
}

function formatEpochTime(epochUtc) {
  if (!epochUtc) return '--:--:--'
  try {
    const d = new Date(epochUtc)
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')} UTC`
  } catch {
    return '--:--:--'
  }
}

export default function LiveFeed({ alerts = [], objectCount = 0, onRefresh, live = false, filter, onFilterChange, simTime }) {
  const [feedItems, setFeedItems] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const shownIdsRef = useRef(new Set())

  // Only add NEW close approaches to the feed (ones we haven't shown before)
  useEffect(() => {
    const newAlerts = alerts.filter((alert) => !shownIdsRef.current.has(alert.id))
    if (newAlerts.length === 0) return

    for (const alert of newAlerts) shownIdsRef.current.add(alert.id)

    const timestamp = simTime ? formatEpochTime(simTime.toISOString()) : formatEpochTime(null)
    const newItems = newAlerts.map((alert) => {
      const type = alertToFeedType(alert)
      return {
        id: alert.id,
        type,
        icon: feedTypeIcon(type),
        message: `Close approach: ${alert.objectA} / ${alert.objectB} (${alert.closestApproach})`,
        time: timestamp,
        probability: alert.probability,
      }
    })
    setFeedItems((prev) => [...newItems, ...prev].slice(0, MAX_FEED_ITEMS))
  }, [alerts, simTime])

  const handleRefresh = async () => {
    if (refreshing || !onRefresh) return
    setRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
    }
  }

  const filtered = filter === 'All Objects' ? feedItems :
    filter === 'Active Only' ? feedItems.filter(f => f.type === 'success' || f.type === 'info') :
    feedItems.filter(f => f.type === 'alert' || f.type === 'warning')

  return (
    <div className="w-64 shrink-0 flex flex-col bg-space-800 border-r border-blue-900/40 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-blue-900/40 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-300 tracking-widest uppercase">Live Data Feed</span>
        <span className="flex items-center gap-1">
          <span className={`w-2 h-2 rounded-full ${live ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`} />
          <span className={`text-xs ${live ? 'text-green-400' : 'text-amber-400'}`}>
            {live ? '5 km screening' : 'Cached (run backend)'}
          </span>
        </span>
      </div>

      {/* Filter buttons */}
      <div className="px-2 py-2 border-b border-blue-900/30 flex gap-1 flex-wrap">
        {['All Objects', 'Active Only', 'Debris Only'].map((f) => (
          <button
            key={f}
            onClick={() => onFilterChange(f)}
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${
              filter === f
                ? 'bg-blue-700 border-blue-600 text-white'
                : 'border-blue-900/50 text-slate-400 hover:text-slate-200'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Feed items */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
        {filtered.length === 0 ? (
          <div className="text-xs text-slate-500 py-4 text-center">
            {alerts.length === 0 ? 'Loading close approach data...' : 'No new close approaches'}
          </div>
        ) : (
          filtered.map((item) => (
            <div
              key={item.id}
              className={`text-xs rounded border px-2 py-1.5 ${TYPE_BG[item.type] || 'bg-space-900 border-blue-900/20'}`}
            >
              <div className="flex items-center gap-1.5">
                <span>{item.icon}</span>
                <span className="font-mono text-slate-500 shrink-0">{item.time}</span>
              </div>
              <div className={`mt-0.5 ${TYPE_COLORS[item.type] || 'text-slate-300'}`}>
                {item.message}
              </div>
              {item.probability != null && (
                <div className="mt-0.5 text-slate-500 text-[10px] font-mono">
                  Collision prob: {Number(item.probability).toFixed(6)}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Stats footer */}
      <div className="px-3 py-2 border-t border-blue-900/40">
        <div className="grid grid-cols-2 gap-1 mb-2">
          <div className="text-center">
            <div className="text-xs text-slate-500">Tracked</div>
            <div className="text-sm font-bold text-blue-400">{objectCount.toLocaleString()}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-slate-500">Close (&lt;5 km)</div>
            <div className="text-sm font-bold text-red-400">{alerts.length}</div>
          </div>
        </div>
        {onRefresh && (
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="w-full text-xs py-1.5 rounded border border-blue-700 bg-blue-900/30 text-blue-300 hover:bg-blue-800/40 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {refreshing ? 'Screening...' : 'Refresh screening'}
          </button>
        )}
      </div>
    </div>
  )
}
