import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import axios from 'axios'

const API_URL = 'https://replai-backend.onrender.com'

const emptyForm = {
  code: '',
  name: '',
  description: '',
  price: '',
  price_type: 'fixed',
  duration_minutes: 60,
  sort_order: 0
}

const DAY_NAMES = ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne']
const MONTH_NAMES = ['Január', 'Február', 'Marec', 'Apríl', 'Máj', 'Jún', 'Júl', 'August', 'September', 'Október', 'November', 'December']

export default function Services() {
  const { token } = useAuth()
  const [activeTab, setActiveTab] = useState('services') // 'services' | 'calendar'

  // ============ SERVICES STATE ============
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // ============ CALENDAR STATE ============
  const [locations, setLocations] = useState([])
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [blockedSlots, setBlockedSlots] = useState([])
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [reasonModal, setReasonModal] = useState(null) // { date, existing }
  const [reasonText, setReasonText] = useState('')

  // ============ LOAD DATA ============
  useEffect(() => {
    loadServices()
    loadLocations()
  }, [])

  useEffect(() => {
    if (selectedLocation) {
      loadBlockedSlots()
    }
  }, [selectedLocation, currentMonth])

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

  const loadLocations = async () => {
    try {
      const res = await axios.get(`${API_URL}/bookings/locations`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const locs = res.data || []
      setLocations(locs)
      if (locs.length > 0) setSelectedLocation(locs[0].id)
    } catch (err) {
      console.error('Error loading locations:', err)
    }
  }

  const loadBlockedSlots = async () => {
    if (!selectedLocation) return
    setCalendarLoading(true)
    try {
      const res = await axios.get(`${API_URL}/bookings/locations/${selectedLocation}/blocked`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setBlockedSlots(res.data || [])
    } catch (err) {
      console.error('Error loading blocked slots:', err)
    }
    setCalendarLoading(false)
  }

  // ============ SERVICES HANDLERS ============
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
      price_type: svc.price_type || 'fixed',
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
          price_type: form.price_type || 'fixed',
          duration_minutes: parseInt(form.duration_minutes),
          sort_order: parseInt(form.sort_order)
        }, { headers: { Authorization: `Bearer ${token}` } })
      } else {
        await axios.put(`${API_URL}/bookings/services/${editId}`, {
          ...form,
          price: parseFloat(form.price),
          price_type: form.price_type || 'fixed',
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

  // ============ CALENDAR HANDLERS ============
  const getCalendarDays = () => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    
    // Pondelok = 0, Nedeľa = 6
    let startDay = firstDay.getDay() - 1
    if (startDay < 0) startDay = 6
    
    const days = []
    
    // Prázdne dni pred prvým
    for (let i = 0; i < startDay; i++) {
      days.push(null)
    }
    
    // Dni mesiaca
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const blocked = blockedSlots.find(b => {
        const bDate = new Date(b.blocked_date).toISOString().split('T')[0]
        return bDate === dateStr
      })
      const today = new Date().toISOString().split('T')[0]
      const isPast = dateStr < today
      
      days.push({
        day: d,
        date: dateStr,
        blocked: blocked || null,
        isPast
      })
    }
    
    return days
  }

  const handleDayClick = (dayInfo) => {
    if (!dayInfo || dayInfo.isPast) return
    
    if (dayInfo.blocked) {
      // Odblokovať
      if (window.confirm(`Odblokovať ${dayInfo.day}. ${MONTH_NAMES[currentMonth.getMonth()]}?\n\nDôvod blokovania: ${dayInfo.blocked.reason || '(bez dôvodu)'}`)) {
        unblockDay(dayInfo.blocked.id)
      }
    } else {
      // Otvoriť modal na zadanie dôvodu
      setReasonText('')
      setReasonModal({ date: dayInfo.date, day: dayInfo.day })
    }
  }

  const blockDay = async () => {
    if (!reasonModal) return
    try {
      await axios.post(`${API_URL}/bookings/locations/${selectedLocation}/blocked`, {
        blocked_date: reasonModal.date,
        reason: reasonText.trim() || null
      }, { headers: { Authorization: `Bearer ${token}` } })
      setReasonModal(null)
      loadBlockedSlots()
    } catch (err) {
      alert(err.response?.data?.error || 'Nepodarilo sa zablokovať deň')
    }
  }

  const unblockDay = async (slotId) => {
    try {
      await axios.delete(`${API_URL}/bookings/locations/${selectedLocation}/blocked/${slotId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      loadBlockedSlots()
    } catch (err) {
      alert('Nepodarilo sa odblokovať deň')
    }
  }

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
  }

  const calendarDays = activeTab === 'calendar' ? getCalendarDays() : []

  // ============ RENDER ============
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
          margin-bottom: 0;
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

        /* Tabs */
        .tabs {
          display: flex;
          gap: 0;
          margin: 20px 0 24px;
          border-bottom: 1px solid #eaeaea;
        }

        .tab {
          padding: 10px 20px;
          font-size: 14px;
          font-weight: 500;
          color: #888;
          cursor: pointer;
          border: none;
          background: none;
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
          transition: all 0.15s;
        }

        .tab:hover {
          color: #555;
        }

        .tab.active {
          color: #111;
          border-bottom-color: #111;
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
        .form-field textarea,
        .form-field select {
          width: 100%;
          padding: 9px 11px;
          border: 1px solid #ddd;
          border-radius: 7px;
          font-size: 14px;
          box-sizing: border-box;
          font-family: inherit;
          transition: border-color 0.15s;
          background: #fff;
        }

        .form-field input:focus,
        .form-field textarea:focus,
        .form-field select:focus {
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

        /* ============ CALENDAR STYLES ============ */
        .calendar-controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
          flex-wrap: wrap;
          gap: 12px;
        }

        .location-select {
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 7px;
          font-size: 14px;
          background: #fff;
          font-family: inherit;
          cursor: pointer;
          min-width: 200px;
        }

        .location-select:focus {
          outline: none;
          border-color: #111;
        }

        .month-nav {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .month-label {
          font-size: 16px;
          font-weight: 600;
          color: #111;
          min-width: 160px;
          text-align: center;
        }

        .month-btn {
          width: 34px;
          height: 34px;
          border: 1px solid #ddd;
          background: #fff;
          border-radius: 7px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          color: #555;
          transition: all 0.15s;
        }

        .month-btn:hover {
          background: #f5f5f5;
          border-color: #bbb;
        }

        .calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 4px;
        }

        .calendar-header-cell {
          text-align: center;
          padding: 8px 0;
          font-size: 12px;
          font-weight: 600;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .calendar-day {
          aspect-ratio: 1;
          border: 1px solid #eaeaea;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s;
          position: relative;
          min-height: 56px;
        }

        .calendar-day:hover {
          border-color: #bbb;
          background: #fafafa;
        }

        .calendar-day.empty {
          border: none;
          cursor: default;
        }

        .calendar-day.empty:hover {
          background: none;
        }

        .calendar-day.past {
          opacity: 0.35;
          cursor: not-allowed;
        }

        .calendar-day.past:hover {
          background: none;
          border-color: #eaeaea;
        }

        .calendar-day.blocked {
          background: #fef2f2;
          border-color: #fecaca;
        }

        .calendar-day.blocked:hover {
          background: #fee2e2;
        }

        .calendar-day.today {
          border-color: #111;
          border-width: 2px;
        }

        .day-number {
          font-size: 15px;
          font-weight: 500;
          color: #111;
        }

        .calendar-day.blocked .day-number {
          color: #dc2626;
        }

        .calendar-day.past .day-number {
          color: #aaa;
        }

        .day-reason {
          font-size: 9px;
          color: #dc2626;
          margin-top: 2px;
          max-width: 90%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          text-align: center;
        }

        .blocked-icon {
          position: absolute;
          top: 4px;
          right: 4px;
          font-size: 10px;
        }

        .calendar-legend {
          display: flex;
          gap: 20px;
          margin-top: 16px;
          padding: 12px 16px;
          background: #fafafa;
          border-radius: 8px;
          font-size: 13px;
          color: #666;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .legend-dot {
          width: 12px;
          height: 12px;
          border-radius: 3px;
          border: 1px solid;
        }

        .legend-dot.available {
          background: #fff;
          border-color: #ddd;
        }

        .legend-dot.blocked {
          background: #fef2f2;
          border-color: #fecaca;
        }

        .legend-dot.today {
          background: #fff;
          border-color: #111;
          border-width: 2px;
        }

        .blocked-list {
          margin-top: 20px;
        }

        .blocked-list-title {
          font-size: 14px;
          font-weight: 600;
          color: #111;
          margin-bottom: 10px;
        }

        .blocked-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          border: 1px solid #f0f0f0;
          border-radius: 7px;
          margin-bottom: 6px;
          font-size: 13px;
        }

        .blocked-item-date {
          font-weight: 500;
          color: #111;
        }

        .blocked-item-reason {
          color: #888;
          margin-left: 8px;
        }

        .blocked-item-remove {
          background: none;
          border: none;
          color: #dc2626;
          cursor: pointer;
          font-size: 12px;
          padding: 4px 8px;
          border-radius: 4px;
        }

        .blocked-item-remove:hover {
          background: #fef2f2;
        }

        /* Small modal for reason */
        .reason-modal {
          max-width: 360px;
        }
      `}</style>

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Cenník a kalendár</h1>
          <p className="page-subtitle">Správa servisných služieb, cien a dostupnosti</p>
        </div>
        {activeTab === 'services' && (
          <button className="btn btn-primary" onClick={openAdd}>+ Pridať službu</button>
        )}
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'services' ? 'active' : ''}`}
          onClick={() => setActiveTab('services')}
        >
          Cenník
        </button>
        <button
          className={`tab ${activeTab === 'calendar' ? 'active' : ''}`}
          onClick={() => setActiveTab('calendar')}
        >
          Kalendár
        </button>
      </div>

      {/* ============ SERVICES TAB ============ */}
      {activeTab === 'services' && (
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
                    <td><span className="price">{svc.price} €{svc.price_type === 'hourly' ? '/hod' : ''}</span></td>
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
      )}

      {/* ============ CALENDAR TAB ============ */}
      {activeTab === 'calendar' && (
        <div>
          {/* Controls */}
          <div className="calendar-controls">
            <select
              className="location-select"
              value={selectedLocation || ''}
              onChange={e => setSelectedLocation(e.target.value)}
            >
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>

            <div className="month-nav">
              <button className="month-btn" onClick={prevMonth}>‹</button>
              <span className="month-label">
                {MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}
              </span>
              <button className="month-btn" onClick={nextMonth}>›</button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="card" style={{ padding: '16px' }}>
            {calendarLoading ? (
              <div className="empty-state">Načítavam...</div>
            ) : (
              <>
                <div className="calendar-grid">
                  {/* Header */}
                  {DAY_NAMES.map(d => (
                    <div key={d} className="calendar-header-cell">{d}</div>
                  ))}

                  {/* Days */}
                  {calendarDays.map((day, i) => {
                    if (!day) {
                      return <div key={`empty-${i}`} className="calendar-day empty" />
                    }

                    const today = new Date().toISOString().split('T')[0]
                    const isToday = day.date === today
                    const classes = [
                      'calendar-day',
                      day.blocked ? 'blocked' : '',
                      day.isPast ? 'past' : '',
                      isToday ? 'today' : ''
                    ].filter(Boolean).join(' ')

                    return (
                      <div
                        key={day.date}
                        className={classes}
                        onClick={() => handleDayClick(day)}
                        title={day.blocked ? `Blokovaný: ${day.blocked.reason || 'bez dôvodu'}\nKlikni pre odblokovanie` : 'Klikni pre zablokovanie'}
                      >
                        {day.blocked && <span className="blocked-icon">🔒</span>}
                        <span className="day-number">{day.day}</span>
                        {day.blocked?.reason && (
                          <span className="day-reason">{day.blocked.reason}</span>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Legend */}
                <div className="calendar-legend">
                  <div className="legend-item">
                    <div className="legend-dot available" />
                    <span>Dostupný</span>
                  </div>
                  <div className="legend-item">
                    <div className="legend-dot blocked" />
                    <span>Blokovaný</span>
                  </div>
                  <div className="legend-item">
                    <div className="legend-dot today" />
                    <span>Dnes</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Blocked days list */}
          {blockedSlots.length > 0 && (
            <div className="blocked-list">
              <div className="blocked-list-title">Blokované dni ({blockedSlots.length})</div>
              {blockedSlots
                .sort((a, b) => new Date(a.blocked_date) - new Date(b.blocked_date))
                .map(slot => {
                  const d = new Date(slot.blocked_date)
                  const dateStr = `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`
                  return (
                    <div key={slot.id} className="blocked-item">
                      <div>
                        <span className="blocked-item-date">{dateStr}</span>
                        {slot.reason && <span className="blocked-item-reason">— {slot.reason}</span>}
                      </div>
                      <button
                        className="blocked-item-remove"
                        onClick={() => unblockDay(slot.id)}
                      >
                        Odblokovať
                      </button>
                    </div>
                  )
                })
              }
            </div>
          )}
        </div>
      )}

      {/* ============ SERVICE MODAL ============ */}
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
                  <label>Typ ceny</label>
                  <select
                    value={form.price_type || 'fixed'}
                    onChange={e => setForm({...form, price_type: e.target.value})}
                  >
                    <option value="fixed">Fixná</option>
                    <option value="hourly">Za hodinu</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
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

      {/* ============ REASON MODAL (block day) ============ */}
      {reasonModal && (
        <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setReasonModal(null) }}>
          <div className="modal reason-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Zablokovať {reasonModal.day}. {MONTH_NAMES[currentMonth.getMonth()]}</span>
              <button className="modal-close" onClick={() => setReasonModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-field">
                <label>Dôvod (voliteľné)</label>
                <input
                  type="text"
                  value={reasonText}
                  onChange={e => setReasonText(e.target.value)}
                  placeholder="napr. Štátny sviatok, Dovolenka..."
                  onKeyDown={e => { if (e.key === 'Enter') blockDay() }}
                  autoFocus
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setReasonModal(null)}>Zrušiť</button>
              <button className="btn btn-danger" onClick={blockDay}>Zablokovať</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}