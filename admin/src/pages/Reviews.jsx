// ================================================================
// Reviews.jsx — Admin stránka pre správu recenzií
// Ulož do: admin/src/pages/Reviews.jsx
// ================================================================

import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import axios from 'axios'
import { Star, Plus, Trash2, Edit2, Eye, EyeOff, GripVertical, X, Save } from 'lucide-react'

const SOURCES = ['Google', 'Bookio', 'Web', 'Facebook', 'Iné']

export default function Reviews() {
  const { API_URL } = useAuth()
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ rating: 5, text: '', source: 'Google' })
  const [saving, setSaving] = useState(false)

  const token = localStorage.getItem('token')
  const headers = { Authorization: `Bearer ${token}` }

  useEffect(() => {
    fetchReviews()
  }, [])

  const fetchReviews = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/reviews`, { headers })
      setReviews(res.data)
    } catch (err) {
      console.error('Error fetching reviews:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!form.text.trim()) return
    setSaving(true)
    try {
      if (editingId) {
        await axios.put(`${API_URL}/api/reviews/${editingId}`, form, { headers })
      } else {
        await axios.post(`${API_URL}/api/reviews`, form, { headers })
      }
      setShowForm(false)
      setEditingId(null)
      setForm({ rating: 5, text: '', source: 'Google' })
      fetchReviews()
    } catch (err) {
      console.error('Error saving review:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (review) => {
    setForm({ rating: review.rating, text: review.text, source: review.source })
    setEditingId(review.id)
    setShowForm(true)
  }

  const handleToggle = async (review) => {
    try {
      await axios.put(`${API_URL}/api/reviews/${review.id}`, {
        is_active: !review.is_active
      }, { headers })
      fetchReviews()
    } catch (err) {
      console.error('Error toggling review:', err)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Naozaj chcete zmazať túto recenziu?')) return
    try {
      await axios.delete(`${API_URL}/api/reviews/${id}`, { headers })
      fetchReviews()
    } catch (err) {
      console.error('Error deleting review:', err)
    }
  }

  const handleMoveUp = async (index) => {
    if (index === 0) return
    const newReviews = [...reviews]
    const temp = newReviews[index]
    newReviews[index] = newReviews[index - 1]
    newReviews[index - 1] = temp
    const order = newReviews.map((r, i) => ({ id: r.id, sort_order: i }))
    try {
      await axios.put(`${API_URL}/api/reviews/reorder`, { order }, { headers })
      fetchReviews()
    } catch (err) {
      console.error('Error reordering:', err)
    }
  }

  const handleMoveDown = async (index) => {
    if (index === reviews.length - 1) return
    const newReviews = [...reviews]
    const temp = newReviews[index]
    newReviews[index] = newReviews[index + 1]
    newReviews[index + 1] = temp
    const order = newReviews.map((r, i) => ({ id: r.id, sort_order: i }))
    try {
      await axios.put(`${API_URL}/api/reviews/reorder`, { order }, { headers })
      fetchReviews()
    } catch (err) {
      console.error('Error reordering:', err)
    }
  }

  const activeCount = reviews.filter(r => r.is_active).length
  const avgRating = reviews.length > 0
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : '0'

  const renderStars = (rating, interactive = false, onChange = null) => {
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map(i => (
          <button
            key={i}
            type="button"
            disabled={!interactive}
            onClick={() => interactive && onChange && onChange(i)}
            className={`text-xl ${interactive ? 'cursor-pointer hover:scale-110' : 'cursor-default'} transition-transform`}
          >
            <Star
              size={interactive ? 28 : 18}
              className={i <= rating ? 'fill-amber-400 text-amber-400' : 'fill-slate-200 text-slate-200'}
            />
          </button>
        ))}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Recenzie</h1>
          <p className="text-slate-500 mt-1">
            {reviews.length} celkom · {activeCount} aktívnych · Priemer: {avgRating} ★
          </p>
        </div>
        <button
          onClick={() => {
            setForm({ rating: 5, text: '', source: 'Google' })
            setEditingId(null)
            setShowForm(true)
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-xl hover:bg-violet-700 transition-colors font-medium"
        >
          <Plus size={18} />
          Pridať recenziu
        </button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">
              {editingId ? 'Upraviť recenziu' : 'Nová recenzia'}
            </h2>
            <button onClick={() => { setShowForm(false); setEditingId(null) }} className="text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>
          </div>

          {/* Rating */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Hodnotenie</label>
            {renderStars(form.rating, true, (val) => setForm({ ...form, rating: val }))}
          </div>

          {/* Text */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Text recenzie</label>
            <textarea
              value={form.text}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
              rows={4}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none"
              placeholder="Text recenzie od pacienta..."
            />
          </div>

          {/* Source */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">Zdroj</label>
            <div className="flex gap-2 flex-wrap">
              {SOURCES.map(src => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setForm({ ...form, source: src })}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    form.source === src
                      ? 'bg-violet-100 text-violet-700 border-2 border-violet-300'
                      : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {src}
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <div className="flex gap-3">
            <button
              onClick={handleSubmit}
              disabled={saving || !form.text.trim()}
              className="flex items-center gap-2 px-6 py-2.5 bg-violet-600 text-white rounded-xl hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              <Save size={16} />
              {saving ? 'Ukladám...' : editingId ? 'Uložiť zmeny' : 'Pridať recenziu'}
            </button>
            <button
              onClick={() => { setShowForm(false); setEditingId(null) }}
              className="px-6 py-2.5 text-slate-600 hover:text-slate-800 transition-colors"
            >
              Zrušiť
            </button>
          </div>
        </div>
      )}

      {/* Reviews List */}
      {reviews.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Star size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-2">Zatiaľ žiadne recenzie</h3>
          <p className="text-slate-500">Pridajte prvú recenziu kliknutím na tlačidlo vyššie.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((review, index) => (
            <div
              key={review.id}
              className={`bg-white rounded-2xl border p-5 transition-all ${
                review.is_active
                  ? 'border-slate-200 shadow-sm'
                  : 'border-slate-100 opacity-50'
              }`}
            >
              <div className="flex items-start gap-4">
                {/* Reorder */}
                <div className="flex flex-col gap-1 pt-1">
                  <button
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    className="text-slate-300 hover:text-slate-500 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Posunúť hore"
                  >
                    ▲
                  </button>
                  <GripVertical size={16} className="text-slate-300 mx-auto" />
                  <button
                    onClick={() => handleMoveDown(index)}
                    disabled={index === reviews.length - 1}
                    className="text-slate-300 hover:text-slate-500 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Posunúť dole"
                  >
                    ▼
                  </button>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    {renderStars(review.rating)}
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                      {review.source}
                    </span>
                    {!review.is_active && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-500">
                        Skrytá
                      </span>
                    )}
                  </div>
                  <p className="text-slate-700 text-sm leading-relaxed">{review.text}</p>
                  <p className="text-xs text-slate-400 mt-2">
                    {new Date(review.created_at).toLocaleDateString('sk-SK')}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleToggle(review)}
                    className="p-2 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-colors"
                    title={review.is_active ? 'Skryť' : 'Zobraziť'}
                  >
                    {review.is_active ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                  <button
                    onClick={() => handleEdit(review)}
                    className="p-2 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-colors"
                    title="Upraviť"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(review.id)}
                    className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                    title="Zmazať"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
