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

function EarthTextured() {
  const meshRef = useRef()
  const texture = useTexture('/8k_earth_daymap.jpg')
  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.05
  })
  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1, 64, 64]} />
      <meshPhongMaterial map={texture} shininess={15} />
    </mesh>
  )
}

function EarthFallback() {
  const meshRef = useRef()
  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.05
  })
  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1, 64, 64]} />
      <meshPhongMaterial color="#1a4a8a" emissive="#0a1a3a" emissiveIntensity={0.3} shininess={30} />
    </mesh>
  )
}

function Earth() {
  const atmosphereRef = useRef()
  useFrame((_, delta) => {
    if (atmosphereRef.current) atmosphereRef.current.rotation.y += delta * 0.05
  })
  return (
    <group>
      <TextureErrorBoundary fallback={<EarthFallback />}>
        <Suspense fallback={<EarthFallback />}>
          <EarthTextured />
        </Suspense>
      </TextureErrorBoundary>
      <mesh ref={atmosphereRef}>
        <sphereGeometry args={[1.05, 64, 64]} />
        <meshPhongMaterial color="#4488ff" transparent opacity={0.08} side={THREE.BackSide} />
      </mesh>
    </group>
  )
}

function OrbitTrail({ altitude, inclination, raan, color }) {
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

  return (
    <line geometry={geometry}>
      <lineBasicMaterial color={color} transparent opacity={0.3} />
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

function Satellite({ satellite, isHighlighted, onClick, simSpeed = 60 }) {
  const meshRef = useRef()
  // Angular propagation keeps objects on orbit path (no drift). Linear ECI integration causes spiral-out.
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
  // Orbital angular speed (deg/s): T = 2π√(a³/μ), ω = 360/T
  const orbitalSpeed = useMemo(() => {
    const a = R_EARTH_KM + satellite.altitude
    const T = 2 * Math.PI * Math.sqrt(Math.pow(a, 3) / MU_EARTH)
    return 360 / T
  }, [satellite.altitude])

  useFrame((_, delta) => {
    const next = angleRef.current + orbitalSpeed * delta * simSpeed
    angleRef.current = ((next % 360) + 360) % 360
    const [x, y, z] = orbitalToXYZ(satellite.altitude, satellite.inclination, satellite.raan, angleRef.current)
    if (meshRef.current) meshRef.current.position.set(x, y, z)
  })

  const color = satellite.type === 'debris' ? '#ef4444' : '#3b82f6'
  const size = isHighlighted ? 0.025 : 0.015

  return (
    <mesh ref={meshRef} onClick={onClick}>
      <sphereGeometry args={[size, 8, 8]} />
      <meshBasicMaterial color={isHighlighted ? '#ffffff' : color} />
      {isHighlighted && (
        <pointLight color={color} intensity={0.5} distance={0.2} />
      )}
    </mesh>
  )
}

function CollisionWarningMarker({ position }) {
  const ringRef = useRef()
  useFrame((state) => {
    if (ringRef.current) {
      ringRef.current.scale.setScalar(1 + 0.3 * Math.sin(state.clock.elapsedTime * 3))
      ringRef.current.material.opacity = 0.6 + 0.4 * Math.sin(state.clock.elapsedTime * 3)
    }
  })

  return (
    <group position={position}>
      <mesh ref={ringRef}>
        <ringGeometry args={[0.04, 0.055, 32]} />
        <meshBasicMaterial color="#ef4444" transparent opacity={0.8} side={THREE.DoubleSide} />
      </mesh>
      <pointLight color="#ef4444" intensity={1} distance={0.3} />
    </group>
  )
}

function SceneContent({ satellites, alerts, selectedSatId, onSelectSat, isPlaying, simSpeed }) {
  const { camera } = useThree()

  useEffect(() => {
    camera.position.set(0, 1.5, 3.5)
  }, [camera])

  // Compute approximate collision positions for alerts
  const collisionPositions = useMemo(() => {
    return alerts.slice(0, 2).map((_, i) => {
      const angle = i * 120
      return orbitalToXYZ(600, 53, angle, 45)
    })
  }, [alerts])

  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 3, 5]} intensity={1.2} color="#ffffff" />
      <directionalLight position={[-5, -3, -5]} intensity={0.2} color="#3366ff" />

      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={0.5} />

      <Earth />

      {satellites.map((sat) => (
        <OrbitTrail
          key={`trail-${sat.id}`}
          altitude={sat.altitude}
          inclination={sat.inclination}
          raan={sat.raan}
          color={sat.type === 'debris' ? '#ef444440' : '#3b82f640'}
        />
      ))}

      {satellites.map((sat) => (
        <Satellite
          key={sat.id}
          satellite={sat}
          isHighlighted={selectedSatId === sat.id}
          onClick={() => onSelectSat(sat)}
          simSpeed={simSpeed}
        />
      ))}

      {collisionPositions.map((pos, i) => (
        <CollisionWarningMarker key={i} position={pos} />
      ))}

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

export default function Globe({ satellites, alerts, selectedSatId, onSelectSat, isPlaying, simSpeed }) {
  return (
    <Canvas
      camera={{ position: [0, 1.5, 3.5], fov: 45 }}
      gl={{ antialias: true, alpha: true }}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    >
      <SceneContent
        satellites={satellites}
        alerts={alerts}
        selectedSatId={selectedSatId}
        onSelectSat={onSelectSat}
        isPlaying={isPlaying}
        simSpeed={simSpeed}
      />
    </Canvas>
  )
}
