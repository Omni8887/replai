import { useState, useEffect } from 'react'
import axios from 'axios'
import { useAuth } from '../context/AuthContext.jsx'
import { Users, CreditCard, MessageSquare, TrendingUp, Crown, Trash2, Shield, Building, Mail, Globe, Calendar } from 'lucide-react'

export default function SuperAdmin() {
  const { API_URL } = useAuth()
  const [stats, setStats] = useState(null)
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [statsRes, clientsRes] = await Promise.all([
        axios.get(`${API_URL}/superadmin/stats`),
        axios.get(`${API_URL}/superadmin/clients`)
      ])
      setStats(statsRes.data)
      setClients(clientsRes.data)
    } catch (error) {
      console.error('Failed to load admin data:', error)
      alert('Prístup zamietnutý alebo chyba servera')
    } finally {
      setLoading(false)
    }
  }

  const updateClient = async (clientId, updates) => {
    setUpdating(clientId)
    try {
      await axios.put(`${API_URL}/superadmin/clients/${clientId}`, updates)
      await loadData()
    } catch (error) {
      console.error('Failed to update client:', error)
      alert('Nepodarilo sa aktualizovať klienta')
    } finally {
      setUpdating(null)
    }
  }

  const deleteClient = async (clientId, clientName) => {
    if (!confirm(`Naozaj chcete zmazať klienta "${clientName}"? Táto akcia je nevratná!`)) {
      return
    }
    
    try {
      await axios.delete(`${API_URL}/superadmin/clients/${clientId}`)
      await loadData()
    } catch (error) {
      console.error('Failed to delete client:', error)
      alert('Nepodarilo sa zmazať klienta')
    }
  }

  const getPlanBadge = (tier) => {
    const styles = {
      free: 'bg-slate-100 text-slate-700',
      starter: 'bg-blue-100 text-blue-700',
      pro: 'bg-violet-100 text-violet-700',
      business: 'bg-amber-100 text-amber-700'
    }
    return styles[tier] || styles.free
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">Načítavam...</div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-rose-600 rounded-xl flex items-center justify-center">
            <Shield size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Super Admin</h1>
            <p className="text-slate-500">Správa všetkých klientov a predplatných</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-sm font-medium">Celkom klientov</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{stats.totalClients}</p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-indigo-500 rounded-xl flex items-center justify-center">
                <Users size={24} className="text-white" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-sm font-medium">Mesačný príjem</p>
                <p className="text-3xl font-bold text-emerald-600 mt-1">{stats.monthlyRevenue}€</p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center">
                <CreditCard size={24} className="text-white" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-sm font-medium">Konverzácie</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{stats.totalConversations}</p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center">
                <MessageSquare size={24} className="text-white" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-sm font-medium">Platiacich</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">
                  {stats.starterClients + stats.proClients + stats.businessClients}
                </p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center">
                <TrendingUp size={24} className="text-white" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Plan Breakdown */}
      {stats && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 mb-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Rozdelenie plánov</h2>
          <div className="flex gap-4 flex-wrap">
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-xl">
              <span className="font-semibold text-slate-700">FREE:</span>
              <span className="text-slate-900">{stats.freeClients}</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-100 rounded-xl">
              <span className="font-semibold text-blue-700">STARTER:</span>
              <span className="text-blue-900">{stats.starterClients}</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-violet-100 rounded-xl">
              <span className="font-semibold text-violet-700">PRO:</span>
              <span className="text-violet-900">{stats.proClients}</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-100 rounded-xl">
              <span className="font-semibold text-amber-700">BUSINESS:</span>
              <span className="text-amber-900">{stats.businessClients}</span>
            </div>
          </div>
        </div>
      )}

      {/* Clients Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Všetci klienti ({clients.length})</h2>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Klient</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Web</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Plán</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Správy</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Registrácia</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Akcie</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {clients.map(client => (
                <tr key={client.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-indigo-500 rounded-full flex items-center justify-center">
                        <span className="text-white font-semibold text-sm">
                          {client.name?.charAt(0)?.toUpperCase() || '?'}
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{client.name}</p>
                        <p className="text-sm text-slate-500">{client.email}</p>
                      </div>
                      {!client.email_verified && (
                        <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                          Neoverený
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {client.website_url ? (
                      <a 
                        href={client.website_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-violet-600 hover:underline text-sm"
                      >
                        {client.website_url.replace(/https?:\/\//, '').substring(0, 30)}
                      </a>
                    ) : (
                      <span className="text-slate-400 text-sm">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <select
                      value={client.subscription_tier || 'free'}
                      onChange={(e) => updateClient(client.id, { subscription_tier: e.target.value })}
                      disabled={updating === client.id}
                      className={`px-3 py-1.5 rounded-lg text-sm font-semibold border-0 cursor-pointer ${getPlanBadge(client.subscription_tier)}`}
                    >
                      <option value="free">FREE</option>
                      <option value="starter">STARTER</option>
                      <option value="pro">PRO</option>
                      <option value="business">BUSINESS</option>
                    </select>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-slate-900">{client.messages_this_month || 0}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-slate-500 text-sm">
                      {new Date(client.created_at).toLocaleDateString('sk-SK')}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => deleteClient(client.id, client.name)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-lg transition"
                      title="Zmazať klienta"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}