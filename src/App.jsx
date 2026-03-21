import { useState, useEffect, useRef } from 'react'
import Globe from './components/Globe.jsx'
import Navbar from './components/Navbar.jsx'
import LiveFeed from './components/LiveFeed.jsx'
import CollisionAlerts from './components/CollisionAlerts.jsx'
import PredictionAnalysis from './components/PredictionAnalysis.jsx'
import { fetchActiveSatellites, fetchCollisionAlerts, fetchCollisionRefresh } from './api/satellites.js'

const MAX_GLOBE_OBJECTS = 500

export default function App() {
  const [activeTab, setActiveTab] = useState('All Objects')
  const [filter, setFilter] = useState('All Objects')
  const [isPlaying, setIsPlaying] = useState(true)
  const [simSpeed, setSimSpeed] = useState(1)
  const [simTime, setSimTime] = useState(new Date())
  const [selectedSat, setSelectedSat] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [satellites, setSatellites] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [collisionDataLive, setCollisionDataLive] = useState(false)

  const refreshingRef = useRef(false)

  const runCollisionRefresh = async () => {
    if (refreshingRef.current) return
    refreshingRef.current = true
    try {
      const { alerts: fresh, live } = await fetchCollisionRefresh()
      setAlerts(fresh)
      setCollisionDataLive(live)
    } finally {
      refreshingRef.current = false
    }
  }

  // Initial load: satellites + live collision screening (not cached)
  useEffect(() => {
    Promise.all([fetchActiveSatellites(), runCollisionRefresh()])
      .then(([sats]) => {
        setSatellites(sats ?? [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // Reload close-approach data every 2 seconds (re-runs screening for fresh results)
  useEffect(() => {
    const interval = setInterval(runCollisionRefresh, 2000)
    return () => clearInterval(interval)
  }, [])

  // Simulation clock
  useEffect(() => {
    if (!isPlaying) return
    const interval = setInterval(() => {
      setSimTime((prev) => new Date(prev.getTime() + simSpeed * 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [isPlaying, simSpeed])

  // Filter satellites based on tab and search
  const filteredSatellites = satellites.filter((sat) => {
    if (activeTab === 'Active Satellites') return sat.type === 'active'
    if (activeTab === 'Debris') return sat.type === 'debris'
    return true
  }).filter((sat) =>
    searchQuery === '' || sat.id.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Cap what's rendered on the globe for performance
  const globeSatellites = filteredSatellites.slice(0, MAX_GLOBE_OBJECTS)

  const handleStepForward = () => {
    setSimTime((prev) => new Date(prev.getTime() + 60 * 1000))
  }

  const handleStepBack = () => {
    setSimTime((prev) => new Date(prev.getTime() - 60 * 1000))
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-space-900 overflow-hidden">
      {/* Navbar */}
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        simTime={simTime}
        isPlaying={isPlaying}
        onPlayPause={() => setIsPlaying(p => !p)}
        onStepForward={handleStepForward}
        onStepBack={handleStepBack}
        simSpeed={simSpeed}
        onSpeedChange={setSimSpeed}
        onSearch={setSearchQuery}
      />

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Live Feed */}
        <LiveFeed
          alerts={alerts}
          objectCount={satellites.length}
          onRefresh={runCollisionRefresh}
          live={collisionDataLive}
          filter={filter}
          onFilterChange={setFilter}
        />

        {/* Center: Globe */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          <div className="flex-1 relative">
            {/* Globe background gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-space-800 to-space-900" />
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center z-10 text-slate-400 text-sm">
                Loading satellite data...
              </div>
            )}
            <Globe
              satellites={globeSatellites}
              alerts={alerts}
              selectedSatId={selectedSat?.id}
              onSelectSat={setSelectedSat}
              isPlaying={isPlaying}
              simSpeed={simSpeed}
            />

            {/* Overlay: selected satellite info */}
            {selectedSat && (
              <div className="absolute top-3 left-3 bg-space-800/90 border border-blue-800 rounded p-3 text-xs backdrop-blur-sm max-w-48">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-blue-300">{selectedSat.id}</span>
                  <button onClick={() => setSelectedSat(null)} className="text-slate-500 hover:text-white ml-3">&#10005;</button>
                </div>
                <div className="space-y-0.5 text-slate-400">
                  <div>Type: <span className={selectedSat.type === 'debris' ? 'text-red-400' : 'text-green-400'}>{selectedSat.type}</span></div>
                  <div>Altitude: <span className="text-slate-200">{selectedSat.altitude} km</span></div>
                  <div>Inclination: <span className="text-slate-200">{selectedSat.inclination}&deg;</span></div>
                  <div>RAAN: <span className="text-slate-200">{selectedSat.raan}&deg;</span></div>
                </div>
              </div>
            )}

            {/* Globe legend */}
            <div className="absolute bottom-3 left-3 flex gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Active</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Debris</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" /> Decaying</span>
              {!loading && <span>{filteredSatellites.length.toLocaleString()} objects</span>}
            </div>

            {/* Controls hint */}
            <div className="absolute bottom-3 right-3 text-xs text-slate-600">
              Drag to rotate &middot; Scroll to zoom
            </div>
          </div>

          {/* Bottom: Prediction Analysis */}
          <PredictionAnalysis selectedAlert={alerts[0]} />
        </div>

        {/* Right: Collision Alerts */}
        <CollisionAlerts alerts={alerts} live={collisionDataLive} />
      </div>
    </div>
  )
}
