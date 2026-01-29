import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { Key, Code, Copy, Check, BookOpen, Plug, Calendar, Settings, Palette } from 'lucide-react'

export default function Integration() {
  const { client } = useAuth()
  const [copied, setCopied] = useState('')
  const [bookingColor, setBookingColor] = useState('#111111')
  const [bookingTrigger, setBookingTrigger] = useState('')
  const [showFloating, setShowFloating] = useState(true)

  const backendUrl = 'https://replai-backend.onrender.com'

  const embedCode = `<script 
  src="${backendUrl}/static/widget.js" 
  data-api-key="${client?.api_key}"
  data-backend-url="${backendUrl}">
</script>`

  // Booking widget embed code
  const bookingEmbedCode = `<script
  src="${backendUrl}/static/booking-widget.js"
  data-client-id="${client?.id}"
  data-backend-url="${backendUrl}"${bookingColor !== '#111111' ? `
  data-color="${bookingColor}"` : ''}${bookingTrigger ? `
  data-trigger="${bookingTrigger}"` : ''}${!showFloating ? `
  data-floating="false"` : ''}>
</script>`

  const copyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text)
    setCopied(type)
    setTimeout(() => setCopied(''), 2000)
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Integrácia</h1>
        <p className="text-slate-500 mt-1">Vložte chat widget na váš web</p>
      </div>

      <div className="space-y-6">
        {/* API Key Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center">
              <Key size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Váš API kľúč</h2>
              <p className="text-sm text-slate-500">Nikdy ho nezdieľajte verejne</p>
            </div>
          </div>
          
          <div className="flex gap-3">
            <code className="flex-1 bg-slate-100 px-4 py-3 rounded-xl font-mono text-sm overflow-x-auto text-slate-700 border border-slate-200">
              {client?.api_key}
            </code>
            <button
              onClick={() => copyToClipboard(client?.api_key, 'api')}
              className="px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl hover:opacity-90 transition flex items-center gap-2 font-medium shadow-lg shadow-violet-200"
            >
              {copied === 'api' ? <Check size={18} /> : <Copy size={18} />}
              {copied === 'api' ? 'Skopírované' : 'Kopírovať'}
            </button>
          </div>
        </div>

        {/* Chat Widget Embed Code */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-indigo-500 rounded-xl flex items-center justify-center">
              <Code size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Chat Widget - Embed kód</h2>
              <p className="text-sm text-slate-500">Vložte pred &lt;/body&gt; tag</p>
            </div>
          </div>
          
          <div className="relative">
            <pre className="bg-slate-900 text-emerald-400 p-5 rounded-xl overflow-x-auto text-sm font-mono">
              {embedCode}
            </pre>
            <button
              onClick={() => copyToClipboard(embedCode, 'embed')}
              className="absolute top-3 right-3 px-3 py-1.5 bg-white text-slate-800 rounded-lg hover:bg-slate-100 transition text-sm font-medium flex items-center gap-1"
            >
              {copied === 'embed' ? <Check size={16} /> : <Copy size={16} />}
              {copied === 'embed' ? 'Skopírované' : 'Kopírovať'}
            </button>
          </div>
        </div>

        {/* Booking Widget Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center">
              <Calendar size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Rezervačný Widget - Embed kód</h2>
              <p className="text-sm text-slate-500">Online rezervácie priamo na vašom webe</p>
            </div>
          </div>

          {/* Konfigurácia */}
          <div className="bg-slate-50 rounded-xl p-4 mb-4 border border-slate-200">
            <div className="flex items-center gap-2 mb-3">
              <Settings size={16} className="text-slate-500" />
              <span className="text-sm font-medium text-slate-700">Konfigurácia (voliteľné)</span>
            </div>
            
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  <Palette size={12} className="inline mr-1" />
                  Farba widgetu
                </label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={bookingColor}
                    onChange={(e) => setBookingColor(e.target.value)}
                    className="w-10 h-9 rounded border border-slate-300 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={bookingColor}
                    onChange={(e) => setBookingColor(e.target.value)}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
                    placeholder="#111111"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Vlastné tlačidlo (CSS selektor)
                </label>
                <input
                  type="text"
                  value={bookingTrigger}
                  onChange={(e) => setBookingTrigger(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  placeholder="#servis-btn alebo .booking-btn"
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Plávajúce tlačidlo
                </label>
                <div className="flex items-center gap-3 mt-2">
                  <button
                    onClick={() => setShowFloating(true)}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition ${
                      showFloating 
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700' 
                        : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Zobraziť
                  </button>
                  <button
                    onClick={() => setShowFloating(false)}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition ${
                      !showFloating 
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700' 
                        : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Skryť
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          <div className="relative">
            <pre className="bg-slate-900 text-cyan-400 p-5 rounded-xl overflow-x-auto text-sm font-mono">
              {bookingEmbedCode}
            </pre>
            <button
              onClick={() => copyToClipboard(bookingEmbedCode, 'booking')}
              className="absolute top-3 right-3 px-3 py-1.5 bg-white text-slate-800 rounded-lg hover:bg-slate-100 transition text-sm font-medium flex items-center gap-1"
            >
              {copied === 'booking' ? <Check size={16} /> : <Copy size={16} />}
              {copied === 'booking' ? 'Skopírované' : 'Kopírovať'}
            </button>
          </div>

          {/* Príklad s vlastným tlačidlom */}
          {bookingTrigger && (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm text-amber-800">
                <strong>Tip:</strong> Na vašej stránke pridajte element s atribútom <code className="bg-amber-200 px-1 rounded">{bookingTrigger}</code>:
              </p>
              <pre className="mt-2 bg-amber-100 text-amber-900 p-3 rounded-lg text-sm font-mono overflow-x-auto">
{`<a href="#" ${bookingTrigger.startsWith('#') ? `id="${bookingTrigger.slice(1)}"` : `class="${bookingTrigger.slice(1)}"`}>Rezervovať servis</a>`}
              </pre>
            </div>
          )}
        </div>

        {/* Installation Guide */}
        <div className="bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-indigo-500 rounded-xl flex items-center justify-center">
              <BookOpen size={20} className="text-white" />
            </div>
            <h2 className="text-lg font-semibold text-violet-900">Návod na inštaláciu</h2>
          </div>
          <ol className="space-y-3 text-violet-800">
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 bg-violet-200 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0">1</span>
              <span>Skopírujte embed kód vyššie</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 bg-violet-200 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0">2</span>
              <span>Otvorte HTML súbor vašej stránky</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 bg-violet-200 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0">3</span>
              <span>Vložte kód pred <code className="bg-violet-200 px-1.5 py-0.5 rounded font-mono text-sm">&lt;/body&gt;</code></span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 bg-violet-200 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0">4</span>
              <span>Uložte a obnovte stránku</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 bg-violet-200 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0">5</span>
              <span>Chat widget sa zobrazí vpravo dole</span>
            </li>
          </ol>
        </div>

        {/* Platforms */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center">
              <Plug size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Platformy</h2>
              <p className="text-sm text-slate-500">Ako vložiť widget na populárne platformy</p>
            </div>
          </div>
          
          <div className="grid md:grid-cols-2 gap-4">
            <div className="border border-slate-200 rounded-xl p-5 hover:border-violet-300 hover:bg-violet-50 transition">
              <h3 className="font-semibold text-slate-900 mb-2">WordPress</h3>
              <p className="text-sm text-slate-500">
                Appearance → Theme Editor → footer.php, alebo plugin "Insert Headers and Footers"
              </p>
            </div>
            
            <div className="border border-slate-200 rounded-xl p-5 hover:border-violet-300 hover:bg-violet-50 transition">
              <h3 className="font-semibold text-slate-900 mb-2">Shopify</h3>
              <p className="text-sm text-slate-500">
                Online Store → Themes → Edit code → theme.liquid
              </p>
            </div>
            
            <div className="border border-slate-200 rounded-xl p-5 hover:border-violet-300 hover:bg-violet-50 transition">
              <h3 className="font-semibold text-slate-900 mb-2">Wix</h3>
              <p className="text-sm text-slate-500">
                Settings → Custom Code → Add Code to Body - End
              </p>
            </div>
            
            <div className="border border-slate-200 rounded-xl p-5 hover:border-violet-300 hover:bg-violet-50 transition">
              <h3 className="font-semibold text-slate-900 mb-2">Webflow</h3>
              <p className="text-sm text-slate-500">
                Project Settings → Custom Code → Footer Code
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}