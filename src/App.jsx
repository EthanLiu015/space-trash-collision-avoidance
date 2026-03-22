import { useState, useEffect, useRef, useMemo } from 'react'
import Globe from './components/Globe.jsx'
import Navbar from './components/Navbar.jsx'
import LiveFeed from './components/LiveFeed.jsx'
import CollisionAlerts from './components/CollisionAlerts.jsx'
import PredictionAnalysis from './components/PredictionAnalysis.jsx'
import ManeuverSimulator from './components/ManeuverSimulator.jsx'
import SearchEncounters from './components/SearchEncounters.jsx'
import { fetchActiveSatellites, fetchCollisionRefresh } from './api/satellites.js'

const MAX_GLOBE_OBJECTS = 500
const MAX_PERSISTED_ALERTS = 50

export default function App() {
  const [activeTab, setActiveTab] = useState('All Objects')
  const [filter, setFilter] = useState('All Objects')
  const [isPlaying, setIsPlaying] = useState(true)
  const [simSpeed, setSimSpeed] = useState(1)
  const [simTime, setSimTime] = useState(new Date())
  const [selectedSat, setSelectedSat] = useState(null)
  const [selectedAlert, setSelectedAlert] = useState(null)
  const [showManeuver, setShowManeuver] = useState(false)
  const [showPrediction, setShowPrediction] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSearchSatellite, setSelectedSearchSatellite] = useState(null)
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
      setCollisionDataLive(live)

      setAlerts((prev) => {
        const byId = new Map(prev.map((a) => [a.id, a]))
        for (const a of fresh) byId.set(a.id, a)
        const merged = Array.from(byId.values())
        merged.sort((a, b) => (b.epoch_utc || '').localeCompare(a.epoch_utc || ''))
        return merged.slice(0, MAX_PERSISTED_ALERTS)
      })
    } finally {
      refreshingRef.current = false
    }
  }

  useEffect(() => {
    Promise.all([fetchActiveSatellites(), runCollisionRefresh()])
      .then(([sats]) => {
        setSatellites(sats ?? [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const interval = setInterval(runCollisionRefresh, Math.max(500, 2000 / simSpeed))
    return () => clearInterval(interval)
  }, [simSpeed])

  useEffect(() => {
    if (!isPlaying) return
    const interval = setInterval(() => {
      setSimTime((prev) => new Date(prev.getTime() + simSpeed * 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [isPlaying, simSpeed])

  useEffect(() => {
    if (!selectedAlert && alerts.length > 0) {
      setSelectedAlert(alerts[0])
      return
    }

    if (selectedAlert) {
      const updatedMatch = alerts.find((a) => a.id === selectedAlert.id)
      if (updatedMatch) {
        setSelectedAlert(updatedMatch)
      }
    }
  }, [alerts, selectedAlert])

  const tabFilteredSatellites = satellites.filter((sat) => {
    if (activeTab === 'Active Satellites') return sat.type === 'active'
    if (activeTab === 'Debris') return sat.type === 'debris'
    return true
  })

  const filteredSatellites = tabFilteredSatellites.filter((sat) => {
    if (searchQuery === '') return true
    const q = searchQuery.toLowerCase().trim()
    return (sat.id ?? '').toLowerCase().includes(q) || String(sat.norad ?? '').includes(q)
  })

  const searchedSatellite =
    selectedSearchSatellite ??
    (searchQuery.trim() && filteredSatellites.length > 0 ? filteredSatellites[0] : null)

  const highlightedNoradIds = useMemo(() => {
    const ids = new Set()
    if (selectedAlert?.noradA != null) ids.add(selectedAlert.noradA)
    if (selectedAlert?.noradB != null) ids.add(selectedAlert.noradB)
    if (searchedSatellite?.norad != null) ids.add(searchedSatellite.norad)
    if (selectedSat?.norad != null) ids.add(selectedSat.norad)
    return ids
  }, [selectedAlert?.noradA, selectedAlert?.noradB, searchedSatellite?.norad, selectedSat?.norad])

  // When a collision is selected, use TCA positions so the two dots appear near each other
  const collisionPositionOverrides = useMemo(() => {
    if (!selectedAlert?.positionA || !selectedAlert?.positionB) return null
    const map = new Map()
    if (selectedAlert.noradA != null) map.set(selectedAlert.noradA, selectedAlert.positionA)
    if (selectedAlert.noradB != null) map.set(selectedAlert.noradB, selectedAlert.positionB)
    return map.size > 0 ? map : null
  }, [selectedAlert?.noradA, selectedAlert?.noradB, selectedAlert?.positionA, selectedAlert?.positionB])

  const globeSatellites = (() => {
    let list
    if (activeTab !== 'All Objects') list = tabFilteredSatellites.slice(0, MAX_GLOBE_OBJECTS)
    else {
      const active = tabFilteredSatellites.filter((s) => s.type === 'active').slice(0, MAX_GLOBE_OBJECTS)
      const debris = tabFilteredSatellites.filter((s) => s.type === 'debris').slice(0, MAX_GLOBE_OBJECTS)
      const decaying = tabFilteredSatellites.filter((s) => s.type === 'decaying').slice(0, MAX_GLOBE_OBJECTS)
      list = [...active, ...debris, ...decaying]
    }
    const ids = new Set(list.map((s) => s.norad ?? s.id))
    const extras = []
    for (const norad of [selectedAlert?.noradA, selectedAlert?.noradB, searchedSatellite?.norad].filter(Boolean)) {
      if (ids.has(norad)) continue
      const sat = satellites.find((s) => (s.norad ?? s.id) === norad)
      if (sat) {
        extras.push(sat)
        ids.add(norad)
      }
    }
    return [...list, ...extras]
  })()

  const handleStepForward = () => {
    setSimTime((prev) => new Date(prev.getTime() + 60 * 1000))
  }

  const handleStepBack = () => {
    setSimTime((prev) => new Date(prev.getTime() - 60 * 1000))
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-space-900 overflow-hidden">
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        simTime={simTime}
        isPlaying={isPlaying}
        onPlayPause={() => setIsPlaying((p) => !p)}
        onStepForward={handleStepForward}
        onStepBack={handleStepBack}
        simSpeed={simSpeed}
        onSpeedChange={setSimSpeed}
        onSearch={(q) => { setSearchQuery(q); if (!q.trim()) setSelectedSearchSatellite(null) }}
        filteredSatellites={filteredSatellites}
        onSelectFromSearch={setSelectedSearchSatellite}
      />

      {searchedSatellite && <SearchEncounters searchedSatellite={searchedSatellite} />}

      <div className="flex flex-1 overflow-hidden">
        <LiveFeed
          alerts={alerts}
          objectCount={satellites.length}
          onRefresh={runCollisionRefresh}
          live={collisionDataLive}
          filter={filter}
          onFilterChange={setFilter}
          simTime={simTime}
        />

        <div className="flex-1 flex flex-col overflow-hidden relative">
          <div className="flex-1 relative">
            <div className="absolute inset-0 bg-gradient-to-br from-space-800 to-space-900" />

            {loading && (
              <div className="absolute inset-0 flex items-center justify-center z-10 text-slate-400 text-sm">
                Loading satellite data...
              </div>
            )}

            <Globe
              satellites={globeSatellites}
              alerts={alerts}
              highlightedNoradIds={highlightedNoradIds}
              collisionPositionOverrides={collisionPositionOverrides}
              onSelectSat={(sat) => { setSelectedSat(sat); setShowPrediction(true) }}
              isPlaying={isPlaying}
              simSpeed={simSpeed}
              activeTab={activeTab}
            />

            {selectedSat && (
              <div className="absolute top-3 left-3 bg-space-800/90 border border-blue-800 rounded p-3 text-xs backdrop-blur-sm max-w-48">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-blue-300">{selectedSat.id}</span>
                  <button
                    onClick={() => setSelectedSat(null)}
                    className="text-slate-500 hover:text-white ml-3"
                  >
                    &#10005;
                  </button>
                </div>
                <div className="space-y-0.5 text-slate-400">
                  <div>
                    Type:{' '}
                    <span className={selectedSat.type === 'debris' ? 'text-red-400' : 'text-green-400'}>
                      {selectedSat.type}
                    </span>
                  </div>
                  <div>
                    Altitude: <span className="text-slate-200">{selectedSat.altitude} km</span>
                  </div>
                  <div>
                    Inclination: <span className="text-slate-200">{selectedSat.inclination}&deg;</span>
                  </div>
                  <div>
                    RAAN: <span className="text-slate-200">{selectedSat.raan}&deg;</span>
                  </div>
                </div>
              </div>
            )}

            <div className="absolute bottom-3 left-3 flex gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Active
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Debris
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" /> Decaying
              </span>
              {!loading && <span>{tabFilteredSatellites.length.toLocaleString()} objects</span>}
            </div>

            <div className="absolute bottom-3 right-3 text-xs text-slate-600">
              Drag to rotate &middot; Scroll to zoom
            </div>
          </div>

          {showPrediction && <PredictionAnalysis selectedSat={selectedSat} satellites={satellites} selectedAlert={selectedAlert} onClose={() => setShowPrediction(false)} />}
          {showManeuver && selectedAlert && (
            <ManeuverSimulator selectedAlert={selectedAlert} onClose={() => setShowManeuver(false)} />
          )}
        </div>

        <CollisionAlerts
          alerts={alerts}
          live={collisionDataLive}
          selectedAlert={selectedAlert}
          onSelectAlert={(alert) => { setSelectedAlert(alert); setShowManeuver(true) }}
        />
      </div>
    </div>
  )
}