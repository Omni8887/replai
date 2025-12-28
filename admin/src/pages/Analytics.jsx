import { useState, useEffect } from 'react'
import axios from 'axios'
import { useAuth } from '../context/AuthContext.jsx'
import { BarChart3, Users, Target, Clock, MessageSquare, TrendingUp } from 'lucide-react'

export default function Analytics() {
  const { API_URL } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAnalytics()
  }, [])

  const loadAnalytics = async () => {
    try {
      const response = await axios.get(`${API_URL}/admin/analytics`)
      setData(response.data)
    } catch (error) {
      console.error('Failed to load analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">Načítavam analytiku...</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">Nepodarilo sa načítať analytiku</div>
      </div>
    )
  }

  const maxDaily = Math.max(...data.dailyData.map(d => d.conversations), 1)
  const maxHourly = Math.max(...data.hourlyData.map(d => d.count), 1)

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Analytika</h1>
        <p className="text-slate-500 mt-1">Prehľad výkonnosti chatu</p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-500 text-sm font-medium">Celkom konverzácií</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{data.overview.total}</p>
              <p className="text-sm text-slate-400 mt-1">
                Tento týždeň: {data.overview.week.total}
              </p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-indigo-500 rounded-xl flex items-center justify-center shadow-lg">
              <MessageSquare size={24} className="text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-500 text-sm font-medium">Celkom leadov</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{data.overview.totalLeads}</p>
              <p className="text-sm text-slate-400 mt-1">
                Tento týždeň: {data.overview.week.leads}
              </p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center shadow-lg">
              <Users size={24} className="text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-500 text-sm font-medium">Konverzný pomer</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{data.overview.conversionRate}%</p>
              <p className="text-sm text-slate-400 mt-1">
                Tento týždeň: {data.overview.week.conversionRate}%
              </p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center shadow-lg">
              <Target size={24} className="text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-500 text-sm font-medium">Tento mesiac</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{data.overview.month.total}</p>
              <p className="text-sm text-slate-400 mt-1">
                Leadov: {data.overview.month.leads} ({data.overview.month.conversionRate}%)
              </p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg">
              <TrendingUp size={24} className="text-white" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Graf konverzácií za 30 dní */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-indigo-500 rounded-xl flex items-center justify-center">
              <BarChart3 size={20} className="text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">Konverzácie za 30 dní</h2>
              <p className="text-sm text-slate-500">Denný prehľad</p>
            </div>
          </div>
          
          <div className="flex items-end gap-1 h-48">
            {data.dailyData.map((day, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex flex-col gap-0.5" style={{ height: '160px' }}>
                  <div className="flex-1 flex flex-col justify-end">
                    <div 
                      className="w-full bg-gradient-to-t from-violet-500 to-indigo-400 rounded-t-sm transition-all hover:opacity-80"
                      style={{ height: `${(day.conversations / maxDaily) * 100}%`, minHeight: day.conversations > 0 ? '4px' : '0' }}
                      title={`${day.label}: ${day.conversations} konverzácií, ${day.leads} leadov`}
                    />
                  </div>
                </div>
                {i % 5 === 0 && (
                  <span className="text-xs text-slate-400">{day.label}</span>
                )}
              </div>
            ))}
          </div>
          
          <div className="flex items-center gap-4 mt-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-gradient-to-r from-violet-500 to-indigo-400 rounded-sm"></div>
              <span className="text-slate-600">Konverzácie</span>
            </div>
          </div>
        </div>

        {/* Najaktívnejšie hodiny */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center">
              <Clock size={20} className="text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">Najaktívnejšie hodiny</h2>
              <p className="text-sm text-slate-500">Kedy zákazníci chatujú</p>
            </div>
          </div>
          
          <div className="flex items-end gap-1 h-48">
            {data.hourlyData.map((hour, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex flex-col gap-0.5" style={{ height: '160px' }}>
                  <div className="flex-1 flex flex-col justify-end">
                    <div 
                      className="w-full bg-gradient-to-t from-amber-500 to-orange-400 rounded-t-sm transition-all hover:opacity-80"
                      style={{ height: `${(hour.count / maxHourly) * 100}%`, minHeight: hour.count > 0 ? '4px' : '0' }}
                      title={`${hour.hour}: ${hour.count} konverzácií`}
                    />
                  </div>
                </div>
                {i % 4 === 0 && (
                  <span className="text-xs text-slate-400">{i}h</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Najčastejšie otázky */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center">
            <MessageSquare size={20} className="text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Najčastejšie otázky</h2>
            <p className="text-sm text-slate-500">Čo zákazníci najviac riešia</p>
          </div>
        </div>

        {data.topQuestions.length === 0 ? (
          <p className="text-slate-500 text-center py-8">Zatiaľ žiadne dáta</p>
        ) : (
          <div className="space-y-3">
            {data.topQuestions.map((q, i) => (
              <div key={i} className="flex items-center gap-4">
                <span className="text-lg font-bold text-slate-300 w-6">{i + 1}.</span>
                <div className="flex-1 bg-slate-50 rounded-xl px-4 py-3">
                  <p className="text-slate-700 truncate">{q.question}</p>
                </div>
                <div className="bg-violet-100 text-violet-700 px-3 py-1 rounded-full text-sm font-medium">
                  {q.count}x
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}