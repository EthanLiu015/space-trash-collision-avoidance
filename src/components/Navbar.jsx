import { useState, useRef, useEffect } from 'react'

export default function Navbar({ activeTab, onTabChange, simTime, isPlaying, onPlayPause, onStepForward, onStepBack, simSpeed, onSpeedChange, onSearch, filteredSatellites = [], onSelectFromSearch }) {
  const [searchVal, setSearchVal] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const formatTime = (date) => {
    return date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
  }

  const handleSearchChange = (val) => {
    setSearchVal(val)
    onSearch(val)
    setDropdownOpen(val.trim().length > 0)
    onSelectFromSearch?.(null)
  }

  const handleSelect = (sat) => {
    setSearchVal(sat.id)
    onSearch(sat.id)
    onSelectFromSearch?.(sat)
    setDropdownOpen(false)
  }

  const showDropdown = dropdownOpen && searchVal.trim() && filteredSatellites.length > 0

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

      {/* Search with dropdown */}
      <div ref={containerRef} className="relative">
        <div className="flex items-center bg-space-900 rounded border border-blue-900/40 px-2 py-1 gap-1 min-w-[320px]">
          <span className="text-slate-500 text-xs">&#128269;</span>
          <input
            type="text"
            placeholder="Search satellite or NORAD ID"
            value={searchVal}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => searchVal.trim() && setDropdownOpen(true)}
            className="bg-transparent text-xs text-slate-300 outline-none placeholder-slate-600 flex-1 min-w-0"
          />
        </div>
        {showDropdown && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-space-800 border border-blue-900/50 rounded shadow-xl z-50 max-h-64 overflow-y-auto">
            {filteredSatellites.slice(0, 50).map((sat) => (
              <button
                key={sat.norad}
                type="button"
                onClick={() => handleSelect(sat)}
                className="w-full px-3 py-2 text-left text-xs hover:bg-blue-900/40 flex items-center justify-between gap-2 border-b border-blue-900/30 last:border-b-0"
              >
                <span className="text-slate-200 truncate">{sat.id}</span>
                <span className="text-slate-500 shrink-0">NORAD {sat.norad}</span>
                <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded ${sat.type === 'debris' ? 'bg-red-900/50 text-red-300' : 'bg-green-900/50 text-green-300'}`}>
                  {sat.type}
                </span>
              </button>
            ))}
            {filteredSatellites.length > 50 && (
              <div className="px-3 py-2 text-[10px] text-slate-500 border-t border-blue-900/30">
                +{filteredSatellites.length - 50} more — refine search
              </div>
            )}
          </div>
        )}
      </div>

      {/* Settings */}
      <button className="text-slate-400 hover:text-white text-sm px-2">&#9881;</button>
    </div>
  )
}
