import { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'

const AuthContext = createContext()
const API_URL = 'https://replai-backend.onrender.com'

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('token'))
  const [client, setClient] = useState(JSON.parse(localStorage.getItem('client') || 'null'))
  const [loading, setLoading] = useState(false)
  const [initializing, setInitializing] = useState(true)

  // Check for token in URL on app start
  useEffect(() => {
    const initAuth = async () => {
      const urlParams = new URLSearchParams(window.location.search)
      const tokenFromUrl = urlParams.get('token')
      
      if (tokenFromUrl) {
        try {
          const response = await axios.get(`${API_URL}/auth/me`, {
            headers: { Authorization: `Bearer ${tokenFromUrl}` }
          })
          
          localStorage.setItem('token', tokenFromUrl)
          localStorage.setItem('client', JSON.stringify(response.data))
          setToken(tokenFromUrl)
          setClient(response.data)
          axios.defaults.headers.common['Authorization'] = `Bearer ${tokenFromUrl}`
          
          // Clean URL
          window.history.replaceState({}, '', window.location.pathname)
        } catch (err) {
          console.error('Failed to fetch client data:', err)
          localStorage.removeItem('token')
          localStorage.removeItem('client')
        }
      }
      
      setInitializing(false)
    }
    
    initAuth()
  }, [])

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
    } else {
      delete axios.defaults.headers.common['Authorization']
    }
  }, [token])

  const login = async (email, password) => {
    setLoading(true)
    try {
      localStorage.removeItem('token')
      localStorage.removeItem('client')
      setToken(null)
      setClient(null)
      delete axios.defaults.headers.common['Authorization']

      const response = await axios.post(`${API_URL}/auth/login`, { email, password })
      const { token: newToken, client: newClient } = response.data

      setToken(newToken)
      setClient(newClient)
      localStorage.setItem('token', newToken)
      localStorage.setItem('client', JSON.stringify(newClient))
      axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`

      return { success: true }
    } catch (error) {
      return { success: false, error: error.response?.data?.error || 'Chyba prihlásenia' }
    } finally {
      setLoading(false)
    }
  }

  const register = async (name, email, password, websiteUrl) => {
    setLoading(true)
    try {
      localStorage.removeItem('token')
      localStorage.removeItem('client')
      setToken(null)
      setClient(null)
      delete axios.defaults.headers.common['Authorization']

      const response = await axios.post(`${API_URL}/auth/register`, { 
        name, 
        email, 
        password,
        websiteUrl 
      })

      if (response.data.requiresVerification) {
        return { success: true, requiresVerification: true }
      }

      const { token: newToken, client: newClient } = response.data
      setToken(newToken)
      setClient(newClient)
      localStorage.setItem('token', newToken)
      localStorage.setItem('client', JSON.stringify(newClient))
      axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`

      return { success: true }
    } catch (error) {
      return { success: false, error: error.response?.data?.error || 'Chyba registrácie' }
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    setToken(null)
    setClient(null)
    localStorage.removeItem('token')
    localStorage.removeItem('client')
    delete axios.defaults.headers.common['Authorization']
  }

  const refreshProfile = async () => {
    try {
      const response = await axios.get(`${API_URL}/admin/profile`)
      setClient(response.data)
      localStorage.setItem('client', JSON.stringify(response.data))
    } catch (error) {
      console.error('Failed to refresh profile:', error)
    }
  }

  // Show nothing while initializing
  if (initializing) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="w-16 h-16 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-violet-200 animate-pulse">
          <span className="text-white font-bold text-2xl">R</span>
        </div>
      </div>
    )
  }

  return (
    <AuthContext.Provider value={{ 
      token, 
      client, 
      setClient,
      login, 
      register, 
      logout, 
      loading,
      refreshProfile,
      API_URL 
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}