import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import axios from 'axios'
import { CheckCircle, XCircle, Loader } from 'lucide-react'

const API_URL = 'https://replai-backend.onrender.com'

export default function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState('loading') // loading, success, error
  const [message, setMessage] = useState('')

  useEffect(() => {
    const token = searchParams.get('token')
    if (token) {
      verifyEmail(token)
    } else {
      setStatus('error')
      setMessage('Chýba verifikačný token')
    }
  }, [searchParams])

  const verifyEmail = async (token) => {
    try {
      const response = await axios.post(`${API_URL}/auth/verify-email`, { token })
      setStatus('success')
      setMessage(response.data.message)
    } catch (error) {
      setStatus('error')
      setMessage(error.response?.data?.error || 'Verifikácia zlyhala')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="bg-white p-10 rounded-2xl shadow-xl shadow-slate-200 w-full max-w-md border border-slate-200 text-center">
        {status === 'loading' && (
          <>
            <Loader size={64} className="text-violet-600 animate-spin mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-slate-900">Overujem email...</h1>
          </>
        )}
        
        {status === 'success' && (
          <>
            <CheckCircle size={64} className="text-emerald-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Email overený!</h1>
            <p className="text-slate-500 mb-6">Váš účet je aktívny. Môžete sa prihlásiť.</p>
            <Link 
              to="/login"
              className="inline-block bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-6 py-3 rounded-xl font-semibold hover:opacity-90 transition"
            >
              Prihlásiť sa
            </Link>
          </>
        )}
        
        {status === 'error' && (
          <>
            <XCircle size={64} className="text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Chyba</h1>
            <p className="text-slate-500 mb-6">{message}</p>
            <Link 
              to="/register"
              className="inline-block bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-6 py-3 rounded-xl font-semibold hover:opacity-90 transition"
            >
              Zaregistrovať sa znova
            </Link>
          </>
        )}
      </div>
    </div>
  )
}