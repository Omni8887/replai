import { useState, useEffect } from 'react'
import axios from 'axios'
import { useAuth } from '../context/AuthContext.jsx'
import { Coins, TrendingUp, Zap, Calculator, Calendar } from 'lucide-react'

export default function Usage() {
  const { API_URL } = useAuth()
  const [usage, setUsage] = useState(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('30')

  useEffect(() => {
    loadUsage()
  }, [period])

  const loadUsage = async () => {
    try {
      const response = await axios.get(`${API_URL}/admin/usage?period=${period}`)
      setUsage(response.data)
    } catch (error) {
      console.error('Failed to load usage:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatNumber = (num) => {
    return new Intl.NumberFormat('sk-SK').format(Math.round(num))
  }

  const formatCost = (cost) => {
    return new Intl.NumberFormat('sk-SK', { 
      style: 'currency', 
      currency: 'EUR',
      minimumFractionDigits: 4
    }).format(cost)
  }

  const periodOptions = [
    { value: '7', label: 'Posledných 7 dní' },
    { value: '30', label: 'Posledných 30 dní' },
    { value: '90', label: 'Posledných 90 dní' },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-500">Načítavam...</p>
      </div>
    )
  }

  const stats = [
    { 
      label: 'Celkové náklady', 
      value: formatCost(usage?.totals?.costEur || 0), 
      icon: Coins, 
      color: 'from-emerald-500 to-teal-500' 
    },
    { 
      label: 'Počet požiadaviek', 
      value: formatNumber(usage?.totals?.requests || 0), 
      icon: Zap, 
      color: 'from-violet-500 to-indigo-500' 
    },
    { 
      label: 'Input tokeny', 
      value: formatNumber(usage?.totals?.inputTokens || 0), 
      icon: TrendingUp, 
      color: 'from-amber-500 to-orange-500' 
    },
    { 
      label: 'Output tokeny', 
      value: formatNumber(usage?.totals?.outputTokens || 0), 
      icon: Calculator, 
      color: 'from-rose-500 to-pink-500' 
    },
  ]

  return (
    <div>
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Spotreba</h1>
          <p className="text-slate-500 mt-1">Prehľad spotreby tokenov a nákladov</p>
        </div>
        
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-600 focus:border-transparent outline-none bg-white"
        >
          {periodOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-sm font-medium">{stat.label}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{stat.value}</p>
              </div>
              <div className={`w-12 h-12 bg-gradient-to-br ${stat.color} rounded-xl flex items-center justify-center shadow-lg`}>
                <stat.icon size={24} className="text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-indigo-500 rounded-xl flex items-center justify-center">
            <Calendar size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Denná spotreba</h2>
            <p className="text-sm text-slate-500">Tokeny a náklady po dňoch</p>
          </div>
        </div>

        {usage?.daily?.length === 0 ? (
          <p className="text-slate-500 text-center py-8">Zatiaľ žiadne dáta</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Dátum</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Požiadavky</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Input</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Output</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Náklady</th>
                </tr>
              </thead>
              <tbody>
                {usage?.daily?.map((day, i) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 text-slate-900">
                      {new Date(day.date).toLocaleDateString('sk-SK')}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-600">{day.requests}</td>
                    <td className="py-3 px-4 text-right text-slate-600">{formatNumber(day.inputTokens)}</td>
                    <td className="py-3 px-4 text-right text-slate-600">{formatNumber(day.outputTokens)}</td>
                    <td className="py-3 px-4 text-right font-medium text-emerald-600">{formatCost(day.costEur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-6 bg-slate-100 rounded-xl p-4 text-sm text-slate-600">
        <p><strong>Cenník Claude Sonnet:</strong> $3 / 1M input tokenov, $15 / 1M output tokenov (prepočet na € kurzom 0.92)</p>
      </div>
    </div>
  )
}