import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { LayoutDashboard, MessageSquare, Settings, Code, LogOut, Coins, Package, BarChart3, Shield, Calendar, Bike, Wrench, Lock, Mountain, ClipboardList } from 'lucide-react'
import { useState, useEffect } from 'react'
import axios from 'axios'
import Logo from './Logo.jsx'

export default function Layout() {
  const { client, logout, API_URL } = useAuth()
  const navigate = useNavigate()
  const [isAdmin, setIsAdmin] = useState(false)

  const tier = client?.subscription_tier || 'free'
  const isFree = tier === 'free'
  const hasBooking = client?.booking_enabled || false

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const token = localStorage.getItem('token')
        const response = await axios.get(`${API_URL}/superadmin/stats`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (response.status === 200) {
          setIsAdmin(true)
        }
      } catch (error) {
        setIsAdmin(false)
      }
    }
    checkAdmin()
  }, [API_URL])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/conversations', label: 'Konverzácie', icon: MessageSquare },
    { to: '/bookings', label: 'Rezervácie', icon: Calendar, requiresBooking: true },
    { to: '/rental', label: 'Požičovňa', icon: Bike, requiresBooking: true },
    { to: '/products', label: 'Produkty', icon: Package, paidOnly: true },
    { to: '/analytics', label: 'Analytika', icon: BarChart3, paidOnly: true },
    { to: '/usage', label: 'Spotreba', icon: Coins, adminOnly: true },
    { to: '/settings', label: 'Nastavenia', icon: Settings },
    { to: '/integration', label: 'Integrácia', icon: Code },
    { to: '/services', label: 'Cenník', icon: Wrench, requiresBooking: true },
    { to: '/pieniny', label: 'Pieniny', icon: Mountain, showForTenants: ['e8f3937e-d56f-401b-b7c0-a90fb7654503'] },
    { to: '/dotaznik', label: 'Dotazníky', icon: ClipboardList, showForTenants: ['58718bb0-84dd-4024-b9af-2815b2505afc'] },
  ]

  const handleLockedClick = (e) => {
    e.preventDefault()
    navigate('/settings', { state: { showUpgrade: true } })
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className="w-72 bg-white border-r border-slate-200 fixed h-full flex flex-col">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <Logo size={40} />
            <div>
              <h1 className="text-xl font-bold text-slate-900">Replai</h1>
              <p className="text-sm text-slate-500">{client?.name}</p>
            </div>
          </div>
        </div>
        
        <nav className="flex-1 p-4">
          {navItems
            .filter(item => !item.adminOnly || isAdmin)
            .filter(item => !item.requiresBooking || hasBooking)
            .filter(item => !item.showForTenants || item.showForTenants.includes(client?.id))
            .map(item => {
              const isLocked = isFree && item.paidOnly

              if (isLocked) {
                return (
                  <a
                    key={item.to}
                    href={item.to}
                    onClick={handleLockedClick}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl mb-1 transition-all font-medium text-slate-400 hover:bg-slate-50 cursor-pointer"
                    title={`${item.label} – dostupné od Starter plánu`}
                  >
                    <item.icon size={20} />
                    <span>{item.label}</span>
                    <Lock size={14} className="ml-auto text-slate-300" />
                  </a>
                )
              }

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-xl mb-1 transition-all font-medium ${
                      isActive 
                        ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-200' 
                        : 'text-slate-600 hover:bg-slate-100'
                    }`
                  }
                >
                  <item.icon size={20} />
                  <span>{item.label}</span>
                </NavLink>
              )
            })}
          
          {isAdmin && (
            <NavLink
              to="/superadmin"
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl mb-1 transition-all font-medium mt-4 ${
                  isActive 
                    ? 'bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-lg shadow-red-200' 
                    : 'text-red-600 hover:bg-red-50 border border-red-200'
                }`
              }
            >
              <Shield size={20} />
              <span>Super Admin</span>
            </NavLink>
          )}
        </nav>
        
        <div className="p-4 border-t border-slate-200">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-slate-600 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all font-medium"
          >
            <LogOut size={20} />
            <span>Odhlásiť sa</span>
          </button>
        </div>
      </aside>
      
      <main className="flex-1 p-8 ml-72">
        <Outlet />
      </main>
    </div>
  )
}