import { useRef, useMemo, useEffect, Suspense, Component } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Stars, useTexture } from '@react-three/drei'
import * as THREE from 'three'

class TextureErrorBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

// Convert orbital elements to 3D position
function orbitalToXYZ(altitude, inclination, raan, trueAnomaly) {
  const R_EARTH = 6371
  const r = R_EARTH + altitude
  const incRad = (inclination * Math.PI) / 180
  const raanRad = (raan * Math.PI) / 180
  const tRad = (trueAnomaly * Math.PI) / 180

  const x = r * (Math.cos(raanRad) * Math.cos(tRad) - Math.sin(raanRad) * Math.sin(tRad) * Math.cos(incRad))
  const y = r * Math.sin(tRad) * Math.sin(incRad)
  const z = r * (Math.sin(raanRad) * Math.cos(tRad) + Math.cos(raanRad) * Math.sin(tRad) * Math.cos(incRad))

  // Scale down for rendering (Earth radius = 1 unit)
  const scale = 1 / R_EARTH
  return [x * scale, y * scale, z * scale]
}

const SIDEREAL_DAY_SEC = 86164 // 23h 56m 4s — one rotation relative to stars
const EARTH_ROTATION_RAD_PER_SEC = (2 * Math.PI) / SIDEREAL_DAY_SEC

function EarthTextured({ simSpeed = 1 }) {
  const meshRef = useRef()
  const texture = useTexture('/8k_earth_daymap.jpg')
  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * simSpeed * EARTH_ROTATION_RAD_PER_SEC
  })
  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1, 64, 64]} />
      <meshPhongMaterial map={texture} shininess={15} />
    </mesh>
  )
}

function EarthFallback({ simSpeed = 1 }) {
  const meshRef = useRef()
  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * simSpeed * EARTH_ROTATION_RAD_PER_SEC
  })
  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1, 64, 64]} />
      <meshPhongMaterial color="#1a4a8a" emissive="#0a1a3a" emissiveIntensity={0.3} shininess={30} />
    </mesh>
  )
}

function Earth({ simSpeed = 1 }) {
  const atmosphereRef = useRef()
  useFrame((_, delta) => {
    if (atmosphereRef.current) atmosphereRef.current.rotation.y += delta * simSpeed * EARTH_ROTATION_RAD_PER_SEC
  })
  return (
    <group>
      <TextureErrorBoundary fallback={<EarthFallback simSpeed={simSpeed} />}>
        <Suspense fallback={<EarthFallback simSpeed={simSpeed} />}>
          <EarthTextured simSpeed={simSpeed} />
        </Suspense>
      </TextureErrorBoundary>
      <mesh ref={atmosphereRef}>
        <sphereGeometry args={[1.05, 64, 64]} />
        <meshPhongMaterial color="#4488ff" transparent opacity={0.08} side={THREE.BackSide} />
      </mesh>
    </group>
  )
}

function OrbitTrail({ altitude, inclination, raan, color, isHighlighted }) {
  const points = useMemo(() => {
    const pts = []
    for (let i = 0; i <= 128; i++) {
      const angle = (i / 128) * 360
      const [x, y, z] = orbitalToXYZ(altitude, inclination, raan, angle)
      pts.push(new THREE.Vector3(x, y, z))
    }
    return pts
  }, [altitude, inclination, raan])

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints(points)
    return geo
  }, [points])

  const opacity = isHighlighted ? 0.95 : 0.3
  const lineColor = isHighlighted ? '#ffffff' : color

  return (
    <line geometry={geometry}>
      <lineBasicMaterial color={lineColor} transparent opacity={opacity} />
    </line>
  )
}

const R_EARTH_KM = 6371
const MU_EARTH = 398600 // km³/s²

// Compute initial true anomaly (deg) from ECI position. Keeps objects on correct orbit phase.
function trueAnomalyFromECI(xKm, yKm, zKm, incDeg, raanDeg) {
  const r = Math.sqrt(xKm * xKm + yKm * yKm + zKm * zKm)
  if (r < 100) return 0
  const incRad = (incDeg * Math.PI) / 180
  const raanRad = (raanDeg * Math.PI) / 180
  const sinInc = Math.sin(incRad)
  if (Math.abs(sinInc) < 0.01) {
    return ((Math.atan2(yKm, xKm) - raanRad) * 180) / Math.PI
  }
  const cosNu = (xKm * Math.cos(raanRad) + zKm * Math.sin(raanRad)) / r
  const sinNu = zKm / (r * sinInc)
  return (Math.atan2(sinNu, cosNu) * 180) / Math.PI
}

