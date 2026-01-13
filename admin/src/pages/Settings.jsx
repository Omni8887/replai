import { useState, useEffect } from 'react'
import axios from 'axios'
import { useAuth } from '../context/AuthContext.jsx'
import { Bot, Palette, Eye, Save, Check, Sparkles } from 'lucide-react'

export default function Settings() {
  const { client, API_URL, refreshProfile } = useAuth()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  
  const [systemPrompt, setSystemPrompt] = useState('')
  const [widgetSettings, setWidgetSettings] = useState({
    primaryColor: '#7c3aed',
    title: 'Zákaznícka podpora',
    welcomeMessage: 'Dobrý deň! Ako vám môžem pomôcť?'
  })

  useEffect(() => {
    if (client) {
      setSystemPrompt(client.system_prompt || '')
      setWidgetSettings(client.widget_settings || {
        primaryColor: '#7c3aed',
        title: 'Zákaznícka podpora',
        welcomeMessage: 'Dobrý deň! Ako vám môžem pomôcť?'
      })
    }
  }, [client])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    
    try {
      await axios.put(`${API_URL}/admin/settings`, {
        systemPrompt,
        widgetSettings
      })
      await refreshProfile()
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (error) {
      console.error('Failed to save settings:', error)
      alert('Chyba pri ukladaní')
    } finally {
      setSaving(false)
    }
  }

  const handleOrderPrompt = async () => {
    setCheckoutLoading(true)
    try {
      const response = await axios.post(`${API_URL}/create-service-checkout`, { service: 'prompt_custom' })
      if (response.data.url) {
        window.location.href = response.data.url
      }
    } catch (error) {
      console.error('Checkout error:', error)
      alert('Nepodarilo sa vytvoriť objednávku. Skúste znova.')
    } finally {
      setCheckoutLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Nastavenia</h1>
        <p className="text-slate-500 mt-1">Upravte správanie a vzhľad vášho chatbota</p>
      </div>

      <div className="space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-indigo-500 rounded-xl flex items-center justify-center">
              <Bot size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">System Prompt</h2>
              <p className="text-sm text-slate-500">Inštrukcie pre AI ako sa má správať</p>
            </div>
          </div>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className="w-full h-48 px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-600 focus:border-transparent outline-none transition resize-none text-slate-700"
            placeholder="Si priateľský zákaznícky asistent firmy XY. Odpovedaj stručne a pomocne. Naša firma predáva..."
          />
        </div>

        {/* Prompt na mieru */}
        <div className="bg-gradient-to-r from-violet-50 to-indigo-50 rounded-2xl border border-violet-200 p-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-indigo-500 rounded-xl flex items-center justify-center shadow-lg">
                <Sparkles size={24} className="text-white" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Neviete ako nastaviť prompt?</h3>
                <p className="text-slate-600 text-sm">Vytvoríme vám profesionálny prompt na mieru pre váš biznis</p>
              </div>
            </div>
            <button
              onClick={handleOrderPrompt}
              disabled={checkoutLoading}
              className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 text-white px-6 py-3 rounded-xl font-semibold transition disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-violet-200"
            >
              <Sparkles size={18} />
              {checkoutLoading ? 'Načítavam...' : 'Prompt na mieru za 19,90€'}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center">
              <Palette size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Vzhľad widgetu</h2>
              <p className="text-sm text-slate-500">Prispôsobte widget vašej značke</p>
            </div>
          </div>
          
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Názov (zobrazí sa v hlavičke)
              </label>
              <input
                type="text"
                value={widgetSettings.title || ''}
                onChange={(e) => setWidgetSettings({...widgetSettings, title: e.target.value})}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-600 focus:border-transparent outline-none transition"
                placeholder="Zákaznícka podpora"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Hlavná farba
              </label>
              <div className="flex gap-3">
                <input
                  type="color"
                  value={widgetSettings.primaryColor || '#7c3aed'}
                  onChange={(e) => setWidgetSettings({...widgetSettings, primaryColor: e.target.value})}
                  className="w-14 h-12 rounded-xl cursor-pointer border border-slate-300 p-1"
                />
                <input
                  type="text"
                  value={widgetSettings.primaryColor || '#7c3aed'}
                  onChange={(e) => setWidgetSettings({...widgetSettings, primaryColor: e.target.value})}
                  className="flex-1 px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-600 focus:border-transparent outline-none transition font-mono"
                  placeholder="#7c3aed"
                />
              </div>
            </div>
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Uvítacia správa
            </label>
            <textarea
              value={widgetSettings.welcomeMessage || ''}
              onChange={(e) => setWidgetSettings({...widgetSettings, welcomeMessage: e.target.value})}
              className="w-full h-24 px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-600 focus:border-transparent outline-none transition resize-none"
              placeholder="Dobrý deň! Ako vám môžem pomôcť?"
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center">
              <Eye size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Náhľad</h2>
              <p className="text-sm text-slate-500">Takto bude widget vyzerať</p>
            </div>
          </div>
          <div className="bg-slate-100 rounded-xl p-6">
            <div className="w-80 bg-white rounded-2xl shadow-xl mx-auto overflow-hidden border border-slate-200">
              <div 
                className="p-4 text-white font-semibold"
                style={{ backgroundColor: widgetSettings.primaryColor }}
              >
                {widgetSettings.title || 'Zákaznícka podpora'}
              </div>
              <div className="p-4">
                <div className="bg-slate-100 rounded-xl p-3 text-sm text-slate-700">
                  {widgetSettings.welcomeMessage || 'Dobrý deň! Ako vám môžem pomôcť?'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-6 py-3 rounded-xl font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-violet-200"
          >
            {saving ? (
              'Ukladám...'
            ) : (
              <>
                <Save size={20} />
                Uložiť nastavenia
              </>
            )}
          </button>
          
          {saved && (
            <span className="text-emerald-600 font-medium flex items-center gap-1">
              <Check size={20} />
              Uložené!
            </span>
          )}
        </div>
      </div>
    </div>
  )
}