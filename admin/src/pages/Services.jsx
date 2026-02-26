import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import axios from 'axios'

const API_URL = 'https://replai-backend.onrender.com'

const emptyForm = {
  code: '',
  name: '',
  description: '',
  price: '',
  duration_minutes: 60,
  sort_order: 0
}

export default function Services() {
  const { token } = useAuth()
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // null | 'add' | 'edit'
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadServices()
  }, [])

  const loadServices = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`${API_URL}/bookings/services`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setServices(res.data || [])
    } catch (err) {
      console.error('Error loading services:', err)
    }
    setLoading(false)
  }

  const openAdd = () => {
    setForm(emptyForm)
    setEditId(null)
    setError('')
    setModal('add')
  }

  const openEdit = (svc) => {
    setForm({
      code: svc.code || '',
      name: svc.name || '',
      description: svc.description || '',
      price: svc.price ?? '',
      duration_minutes: svc.duration_minutes || 60,
      sort_order: svc.sort_order || 0
    })
    setEditId(svc.id)
    setError('')
    setModal('edit')
  }

  const closeModal = () => {
    setModal(null)
    setEditId(null)
    setError('')
  }

  const saveService = async () => {
    if (!form.name.trim()) { setError('Názov je povinný'); return }
    if (!form.code.trim()) { setError('Kód je povinný'); return }
    if (form.price === '' || isNaN(form.price)) { setError('Cena musí byť číslo'); return }

    setSaving(true)
    setError('')
    try {
      if (modal === 'add') {
        await axios.post(`${API_URL}/bookings/services`, {
          ...form,
          price: parseFloat(form.price),
          duration_minutes: parseInt(form.duration_minutes),
          sort_order: parseInt(form.sort_order)
        }, { headers: { Authorization: `Bearer ${token}` } })
      } else {
        await axios.put(`${API_URL}/bookings/services/${editId}`, {
          ...form,
          price: parseFloat(form.price),
          duration_minutes: parseInt(form.duration_minutes),
          sort_order: parseInt(form.sort_order)
        }, { headers: { Authorization: `Bearer ${token}` } })
      }
      closeModal()
      loadServices()
    } catch (err) {
      setError(err.response?.data?.error || 'Nepodarilo sa uložiť')
    }
    setSaving(false)
  }

  const deleteService = async (id, name) => {
    if (!window.confirm(`Vymazať službu "${name}"?`)) return
    try {
      await axios.delete(`${API_URL}/bookings/services/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      loadServices()
    } catch (err) {
      alert('Nepodarilo sa vymazať službu')
    }
  }

  const toggleActive = async (svc) => {
    try {
      await axios.put(`${API_URL}/bookings/services/${svc.id}`, {
        is_active: !svc.is_active
      }, { headers: { Authorization: `Bearer ${token}` } })
      loadServices()
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="services-page">
      <style>{`
        .services-page {
          padding: 24px;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .page-title {
          font-size: 20px;
          font-weight: 600;
          color: #111;
        }

        .page-subtitle {
          font-size: 13px;
          color: #888;
          margin-top: 2px;
        }

        .btn {
          padding: 8px 16px;
          border-radius: 7px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          border: none;
          transition: all 0.15s;
        }

        .btn-primary {
          background: #111;
          color: #fff;
        }

        .btn-primary:hover { background: #000; }

        .btn-ghost {
          background: transparent;
          border: 1px solid #ddd;
          color: #333;
        }

        .btn-ghost:hover { background: #f5f5f5; }

        .btn-danger {
          background: #fef2f2;
          color: #dc2626;
          border: 1px solid #fecaca;
        }

        .btn-danger:hover { background: #fee2e2; }

        .card {
          background: #fff;
          border: 1px solid #eaeaea;
          border-radius: 10px;
          overflow: hidden;
        }

        table {
          width: 100%;
          border-collapse: collapse;
        }

        th {
          text-align: left;
          padding: 10px 16px;
          font-size: 11px;
          font-weight: 500;
          color: #888;
          text-transform: uppercase;
          background: #fafafa;
          border-bottom: 1px solid #eaeaea;
          letter-spacing: 0.5px;
        }

        td {
          padding: 14px 16px;
          border-bottom: 1px solid #f0f0f0;
          vertical-align: middle;
          font-size: 14px;
        }

        tbody tr:last-child td {
          border-bottom: none;
        }

        tbody tr:hover { background: #fafafa; }

        .svc-name {
          font-weight: 500;
          color: #111;
        }

        .svc-desc {
          font-size: 12px;
          color: #888;
          margin-top: 2px;
        }

        .svc-code {
          font-family: monospace;
          font-size: 12px;
          color: #666;
          background: #f5f5f5;
          padding: 2px 6px;
          border-radius: 4px;
        }

        .price {
          font-weight: 600;
          font-size: 15px;
          color: #111;
        }

        .duration {
          color: #666;
          font-size: 13px;
        }

        .badge-active {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 500;
          background: #dcfce7;
          color: #166534;
          cursor: pointer;
        }

        .badge-inactive {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 500;
          background: #f1f5f9;
          color: #64748b;
          cursor: pointer;
        }

        .actions {
          display: flex;
          gap: 4px;
        }

        .action-btn {
          width: 30px;
          height: 30px;
          border: 1px solid #e5e5e5;
          background: #fff;
          border-radius: 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
        }

        .action-btn:hover { background: #f5f5f5; }

        .action-btn.delete:hover {
          background: #fef2f2;
          border-color: #fecaca;
        }

        .empty-state {
          text-align: center;
          padding: 60px 20px;
          color: #888;
        }

        .empty-icon {
          font-size: 40px;
          margin-bottom: 12px;
        }

        .empty-title {
          font-size: 15px;
          font-weight: 500;
          color: #555;
          margin-bottom: 6px;
        }

        /* Modal */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }

        .modal {
          background: #fff;
          border-radius: 12px;
          width: 100%;
          max-width: 460px;
          display: flex;
          flex-direction: column;
          max-height: 90vh;
          overflow: hidden;
        }

        .modal-header {
          padding: 18px 20px;
          border-bottom: 1px solid #eaeaea;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .modal-title {
          font-size: 15px;
          font-weight: 600;
        }

        .modal-close {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 18px;
          color: #888;
          line-height: 1;
        }

        .modal-close:hover { color: #111; }

        .modal-body {
          padding: 20px;
          overflow-y: auto;
        }

        .modal-footer {
          padding: 14px 20px;
          border-top: 1px solid #eaeaea;
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          background: #fafafa;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .form-field {
          margin-bottom: 14px;
        }

        .form-field label {
          display: block;
          font-size: 13px;
          font-weight: 500;
          color: #333;
          margin-bottom: 5px;
        }

        .form-field input,
        .form-field textarea {
          width: 100%;
          padding: 9px 11px;
          border: 1px solid #ddd;
          border-radius: 7px;
          font-size: 14px;
          box-sizing: border-box;
          font-family: inherit;
          transition: border-color 0.15s;
        }

        .form-field input:focus,
        .form-field textarea:focus {
          outline: none;
          border-color: #111;
        }

        .form-field textarea {
          min-height: 72px;
          resize: vertical;
        }

        .form-error {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #dc2626;
          padding: 10px 14px;
          border-radius: 7px;
          font-size: 13px;
          margin-bottom: 14px;
        }
      `}</style>

      <div className="page-header">
        <div>
          <h1 className="page-title">Cenník služieb</h1>
          <p className="page-subtitle">Správa servisných služieb a cien</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Pridať službu</button>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Poradie</th>
              <th>Služba</th>
              <th>Kód</th>
              <th>Cena</th>
              <th>Trvanie</th>
              <th>Stav</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7" className="empty-state">Načítavam...</td></tr>
            ) : services.length === 0 ? (
              <tr>
                <td colSpan="7">
                  <div className="empty-state">
                    <div className="empty-icon">🔧</div>
                    <div className="empty-title">Zatiaľ žiadne služby</div>
                    <p>Klikni na "Pridať službu" pre vytvorenie prvej položky cenníka.</p>
                  </div>
                </td>
              </tr>
            ) : (
              services.map(svc => (
                <tr key={svc.id}>
                  <td style={{ color: '#aaa', fontSize: '13px' }}>{svc.sort_order}</td>
                  <td>
                    <div className="svc-name">{svc.name}</div>
                    {svc.description && <div className="svc-desc">{svc.description}</div>}
                  </td>
                  <td><span className="svc-code">{svc.code}</span></td>
                  <td><span className="price">{svc.price} €</span></td>
                  <td><span className="duration">{svc.duration_minutes} min</span></td>
                  <td>
                    <span
                      className={svc.is_active ? 'badge-active' : 'badge-inactive'}
                      onClick={() => toggleActive(svc)}
                      title="Klikni pre zmenu stavu"
                    >
                      {svc.is_active ? 'Aktívna' : 'Neaktívna'}
                    </span>
                  </td>
                  <td>
                    <div className="actions">
                      <button className="action-btn" onClick={() => openEdit(svc)} title="Upraviť">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button className="action-btn delete" onClick={() => deleteService(svc.id, svc.name)} title="Vymazať">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {modal && (
        <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) closeModal() }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{modal === 'add' ? 'Pridať službu' : 'Upraviť službu'}</span>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="form-error">{error}</div>}
              <div className="form-row">
                <div className="form-field">
                  <label>Názov *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm({...form, name: e.target.value})}
                    placeholder="Základný servis"
                  />
                </div>
                <div className="form-field">
                  <label>Kód *</label>
                  <input
                    type="text"
                    value={form.code}
                    onChange={e => setForm({...form, code: e.target.value.toLowerCase().replace(/\s+/g, '-')})}
                    placeholder="zakladny-servis"
                  />
                </div>
              </div>
              <div className="form-field">
                <label>Popis</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm({...form, description: e.target.value})}
                  placeholder="Krátky popis služby..."
                />
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>Cena (€) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price}
                    onChange={e => setForm({...form, price: e.target.value})}
                    placeholder="29"
                  />
                </div>
                <div className="form-field">
                  <label>Trvanie (min)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.duration_minutes}
                    onChange={e => setForm({...form, duration_minutes: e.target.value})}
                    placeholder="60"
                  />
                </div>
              </div>
              <div className="form-field">
                <label>Poradie zoradenia</label>
                <input
                  type="number"
                  min="0"
                  value={form.sort_order}
                  onChange={e => setForm({...form, sort_order: e.target.value})}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={closeModal} disabled={saving}>Zrušiť</button>
              <button className="btn btn-primary" onClick={saveService} disabled={saving}>
                {saving ? 'Ukladám...' : 'Uložiť'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}