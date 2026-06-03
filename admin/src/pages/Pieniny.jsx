import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import axios from 'axios'
import ReactQuill from 'react-quill'
import 'react-quill/dist/quill.snow.css'
import { 
  CalendarDays, BedDouble, Users, Plus, X, Check, 
  XCircle, Eye, Edit3, Trash2, ChevronDown, Search,
  Home, DoorOpen, ArrowUpDown, Euro, UserPlus, Mail, Phone, MapPin,
  FileText, Image, Globe, EyeOff, Star, StarOff, Upload
} from 'lucide-react'

// ============================================================
// STATUS CONFIG
// ============================================================
const STATUS_MAP = {
  nova:      { label: 'Nová',       color: 'bg-blue-100 text-blue-700',   dot: 'bg-blue-500' },
  potvrdena: { label: 'Potvrdená',  color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  zrusena:   { label: 'Zrušená',    color: 'bg-red-100 text-red-700',     dot: 'bg-red-500' },
  dokoncena: { label: 'Dokončená',  color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
}

const LEAD_STATUS_MAP = {
  nova:        { label: 'Nový',        color: 'bg-blue-100 text-blue-700',   dot: 'bg-blue-500' },
  kontaktovany:{ label: 'Kontaktovaný',color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  potvrdeny:   { label: 'Potvrdený',   color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  zamietnuty:  { label: 'Zamietnutý',  color: 'bg-red-100 text-red-700',     dot: 'bg-red-500' },
}

const BLOG_CATEGORIES = ['Pôst', 'Detoxikácia', 'Chudnutie', 'Zdravý životný štýl', 'Výživa', 'Klinika']

const ROOM_TYPE_ICONS = {
  izba: BedDouble,
  apartman: Home,
  rodinna: Users,
}

const QUILL_MODULES = {
  toolbar: [
    [{ 'header': [2, 3, false] }],
    ['bold', 'italic', 'underline'],
    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
    ['blockquote'],
    ['link', 'image'],
    ['clean']
  ]
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function Pieniny() {
  const { API_URL } = useAuth()
  const [activeTab, setActiveTab] = useState('bookings')
  const [bookings, setBookings] = useState([])
  const [rooms, setRooms] = useState([])
  const [leads, setLeads] = useState([])
  const [blogPosts, setBlogPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [leadSearchQuery, setLeadSearchQuery] = useState('')
  const [leadStatusFilter, setLeadStatusFilter] = useState('all')
  const [blogSearchQuery, setBlogSearchQuery] = useState('')
  const [blogCategoryFilter, setBlogCategoryFilter] = useState('all')
  const [showBookingModal, setShowBookingModal] = useState(false)
  const [showRoomModal, setShowRoomModal] = useState(false)
  const [showBlogModal, setShowBlogModal] = useState(false)
  const [editingBooking, setEditingBooking] = useState(null)
  const [editingRoom, setEditingRoom] = useState(null)
  const [editingPost, setEditingPost] = useState(null)
  const [stats, setStats] = useState({ total: 0, nova: 0, potvrdena: 0, thisMonth: 0 })
  const [leadStats, setLeadStats] = useState({ total: 0, nova: 0, kontaktovany: 0, thisMonth: 0 })

  const token = localStorage.getItem('token')
  const headers = { Authorization: `Bearer ${token}` }

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [bookingsRes, roomsRes, leadsRes, blogRes] = await Promise.all([
        axios.get(`${API_URL}/nhc/bookings`, { headers }),
        axios.get(`${API_URL}/nhc/rooms`, { headers }),
        axios.get(`${API_URL}/nhc/leads`, { headers }),
        axios.get(`${API_URL}/nhc/blog`, { headers }),
      ])
      setBookings(bookingsRes.data || [])
      setRooms(roomsRes.data || [])
      setLeads(leadsRes.data || [])
      setBlogPosts(blogRes.data || [])
      calculateStats(bookingsRes.data || [])
      calculateLeadStats(leadsRes.data || [])
    } catch (err) {
      console.error('Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  const calculateStats = (data) => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    setStats({
      total: data.length,
      nova: data.filter(b => b.status === 'nova').length,
      potvrdena: data.filter(b => b.status === 'potvrdena').length,
      thisMonth: data.filter(b => new Date(b.created_at) >= monthStart).length,
    })
  }

  const calculateLeadStats = (data) => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    setLeadStats({
      total: data.length,
      nova: data.filter(l => l.status === 'nova').length,
      kontaktovany: data.filter(l => l.status === 'kontaktovany').length,
      thisMonth: data.filter(l => new Date(l.created_at) >= monthStart).length,
    })
  }

  // ── Booking CRUD ─────────────────────────────────────────
  const saveBooking = async (formData) => {
    try {
      if (editingBooking) {
        await axios.put(`${API_URL}/nhc/bookings/${editingBooking.id}`, formData, { headers })
      } else {
        await axios.post(`${API_URL}/nhc/bookings`, formData, { headers })
      }
      setShowBookingModal(false)
      setEditingBooking(null)
      fetchAll()
    } catch (err) {
      console.error('Save booking error:', err)
      alert('Chyba pri ukladaní rezervácie')
    }
  }

  const updateBookingStatus = async (id, status) => {
    try {
      await axios.put(`${API_URL}/nhc/bookings/${id}`, { status }, { headers })
      fetchAll()
    } catch (err) { console.error('Status update error:', err) }
  }

  const deleteBooking = async (id) => {
    if (!confirm('Naozaj chcete zmazať túto rezerváciu?')) return
    try {
      await axios.delete(`${API_URL}/nhc/bookings/${id}`, { headers })
      fetchAll()
    } catch (err) { console.error('Delete error:', err) }
  }

  // ── Room CRUD ────────────────────────────────────────────
  const saveRoom = async (formData) => {
    try {
      if (editingRoom) {
        await axios.put(`${API_URL}/nhc/rooms/${editingRoom.id}`, formData, { headers })
      } else {
        await axios.post(`${API_URL}/nhc/rooms`, formData, { headers })
      }
      setShowRoomModal(false)
      setEditingRoom(null)
      fetchAll()
    } catch (err) {
      console.error('Save room error:', err)
      alert('Chyba pri ukladaní izby')
    }
  }

  // ── Lead actions ─────────────────────────────────────────
  const updateLeadStatus = async (id, status) => {
    try {
      await axios.put(`${API_URL}/nhc/leads/${id}`, { status }, { headers })
      fetchAll()
    } catch (err) { console.error('Lead status update error:', err) }
  }

  const deleteLead = async (id) => {
    if (!confirm('Naozaj chcete zmazať tento kontakt?')) return
    try {
      await axios.delete(`${API_URL}/nhc/leads/${id}`, { headers })
      fetchAll()
    } catch (err) { console.error('Delete lead error:', err) }
  }

  // ── Blog CRUD ────────────────────────────────────────────
  const saveBlogPost = async (formData) => {
    try {
      if (editingPost) {
        await axios.put(`${API_URL}/nhc/blog/${editingPost.id}`, formData, { headers })
      } else {
        await axios.post(`${API_URL}/nhc/blog`, formData, { headers })
      }
      setShowBlogModal(false)
      setEditingPost(null)
      fetchAll()
    } catch (err) {
      console.error('Save blog error:', err)
      alert('Chyba pri ukladaní článku')
    }
  }

  const togglePublish = async (post) => {
    try {
      await axios.put(`${API_URL}/nhc/blog/${post.id}`, { is_published: !post.is_published }, { headers })
      fetchAll()
    } catch (err) { console.error('Publish toggle error:', err) }
  }

  const toggleFeatured = async (post) => {
    try {
      await axios.put(`${API_URL}/nhc/blog/${post.id}`, { is_featured: !post.is_featured }, { headers })
      fetchAll()
    } catch (err) { console.error('Featured toggle error:', err) }
  }

  const deletePost = async (id) => {
    if (!confirm('Naozaj chcete zmazať tento článok?')) return
    try {
      await axios.delete(`${API_URL}/nhc/blog/${id}`, { headers })
      fetchAll()
    } catch (err) { console.error('Delete post error:', err) }
  }

  const openEditPost = async (post) => {
    try {
      const { data } = await axios.get(`${API_URL}/nhc/blog/${post.id}`, { headers })
      setEditingPost(data)
      setShowBlogModal(true)
    } catch (err) { console.error('Fetch post error:', err) }
  }

  // ── Filters ──────────────────────────────────────────────
  const filteredBookings = bookings.filter(b => {
    const matchesSearch = searchQuery === '' || b.guest_name?.toLowerCase().includes(searchQuery.toLowerCase()) || b.guest_email?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'all' || b.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const filteredLeads = leads.filter(l => {
    const matchesSearch = leadSearchQuery === '' || l.name?.toLowerCase().includes(leadSearchQuery.toLowerCase()) || l.email?.toLowerCase().includes(leadSearchQuery.toLowerCase()) || l.phone?.includes(leadSearchQuery)
    const matchesStatus = leadStatusFilter === 'all' || l.status === leadStatusFilter
    return matchesSearch && matchesStatus
  })

  const filteredPosts = blogPosts.filter(p => {
    const matchesSearch = blogSearchQuery === '' || p.title?.toLowerCase().includes(blogSearchQuery.toLowerCase())
    const matchesCategory = blogCategoryFilter === 'all' || p.category === blogCategoryFilter
    return matchesSearch && matchesCategory
  })

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('sk-SK', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
  const formatPrice = (p) => p ? `${Number(p).toFixed(0)}€` : '—'
  const getRoomName = (roomId) => rooms.find(r => r.id === roomId)?.name || '—'

  // ============================================================
  // RENDER
  // ============================================================
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Rezervácie — Pieniny</h1>
          <p className="text-slate-500 mt-1">National Health Clinic · Rezervačný systém</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard icon={CalendarDays} label="Celkom rezervácií" value={stats.total} color="violet" />
        <StatCard icon={Plus} label="Nové (čakajú)" value={stats.nova} color="blue" />
        <StatCard icon={Check} label="Potvrdené" value={stats.potvrdena} color="green" />
        <StatCard icon={UserPlus} label="Nové leady" value={leadStats.nova} color="amber" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {[
          { key: 'bookings', icon: CalendarDays, label: 'Rezervácie' },
          { key: 'rooms', icon: BedDouble, label: 'Izby & Ceny' },
          { key: 'leads', icon: UserPlus, label: 'Leady', badge: leadStats.nova },
          { key: 'blog', icon: FileText, label: 'Blog' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <tab.icon size={16} className="inline mr-2" />
            {tab.label}
            {tab.badge > 0 && (
              <span className="ml-2 px-1.5 py-0.5 bg-amber-500 text-white text-xs rounded-full">{tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'bookings' && (
        <BookingsTab bookings={filteredBookings} rooms={rooms} searchQuery={searchQuery} setSearchQuery={setSearchQuery}
          statusFilter={statusFilter} setStatusFilter={setStatusFilter}
          onAdd={() => { setEditingBooking(null); setShowBookingModal(true) }}
          onEdit={(b) => { setEditingBooking(b); setShowBookingModal(true) }}
          onDelete={deleteBooking} onStatusChange={updateBookingStatus}
          formatDate={formatDate} formatPrice={formatPrice} getRoomName={getRoomName} />
      )}
      {activeTab === 'rooms' && (
        <RoomsTab rooms={rooms} onEdit={(r) => { setEditingRoom(r); setShowRoomModal(true) }} formatPrice={formatPrice} />
      )}
      {activeTab === 'leads' && (
        <LeadsTab leads={filteredLeads} searchQuery={leadSearchQuery} setSearchQuery={setLeadSearchQuery}
          statusFilter={leadStatusFilter} setStatusFilter={setLeadStatusFilter}
          onStatusChange={updateLeadStatus} onDelete={deleteLead} formatDate={formatDate} formatPrice={formatPrice} />
      )}
      {activeTab === 'blog' && (
        <BlogTab posts={filteredPosts} searchQuery={blogSearchQuery} setSearchQuery={setBlogSearchQuery}
          categoryFilter={blogCategoryFilter} setCategoryFilter={setBlogCategoryFilter}
          onAdd={() => { setEditingPost(null); setShowBlogModal(true) }}
          onEdit={openEditPost} onDelete={deletePost}
          onTogglePublish={togglePublish} onToggleFeatured={toggleFeatured}
          formatDate={formatDate} />
      )}

      {/* Modals */}
      {showBookingModal && <BookingModal booking={editingBooking} rooms={rooms} onSave={saveBooking} onClose={() => { setShowBookingModal(false); setEditingBooking(null) }} />}
      {showRoomModal && <RoomModal room={editingRoom} onSave={saveRoom} onClose={() => { setShowRoomModal(false); setEditingRoom(null) }} />}
      {showBlogModal && <BlogModal post={editingPost} API_URL={API_URL} headers={headers} onSave={saveBlogPost} onClose={() => { setShowBlogModal(false); setEditingPost(null) }} />}
    </div>
  )
}
// ============================================================
// STAT CARD
// ============================================================
function StatCard({ icon: Icon, label, value, color }) {
  const colorMap = {
    violet: 'bg-violet-50 text-violet-600', blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600', amber: 'bg-amber-50 text-amber-600',
  }
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-slate-500">{label}</span>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorMap[color]}`}><Icon size={20} /></div>
      </div>
      <span className="text-3xl font-bold text-slate-900">{value}</span>
    </div>
  )
}

// ============================================================
// BLOG TAB
// ============================================================
function BlogTab({ posts, searchQuery, setSearchQuery, categoryFilter, setCategoryFilter, onAdd, onEdit, onDelete, onTogglePublish, onToggleFeatured, formatDate }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Hľadať článok..." value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none" />
          </div>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-violet-500 outline-none">
            <option value="all">Všetky kategórie</option>
            {BLOG_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button onClick={onAdd}
          className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700 transition-colors">
          <Plus size={16} /> Nový článok
        </button>
      </div>

      {posts.length === 0 ? (
        <div className="p-12 text-center text-slate-400">
          <FileText size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium">Žiadne články</p>
          <p className="text-sm mt-1">Vytvorte prvý článok tlačidlom vyššie</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {posts.map(p => (
            <div key={p.id} className="flex items-center gap-4 p-5 hover:bg-slate-50/50 transition-colors">
              {p.featured_image ? (
                <img src={p.featured_image} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <Image size={20} className="text-slate-300" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium text-slate-900 text-sm truncate">{p.title}</h3>
                  {p.is_featured && <Star size={14} className="text-amber-500 flex-shrink-0" fill="currentColor" />}
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span className="px-2 py-0.5 bg-slate-100 rounded-md">{p.category}</span>
                  <span>{p.reading_time} min čítania</span>
                  <span>{formatDate(p.published_at || p.created_at)}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => onTogglePublish(p)}
                  className={`p-1.5 rounded-lg transition-colors ${p.is_published ? 'text-green-600 hover:bg-green-50' : 'text-slate-400 hover:bg-slate-100'}`}
                  title={p.is_published ? 'Publikovaný — klikni pre skrytie' : 'Skrytý — klikni pre publikovanie'}>
                  {p.is_published ? <Globe size={16} /> : <EyeOff size={16} />}
                </button>
                <button onClick={() => onToggleFeatured(p)}
                  className={`p-1.5 rounded-lg transition-colors ${p.is_featured ? 'text-amber-500 hover:bg-amber-50' : 'text-slate-400 hover:bg-slate-100'}`}
                  title={p.is_featured ? 'Odporúčaný' : 'Označiť ako odporúčaný'}>
                  {p.is_featured ? <Star size={16} fill="currentColor" /> : <StarOff size={16} />}
                </button>
                <button onClick={() => onEdit(p)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors" title="Upraviť">
                  <Edit3 size={16} />
                </button>
                <button onClick={() => onDelete(p.id)} className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors" title="Zmazať">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================
// BLOG MODAL
// ============================================================
function BlogModal({ post, API_URL, headers, onSave, onClose }) {
  const [form, setForm] = useState({
    title: post?.title || '',
    content: post?.content || '',
    excerpt: post?.excerpt || '',
    category: post?.category || 'Pôst',
    featured_image: post?.featured_image || '',
    seo_title: post?.seo_title || '',
    seo_description: post?.seo_description || '',
    is_featured: post?.is_featured || false,
    is_published: post?.is_published || false,
    author: post?.author || 'NHC Redakcia',
  })
  const [uploading, setUploading] = useState(false)
  const [activeSection, setActiveSection] = useState('content')

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  const handleImageUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try {
      const res = await fetch(`${API_URL}/nhc/blog/upload-image`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': file.type },
        body: file,
      })
      const data = await res.json()
      if (data.url) set('featured_image', data.url)
    } catch (err) {
      console.error('Upload error:', err)
      alert('Nepodarilo sa nahrať obrázok')
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.title || !form.content) { alert('Nadpis a obsah sú povinné'); return }
    onSave(form)
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">{post ? 'Upraviť článok' : 'Nový článok'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"><X size={20} className="text-slate-400" /></button>
        </div>

        {/* Section tabs */}
        <div className="flex gap-1 px-6 pt-4">
          {[
            { key: 'content', label: 'Obsah' },
            { key: 'seo', label: 'SEO & Meta' },
          ].map(s => (
            <button key={s.key} onClick={() => setActiveSection(s.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeSection === s.key ? 'bg-violet-100 text-violet-700' : 'text-slate-500 hover:text-slate-700'}`}>
              {s.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {activeSection === 'content' && (
            <>
              <FormField label="Nadpis článku" required>
                <input type="text" value={form.title} onChange={e => set('title', e.target.value)}
                  className="form-input" placeholder="Ako liečebný pôst mení vaše zdravie" required />
              </FormField>

              <div className="grid grid-cols-3 gap-4">
                <FormField label="Kategória">
                  <select value={form.category} onChange={e => set('category', e.target.value)} className="form-input">
                    {BLOG_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </FormField>
                <FormField label="Autor">
                  <input type="text" value={form.author} onChange={e => set('author', e.target.value)} className="form-input" />
                </FormField>
                <FormField label="Náhľadový obrázok">
                  <div className="flex gap-2">
                    <label className={`flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-xl text-sm cursor-pointer hover:bg-slate-50 transition-colors ${uploading ? 'opacity-50' : ''}`}>
                      <Upload size={14} /> {uploading ? 'Nahrávam...' : 'Nahrať'}
                      <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" disabled={uploading} />
                    </label>
                    {form.featured_image && <img src={form.featured_image} alt="" className="w-10 h-10 rounded-lg object-cover" />}
                  </div>
                </FormField>
              </div>

              <FormField label="Krátky popis (excerpt)">
                <textarea value={form.excerpt} onChange={e => set('excerpt', e.target.value)}
                  className="form-input" rows={2} placeholder="Automaticky sa vygeneruje z obsahu ak necháte prázdne..." />
              </FormField>

              <FormField label="Obsah článku" required>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <ReactQuill theme="snow" value={form.content} onChange={val => set('content', val)}
                    modules={QUILL_MODULES} placeholder="Začnite písať článok..." style={{ minHeight: '280px' }} />
                </div>
              </FormField>

              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={form.is_published} onChange={e => set('is_published', e.target.checked)}
                    className="w-4 h-4 accent-violet-600" />
                  Publikovať
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={form.is_featured} onChange={e => set('is_featured', e.target.checked)}
                    className="w-4 h-4 accent-amber-500" />
                  Odporúčaný článok
                </label>
              </div>
            </>
          )}

          {activeSection === 'seo' && (
            <>
              <FormField label="SEO Title">
                <input type="text" value={form.seo_title} onChange={e => set('seo_title', e.target.value)}
                  className="form-input" placeholder="Automaticky z nadpisu ak necháte prázdne" />
                <p className="text-xs text-slate-400 mt-1">{(form.seo_title || form.title).length}/60 znakov</p>
              </FormField>

              <FormField label="SEO Description (meta description)">
                <textarea value={form.seo_description} onChange={e => set('seo_description', e.target.value)}
                  className="form-input" rows={3} placeholder="Automaticky z obsahu ak necháte prázdne" />
                <p className="text-xs text-slate-400 mt-1">{(form.seo_description || form.excerpt).length}/160 znakov</p>
              </FormField>

              <div className="bg-slate-50 rounded-xl p-4 mt-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Náhľad vo vyhľadávači</p>
                <p className="text-blue-700 text-base font-medium">{form.seo_title || form.title || 'Nadpis článku'}</p>
                <p className="text-green-700 text-xs">nationalhealthclinic.sk/blog/{form.title ? form.title.toLowerCase().replace(/\s+/g, '-').substring(0, 40) : 'slug'}</p>
                <p className="text-slate-500 text-sm mt-1">{form.seo_description || form.excerpt || 'Popis článku sa zobrazí tu...'}</p>
              </div>
            </>
          )}

          <div className="flex gap-3 pt-4 border-t border-slate-100">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              Zrušiť
            </button>
            <button type="submit"
              className="flex-1 px-4 py-3 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors">
              {post ? 'Uložiť zmeny' : 'Vytvoriť článok'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================================================
// BOOKINGS TAB (unchanged)
// ============================================================
function BookingsTab({ bookings, rooms, searchQuery, setSearchQuery, statusFilter, setStatusFilter, onAdd, onEdit, onDelete, onStatusChange, formatDate, formatPrice, getRoomName }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Hľadať meno, email..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-violet-500 outline-none">
            <option value="all">Všetky statusy</option>
            <option value="nova">Nové</option><option value="potvrdena">Potvrdené</option>
            <option value="zrusena">Zrušené</option><option value="dokoncena">Dokončené</option>
          </select>
        </div>
        <button onClick={onAdd} className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700 transition-colors">
          <Plus size={16} /> Nová rezervácia
        </button>
      </div>
      {bookings.length === 0 ? (
        <div className="p-12 text-center text-slate-400">
          <CalendarDays size={40} className="mx-auto mb-3 opacity-40" /><p className="font-medium">Žiadne rezervácie</p>
          <p className="text-sm mt-1">Vytvorte prvú rezerváciu tlačidlom vyššie</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-slate-100">
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Hosť</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Izba</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Check-in</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Check-out</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Noci</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Cena</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
              <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Akcie</th>
            </tr></thead>
            <tbody>
              {bookings.map(b => {
                const st = STATUS_MAP[b.status] || STATUS_MAP.nova
                return (
                  <tr key={b.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-4"><div className="font-medium text-slate-900 text-sm">{b.guest_name}</div><div className="text-xs text-slate-400">{b.guest_email}</div></td>
                    <td className="px-5 py-4 text-sm text-slate-600">{getRoomName(b.room_id)}</td>
                    <td className="px-5 py-4 text-sm text-slate-600">{formatDate(b.check_in)}</td>
                    <td className="px-5 py-4 text-sm text-slate-600">{formatDate(b.check_out)}</td>
                    <td className="px-5 py-4 text-sm text-slate-600">{b.nights || '—'}</td>
                    <td className="px-5 py-4 text-sm font-medium text-slate-900">{formatPrice(b.total_price)}</td>
                    <td className="px-5 py-4"><span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${st.color}`}><span className={`w-1.5 h-1.5 rounded-full ${st.dot}`}></span>{st.label}</span></td>
                    <td className="px-5 py-4"><div className="flex items-center justify-end gap-1">
                      {b.status === 'nova' && <button onClick={() => onStatusChange(b.id, 'potvrdena')} className="p-1.5 rounded-lg text-green-600 hover:bg-green-50" title="Potvrdiť"><Check size={16} /></button>}
                      {(b.status === 'nova' || b.status === 'potvrdena') && <button onClick={() => onStatusChange(b.id, 'zrusena')} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50" title="Zrušiť"><XCircle size={16} /></button>}
                      <button onClick={() => onEdit(b)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100" title="Upraviť"><Edit3 size={16} /></button>
                      <button onClick={() => onDelete(b.id)} className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500" title="Zmazať"><Trash2 size={16} /></button>
                    </div></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ============================================================
// LEADS TAB (unchanged)
// ============================================================
function LeadsTab({ leads, searchQuery, setSearchQuery, statusFilter, setStatusFilter, onStatusChange, onDelete, formatDate, formatPrice }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Hľadať meno, email, telefón..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-violet-500 outline-none">
            <option value="all">Všetky statusy</option><option value="nova">Nové</option>
            <option value="kontaktovany">Kontaktované</option><option value="potvrdeny">Potvrdené</option>
            <option value="zamietnuty">Zamietnuté</option>
          </select>
        </div>
      </div>
      {leads.length === 0 ? (
        <div className="p-12 text-center text-slate-400">
          <UserPlus size={40} className="mx-auto mb-3 opacity-40" /><p className="font-medium">Žiadne leady</p>
          <p className="text-sm mt-1">Kontakty z webového formulára sa zobrazia tu</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-slate-100">
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Kontakt</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Program</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Apartmán</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Cena</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Termín</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Dátum</th>
              <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Akcie</th>
            </tr></thead>
            <tbody>
              {leads.map(l => {
                const st = LEAD_STATUS_MAP[l.status] || LEAD_STATUS_MAP.nova
                return (
                  <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-4"><div className="font-medium text-slate-900 text-sm">{l.name}</div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-slate-400 flex items-center gap-1"><Mail size={12} /> {l.email}</span>
                        {l.phone && <span className="text-xs text-slate-400 flex items-center gap-1"><Phone size={12} /> {l.phone}</span>}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">{l.program}</td>
                    <td className="px-5 py-4 text-sm text-slate-600">{l.apartment || '—'}</td>
                    <td className="px-5 py-4 text-sm font-medium text-slate-900">{formatPrice(l.total_price)}</td>
                    <td className="px-5 py-4 text-sm text-slate-600">{l.preferred_date_from ? <span>{formatDate(l.preferred_date_from)} — {formatDate(l.preferred_date_to)}</span> : '—'}</td>
                    <td className="px-5 py-4"><span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${st.color}`}><span className={`w-1.5 h-1.5 rounded-full ${st.dot}`}></span>{st.label}</span></td>
                    <td className="px-5 py-4 text-sm text-slate-400">{formatDate(l.created_at)}</td>
                    <td className="px-5 py-4"><div className="flex items-center justify-end gap-1">
                      {l.status === 'nova' && <button onClick={() => onStatusChange(l.id, 'kontaktovany')} className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50" title="Kontaktovaný"><Phone size={16} /></button>}
                      {(l.status === 'nova' || l.status === 'kontaktovany') && <button onClick={() => onStatusChange(l.id, 'potvrdeny')} className="p-1.5 rounded-lg text-green-600 hover:bg-green-50" title="Potvrdiť"><Check size={16} /></button>}
                      {l.status !== 'zamietnuty' && <button onClick={() => onStatusChange(l.id, 'zamietnuty')} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50" title="Zamietnuť"><XCircle size={16} /></button>}
                      <button onClick={() => onDelete(l.id)} className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500" title="Zmazať"><Trash2 size={16} /></button>
                    </div></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ============================================================
// ROOMS TAB (unchanged)
// ============================================================
function RoomsTab({ rooms, onEdit, formatPrice }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {rooms.map(room => {
        const TypeIcon = ROOM_TYPE_ICONS[room.type] || BedDouble
        return (
          <div key={room.id} className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center"><TypeIcon size={20} /></div>
                <div><h3 className="font-semibold text-slate-900 text-sm">{room.name}</h3><span className="text-xs text-slate-400 capitalize">{room.category} · {room.type}</span></div>
              </div>
              <button onClick={() => onEdit(room)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><Edit3 size={16} /></button>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-4">
              <div className="text-center p-2.5 bg-slate-50 rounded-xl"><div className="text-lg font-bold text-slate-900">{formatPrice(room.price_per_night)}</div><div className="text-xs text-slate-400">za noc</div></div>
              <div className="text-center p-2.5 bg-slate-50 rounded-xl"><div className="text-lg font-bold text-slate-900">{room.max_guests}</div><div className="text-xs text-slate-400">max. hostí</div></div>
              <div className="text-center p-2.5 bg-slate-50 rounded-xl"><div className="text-lg font-bold text-slate-900">{room.total_count}</div><div className="text-xs text-slate-400">izieb</div></div>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-4">
              {(room.amenities || []).slice(0, 4).map((a, i) => <span key={i} className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md">{a}</span>)}
              {(room.amenities || []).length > 4 && <span className="text-xs text-slate-400">+{room.amenities.length - 4}</span>}
            </div>
            <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100">
              {room.has_balcony && <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-md">Balkón</span>}
              <span className={`text-xs px-2 py-0.5 rounded-md ${room.is_active ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>{room.is_active ? 'Aktívna' : 'Neaktívna'}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ============================================================
// BOOKING MODAL (unchanged)
// ============================================================
function BookingModal({ booking, rooms, onSave, onClose }) {
  const [form, setForm] = useState({
    guest_name: booking?.guest_name || '', guest_email: booking?.guest_email || '',
    guest_phone: booking?.guest_phone || '', guests_count: booking?.guests_count || 2,
    room_id: booking?.room_id || (rooms[0]?.id || ''), check_in: booking?.check_in || '',
    check_out: booking?.check_out || '', status: booking?.status || 'nova', notes: booking?.notes || '',
  })
  const selectedRoom = rooms.find(r => r.id === form.room_id)
  const nights = form.check_in && form.check_out ? Math.max(0, Math.ceil((new Date(form.check_out) - new Date(form.check_in)) / 86400000)) : 0
  const totalPrice = selectedRoom ? nights * selectedRoom.price_per_night : 0
  const handleSubmit = (e) => { e.preventDefault(); onSave({ ...form, total_price: totalPrice }) }
  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">{booking ? 'Upraviť rezerváciu' : 'Nová rezervácia'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Meno a priezvisko" required><input type="text" value={form.guest_name} onChange={e => set('guest_name', e.target.value)} className="form-input" placeholder="Ján Novák" required /></FormField>
            <FormField label="E-mail" required><input type="email" value={form.guest_email} onChange={e => set('guest_email', e.target.value)} className="form-input" placeholder="jan@example.com" required /></FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Telefón"><input type="tel" value={form.guest_phone} onChange={e => set('guest_phone', e.target.value)} className="form-input" placeholder="+421 9XX XXX XXX" /></FormField>
            <FormField label="Počet hostí"><input type="number" min="1" max="5" value={form.guests_count} onChange={e => set('guests_count', Number(e.target.value))} className="form-input" /></FormField>
          </div>
          <FormField label="Izba" required><select value={form.room_id} onChange={e => set('room_id', e.target.value)} className="form-input" required>{rooms.map(r => <option key={r.id} value={r.id}>{r.name} — {r.price_per_night}€/noc</option>)}</select></FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Check-in" required><input type="date" value={form.check_in} onChange={e => set('check_in', e.target.value)} className="form-input" required /></FormField>
            <FormField label="Check-out" required><input type="date" value={form.check_out} onChange={e => set('check_out', e.target.value)} className="form-input" min={form.check_in} required /></FormField>
          </div>
          {nights > 0 && <div className="bg-violet-50 rounded-xl p-4 flex items-center justify-between"><div><span className="text-sm text-violet-600 font-medium">{nights} {nights === 1 ? 'noc' : nights < 5 ? 'noci' : 'nocí'}</span><span className="text-xs text-violet-400 ml-2">× {selectedRoom?.price_per_night}€</span></div><span className="text-xl font-bold text-violet-700">{totalPrice}€</span></div>}
          {booking && <FormField label="Status"><select value={form.status} onChange={e => set('status', e.target.value)} className="form-input"><option value="nova">Nová</option><option value="potvrdena">Potvrdená</option><option value="zrusena">Zrušená</option><option value="dokoncena">Dokončená</option></select></FormField>}
          <FormField label="Poznámka"><textarea value={form.notes} onChange={e => set('notes', e.target.value)} className="form-input" rows={3} placeholder="Špeciálne požiadavky..." /></FormField>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">Zrušiť</button>
            <button type="submit" className="flex-1 px-4 py-3 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700">{booking ? 'Uložiť zmeny' : 'Vytvoriť rezerváciu'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================================================
// ROOM MODAL (unchanged)
// ============================================================
function RoomModal({ room, onSave, onClose }) {
  const [form, setForm] = useState({ price_per_night: room?.price_per_night || 0, total_count: room?.total_count || 1, is_active: room?.is_active ?? true })
  const handleSubmit = (e) => { e.preventDefault(); onSave(form) }
  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div><h2 className="text-lg font-bold text-slate-900">Upraviť izbu</h2><p className="text-sm text-slate-400">{room?.name}</p></div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <FormField label="Cena za noc (€)"><input type="number" min="0" step="1" value={form.price_per_night} onChange={e => set('price_per_night', Number(e.target.value))} className="form-input" /></FormField>
          <FormField label="Počet izieb tohto typu"><input type="number" min="0" value={form.total_count} onChange={e => set('total_count', Number(e.target.value))} className="form-input" /></FormField>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm font-medium text-slate-700">Aktívna (zobrazená na webe)</span>
            <button type="button" onClick={() => set('is_active', !form.is_active)} className={`relative w-11 h-6 rounded-full transition-colors ${form.is_active ? 'bg-violet-600' : 'bg-slate-200'}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.is_active ? 'translate-x-5' : ''}`} />
            </button>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">Zrušiť</button>
            <button type="submit" className="flex-1 px-4 py-3 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700">Uložiť</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================================================
// FORM FIELD HELPER
// ============================================================
function FormField({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
      <style>{`
        .form-input { width: 100%; padding: 0.625rem 0.875rem; border: 1px solid #e2e8f0; border-radius: 0.75rem; font-size: 0.875rem; color: #1e293b; outline: none; transition: border-color 0.2s, box-shadow 0.2s; }
        .form-input:focus { border-color: #7c3aed; box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.1); }
        .ql-container { min-height: 200px; font-family: system-ui, sans-serif; font-size: 0.9rem; }
        .ql-editor { min-height: 200px; }
      `}</style>
    </div>
  )
}