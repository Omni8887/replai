import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../context/AuthContext.jsx'
import { MessageSquare, Target, Mail, Clock, Download, Trash2, CheckCheck, X } from 'lucide-react'

export default function Conversations() {
  const { API_URL } = useAuth()
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [exporting, setExporting] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [deleting, setDeleting] = useState(false)

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

  const toggleSelect = (id, e) => {
    e.preventDefault()
    e.stopPropagation()
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selected.size === filteredConversations.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filteredConversations.map(c => c.id)))
    }
  }

  const clearSelection = () => setSelected(new Set())

  const bulkDelete = async () => {
    if (selected.size === 0) return
    if (!window.confirm(`Vymazať ${selected.size} konverzácií? Táto akcia je nevratná.`)) return
    
    setDeleting(true)
    try {
      await Promise.all(
        [...selected].map(id => 
          axios.delete(`${API_URL}/admin/conversations/${id}`)
        )
      )
      setSelected(new Set())
      await loadConversations()
    } catch (error) {
      console.error('Bulk delete failed:', error)
      alert('Nepodarilo sa vymazať všetky konverzácie')
    } finally {
      setDeleting(false)
    }
  }

  const bulkMarkRead = async () => {
    if (selected.size === 0) return
    
    try {
      await Promise.all(
        [...selected].map(id => 
          axios.get(`${API_URL}/admin/conversations/${id}`)
        )
      )
      setSelected(new Set())
      await loadConversations()
    } catch (error) {
      console.error('Bulk mark read failed:', error)
    }
  }

  // Vytvor mapu čísiel — najstaršia konverzácia = #001
  const conversationNumbers = (() => {
    const sorted = [...conversations].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    const map = {}
    sorted.forEach((conv, i) => {
      map[conv.id] = String(i + 1).padStart(3, '0')
    })
    return map
  })()

  const getConversationLabel = (conv) => {
    if (conv.visitor_email) return conv.visitor_email
    if (conv.visitor_name) return conv.visitor_name
    return `Konverzácia #${conversationNumbers[conv.id] || '000'}`
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
  const isSelectMode = selected.size > 0

  return (
    <div>
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Konverzácie</h1>
          <p className="text-slate-500 mt-1">Prehľad všetkých chatov so zákazníkmi</p>
        </div>
        
        {leadsCount > 0 && !isSelectMode && (
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

      <div className="flex gap-3 mb-6 justify-between items-center flex-wrap">
        <div className="flex gap-3">
          {filterButtons.map(btn => (
            <button
              key={btn.key}
              onClick={() => { setFilter(btn.key); clearSelection() }}
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
      </div>

      {/* Bulk action bar */}
      {isSelectMode && (
        <div className="mb-4 p-3 bg-violet-50 border border-violet-200 rounded-xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-violet-700">
              Označených: {selected.size}
            </span>
            <button
              onClick={selectAll}
              className="text-sm text-violet-600 hover:text-violet-800 underline"
            >
              {selected.size === filteredConversations.length ? 'Zrušiť všetky' : 'Označiť všetky'}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={bulkMarkRead}
              className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition flex items-center gap-1.5"
            >
              <CheckCheck size={15} />
              Označiť prečítané
            </button>
            <button
              onClick={bulkDelete}
              disabled={deleting}
              className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition flex items-center gap-1.5 disabled:opacity-50"
            >
              <Trash2 size={15} />
              {deleting ? 'Mažem...' : 'Vymazať'}
            </button>
            <button
              onClick={clearSelection}
              className="p-1.5 text-slate-400 hover:text-slate-600 transition"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

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
              <div
                key={conv.id}
                className={`flex items-center ${conv.has_contact ? 'border-l-4 border-emerald-500' : ''}`}
              >
                {/* Checkbox */}
                <div className="pl-4 flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={selected.has(conv.id)}
                    onChange={(e) => toggleSelect(conv.id, e)}
                    className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                  />
                </div>
                
                {/* Conversation row */}
                <Link
                  to={`/conversations/${conv.id}`}
                  className="block p-5 hover:bg-slate-50 transition flex-1"
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
                            {getConversationLabel(conv)}
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}