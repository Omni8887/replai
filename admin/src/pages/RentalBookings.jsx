import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import axios from 'axios'

const API_URL = 'https://replai-backend.onrender.com'

const statusLabels = {
  pending: 'Čakajúce',
  confirmed: 'Potvrdené',
  picked_up: 'Vyzdvihnuté',
  returned: 'Vrátené',
  cancelled: 'Zrušené'
}

const emailTemplates = {
  confirmed: {
    subject: 'Potvrdenie rezervácie bicykla - {{booking_number}}',
    body: `Dobrý deň {{customer_name}},\n\nvaša rezervácia testovacieho bicykla bola potvrdená.\n\nBicykel: {{bike_name}}\nVeľkosť: {{size}}\nVyzdvihnutie: {{pickup_date}}\nVrátenie: {{return_date}}\nPrevádzka: {{location}}\n\nPri vyzdvihnutí je potrebné uhradiť kauciu 500€ v hotovosti.\n\nS pozdravom`
  },
  reminder: {
    subject: 'Pripomienka vyzdvihnutia - {{booking_number}}',
    body: `Dobrý deň {{customer_name}},\n\npripomíname vám, že zajtra si môžete vyzdvihnúť rezervovaný bicykel.\n\nBicykel: {{bike_name}}\nPrevádzka: {{location}}\n\nNezabudnite na kauciu 500€ v hotovosti.\n\nS pozdravom`
  },
  return_reminder: {
    subject: 'Pripomienka vrátenia - {{booking_number}}',
    body: `Dobrý deň {{customer_name}},\n\npripomíname vám, že dnes je termín vrátenia bicykla.\n\nBicykel: {{bike_name}}\nPrevádzka: {{location}}\n\nPo kontrole bicykla vám vrátime kauciu.\n\nS pozdravom`
  },
  custom: {
    subject: 'Informácia k rezervácii - {{booking_number}}',
    body: `Dobrý deň {{customer_name}},\n\n\n\nS pozdravom`
  }
}

