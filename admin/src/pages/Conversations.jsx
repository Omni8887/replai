import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../context/AuthContext.jsx'
import { MessageSquare, Target, Mail, Clock, Download } from 'lucide-react'

export default function Conversations() {
  const { API_URL } = useAuth()
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    loadConversations()
  }, [])

  const loadConversations = async () => {
    try {
      const response = await axios.get(`${API_URL}/admin/conversations`)
      setConversations(response.data)
    } catch (error) {
      console.error('Failed to load conversations:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const response = await axios.get(`${API_URL}/admin/export/leads`, {
        responseType: 'blob'
      })
      
      // Vytvor download link
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', 'leady.csv')
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      if (error.response?.status === 404) {
        alert('Žiadne leady na export')
      } else {
        console.error('Export failed:', error)
        alert('Chyba pri exporte')
      }
    } finally {
      setExporting(false)
    }
  }

  const filteredConversations = conversations.filter(conv => {
    if (filter === 'leads') return conv.has_contact
    if (filter === 'unread') return !conv.is_read
    return true
  })

  const filterButtons = [
    { key: 'all', label: 'Všetky', count: conversations.length, icon: MessageSquare },
    { key: 'leads', label: 'Leady', count: conversations.filter(c => c.has_contact).length, icon: Target },
    { key: 'unread', label: 'Neprečítané', count: conversations.filter(c => !c.is_read).length, icon: Mail },
  ]

  const leadsCount = conversations.filter(c => c.has_contact).length

  return (
    <div>
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Konverzácie</h1>
          <p className="text-slate-500 mt-1">Prehľad všetkých chatov so zákazníkmi</p>
        </div>
        
        {leadsCount > 0 && (
          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl hover:opacity-90 transition flex items-center gap-2 font-medium shadow-lg shadow-emerald-200 disabled:opacity-50"
          >
            <Download size={18} />
            {exporting ? 'Exportujem...' : `Stiahnuť leady (${leadsCount})`}
          </button>
        )}
      </div>

      <div className="flex gap-3 mb-6">
        {filterButtons.map(btn => (
          <button
            key={btn.key}
            onClick={() => setFilter(btn.key)}
            className={`px-5 py-2.5 rounded-xl font-medium transition flex items-center gap-2 ${
              filter === btn.key
                ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-200'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <btn.icon size={18} />
            {btn.label} ({btn.count})
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
        {loading ? (
          <div className="p-12 text-center text-slate-500">Načítavam...</div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            {filter === 'all' 
              ? 'Zatiaľ žiadne konverzácie'
              : 'Žiadne konverzácie v tomto filtri'
            }
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredConversations.map(conv => (
              <Link
                key={conv.id}
                to={`/conversations/${conv.id}`}
                className={`block p-5 hover:bg-slate-50 transition ${
                  conv.has_contact ? 'border-l-4 border-emerald-500' : ''
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      conv.has_contact 
                        ? 'bg-emerald-100 text-emerald-600' 
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      <MessageSquare size={20} />
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
                          <span className="bg-emerald-100 text-emerald-700 text-xs px-2.5 py-1 rounded-full font-medium">
                            Lead
                          </span>
                        )}
                      </div>
                      
                      <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-500">
                        {conv.visitor_email && (
                          <span className="flex items-center gap-1">
                            <Mail size={14} />
                            {conv.visitor_email}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <span className="text-sm text-slate-400 flex items-center gap-1">
                      <Clock size={14} />
                      {new Date(conv.updated_at).toLocaleDateString('sk')}
                    </span>
                    <p className="text-xs text-slate-400 mt-1">
                      {new Date(conv.updated_at).toLocaleTimeString('sk', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </p>
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