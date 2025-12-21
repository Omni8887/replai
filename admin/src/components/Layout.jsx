import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { LayoutDashboard, MessageSquare, Settings, Code, LogOut, Coins, Package } from 'lucide-react'

export default function Layout() {
  const { client, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/conversations', label: 'Konverzácie', icon: MessageSquare },
    { to: '/products', label: 'Produkty', icon: Package },
    { to: '/usage', label: 'Spotreba', icon: Coins },
    { to: '/settings', label: 'Nastavenia', icon: Settings },
    { to: '/integration', label: 'Integrácia', icon: Code },
  ]

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className="w-72 bg-white border-r border-slate-200 fixed h-full flex flex-col">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-lg">R</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Replai</h1>
              <p className="text-sm text-slate-500">{client?.name}</p>
            </div>
          </div>
        </div>
        
        <nav className="flex-1 p-4">
          {navItems.map(item => (
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
          ))}
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