export default function RentalBookings() {
  const { token } = useAuth()
  const [bookings, setBookings] = useState([])
  const [stats, setStats] = useState({ total: 0, pending: 0, confirmed: 0, picked_up: 0, returned: 0, cancelled: 0 })
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ status: '', search: '' })
  
  const [detailModal, setDetailModal] = useState(null)
  const [editModal, setEditModal] = useState(null)
  const [editForm, setEditForm] = useState({ status: '', admin_notes: '' })
  const [contactTemplate, setContactTemplate] = useState('confirmed')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      await Promise.all([loadBookings(), loadStats()])
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  const loadBookings = async (f = filters) => {
    const params = new URLSearchParams()
    if (f.status) params.append('status', f.status)
    if (f.search) params.append('search', f.search)
    
    const res = await axios.get(`${API_URL}/rental/bookings?${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    setBookings(res.data.bookings || [])
  }

  const loadStats = async () => {
    // Vypočítame stats z bookings
    const res = await axios.get(`${API_URL}/rental/bookings`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    const all = res.data.bookings || []
    setStats({
      total: all.length,
      pending: all.filter(b => b.status === 'pending').length,
      confirmed: all.filter(b => b.status === 'confirmed').length,
      picked_up: all.filter(b => b.status === 'picked_up').length,
      returned: all.filter(b => b.status === 'returned').length,
      cancelled: all.filter(b => b.status === 'cancelled').length
    })
  }

  const applyFilters = () => {
    loadBookings(filters)
  }

  const openDetail = (booking) => {
    setDetailModal(booking)
    setContactTemplate('confirmed')
  }

  const openEdit = (booking) => {
    setEditForm({
      status: booking.status,
      admin_notes: booking.admin_notes || ''
    })
    setEditModal(booking)
  }

  const saveBooking = async () => {
    try {
      await axios.put(`${API_URL}/rental/bookings/${editModal.id}`, editForm, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setEditModal(null)
      loadData()
    } catch (err) {
      console.error(err)
    }
  }

  const fillTemplate = (template, booking) => {
    const pickupDate = new Date(booking.pickup_date).toLocaleDateString('sk-SK')
    const returnDate = new Date(booking.return_date).toLocaleDateString('sk-SK')
    
    return template
      .replace(/{{booking_number}}/g, booking.booking_number)
      .replace(/{{customer_name}}/g, booking.customer_name)
      .replace(/{{bike_name}}/g, booking.bike_name || '')
      .replace(/{{size}}/g, booking.selected_size || '')
      .replace(/{{pickup_date}}/g, pickupDate)
      .replace(/{{return_date}}/g, returnDate)
      .replace(/{{location}}/g, booking.location_name || '')
      .replace(/{{total_price}}/g, booking.total_price || '')
  }

  const contactCustomer = () => {
    if (!detailModal) return
    const template = emailTemplates[contactTemplate]
    const subject = encodeURIComponent(fillTemplate(template.subject, detailModal))
    const body = encodeURIComponent(fillTemplate(template.body, detailModal))
    window.open(`mailto:${detailModal.customer_email}?subject=${subject}&body=${body}`, '_blank')
  }

  const callCustomer = () => {
    if (!detailModal) return
    window.open(`tel:${detailModal.customer_phone}`, '_blank')
  }

  const formatDate = (str) => new Date(str).toLocaleDateString('sk-SK')
  
  const formatDateTime = (str) => {
    const d = new Date(str)
    return d.toLocaleDateString('sk-SK') + ' ' + d.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' })
  }

  const calculateDays = (pickup, ret) => {
    const p = new Date(pickup)
    const r = new Date(ret)
    return Math.ceil((r - p) / (1000 * 60 * 60 * 24)) + 1
  }

  return (
    <div className="bookings-page">
      <style>{`
        .bookings-page {
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
        
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 12px;
          margin-bottom: 24px;
        }
        
        .stat-card {
          background: #fff;
          border: 1px solid #eaeaea;
          border-radius: 8px;
          padding: 16px;
        }
        
        .stat-value {
          font-size: 24px;
          font-weight: 600;
          color: #111;
        }
        
        .stat-label {
          font-size: 12px;
          color: #888;
        }
        
        .stat-card.pending .stat-value { color: #b45309; }
        .stat-card.confirmed .stat-value { color: #1d4ed8; }
        .stat-card.picked_up .stat-value { color: #7c3aed; }
        .stat-card.returned .stat-value { color: #15803d; }
        .stat-card.cancelled .stat-value { color: #b91c1c; }
        
        .card {
          background: #fff;
          border: 1px solid #eaeaea;
          border-radius: 8px;
          overflow: hidden;
        }
        
        .card-header {
          padding: 14px 18px;
          border-bottom: 1px solid #eaeaea;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        
        .card-title {
          font-size: 14px;
          font-weight: 600;
        }
        
        .filters {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        
        .filter-input,
        .filter-select {
          padding: 7px 10px;
          border: 1px solid #ddd;
          border-radius: 5px;
          font-size: 13px;
        }
        
        .filter-input:focus,
        .filter-select:focus {
          outline: none;
          border-color: #111;
        }
        
        .btn {
          padding: 8px 14px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          border: 1px solid transparent;
        }
        
        .btn-primary {
          background: #111;
          color: #fff;
          border: none;
        }
        
        .btn-primary:hover {
          background: #000;
        }
        
        .btn-ghost {
          background: transparent;
          border: 1px solid #ddd;
          color: #333;
        }
        
        .btn-ghost:hover {
          background: #f5f5f5;
        }
        
        table {
          width: 100%;
          border-collapse: collapse;
        }
        
        th {
          text-align: left;
          padding: 10px 14px;
          font-size: 11px;
          font-weight: 500;
          color: #888;
          text-transform: uppercase;
          background: #fafafa;
          border-bottom: 1px solid #eaeaea;
        }
        
        td {
          padding: 12px 14px;
          border-bottom: 1px solid #f0f0f0;
          vertical-align: middle;
        }
        
        tbody tr:hover {
          background: #fafafa;
        }
        
        .cell-booking {
          font-family: monospace;
          font-size: 12px;
          font-weight: 500;
        }
        
        .cell-customer {
          font-weight: 500;
        }
        
        .cell-meta {
          font-size: 12px;
          color: #888;
        }
        
        .cell-bike {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        
        .cell-bike-img {
          width: 48px;
          height: 36px;
          object-fit: contain;
          background: #f8f8f8;
          border-radius: 4px;
        }
        
        .badge {
          display: inline-block;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 500;
        }
        
        .badge-pending { background: #fef3c7; color: #92400e; }
        .badge-confirmed { background: #dbeafe; color: #1e40af; }
        .badge-picked_up { background: #ede9fe; color: #5b21b6; }
        .badge-returned { background: #dcfce7; color: #166534; }
        .badge-cancelled { background: #fee2e2; color: #991b1b; }
        
        .actions {
          display: flex;
          gap: 4px;
        }
        
        .action-btn {
          width: 28px;
          height: 28px;
          border: 1px solid #e5e5e5;
          background: #fff;
          border-radius: 5px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .action-btn:hover {
          background: #f5f5f5;
        }
        
        .empty-state {
          text-align: center;
          padding: 48px 20px;
          color: #888;
        }
        
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
          border-radius: 10px;
          width: 100%;
          max-width: 480px;
          max-height: 90vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        
        .modal-header {
          padding: 16px 20px;
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
          padding: 4px;
        }
        
        .modal-body {
          padding: 20px;
          overflow-y: auto;
        }
        
        .modal-footer {
          padding: 14px 20px;
          border-top: 1px solid #eaeaea;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          background: #fafafa;
        }
        
        .contact-actions {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        
        .detail-item {
          display: flex;
          justify-content: space-between;
          padding: 10px 0;
          border-bottom: 1px solid #f0f0f0;
        }
        
        .detail-item:last-child {
          border-bottom: none;
        }
        
        .detail-label {
          color: #888;
          font-size: 13px;
        }
        
        .detail-value {
          font-weight: 500;
          text-align: right;
        }
        
        .detail-bike-img {
          width: 100%;
          max-width: 200px;
          height: auto;
          object-fit: contain;
          background: #f8f8f8;
          border-radius: 8px;
          margin: 0 auto 16px;
          display: block;
        }
        
        .deposit-warning {
          background: #fff8e6;
          border: 1px solid #ffd666;
          border-radius: 6px;
          padding: 10px 12px;
          font-size: 12px;
          color: #8a6d00;
          margin-top: 16px;
        }
        
        .form-field {
          margin-bottom: 14px;
        }
        
        .form-field label {
          display: block;
          font-size: 13px;
          font-weight: 500;
          margin-bottom: 5px;
        }
        
        .form-field select,
        .form-field input,
        .form-field textarea {
          width: 100%;
          padding: 9px 11px;
          border: 1px solid #ddd;
          border-radius: 5px;
          font-size: 14px;
        }
        
        .form-field textarea {
          min-height: 72px;
          resize: vertical;
        }
        
        @media (max-width: 1024px) {
          .stats-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
        
        @media (max-width: 768px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          
          .filters {
            width: 100%;
          }
        }
      `}</style>

      <div className="page-header">
        <h1 className="page-title">Požičovňa bicyklov</h1>
        <button className="btn btn-ghost" onClick={loadData}>Obnoviť</button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Celkom</div>
        </div>
        <div className="stat-card pending">
          <div className="stat-value">{stats.pending}</div>
          <div className="stat-label">Čakajúce</div>
        </div>
        <div className="stat-card confirmed">
          <div className="stat-value">{stats.confirmed}</div>
          <div className="stat-label">Potvrdené</div>
        </div>
        <div className="stat-card picked_up">
          <div className="stat-value">{stats.picked_up}</div>
          <div className="stat-label">Vyzdvihnuté</div>
        </div>
        <div className="stat-card returned">
          <div className="stat-value">{stats.returned}</div>
          <div className="stat-label">Vrátené</div>
        </div>
        <div className="stat-card cancelled">
          <div className="stat-value">{stats.cancelled}</div>
          <div className="stat-label">Zrušené</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Zoznam rezervácií</span>
          <div className="filters">
            <select
              className="filter-select"
              value={filters.status}
              onChange={e => setFilters({...filters, status: e.target.value})}
            >
              <option value="">Všetky stavy</option>
              <option value="pending">Čakajúce</option>
              <option value="confirmed">Potvrdené</option>
              <option value="picked_up">Vyzdvihnuté</option>
              <option value="returned">Vrátené</option>
              <option value="cancelled">Zrušené</option>
            </select>
            <input
              type="text"
              className="filter-input"
              placeholder="Hľadať..."
              value={filters.search}
              onChange={e => setFilters({...filters, search: e.target.value})}
              onKeyDown={e => e.key === 'Enter' && applyFilters()}
            />
            <button className="btn btn-primary" onClick={applyFilters}>Filtrovať</button>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Číslo</th>
              <th>Vytvorené</th>
              <th>Zákazník</th>
              <th>Bicykel</th>
              <th>Termín</th>
              <th>Cena</th>
              <th>Stav</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" className="empty-state">Načítavam...</td></tr>
            ) : bookings.length === 0 ? (
              <tr><td colSpan="8" className="empty-state">Žiadne rezervácie</td></tr>
            ) : (
              bookings.map(b => (
                <tr key={b.id}>
                  <td><span className="cell-booking">{b.booking_number}</span></td>
                  <td>
                    <div>{formatDate(b.created_at)}</div>
                    <div className="cell-meta">{new Date(b.created_at).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' })}</div>
                  </td>
                  <td>
                    <div className="cell-customer">{b.customer_name}</div>
                    <div className="cell-meta">{b.customer_phone}</div>
                  </td>
                  <td>
                    <div className="cell-bike">
                      {b.bike_image && <img className="cell-bike-img" src={b.bike_image} alt="" />}
                      <div>
                        <div style={{fontSize: '13px'}}>{b.bike_name}</div>
                        <div className="cell-meta">Veľkosť: {b.selected_size}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div>{formatDate(b.pickup_date)}</div>
                    <div className="cell-meta">→ {formatDate(b.return_date)}</div>
                  </td>
                  <td>
                    <div style={{fontWeight: 600}}>{b.total_price}€</div>
                    <div className="cell-meta">{calculateDays(b.pickup_date, b.return_date)} dní</div>
                  </td>
                  <td><span className={`badge badge-${b.status}`}>{statusLabels[b.status]}</span></td>
                  <td>
                    <div className="actions">
                      <button className="action-btn" onClick={() => openDetail(b)} title="Detail">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      </button>
                      <button className="action-btn" onClick={() => openEdit(b)} title="Upraviť">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
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

      {/* Detail Modal */}
      {detailModal && (
        <div className="modal-overlay" onClick={() => setDetailModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Detail rezervácie</span>
              <button className="modal-close" onClick={() => setDetailModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              {detailModal.bike_image && (
                <img className="detail-bike-img" src={detailModal.bike_image} alt={detailModal.bike_name} />
              )}
              <div className="detail-item"><span className="detail-label">Číslo</span><span className="detail-value">{detailModal.booking_number}</span></div>
              <div className="detail-item"><span className="detail-label">Vytvorené</span><span className="detail-value">{formatDateTime(detailModal.created_at)}</span></div>
              <div className="detail-item"><span className="detail-label">Zákazník</span><span className="detail-value">{detailModal.customer_name}</span></div>
              <div className="detail-item"><span className="detail-label">Email</span><span className="detail-value">{detailModal.customer_email}</span></div>
              <div className="detail-item"><span className="detail-label">Telefón</span><span className="detail-value">{detailModal.customer_phone}</span></div>
              <div className="detail-item"><span className="detail-label">Bicykel</span><span className="detail-value">{detailModal.bike_name}</span></div>
              <div className="detail-item"><span className="detail-label">Veľkosť</span><span className="detail-value">{detailModal.selected_size}</span></div>
              <div className="detail-item"><span className="detail-label">Prevádzka</span><span className="detail-value">{detailModal.location_name}</span></div>
              <div className="detail-item"><span className="detail-label">Vyzdvihnutie</span><span className="detail-value">{formatDate(detailModal.pickup_date)}</span></div>
              <div className="detail-item"><span className="detail-label">Vrátenie</span><span className="detail-value">{formatDate(detailModal.return_date)}</span></div>
              <div className="detail-item"><span className="detail-label">Počet dní</span><span className="detail-value">{calculateDays(detailModal.pickup_date, detailModal.return_date)}</span></div>
              <div className="detail-item"><span className="detail-label">Cena</span><span className="detail-value" style={{fontSize: '16px'}}>{detailModal.total_price}€</span></div>
              <div className="detail-item"><span className="detail-label">Stav</span><span className="detail-value"><span className={`badge badge-${detailModal.status}`}>{statusLabels[detailModal.status]}</span></span></div>
              <div className="detail-item"><span className="detail-label">Poznámky</span><span className="detail-value">{detailModal.admin_notes || '–'}</span></div>
              <div className="deposit-warning">
                <strong>Kaucia: {detailModal.deposit}€</strong> – vratná po kontrole bicykla
              </div>
            </div>
            <div className="modal-footer">
              <div className="contact-actions">
                <select className="filter-select" value={contactTemplate} onChange={e => setContactTemplate(e.target.value)}>
                  <option value="confirmed">Potvrdenie rezervácie</option>
                  <option value="reminder">Pripomienka vyzdvihnutia</option>
                  <option value="return_reminder">Pripomienka vrátenia</option>
                  <option value="custom">Vlastná správa</option>
                </select>
                <button className="btn btn-primary" onClick={contactCustomer}>Poslať email</button>
                <button className="btn btn-ghost" onClick={callCustomer}>Zavolať</button>
              </div>
              <button className="btn btn-ghost" onClick={() => setDetailModal(null)}>Zavrieť</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModal && (
        <div className="modal-overlay" onClick={() => setEditModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Upraviť rezerváciu</span>
              <button className="modal-close" onClick={() => setEditModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-field">
                <label>Stav</label>
                <select value={editForm.status} onChange={e => setEditForm({...editForm, status: e.target.value})}>
                  <option value="pending">Čakajúce</option>
                  <option value="confirmed">Potvrdené</option>
                  <option value="picked_up">Vyzdvihnuté</option>
                  <option value="returned">Vrátené</option>
                  <option value="cancelled">Zrušené</option>
                </select>
              </div>
              <div className="form-field">
                <label>Poznámky</label>
                <textarea 
                  value={editForm.admin_notes} 
                  onChange={e => setEditForm({...editForm, admin_notes: e.target.value})}
                  placeholder="Interné poznámky..."
                />
              </div>
            </div>
            <div className="modal-footer">
              <div></div>
              <div style={{display: 'flex', gap: '8px'}}>
                <button className="btn btn-ghost" onClick={() => setEditModal(null)}>Zrušiť</button>
                <button className="btn btn-primary" onClick={saveBooking}>Uložiť</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}