function Satellite({ satellite, isHighlighted, onClick, simSpeed = 60, positionOverride = null }) {
  const meshRef = useRef()
  const scale = 1 / R_EARTH_KM

  const angleRef = useRef((() => {
    if (satellite.x_km != null && satellite.y_km != null && satellite.z_km != null) {
      const nu = trueAnomalyFromECI(
        satellite.x_km, satellite.y_km, satellite.z_km,
        satellite.inclination, satellite.raan
      )
      return ((nu % 360) + 360) % 360
    }
    return Math.random() * 360
  })())
  const orbitalSpeed = useMemo(() => {
    const a = R_EARTH_KM + satellite.altitude
    const T = 2 * Math.PI * Math.sqrt(Math.pow(a, 3) / MU_EARTH)
    return 360 / T
  }, [satellite.altitude])

  useFrame((_, delta) => {
    if (positionOverride && positionOverride.x_km != null && positionOverride.y_km != null && positionOverride.z_km != null) return
    const next = angleRef.current + orbitalSpeed * delta * simSpeed
    angleRef.current = ((next % 360) + 360) % 360
    const [x, y, z] = orbitalToXYZ(satellite.altitude, satellite.inclination, satellite.raan, angleRef.current)
    if (meshRef.current) meshRef.current.position.set(x, y, z)
  })

  const color = satellite.type === 'debris' ? '#ef4444' : satellite.type === 'decaying' ? '#f97316' : '#3b82f6'
  const size = isHighlighted ? 0.04 : 0.015

  // When collision selected: use exact TCA positions so the two satellites appear close (collision location).
  if (positionOverride && positionOverride.x_km != null && positionOverride.y_km != null && positionOverride.z_km != null) {
    const x = positionOverride.x_km * scale
    const y = positionOverride.y_km * scale
    const z = positionOverride.z_km * scale
    return (
      <group position={[x, y, z]}>
        <mesh>
          <sphereGeometry args={[size, 8, 8]} />
          <meshBasicMaterial color={isHighlighted ? '#ffffff' : color} />
        </mesh>
        <mesh onClick={onClick}>
          <sphereGeometry args={[0.04, 6, 6]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        {isHighlighted && (
          <pointLight color={color} intensity={1} distance={0.35} />
        )}
      </group>
    )
  }

  return (
    <group ref={meshRef}>
      <mesh>
        <sphereGeometry args={[size, 8, 8]} />
        <meshBasicMaterial color={isHighlighted ? '#ffffff' : color} />
      </mesh>
      <mesh onClick={onClick}>
        <sphereGeometry args={[0.04, 6, 6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {isHighlighted && (
        <pointLight color={color} intensity={1} distance={0.35} />
      )}
    </group>
  )
}

function SceneContent({ satellites, highlightedNoradIds, collisionPositionOverrides, onSelectSat, isPlaying, simSpeed, activeTab }) {
  const { camera } = useThree()

  // DEBUG: log type breakdown whenever satellites or tab changes
  if (typeof window !== 'undefined') {
    const counts = satellites.reduce((acc, s) => { acc[s.type] = (acc[s.type] || 0) + 1; return acc }, {})
    console.log(`[Globe] tab="${activeTab}" satellites:`, counts)
  }

  useEffect(() => {
    camera.position.set(0, 1.5, 3.5)
  }, [camera])

  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 3, 5]} intensity={1.2} color="#ffffff" />
      <directionalLight position={[-5, -3, -5]} intensity={0.2} color="#3366ff" />

      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={0.5} />

      <Earth simSpeed={simSpeed} />

      <group key={activeTab}>
        {satellites.map((sat) => (
          <OrbitTrail
            key={`trail-${sat.id}`}
            altitude={sat.altitude}
            inclination={sat.inclination}
            raan={sat.raan}
            color={sat.type === 'debris' ? '#ef444440' : sat.type === 'decaying' ? '#f9731640' : '#3b82f640'}
            isHighlighted={highlightedNoradIds.has(sat.norad)}
          />
        ))}

        {satellites.map((sat) => (
          <Satellite
            key={sat.id}
            satellite={sat}
            isHighlighted={highlightedNoradIds.has(sat.norad)}
            positionOverride={collisionPositionOverrides?.get(sat.norad) ?? null}
            onClick={() => onSelectSat(sat)}
            simSpeed={simSpeed}
          />
        ))}
      </group>

      <OrbitControls
        enablePan={false}
        minDistance={1.5}
        maxDistance={8}
        rotateSpeed={0.5}
        zoomSpeed={0.8}
      />
    </>
  )
}

export default function Globe({ satellites, alerts, highlightedNoradIds = new Set(), collisionPositionOverrides = null, onSelectSat, isPlaying, simSpeed, activeTab }) {
  return (
    <Canvas
      camera={{ position: [0, 1.5, 3.5], fov: 45 }}
      gl={{ antialias: true, alpha: true }}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    >
      <SceneContent
        satellites={satellites}
        collisionPositionOverrides={collisionPositionOverrides}
        highlightedNoradIds={highlightedNoradIds}
        onSelectSat={onSelectSat}
        isPlaying={isPlaying}
        simSpeed={simSpeed}
        activeTab={activeTab}
      />
    </Canvas>
  )
}
