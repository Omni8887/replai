import { useState, useEffect } from 'react'
import axios from 'axios'
import { useAuth } from '../context/AuthContext.jsx'
import { Users, CreditCard, MessageSquare, TrendingUp, Trash2, Shield, Plus, Tag, X, Eye, Copy, Check } from 'lucide-react'

export default function SuperAdmin() {
  const { API_URL } = useAuth()
  const [stats, setStats] = useState(null)
  const [clients, setClients] = useState([])
  const [promoCodes, setPromoCodes] = useState([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(null)
  const [showPromoForm, setShowPromoForm] = useState(false)
  const [showUsesModal, setShowUsesModal] = useState(null)
  const [promoUses, setPromoUses] = useState([])
  const [copiedCode, setCopiedCode] = useState(null)
  const [newPromo, setNewPromo] = useState({
    code: '',
    description: '',
    reward_type: 'free_days',
    reward_value: 30,
    reward_plan: 'business',
    max_uses: '',
    valid_until: ''
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [statsRes, clientsRes, promoRes] = await Promise.all([
        axios.get(`${API_URL}/superadmin/stats`),
        axios.get(`${API_URL}/superadmin/clients`),
        axios.get(`${API_URL}/superadmin/promo-codes`)
      ])
      setStats(statsRes.data)
      setClients(clientsRes.data)
      setPromoCodes(promoRes.data)
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

  const createPromoCode = async (e) => {
    e.preventDefault()
    try {
      await axios.post(`${API_URL}/superadmin/promo-codes`, {
        ...newPromo,
        max_uses: newPromo.max_uses ? parseInt(newPromo.max_uses) : null,
        valid_until: newPromo.valid_until || null
      })
      setShowPromoForm(false)
      setNewPromo({
        code: '',
        description: '',
        reward_type: 'free_days',
        reward_value: 30,
        reward_plan: 'business',
        max_uses: '',
        valid_until: ''
      })
      await loadData()
    } catch (error) {
      alert(error.response?.data?.error || 'Nepodarilo sa vytvoriť kód')
    }
  }

  const togglePromoCode = async (id, isActive) => {
    try {
      await axios.put(`${API_URL}/superadmin/promo-codes/${id}`, { is_active: !isActive })
      await loadData()
    } catch (error) {
      alert('Nepodarilo sa aktualizovať kód')
    }
  }

  const deletePromoCode = async (id, code) => {
    if (!confirm(`Naozaj chcete zmazať promo kód "${code}"?`)) return
    
    try {
      await axios.delete(`${API_URL}/superadmin/promo-codes/${id}`)
      await loadData()
    } catch (error) {
      alert('Nepodarilo sa zmazať kód')
    }
  }

  const viewPromoUses = async (promoId) => {
    try {
      const res = await axios.get(`${API_URL}/superadmin/promo-codes/${promoId}/uses`)
      setPromoUses(res.data)
      setShowUsesModal(promoId)
    } catch (error) {
      alert('Nepodarilo sa načítať použitia')
    }
  }

  const copyCode = (code) => {
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2000)
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

      {/* Promo Codes Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-8">
        <div className="p-6 border-b border-slate-200 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Tag className="text-violet-600" size={24} />
            <h2 className="text-lg font-semibold text-slate-900">Promo kódy ({promoCodes.length})</h2>
          </div>
          <button
            onClick={() => setShowPromoForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl hover:opacity-90 transition"
          >
            <Plus size={20} />
            Nový kód
          </button>
        </div>

        {promoCodes.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            Zatiaľ žiadne promo kódy. Vytvorte prvý!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Kód</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Popis</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Odmena</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Použité</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Platnosť</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Stav</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Akcie</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {promoCodes.map(promo => (
                  <tr key={promo.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <code className="bg-slate-100 px-3 py-1 rounded-lg font-mono font-semibold text-slate-900">
                          {promo.code}
                        </code>
                        <button
                          onClick={() => copyCode(promo.code)}
                          className="text-slate-400 hover:text-slate-600 transition"
                          title="Kopírovať"
                        >
                          {copiedCode === promo.code ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-slate-600 text-sm">{promo.description || '-'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-lg text-sm font-semibold ${getPlanBadge(promo.reward_plan)}`}>
                        {promo.reward_value} dní {promo.reward_plan?.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => viewPromoUses(promo.id)}
                        className="flex items-center gap-1 text-violet-600 hover:underline"
                      >
                        <span className="font-semibold">{promo.uses_count || 0}</span>
                        {promo.max_uses && <span className="text-slate-400">/ {promo.max_uses}</span>}
                        <Eye size={16} />
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      {promo.valid_until ? (
                        <span className={`text-sm ${new Date(promo.valid_until) < new Date() ? 'text-red-500' : 'text-slate-600'}`}>
                          {new Date(promo.valid_until).toLocaleDateString('sk-SK')}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-sm">Neobmedzene</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => togglePromoCode(promo.id, promo.is_active)}
                        className={`px-3 py-1 rounded-full text-sm font-semibold transition ${
                          promo.is_active 
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' 
                            : 'bg-red-100 text-red-700 hover:bg-red-200'
                        }`}
                      >
                        {promo.is_active ? 'Aktívny' : 'Neaktívny'}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => deletePromoCode(promo.id, promo.code)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-lg transition"
                        title="Zmazať kód"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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

      {/* Create Promo Code Modal */}
      {showPromoForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-slate-900">Nový promo kód</h3>
              <button onClick={() => setShowPromoForm(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={createPromoCode} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Kód *</label>
                <input
                  type="text"
                  value={newPromo.code}
                  onChange={(e) => setNewPromo({ ...newPromo, code: e.target.value.toUpperCase() })}
                  placeholder="LAUNCH2026"
                  className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Popis</label>
                <input
                  type="text"
                  value={newPromo.description}
                  onChange={(e) => setNewPromo({ ...newPromo, description: e.target.value })}
                  placeholder="Pre prvých zákazníkov"
                  className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Počet dní *</label>
                  <input
                    type="number"
                    value={newPromo.reward_value}
                    onChange={(e) => setNewPromo({ ...newPromo, reward_value: parseInt(e.target.value) })}
                    min="1"
                    className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Plán *</label>
                  <select
                    value={newPromo.reward_plan}
                    onChange={(e) => setNewPromo({ ...newPromo, reward_plan: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  >
                    <option value="starter">STARTER</option>
                    <option value="pro">PRO</option>
                    <option value="business">BUSINESS</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Max použití</label>
                  <input
                    type="number"
                    value={newPromo.max_uses}
                    onChange={(e) => setNewPromo({ ...newPromo, max_uses: e.target.value })}
                    placeholder="Neobmedzené"
                    min="1"
                    className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Platnosť do</label>
                  <input
                    type="date"
                    value={newPromo.valid_until}
                    onChange={(e) => setNewPromo({ ...newPromo, valid_until: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl font-semibold hover:opacity-90 transition"
              >
                Vytvoriť kód
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Promo Uses Modal */}
      {showUsesModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-slate-900">Použitia kódu</h3>
              <button onClick={() => setShowUsesModal(null)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <div className="p-6 max-h-96 overflow-y-auto">
              {promoUses.length === 0 ? (
                <p className="text-center text-slate-500">Kód ešte nikto nepoužil</p>
              ) : (
                <div className="space-y-3">
                  {promoUses.map(use => (
                    <div key={use.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
                      <div>
                        <p className="font-medium text-slate-900">{use.clients?.name || use.client_email}</p>
                        <p className="text-sm text-slate-500">{use.client_email}</p>
                      </div>
                      <span className="text-sm text-slate-400">
                        {new Date(use.used_at).toLocaleDateString('sk-SK')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}