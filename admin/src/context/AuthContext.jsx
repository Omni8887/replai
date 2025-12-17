import { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'

const AuthContext = createContext()

const API_URL = 'https://replai-backend.onrender.com'

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('token'))
  const [client, setClient] = useState(JSON.parse(localStorage.getItem('client') || 'null'))
  const [loading, setLoading] = useState(false)

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
      const response = await axios.post(`${API_URL}/auth/login`, { email, password })
      const { token: newToken, client: newClient } = response.data
      
      setToken(newToken)
      setClient(newClient)
      localStorage.setItem('token', newToken)
      localStorage.setItem('client', JSON.stringify(newClient))
      
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
      const response = await axios.post(`${API_URL}/auth/register`, { 
        name, 
        email, 
        password,
        websiteUrl 
      })
      const { token: newToken, client: newClient } = response.data
      
      setToken(newToken)
      setClient(newClient)
      localStorage.setItem('token', newToken)
      localStorage.setItem('client', JSON.stringify(newClient))
      
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

  return (
    <AuthContext.Provider value={{ 
      token, 
      client, 
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