import { useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { Mail, ArrowLeft, Send } from 'lucide-react'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      await axios.post(`${API_URL}/auth/forgot-password`, { email })
      setSent(true)
    } catch (err) {
      setError('Nastala chyba. Skúste znova.')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Send size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Email odoslaný!</h1>
          <p className="text-slate-500 mb-6">
            Ak existuje účet s emailom <strong>{email}</strong>, poslali sme naň link pre reset hesla.
          </p>
          <p className="text-sm text-slate-400 mb-6">Skontrolujte aj spam priečinok.</p>
          <Link
            to="/login"
            className="text-violet-600 hover:text-violet-700 font-medium flex items-center justify-center gap-2"
          >
            <ArrowLeft size={18} />
            Späť na prihlásenie
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl font-bold">R</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Zabudnuté heslo</h1>
          <p className="text-slate-500 mt-2">Zadajte váš email a pošleme vám link</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Email</label>
            <div className="relative">
              <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-600 focus:border-transparent outline-none"
                placeholder="vas@email.sk"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            {loading ? 'Posielam...' : 'Poslať link'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link to="/login" className="text-violet-600 hover:text-violet-700 font-medium flex items-center justify-center gap-2">
            <ArrowLeft size={18} />
            Späť na prihlásenie
          </Link>
        </div>
      </div>
    </div>
  )
}