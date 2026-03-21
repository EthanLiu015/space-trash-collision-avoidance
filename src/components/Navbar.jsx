import { useState } from 'react'

export default function Navbar({ activeTab, onTabChange, simTime, isPlaying, onPlayPause, onStepForward, onStepBack, simSpeed, onSpeedChange, onSearch }) {
  const [searchVal, setSearchVal] = useState('')

  const formatTime = (date) => {
    return date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
  }

  return (
    <div className="flex items-center h-12 px-4 bg-space-800 border-b border-blue-900/50 gap-3 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-2">
        <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">OG</div>
        <span className="font-bold text-blue-400 text-sm tracking-wider glow-blue hidden sm:block">OrbitalGuard</span>
      </div>

      {/* Tabs */}
      <div className="flex bg-space-900 rounded border border-blue-900/40 text-xs">
        {['Active Satellites', 'Debris', 'All Objects'].map((tab) => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`px-3 py-1.5 transition-colors ${
              activeTab === tab
                ? 'bg-blue-700 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Playback Controls */}
      <div className="flex items-center gap-1 bg-space-900 rounded border border-blue-900/40 px-2 py-1">
        <button onClick={onStepBack} className="text-slate-400 hover:text-white p-1 text-sm" title="Step back">&#9194;</button>
        <button onClick={onPlayPause} className="text-white hover:text-blue-400 p-1 text-sm w-6 text-center">
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button onClick={onStepForward} className="text-slate-400 hover:text-white p-1 text-sm" title="Step forward">&#9193;</button>
        <select
          value={simSpeed}
          onChange={(e) => onSpeedChange(Number(e.target.value))}
          className="bg-transparent text-xs text-slate-300 border-none outline-none ml-1"
        >
          <option value={0.5}>0.5x</option>
          <option value={1}>1x</option>
          <option value={5}>5x</option>
          <option value={10}>10x</option>
          <option value={60}>60x</option>
        </select>
      </div>

      {/* Sim time display */}
      <div className="hidden md:flex items-center gap-2 bg-space-900 rounded border border-blue-900/40 px-2 py-1">
        <span className="text-blue-500 text-xs">&#9201;</span>
        <span className="text-xs font-mono text-blue-300">{formatTime(simTime)}</span>
      </div>

      {/* Search */}
      <div className="flex items-center bg-space-900 rounded border border-blue-900/40 px-2 py-1 gap-1">
        <span className="text-slate-500 text-xs">&#128269;</span>
        <input
          type="text"
          placeholder="Search satellite or NORAD ID"
          value={searchVal}
          onChange={(e) => { setSearchVal(e.target.value); onSearch(e.target.value) }}
          className="bg-transparent text-xs text-slate-300 outline-none placeholder-slate-600 w-40"
        />
      </div>

      {/* Settings */}
      <button className="text-slate-400 hover:text-white text-sm px-2">&#9881;</button>
    </div>
  )
}
