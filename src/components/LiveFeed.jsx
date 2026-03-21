import { useState, useEffect, useRef } from 'react'
import { mockLiveFeed } from '../data/mockData.js'

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

export default function LiveFeed({ filter, onFilterChange }) {
  const [feed, setFeed] = useState(mockLiveFeed)
  const feedRef = useRef(null)

  // Simulate live updates
  useEffect(() => {
    const messages = [
      { type: 'alert', message: 'FENGYUN-1C fragment maneuver detected', icon: '🔴' },
      { type: 'warning', message: 'Close approach warning: 2 objects', icon: '⚠️' },
      { type: 'info', message: 'TLE refresh: CelesTrak synced', icon: '📡' },
      { type: 'success', message: 'Risk assessment updated', icon: '✅' },
      { type: 'alert', message: 'New debris object catalogued', icon: '🔴' },
      { type: 'warning', message: 'STARLINK-4291 altitude anomaly', icon: '⚠️' },
    ]

    const interval = setInterval(() => {
      const msg = messages[Math.floor(Math.random() * messages.length)]
      const now = new Date()
      const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`
      setFeed(prev => [{
        id: Date.now(),
        time,
        ...msg,
      }, ...prev.slice(0, 29)])
    }, 3500)

    return () => clearInterval(interval)
  }, [])

  const filtered = filter === 'All Objects' ? feed :
    filter === 'Active Only' ? feed.filter(f => f.type === 'success' || f.type === 'info') :
    feed.filter(f => f.type === 'alert' || f.type === 'warning')

  return (
    <div className="w-64 shrink-0 flex flex-col bg-space-800 border-r border-blue-900/40 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-blue-900/40 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-300 tracking-widest uppercase">Live Data Feed</span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-green-400">Live</span>
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
      <div ref={feedRef} className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
        {filtered.map((item) => (
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
          </div>
        ))}
      </div>

      {/* Stats footer */}
      <div className="px-3 py-2 border-t border-blue-900/40 grid grid-cols-2 gap-1">
        <div className="text-center">
          <div className="text-xs text-slate-500">Tracked</div>
          <div className="text-sm font-bold text-blue-400">27,843</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-slate-500">Alerts</div>
          <div className="text-sm font-bold text-red-400">3</div>
        </div>
      </div>
    </div>
  )
}
