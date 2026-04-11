import { useState } from 'react'
import { useNavigate, Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { Mail, Lock, ArrowRight, Eye, EyeOff } from 'lucide-react'

const ReplaiLogo = () => (
  <svg width="28" height="26" viewBox="0 0 32 30" fill="none">
    <defs>
      <linearGradient id="lgLogin" x1="0" y1="0" x2="32" y2="30" gradientUnits="userSpaceOnUse">
        <stop stopColor="#0BB878"/>
        <stop offset="1" stopColor="#6B5FED"/>
      </linearGradient>
    </defs>
    <path fill="url(#lgLogin)" d="M4 0h24a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4H16l-7 8v-8H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4z"/>
    <circle cx="10" cy="11" r="2.2" fill="white" fillOpacity="0.92"/>
    <circle cx="16" cy="11" r="2.2" fill="white" fillOpacity="0.92"/>
    <circle cx="22" cy="11" r="2.2" fill="white" fillOpacity="0.92"/>
  </svg>
)

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const { login, loading, token } = useAuth()
  const navigate = useNavigate()

  if (token) {
    return <Navigate to="/" replace />
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const result = await login(email, password)
    if (result.success) {
      navigate('/')
    } else {
      setError(result.error)
    }
  }

  return (
    <div style={styles.page}>
      {/* Background */}
      <div style={styles.bgWrap}>
        <div style={styles.gridBg} />
        <div style={{...styles.orb, ...styles.orb1}} />
        <div style={{...styles.orb, ...styles.orb2}} />
        <div style={{...styles.orb, ...styles.orb3}} />
      </div>

      {/* Card */}
      <div style={styles.wrapper}>
        <div style={styles.card}>

          {/* Logo */}
          <a href="https://replai.sk" style={styles.logo}>
            <ReplaiLogo />
            <span style={styles.logoText}>replai</span>
          </a>

          {/* Header */}
          <div style={styles.header}>
            <h1 style={styles.title}>Vitajte späť</h1>
            <p style={styles.subtitle}>Prihláste sa do svojho účtu</p>
          </div>

          {/* Error */}
          {error && <div style={styles.error}>{error}</div>}

          {/* Form */}
          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>E-mail</label>
              <div style={styles.inputWrap}>
                <Mail size={17} style={styles.inputIcon} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vas@email.sk"
                  required
                  style={styles.input}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#0BB878'
                    e.target.style.boxShadow = '0 0 0 3px rgba(11,184,120,0.12)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'rgba(0,0,0,0.09)'
                    e.target.style.boxShadow = 'none'
                  }}
                />
              </div>
            </div>

            <div style={styles.fieldGroup}>
              <label style={styles.label}>Heslo</label>
              <div style={styles.inputWrap}>
                <Lock size={17} style={styles.inputIcon} />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{...styles.input, paddingRight: '44px'}}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#0BB878'
                    e.target.style.boxShadow = '0 0 0 3px rgba(11,184,120,0.12)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'rgba(0,0,0,0.09)'
                    e.target.style.boxShadow = 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  style={styles.pwToggle}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Options row */}
            <div style={styles.optionsRow}>
              <label style={styles.checkLabel}>
                <input type="checkbox" style={styles.checkbox} />
                <span>Zapamätať</span>
              </label>
              <Link to="/forgot-password" style={styles.forgotLink}>
                Zabudnuté heslo?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                ...styles.submitBtn,
                opacity: loading ? 0.7 : 1,
                pointerEvents: loading ? 'none' : 'auto'
              }}
              onMouseEnter={(e) => {
                e.target.style.transform = 'translateY(-1px)'
                e.target.style.boxShadow = '0 8px 28px rgba(11,184,120,0.32)'
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = 'none'
                e.target.style.boxShadow = 'none'
              }}
            >
              {loading ? 'Prihlasujem...' : (
                <>
                  Prihlásiť sa
                  <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div style={styles.divider}>
            <div style={styles.dividerLine} />
            <span style={styles.dividerText}>Nemáte účet?</span>
            <div style={styles.dividerLine} />
          </div>

          {/* Switch */}
          <Link to="/register" style={styles.switchBtn}
            onMouseEnter={(e) => {
              e.target.style.borderColor = 'rgba(0,0,0,0.18)'
              e.target.style.background = 'rgba(0,0,0,0.025)'
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = 'rgba(0,0,0,0.09)'
              e.target.style.background = 'transparent'
            }}
          >
            Vytvoriť účet zadarmo
          </Link>

          {/* Footer */}
          <div style={styles.footer}>
            <a href="https://replai.sk" style={styles.footerLink}>← Späť na replai.sk</a>
          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700;800;900&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap');
        @keyframes orbFloat1 {
          0%,100%{transform:translate(0,0) scale(1)}
          33%{transform:translate(-50px,35px) scale(1.06)}
          66%{transform:translate(25px,-25px) scale(0.94)}
        }
        @keyframes orbFloat2 {
          0%,100%{transform:translate(0,0) scale(1)}
          33%{transform:translate(40px,-25px) scale(1.04)}
          66%{transform:translate(-30px,35px) scale(0.97)}
        }
        @keyframes orbFloat3 {
          0%,100%{transform:translate(0,0) scale(1)}
          50%{transform:translate(-35px,22px) scale(1.08)}
        }
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to { opacity: 1; transform: none; }
        }
      `}</style>
    </div>
  )
}

const styles = {
  page: {
    fontFamily: "'DM Sans', -apple-system, sans-serif",
    background: '#F3F4FA',
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    WebkitFontSmoothing: 'antialiased',
  },
  bgWrap: {
    position: 'fixed',
    inset: 0,
    zIndex: 0,
    overflow: 'hidden',
  },
  gridBg: {
    position: 'absolute',
    inset: 0,
    backgroundImage: 'linear-gradient(rgba(107,95,237,0.065) 1px, transparent 1px), linear-gradient(90deg, rgba(107,95,237,0.065) 1px, transparent 1px)',
    backgroundSize: '60px 60px',
    WebkitMaskImage: 'radial-gradient(ellipse 90% 80% at 50% 50%, black 10%, transparent 75%)',
    maskImage: 'radial-gradient(ellipse 90% 80% at 50% 50%, black 10%, transparent 75%)',
  },
  orb: {
    position: 'absolute',
    borderRadius: '50%',
    filter: 'blur(80px)',
    pointerEvents: 'none',
  },
  orb1: {
    width: 700, height: 700,
    background: 'radial-gradient(circle, rgba(11,184,120,0.14), transparent 60%)',
    top: -250, right: -150,
    animation: 'orbFloat1 28s ease-in-out infinite',
  },
  orb2: {
    width: 600, height: 600,
    background: 'radial-gradient(circle, rgba(107,95,237,0.12), transparent 60%)',
    bottom: -200, left: -100,
    animation: 'orbFloat2 35s ease-in-out infinite',
  },
  orb3: {
    width: 400, height: 400,
    background: 'radial-gradient(circle, rgba(11,184,120,0.07), transparent 60%)',
    top: '50%', left: '40%',
    animation: 'orbFloat3 22s ease-in-out infinite',
  },
  wrapper: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    maxWidth: 440,
    padding: 20,
    animation: 'cardIn 0.7s cubic-bezier(0.16,1,0.3,1) both',
  },
  card: {
    background: 'rgba(255,255,255,0.82)',
    backdropFilter: 'blur(24px) saturate(1.8)',
    WebkitBackdropFilter: 'blur(24px) saturate(1.8)',
    border: '1px solid rgba(255,255,255,0.9)',
    borderRadius: 22,
    padding: '44px 36px 38px',
    boxShadow: '0 0 0 1px rgba(0,0,0,0.04), 0 20px 60px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06)',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 32,
    textDecoration: 'none',
    color: '#0C0C22',
  },
  logoText: {
    fontFamily: "'Onest', sans-serif",
    fontWeight: 700,
    fontSize: 20,
    letterSpacing: '-0.5px',
  },
  header: {
    textAlign: 'center',
    marginBottom: 30,
  },
  title: {
    fontFamily: "'Onest', sans-serif",
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: '-1.2px',
    color: '#0C0C22',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14.5,
    color: '#5A5A80',
    lineHeight: 1.6,
  },
  error: {
    background: 'rgba(239,68,68,0.08)',
    border: '1px solid rgba(239,68,68,0.2)',
    borderRadius: 9,
    padding: '10px 14px',
    fontSize: 13,
    color: '#DC2626',
    textAlign: 'center',
    marginBottom: 8,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  fieldGroup: {
    position: 'relative',
  },
  label: {
    display: 'block',
    fontSize: 12.5,
    fontWeight: 600,
    color: '#0C0C22',
    marginBottom: 6,
    letterSpacing: '0.2px',
  },
  inputWrap: {
    position: 'relative',
  },
  inputIcon: {
    position: 'absolute',
    left: 14,
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#9898B8',
    pointerEvents: 'none',
  },
  input: {
    width: '100%',
    padding: '12px 16px 12px 42px',
    border: '1.5px solid rgba(0,0,0,0.09)',
    borderRadius: 9,
    fontSize: 14,
    fontFamily: "'DM Sans', sans-serif",
    background: 'rgba(255,255,255,0.7)',
    color: '#0C0C22',
    outline: 'none',
    transition: 'all 0.25s',
  },
  pwToggle: {
    position: 'absolute',
    right: 14,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    color: '#9898B8',
    cursor: 'pointer',
    padding: 2,
    display: 'flex',
    alignItems: 'center',
  },
  optionsRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: -2,
  },
  checkLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    fontSize: 13,
    color: '#5A5A80',
    cursor: 'pointer',
  },
  checkbox: {
    accentColor: '#0BB878',
    width: 15,
    height: 15,
  },
  forgotLink: {
    fontSize: 13,
    color: '#6B5FED',
    textDecoration: 'none',
    fontWeight: 550,
  },
  submitBtn: {
    width: '100%',
    padding: '13px 24px',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 14.5,
    fontWeight: 600,
    border: 'none',
    borderRadius: 9,
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.16,1,0.3,1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    letterSpacing: '-0.1px',
    background: '#0BB878',
    color: '#FFFFFF',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    margin: '22px 0 14px',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: 'rgba(0,0,0,0.09)',
  },
  dividerText: {
    fontSize: 12,
    color: '#9898B8',
    whiteSpace: 'nowrap',
  },
  switchBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    padding: '12px 24px',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 14,
    fontWeight: 600,
    border: '1px solid rgba(0,0,0,0.09)',
    borderRadius: 9,
    background: 'transparent',
    color: '#0C0C22',
    textDecoration: 'none',
    transition: 'all 0.25s',
  },
  footer: {
    textAlign: 'center',
    marginTop: 22,
  },
  footerLink: {
    fontSize: 12,
    color: '#9898B8',
    textDecoration: 'none',
  },
}