import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../context/AuthContext.jsx'
import { MessageSquare, Calendar, Target, Mail, ArrowRight, Clock, Coins, Zap, TrendingUp, AlertTriangle, Crown, Pencil, X, User, Building, Globe, Save } from 'lucide-react'

export default function Dashboard() {
  const { client, setClient, API_URL } = useAuth()
  const [conversations, setConversations] = useState([])
  const [usage, setUsage] = useState(null)
  const [subscription, setSubscription] = useState(null)
  const [loading, setLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  
  // Profile modal state
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileForm, setProfileForm] = useState({
    name: '',
    email: '',
    website_url: ''
  })

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (client) {
      setProfileForm({
        name: client.name || '',
        email: client.email || '',
        website_url: client.website_url || ''
      })
    }
  }, [client])

  const loadData = async () => {
    try {
      const [convResponse, usageResponse, subResponse] = await Promise.all([
        axios.get(`${API_URL}/admin/conversations`),
        axios.get(`${API_URL}/admin/usage?period=30`),
        axios.get(`${API_URL}/admin/subscription`)
      ])
      setConversations(convResponse.data)
      setUsage(usageResponse.data)
      setSubscription(subResponse.data)
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleUpgrade = async (plan) => {
    setCheckoutLoading(true)
    try {
      const response = await axios.post(`${API_URL}/create-checkout-session`, { plan })
      if (response.data.url) {
        window.location.href = response.data.url
      }
    } catch (error) {
      console.error('Checkout error:', error)
      alert('Nepodarilo sa vytvoriť platbu. Skúste znova.')
    } finally {
      setCheckoutLoading(false)
    }
  }

  const handleProfileSave = async () => {
    setProfileLoading(true)
    try {
      const response = await axios.put(`${API_URL}/admin/profile`, profileForm)
      if (response.data) {
        // Update local client state
        const updatedClient = { ...client, ...profileForm }
        setClient(updatedClient)
        localStorage.setItem('client', JSON.stringify(updatedClient))
        setShowProfileModal(false)
        alert('Profil bol úspešne uložený!')
      }
    } catch (error) {
      console.error('Profile update error:', error)
      alert('Nepodarilo sa uložiť profil. Skúste znova.')
    } finally {
      setProfileLoading(false)
    }
  }

  const today = new Date().toDateString()
  const todayConversations = conversations.filter(c => 
    new Date(c.created_at).toDateString() === today
  )
  const leadsCount = conversations.filter(c => c.has_contact).length
  const unreadCount = conversations.filter(c => !c.is_read).length

  const formatCost = (cost) => {
    return new Intl.NumberFormat('sk-SK', { 
      style: 'currency', 
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4
    }).format(cost || 0)
  }

  const formatNumber = (num) => {
    return new Intl.NumberFormat('sk-SK').format(Math.round(num || 0))
  }

  const getPlanName = (tier) => {
    const names = {
      free: 'FREE',
      starter: 'STARTER',
      pro: 'PRO',
      business: 'BUSINESS'
    }
    return names[tier] || 'FREE'
  }

  const getPlanColor = (tier) => {
    const colors = {
      free: 'from-slate-500 to-slate-600',
      starter: 'from-blue-500 to-indigo-500',
      pro: 'from-violet-500 to-purple-500',
      business: 'from-amber-500 to-orange-500'
    }
    return colors[tier] || 'from-slate-500 to-slate-600'
  }

  const conversationStats = [
    { label: 'Celkom konverzácií', value: conversations.length, icon: MessageSquare, color: 'from-violet-500 to-indigo-500' },
    { label: 'Dnes', value: todayConversations.length, icon: Calendar, color: 'from-blue-500 to-cyan-500' },
    { label: 'Leady', value: leadsCount, icon: Target, color: 'from-emerald-500 to-teal-500' },
    { label: 'Neprečítané', value: unreadCount, icon: Mail, color: 'from-amber-500 to-orange-500' },
  ]

  const usageStats = [
    { label: 'Náklady (30 dní)', value: formatCost(usage?.totals?.costEur), icon: Coins, color: 'from-emerald-500 to-teal-500' },
    { label: 'Požiadavky', value: formatNumber(usage?.totals?.requests), icon: Zap, color: 'from-violet-500 to-indigo-500' },
    { label: 'Tokeny celkom', value: formatNumber(usage?.totals?.totalTokens), icon: TrendingUp, color: 'from-rose-500 to-pink-500' },
  ]

  const recentConversations = conversations.slice(0, 5)

  return (
    <div>
      {/* Profile Edit Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-xl font-bold text-slate-900">Upraviť profil</h2>
              <button 
                onClick={() => setShowProfileModal(false)}
                className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center transition"
              >
                <X size={20} className="text-slate-500" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <Building size={16} className="inline mr-2" />
                  Názov firmy
                </label>
                <input
                  type="text"
                  value={profileForm.name}
                  onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-600 focus:border-transparent outline-none transition"
                  placeholder="Vaša firma s.r.o."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <Mail size={16} className="inline mr-2" />
                  Email
                </label>
                <input
                  type="email"
                  value={profileForm.email}
                  onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-600 focus:border-transparent outline-none transition"
                  placeholder="vas@email.sk"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <Globe size={16} className="inline mr-2" />
                  Webová stránka
                </label>
                <input
                  type="url"
                  value={profileForm.website_url}
                  onChange={(e) => setProfileForm({ ...profileForm, website_url: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-600 focus:border-transparent outline-none transition"
                  placeholder="https://vasafirma.sk"
                />
              </div>
            </div>
            
            <div className="p-6 border-t border-slate-200 flex gap-3">
              <button
                onClick={() => setShowProfileModal(false)}
                className="flex-1 px-4 py-3 border border-slate-300 rounded-xl font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Zrušiť
              </button>
              <button
                onClick={handleProfileSave}
                disabled={profileLoading}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {profileLoading ? (
                  'Ukladám...'
                ) : (
                  <>
                    <Save size={18} />
                    Uložiť
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 mt-1">Vitajte späť, {client?.name}</p>
        </div>
        <button
          onClick={() => setShowProfileModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition font-medium"
        >
          <Pencil size={18} />
          Upraviť profil
        </button>
      </div>

      {/* Subscription Alert */}
      {subscription && subscription.isLimitReached && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-2xl p-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
              <AlertTriangle size={24} className="text-red-600" />
            </div>
            <div>
              <h3 className="font-semibold text-red-800">Dosiahli ste limit správ!</h3>
              <p className="text-red-600 text-sm">Váš chatbot je offline. Upgradujte plán pre obnovenie služby.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => handleUpgrade('starter')}
              disabled={checkoutLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-semibold transition disabled:opacity-50"
            >
              STARTER 29€
            </button>
            <button 
              onClick={() => handleUpgrade('pro')}
              disabled={checkoutLoading}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-xl font-semibold transition disabled:opacity-50"
            >
              PRO 59€
            </button>
          </div>
        </div>
      )}

      {/* Warning when close to limit */}
      {subscription && !subscription.isLimitReached && subscription.percentage >= 80 && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
              <AlertTriangle size={24} className="text-amber-600" />
            </div>
            <div>
              <h3 className="font-semibold text-amber-800">Blížite sa k limitu správ</h3>
              <p className="text-amber-600 text-sm">Zostáva vám {subscription.messagesRemaining} správ z {subscription.messagesLimit}.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => handleUpgrade('starter')}
              disabled={checkoutLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-semibold transition disabled:opacity-50"
            >
              STARTER 29€
            </button>
            <button 
              onClick={() => handleUpgrade('pro')}
              disabled={checkoutLoading}
              className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-xl font-semibold transition disabled:opacity-50"
            >
              PRO 59€
            </button>
          </div>
        </div>
      )}

      {/* Subscription Card */}
      {loading ? (
        <div className="mb-6 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 animate-pulse">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-slate-200 rounded-xl"></div>
            <div>
              <div className="h-4 bg-slate-200 rounded w-20 mb-2"></div>
              <div className="h-6 bg-slate-200 rounded w-28"></div>
            </div>
          </div>
          <div className="h-3 bg-slate-200 rounded w-full"></div>
        </div>
      ) : subscription && (
        <div className="mb-6 bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 bg-gradient-to-br ${getPlanColor(subscription.tier)} rounded-xl flex items-center justify-center shadow-lg`}>
                <Crown size={24} className="text-white" />
              </div>
              <div>
                <p className="text-slate-500 text-sm font-medium">Váš plán</p>
                <p className="text-2xl font-bold text-slate-900">{getPlanName(subscription.tier)}</p>
              </div>
            </div>
          </div>
          
          {/* Upgrade options */}
          {(subscription.tier === 'free' || subscription.tier === 'starter') && (
            <div className="mb-6 pt-4 border-t border-slate-100">
              <p className="text-sm text-slate-500 mb-4">Upgradujte pre viac správ a funkcií</p>
              <div className="flex gap-3">
                {subscription.tier === 'free' && (
                  <button 
                    onClick={() => handleUpgrade('starter')}
                    disabled={checkoutLoading}
                    className="flex-1 group relative bg-white border-2 border-slate-200 hover:border-blue-500 rounded-xl p-4 transition-all disabled:opacity-50"
                  >
                    <div className="text-left">
                      <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Starter</span>
                      <div className="flex items-baseline gap-1 mt-1">
                        <span className="text-2xl font-bold text-slate-900">29€</span>
                        <span className="text-slate-500 text-sm">/mesiac</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-2">500 správ/mesiac</p>
                    </div>
                    <div className="absolute top-4 right-4 w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center group-hover:bg-blue-100 transition">
                      <ArrowRight size={16} className="text-blue-600" />
                    </div>
                  </button>
                )}
                <button 
                  onClick={() => handleUpgrade('pro')}
                  disabled={checkoutLoading}
                  className="flex-1 group relative bg-gradient-to-br from-violet-600 to-indigo-600 rounded-xl p-4 transition-all hover:shadow-lg hover:shadow-violet-200 disabled:opacity-50"
                >
                  <div className="absolute -top-2 -right-2 bg-amber-400 text-amber-900 text-xs font-bold px-2 py-0.5 rounded-full">
                    OBĽÚBENÝ
                  </div>
                  <div className="text-left">
                    <span className="text-xs font-semibold text-violet-200 uppercase tracking-wide">Pro</span>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-2xl font-bold text-white">59€</span>
                      <span className="text-violet-200 text-sm">/mesiac</span>
                    </div>
                    <p className="text-xs text-violet-200 mt-2">2 000 správ/mesiac</p>
                  </div>
                  <div className="absolute top-4 right-4 w-8 h-8 bg-white/20 rounded-full flex items-center justify-center group-hover:bg-white/30 transition">
                    <Crown size={16} className="text-white" />
                  </div>
                </button>
              </div>
            </div>
          )}
          
          {/* Progress bar */}
          {subscription.messagesLimit !== 'Neobmedzené' && (
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-600">Správy tento mesiac</span>
                <span className="font-semibold text-slate-900">
                  {subscription.messagesUsed} / {subscription.messagesLimit}
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3">
                <div 
                  className={`h-3 rounded-full transition-all duration-500 ${
                    subscription.percentage >= 90 ? 'bg-red-500' :
                    subscription.percentage >= 70 ? 'bg-amber-500' :
                    'bg-gradient-to-r from-violet-500 to-indigo-500'
                  }`}
                  style={{ width: `${Math.min(subscription.percentage, 100)}%` }}
                ></div>
              </div>
              <p className="text-sm text-slate-500 mt-2">
                Zostáva <span className="font-semibold text-slate-700">{subscription.messagesRemaining}</span> správ
              </p>
            </div>
          )}
          
          {subscription.messagesLimit === 'Neobmedzené' && (
            <p className="text-emerald-600 font-medium">✓ Neobmedzený počet správ</p>
          )}
        </div>
      )}

      {/* Konverzácie Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {conversationStats.map((stat, i) => (
          <div key={i} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-sm font-medium">{stat.label}</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{stat.value}</p>
              </div>
              <div className={`w-12 h-12 bg-gradient-to-br ${stat.color} rounded-xl flex items-center justify-center shadow-lg`}>
                <stat.icon size={24} className="text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Spotreba Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {usageStats.map((stat, i) => (
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




      {/* Posledné konverzácie */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
        <div className="p-6 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-slate-900">Posledné konverzácie</h2>
          <Link 
            to="/conversations" 
            className="text-sm text-violet-600 hover:text-violet-700 transition font-medium flex items-center gap-1"
          >
            Zobraziť všetky
            <ArrowRight size={16} />
          </Link>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500">Načítavam...</div>
        ) : recentConversations.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            Zatiaľ žiadne konverzácie
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentConversations.map(conv => (
              <Link
                key={conv.id}
                to={`/conversations/${conv.id}`}
                className={`block p-5 hover:bg-slate-50 transition ${
                  conv.has_contact ? 'border-l-4 border-emerald-500' : ''
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      conv.has_contact 
                        ? 'bg-emerald-100 text-emerald-600' 
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      <MessageSquare size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        {!conv.is_read && (
                          <span className="w-2 h-2 bg-violet-500 rounded-full"></span>
                        )}
                        <span className="font-semibold text-slate-900">
                          {conv.visitor_email || conv.visitor_name || 'Anonymný návštevník'}
                        </span>
                        {conv.has_contact && (
                          <span className="bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5 rounded-full font-medium">
                            Lead
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 mt-1 flex items-center gap-1">
                        <Clock size={14} />
                        {new Date(conv.updated_at).toLocaleString('sk')}
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}