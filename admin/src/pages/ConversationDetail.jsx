import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../context/AuthContext.jsx'
import { ArrowLeft, Mail, Phone, User, Bot, Clock, Trash2 } from 'lucide-react'

export default function ConversationDetail() {
  const { id } = useParams()
  const { API_URL } = useAuth()
  const navigate = useNavigate()
  const [conversation, setConversation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    loadConversation()
  }, [id])

  const loadConversation = async () => {
    try {
      const response = await axios.get(`${API_URL}/admin/conversations/${id}`)
      setConversation(response.data)
    } catch (error) {
      console.error('Failed to load conversation:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Naozaj chcete vymazať túto konverzáciu? Táto akcia sa nedá vrátiť.')) {
      return
    }
    
    setDeleting(true)
    try {
      await axios.delete(`${API_URL}/admin/conversations/${id}`)
      navigate('/conversations')
    } catch (error) {
      console.error('Failed to delete conversation:', error)
      alert('Chyba pri mazaní konverzácie')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-500">Načítavam...</p>
      </div>
    )
  }

  if (!conversation) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">Konverzácia nenájdená</p>
        <Link to="/conversations" className="text-violet-600 hover:underline mt-2 inline-block font-medium">
          ← Späť na zoznam
        </Link>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <Link 
          to="/conversations" 
          className="text-slate-500 hover:text-slate-700 text-sm mb-4 inline-flex items-center gap-1 font-medium"
        >
          <ArrowLeft size={16} />
          Späť na konverzácie
        </Link>
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center ${
              conversation.has_contact 
                ? 'bg-emerald-100 text-emerald-600' 
                : 'bg-slate-100 text-slate-600'
            }`}>
              <User size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                {conversation.visitor_email || conversation.visitor_name || 'Anonymný návštevník'}
                {conversation.has_contact && (
                  <span className="bg-emerald-100 text-emerald-700 text-sm px-3 py-1 rounded-full font-medium">
                    Lead
                  </span>
                )}
              </h1>
              <p className="text-slate-500 flex items-center gap-1 mt-1">
                <Clock size={14} />
                {new Date(conversation.created_at).toLocaleString('sk')}
              </p>
            </div>
          </div>
          
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition flex items-center gap-2 font-medium disabled:opacity-50"
          >
            <Trash2 size={18} />
            {deleting ? 'Mažem...' : 'Vymazať'}
          </button>
        </div>
      </div>

      {conversation.has_contact && (
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-5 mb-6">
          <h3 className="font-semibold text-emerald-800 mb-3">Kontaktné údaje</h3>
          <div className="flex flex-wrap gap-6 text-sm">
            {conversation.visitor_email && (
              <a href={`mailto:${conversation.visitor_email}`} className="text-emerald-700 hover:text-emerald-800 flex items-center gap-2 font-medium">
                <Mail size={16} />
                {conversation.visitor_email}
              </a>
            )}
            {conversation.visitor_phone && (
              <a href={`tel:${conversation.visitor_phone}`} className="text-emerald-700 hover:text-emerald-800 flex items-center gap-2 font-medium">
                <Phone size={16} />
                {conversation.visitor_phone}
              </a>
            )}
            {conversation.visitor_name && (
              <span className="text-emerald-700 flex items-center gap-2 font-medium">
                <User size={16} />
                {conversation.visitor_name}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
        <div className="p-5 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">História konverzácie</h2>
        </div>
        
        <div className="p-5 space-y-4 max-h-[500px] overflow-y-auto">
          {conversation.messages?.length === 0 ? (
            <p className="text-slate-500 text-center py-8">Žiadne správy</p>
          ) : (
            conversation.messages?.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] rounded-2xl p-4 ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-800'
                  }`}
                >
                  <p className="text-xs opacity-70 mb-2 flex items-center gap-1">
                    {msg.role === 'user' ? <User size={12} /> : <Bot size={12} />}
                    {msg.role === 'user' ? 'Zákazník' : 'AI Asistent'}
                  </p>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <p className="text-xs opacity-50 mt-2">
                    {new Date(msg.created_at).toLocaleTimeString('sk', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}