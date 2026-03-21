import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer, Area, AreaChart,
} from 'recharts'
import { mockDistanceData, mockProbabilityData } from '../data/mockData.js'

const CustomTooltip = ({ active, payload, label, unit }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-space-800 border border-blue-800 rounded px-2 py-1 text-xs">
        <p className="text-slate-400">t = {label}s</p>
        {payload.map((p) => (
          <p key={p.dataKey} style={{ color: p.color }}>
            {p.dataKey}: {p.value?.toFixed(2)} {unit}
          </p>
        ))}
      </div>
    )
  }
  return null
}

export default function PredictionAnalysis({ selectedAlert }) {
  return (
    <div className="h-48 shrink-0 bg-space-900 border-t border-blue-900/40 px-4 py-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-widest">Prediction Analysis</span>
        <div className="flex gap-2 text-xs">
          <span className="text-slate-500">Object pair:</span>
          <span className="text-blue-300 font-mono">
            {selectedAlert ? `${selectedAlert.objectA} vs ${selectedAlert.objectB}` : 'Select an alert'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 h-32">
        {/* Distance Chart */}
        <div>
          <div className="text-xs text-slate-500 mb-1 flex items-center gap-2">
            <span className="w-2 h-0.5 bg-blue-400 inline-block" />
            Distance (km)
            <span className="text-red-400 ml-auto">— Collision Threshold</span>
          </div>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={mockDistanceData} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="distGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a6e30" />
              <XAxis dataKey="t" tick={{ fill: '#64748b', fontSize: 9 }} interval={14} />
              <YAxis tick={{ fill: '#64748b', fontSize: 9 }} />
              <Tooltip content={<CustomTooltip unit="km" />} />
              <ReferenceLine y={5} stroke="#ef4444" strokeDasharray="3 3" />
              <Area type="monotone" dataKey="distance" stroke="#3b82f6" fill="url(#distGrad)" dot={false} strokeWidth={1.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Probability Chart */}
        <div>
          <div className="text-xs text-slate-500 mb-1 flex items-center gap-2">
            <span className="w-2 h-0.5 bg-red-400 inline-block" />
            Collision Probability (%)
            <span className="text-green-400 ml-auto">— Safe Zone</span>
          </div>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={mockProbabilityData} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="probGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a6e30" />
              <XAxis dataKey="t" tick={{ fill: '#64748b', fontSize: 9 }} interval={14} />
              <YAxis tick={{ fill: '#64748b', fontSize: 9 }} domain={[0, 100]} />
              <Tooltip content={<CustomTooltip unit="%" />} />
              <ReferenceLine y={10} stroke="#22c55e" strokeDasharray="3 3" label={{ value: 'Safe', fill: '#22c55e', fontSize: 9 }} />
              <Area type="monotone" dataKey="probability" stroke="#ef4444" fill="url(#probGrad)" dot={false} strokeWidth={1.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
