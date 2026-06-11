import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext.jsx'

const API = import.meta.env.VITE_API_URL

const QUESTION_LABELS = {
  q1: 'Overenie totožnosti',
  q2: 'Zrozumiteľnosť komunikácie',
  q3: 'Ochota odpovedať na otázky',
  q4: 'Informácie o zdravotnom stave',
  q5: 'Informácie o liečbe',
  q6: 'Správanie lekára',
  q7: 'Správanie sestry',
  q8: 'Prijateľnosť čakania',
  q9: 'Vyhovujúce ordinačné hodiny'
}

function StatBar({ label, counts, total }) {
  const pAno = total > 0 ? Math.round((counts.ano / total) * 100) : 0
  const pNie = total > 0 ? Math.round((counts.nie / total) * 100) : 0
  const pNeviem = total > 0 ? Math.round((counts.neviem / total) * 100) : 0

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13, color: '#374151' }}>
        <span style={{ fontWeight: 500 }}>{label}</span>
        <span style={{ color: '#9ca3af', fontSize: 12 }}>{total} odpovedí</span>
      </div>
      <div style={{ display: 'flex', height: 24, borderRadius: 6, overflow: 'hidden', background: '#f3f4f6' }}>
        {pAno > 0 && (
          <div style={{ width: `${pAno}%`, background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 600, minWidth: pAno > 8 ? 'auto' : 0 }}>
            {pAno > 8 ? `${pAno}%` : ''}
          </div>
        )}
        {pNie > 0 && (
          <div style={{ width: `${pNie}%`, background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 600, minWidth: pNie > 8 ? 'auto' : 0 }}>
            {pNie > 8 ? `${pNie}%` : ''}
          </div>
        )}
        {pNeviem > 0 && (
          <div style={{ width: `${pNeviem}%`, background: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 600, minWidth: pNeviem > 8 ? 'auto' : 0 }}>
            {pNeviem > 8 ? `${pNeviem}%` : ''}
          </div>
        )}
      </div>
    </div>
  )
}

function AnswerBadge({ value }) {
  const styles = {
    ano: { background: '#dcfce7', color: '#166534', label: 'Áno' },
    nie: { background: '#fee2e2', color: '#991b1b', label: 'Nie' },
    neviem: { background: '#fef3c7', color: '#92400e', label: 'Neviem' }
  }
  const s = styles[value] || styles.neviem
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500, background: s.background, color: s.color }}>
      {s.label}
    </span>
  )
}

export default function Dotaznik() {
  const { token } = useAuth()
  const [responses, setResponses] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('stats') // 'stats' | 'list'
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const [resResponses, resStats] = await Promise.all([
        fetch(`${API}/admin/dotaznik`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/admin/dotaznik/stats`, { headers: { Authorization: `Bearer ${token}` } })
      ])
      const dataResponses = await resResponses.json()
      const dataStats = await resStats.json()
      setResponses(Array.isArray(dataResponses) ? dataResponses : [])
      setStats(dataStats)
    } catch (err) {
      console.error('Dotazník fetch error:', err)
    }
    setLoading(false)
  }

  async function handleDelete(id) {
    if (!confirm('Naozaj chcete vymazať tento dotazník?')) return
    try {
      await fetch(`${API}/admin/dotaznik/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      setResponses(prev => prev.filter(r => r.id !== id))
      // Refresh stats
      const resStats = await fetch(`${API}/admin/dotaznik/stats`, { headers: { Authorization: `Bearer ${token}` } })
      setStats(await resStats.json())
    } catch (err) {
      console.error('Delete error:', err)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
        Načítavam dotazníky...
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>
          📋 Dotazníky spokojnosti
        </h1>
        <p style={{ color: '#6b7280', fontSize: 14, margin: '4px 0 0' }}>
          Anonymné hodnotenia pacientov · {stats?.total || 0} vyplnených
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button
          onClick={() => setView('stats')}
          style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: view === 'stats' ? '#7c3aed' : '#f3f4f6',
            color: view === 'stats' ? '#fff' : '#374151'
          }}
        >
          Štatistiky
        </button>
        <button
          onClick={() => setView('list')}
          style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: view === 'list' ? '#7c3aed' : '#f3f4f6',
            color: view === 'list' ? '#fff' : '#374151'
          }}
        >
          Odpovede ({responses.length})
        </button>
      </div>

      {/* Stats view */}
      {view === 'stats' && (
        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          {!stats || stats.total === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
              <p style={{ fontSize: 15 }}>Zatiaľ žiadne vyplnené dotazníky</p>
            </div>
          ) : (
            <>
              {/* Legend */}
              <div style={{ display: 'flex', gap: 16, marginBottom: 20, fontSize: 12 }}>
                <span><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: '#22c55e', marginRight: 4, verticalAlign: 'middle' }} /> Áno</span>
                <span><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: '#ef4444', marginRight: 4, verticalAlign: 'middle' }} /> Nie</span>
                <span><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: '#f59e0b', marginRight: 4, verticalAlign: 'middle' }} /> Neviem</span>
              </div>

              {Object.entries(stats.questions).map(([key, q]) => (
                <StatBar key={key} label={q.label} counts={q.counts} total={stats.total} />
              ))}
            </>
          )}
        </div>
      )}

      {/* List view */}
      {view === 'list' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {responses.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 12, padding: 40, textAlign: 'center', color: '#9ca3af', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
              <p style={{ fontSize: 15 }}>Zatiaľ žiadne vyplnené dotazníky</p>
            </div>
          ) : (
            responses.map((r, idx) => {
              const isExpanded = expandedId === r.id
              const date = new Date(r.created_at)
              const dateStr = date.toLocaleDateString('sk-SK') + ' · ' + date.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' })

              // Quick summary: count ano/nie/neviem
              const answers = [r.q1, r.q2, r.q3, r.q4, r.q5, r.q6, r.q7, r.q8, r.q9]
              const anoCount = answers.filter(a => a === 'ano').length
              const nieCount = answers.filter(a => a === 'nie').length

              return (
                <div key={r.id} style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                  {/* Row header */}
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : r.id)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 13, color: '#9ca3af', fontVariantNumeric: 'tabular-nums', minWidth: 24 }}>#{responses.length - idx}</span>
                      <span style={{ fontSize: 13, color: '#374151' }}>{dateStr}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 600 }}>{anoCount}× áno</span>
                      {nieCount > 0 && <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 600 }}>{nieCount}× nie</span>}
                      <span style={{ fontSize: 16, color: '#9ca3af', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{ padding: '0 16px 16px', borderTop: '1px solid #f3f4f6' }}>
                      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginTop: 12 }}>
                        <tbody>
                          {Object.entries(QUESTION_LABELS).map(([key, label]) => (
                            <tr key={key} style={{ borderBottom: '1px solid #f9fafb' }}>
                              <td style={{ padding: '6px 0', color: '#6b7280', width: '60%' }}>{label}</td>
                              <td style={{ padding: '6px 0', textAlign: 'right' }}><AnswerBadge value={r[key]} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {r.q8_doba && (
                        <div style={{ marginTop: 12, padding: '8px 12px', background: '#f9fafb', borderRadius: 6, fontSize: 13, color: '#374151' }}>
                          <span style={{ color: '#9ca3af', fontSize: 11, display: 'block', marginBottom: 2 }}>Doba čakania</span>
                          {r.q8_doba}
                        </div>
                      )}

                      <div style={{ marginTop: 12, textAlign: 'right' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(r.id) }}
                          style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff', color: '#ef4444', fontSize: 12, cursor: 'pointer' }}
                        >
                          Vymazať
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}