import { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import { useAuth } from '../context/AuthContext.jsx'
import { Package, Upload, Trash2, ExternalLink, Search, X, FileText, Link, ChevronLeft, ChevronRight, Filter } from 'lucide-react'

export default function Products() {
  const { API_URL } = useAuth()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [csvText, setCsvText] = useState('')
  const [xmlText, setXmlText] = useState('')
  const [xmlUrl, setXmlUrl] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [uploadType, setUploadType] = useState('csv')
  
  // Filtre a stránkovanie
  const [search, setSearch] = useState('')
  const [priceFrom, setPriceFrom] = useState('')
  const [priceTo, setPriceTo] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [perPage, setPerPage] = useState(100)
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    loadProducts()
  }, [])

  // Reset stránky pri zmene filtrov
  useEffect(() => {
    setCurrentPage(1)
  }, [search, priceFrom, priceTo, selectedCategory, perPage])

  const loadProducts = async () => {
    try {
      const response = await axios.get(`${API_URL}/admin/products`)
      setProducts(response.data)
    } catch (error) {
      console.error('Failed to load products:', error)
    } finally {
      setLoading(false)
    }
  }

  // Získaj unikátne kategórie
  const categories = useMemo(() => {
    const cats = [...new Set(products.map(p => p.category).filter(Boolean))]
    return cats.sort()
  }, [products])

  // Filtrované produkty
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      // Textové vyhľadávanie
      const matchesSearch = !search || 
        p.name?.toLowerCase().includes(search.toLowerCase()) ||
        p.category?.toLowerCase().includes(search.toLowerCase()) ||
        p.description?.toLowerCase().includes(search.toLowerCase())
      
      // Filter ceny od
      const matchesPriceFrom = !priceFrom || (p.price && p.price >= parseFloat(priceFrom))
      
      // Filter ceny do
      const matchesPriceTo = !priceTo || (p.price && p.price <= parseFloat(priceTo))
      
      // Filter kategórie
      const matchesCategory = !selectedCategory || p.category === selectedCategory
      
      return matchesSearch && matchesPriceFrom && matchesPriceTo && matchesCategory
    })
  }, [products, search, priceFrom, priceTo, selectedCategory])

  // Stránkovanie
  const totalPages = Math.ceil(filteredProducts.length / perPage)
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * perPage,
    currentPage * perPage
  )

  const handleUploadCSV = async () => {
    if (!csvText.trim()) return
    
    setUploading(true)
    try {
      const lines = csvText.trim().split('\n')
      const headers = lines[0].split(';').map(h => h.trim().toLowerCase())
      
      const products = lines.slice(1).map(line => {
        const values = line.split(';')
        const product = {}
        headers.forEach((header, i) => {
          if (header === 'nazov' || header === 'name') product.name = values[i]?.trim()
          if (header === 'popis' || header === 'description') product.description = values[i]?.trim()
          if (header === 'cena' || header === 'price') product.price = parseFloat(values[i]?.trim()) || null
          if (header === 'kategoria' || header === 'category') product.category = values[i]?.trim()
          if (header === 'url' || header === 'link') product.url = values[i]?.trim()
        })
        return product
      }).filter(p => p.name)
      
      const response = await axios.post(`${API_URL}/admin/products/upload`, { products })
      
      if (response.data.success) {
        alert(`Úspešne nahraných ${response.data.count} produktov!`)
        setCsvText('')
        setShowUpload(false)
        loadProducts()
      }
    } catch (error) {
      console.error('Upload failed:', error)
      alert(error.response?.data?.error || 'Chyba pri nahrávaní')
    } finally {
      setUploading(false)
    }
  }

  const handleUploadXML = async () => {
    if (!xmlText.trim() && !xmlUrl.trim()) return
    
    setUploading(true)
    try {
      const response = await axios.post(`${API_URL}/admin/products/upload-xml`, { 
        xmlContent: xmlText || null,
        xmlUrl: xmlUrl || null
      })
      
      if (response.data.success) {
        alert(`Úspešne nahraných ${response.data.count} produktov!`)
        setXmlText('')
        setXmlUrl('')
        setShowUpload(false)
        loadProducts()
      }
    } catch (error) {
      console.error('Upload failed:', error)
      alert('Chyba pri nahrávaní: ' + (error.response?.data?.error || 'Neznáma chyba'))
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Vymazať tento produkt?')) return
    
    try {
      await axios.delete(`${API_URL}/admin/products/${id}`)
      setProducts(products.filter(p => p.id !== id))
    } catch (error) {
      console.error('Delete failed:', error)
    }
  }

  const handleDeleteAll = async () => {
    if (!confirm('Vymazať VŠETKY produkty? Táto akcia sa nedá vrátiť!')) return
    
    try {
      await axios.delete(`${API_URL}/admin/products`)
      setProducts([])
    } catch (error) {
      console.error('Delete all failed:', error)
    }
  }

  const clearFilters = () => {
    setSearch('')
    setPriceFrom('')
    setPriceTo('')
    setSelectedCategory('')
  }

  const hasActiveFilters = search || priceFrom || priceTo || selectedCategory

  return (
    <div>
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Produkty</h1>
          <p className="text-slate-500 mt-1">Databáza produktov pre AI odporúčania</p>
        </div>
        
        <div className="flex gap-3">
          {products.length > 0 && (
            <button
              onClick={handleDeleteAll}
              className="px-4 py-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition flex items-center gap-2 font-medium"
            >
              <Trash2 size={18} />
              Vymazať všetky
            </button>
          )}
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl hover:opacity-90 transition flex items-center gap-2 font-medium shadow-lg shadow-violet-200"
          >
            <Upload size={18} />
            Nahrať produkty
          </button>
        </div>
      </div>

      {showUpload && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Nahrať produkty</h2>
            <button onClick={() => setShowUpload(false)} className="text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>
          </div>
          
          {/* Tabs */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setUploadType('csv')}
              className={`px-4 py-2 rounded-xl font-medium flex items-center gap-2 transition ${
                uploadType === 'csv' 
                  ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <FileText size={18} />
              CSV
            </button>
            <button
              onClick={() => setUploadType('xml')}
              className={`px-4 py-2 rounded-xl font-medium flex items-center gap-2 transition ${
                uploadType === 'xml' 
                  ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <FileText size={18} />
              XML Feed
            </button>
          </div>
          
          {uploadType === 'csv' && (
            <>
              <div className="bg-slate-50 rounded-xl p-4 mb-4 text-sm text-slate-600">
                <p className="font-medium mb-2">Formát CSV (oddelené bodkočiarkou):</p>
                <code className="block bg-slate-100 p-3 rounded-lg text-xs">
                  nazov;popis;cena;kategoria;url<br/>
                  iPhone 15;Najnovší iPhone;999;telefóny;https://eshop.sk/iphone15
                </code>
              </div>
              
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder="Vlož CSV dáta sem..."
                className="w-full h-48 p-4 border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-600 focus:border-transparent outline-none resize-none font-mono text-sm"
              />
              
              <div className="flex justify-end mt-4">
                <button
                  onClick={handleUploadCSV}
                  disabled={uploading || !csvText.trim()}
                  className="px-6 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl hover:opacity-90 transition font-medium disabled:opacity-50"
                >
                  {uploading ? 'Nahrávam...' : 'Nahrať CSV'}
                </button>
              </div>
            </>
          )}
          
          {uploadType === 'xml' && (
            <>
              <div className="bg-slate-50 rounded-xl p-4 mb-4 text-sm text-slate-600">
                <p className="font-medium mb-2">Podporované formáty:</p>
                <p>Heureka XML, Google Shopping, vlastný XML feed</p>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <Link size={16} className="inline mr-2" />
                  URL na XML feed
                </label>
                <input
                  type="url"
                  value={xmlUrl}
                  onChange={(e) => setXmlUrl(e.target.value)}
                  placeholder="https://eshop.sk/feed.xml"
                  className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-600 focus:border-transparent outline-none"
                />
              </div>
              
              <div className="text-center text-slate-400 my-4">alebo</div>
              
              <textarea
                value={xmlText}
                onChange={(e) => setXmlText(e.target.value)}
                placeholder="Vlož XML obsah sem..."
                className="w-full h-48 p-4 border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-600 focus:border-transparent outline-none resize-none font-mono text-sm"
              />
              
              <div className="flex justify-end mt-4">
                <button
                  onClick={handleUploadXML}
                  disabled={uploading || (!xmlText.trim() && !xmlUrl.trim())}
                  className="px-6 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl hover:opacity-90 transition font-medium disabled:opacity-50"
                >
                  {uploading ? 'Nahrávam...' : 'Nahrať XML'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
        <div className="p-5 border-b border-slate-200">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-indigo-500 rounded-xl flex items-center justify-center">
                <Package size={20} className="text-white" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">Zoznam produktov</h2>
                <p className="text-sm text-slate-500">
                  {filteredProducts.length === products.length 
                    ? `${products.length} produktov` 
                    : `${filteredProducts.length} z ${products.length} produktov`
                  }
                </p>
              </div>
            </div>
            
            {products.length > 0 && (
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Hľadať..."
                    className="pl-10 pr-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-600 focus:border-transparent outline-none w-64"
                  />
                </div>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`p-2 rounded-xl transition flex items-center gap-2 ${
                    showFilters || hasActiveFilters
                      ? 'bg-violet-100 text-violet-700' 
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Filter size={18} />
                  {hasActiveFilters && (
                    <span className="w-2 h-2 bg-violet-600 rounded-full"></span>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Filtre */}
          {showFilters && products.length > 0 && (
            <div className="flex flex-wrap gap-4 pt-4 border-t border-slate-200">
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-600">Cena od:</label>
                <input
                  type="number"
                  value={priceFrom}
                  onChange={(e) => setPriceFrom(e.target.value)}
                  placeholder="0"
                  className="w-24 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-600 focus:border-transparent outline-none"
                />
                <span className="text-slate-400">€</span>
              </div>
              
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-600">do:</label>
                <input
                  type="number"
                  value={priceTo}
                  onChange={(e) => setPriceTo(e.target.value)}
                  placeholder="∞"
                  className="w-24 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-600 focus:border-transparent outline-none"
                />
                <span className="text-slate-400">€</span>
              </div>
              
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-600">Kategória:</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-600 focus:border-transparent outline-none min-w-40"
                >
                  <option value="">Všetky kategórie</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-600">Zobraziť:</label>
                <select
                  value={perPage}
                  onChange={(e) => setPerPage(parseInt(e.target.value))}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-600 focus:border-transparent outline-none"
                >
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={500}>500</option>
                </select>
              </div>
              
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition flex items-center gap-1"
                >
                  <X size={16} />
                  Zrušiť filtre
                </button>
              )}
            </div>
          )}
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500">Načítavam...</div>
        ) : products.length === 0 ? (
          <div className="p-12 text-center">
            <Package size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-500 mb-2">Zatiaľ žiadne produkty</p>
            <p className="text-sm text-slate-400">Nahrajte CSV alebo XML súbor s produktami</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-12 text-center">
            <Search size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-500 mb-2">Žiadne produkty nezodpovedajú filtrom</p>
            <button
              onClick={clearFilters}
              className="text-sm text-violet-600 hover:underline"
            >
              Zrušiť filtre
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left py-3 px-5 font-semibold text-slate-700">Názov</th>
                    <th className="text-left py-3 px-5 font-semibold text-slate-700">Kategória</th>
                    <th className="text-right py-3 px-5 font-semibold text-slate-700">Cena</th>
                    <th className="text-left py-3 px-5 font-semibold text-slate-700">Link</th>
                    <th className="text-right py-3 px-5 font-semibold text-slate-700">Akcie</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedProducts.map(product => (
                    <tr key={product.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-5">
                        <p className="font-medium text-slate-900">{product.name}</p>
                        {product.description && (
                          <p className="text-sm text-slate-500 truncate max-w-xs">{product.description}</p>
                        )}
                      </td>
                      <td className="py-3 px-5">
                        {product.category && (
                          <span className="bg-slate-100 text-slate-700 text-xs px-2 py-1 rounded-full">
                            {product.category}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-5 text-right font-medium text-slate-900">
                        {product.price ? `${product.price}€` : '-'}
                      </td>
                      <td className="py-3 px-5">
                        {product.url && (
                          <a 
                            href={product.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-violet-600 hover:text-violet-700 flex items-center gap-1"
                          >
                            <ExternalLink size={14} />
                            <span className="text-sm">Otvoriť</span>
                          </a>
                        )}
                      </td>
                      <td className="py-3 px-5 text-right">
                        <button
                          onClick={() => handleDelete(product.id)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Stránkovanie */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-slate-200 flex justify-between items-center">
                <p className="text-sm text-slate-500">
                  Stránka {currentPage} z {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  
                  {/* Čísla stránok */}
                  <div className="flex gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`w-10 h-10 rounded-lg font-medium transition ${
                            currentPage === pageNum
                              ? 'bg-violet-600 text-white'
                              : 'hover:bg-slate-100 text-slate-600'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}