import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Conversations from './pages/Conversations.jsx'
import ConversationDetail from './pages/ConversationDetail.jsx'
import Settings from './pages/Settings.jsx'
import Integration from './pages/Integration.jsx'
import Usage from './pages/Usage.jsx'
import Products from './pages/Products.jsx'

function ProtectedRoute({ children }) {
  const { token } = useAuth()
  if (!token) {
    return <Navigate to="/login" replace />
  }
  return children
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index element={<Dashboard />} />
          <Route path="conversations" element={<Conversations />} />
          <Route path="conversations/:id" element={<ConversationDetail />} />
          <Route path="settings" element={<Settings />} />
          <Route path="integration" element={<Integration />} />
          <Route path="usage" element={<Usage />} />
          <Route path="products" element={<Products />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}

export default App