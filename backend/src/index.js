import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import xml2js from 'xml2js';
import { Resend } from 'resend';

dotenv.config();

// Až tu, po dotenv.config()
const resend = new Resend(process.env.RESEND_API_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Claude client
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

// Middleware
app.use(cors());
app.use(express.json());

// ============================================
// WIDGET ENDPOINTS
// ============================================

// GET /widget/:apiKey - Získaj nastavenia widgetu
app.get('/widget/:apiKey', async (req, res) => {
  try {
    const { apiKey } = req.params;
    
    const { data: client, error } = await supabase
      .from('clients')
      .select('id, name, widget_settings, system_prompt')
      .eq('api_key', apiKey)
      .eq('is_active', true)
      .single();
    
    if (error || !client) {
      return res.status(404).json({ error: 'Widget not found' });
    }
    
    res.json({
      clientId: client.id,
      name: client.name,
      settings: client.widget_settings
    });
  } catch (error) {
    console.error('Widget settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /chat - Chat endpoint so streamingom
app.post('/chat', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    const { message, threadId, context = [] } = req.body;
    
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }
    
    // Nájdi klienta
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, system_prompt')
      .eq('api_key', apiKey)
      .eq('is_active', true)
      .single();
    
    if (clientError || !client) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
    
    // Nájdi alebo vytvor konverzáciu
    let conversationId;
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('client_id', client.id)
      .eq('thread_id', threadId)
      .single();
    
    if (existingConv) {
      conversationId = existingConv.id;
    } else {
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({ client_id: client.id, thread_id: threadId })
        .select('id')
        .single();
      conversationId = newConv.id;
    }
    
    // Ulož user správu
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      role: 'user',
      content: message
    });
    
    // Priprav správy pre Claude
    const messages = context.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
    messages.push({ role: 'user', content: message });
    
    // Streaming response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    let fullResponse = '';
    let inputTokens = 0;
    let outputTokens = 0;
    
   // Aktuálny čas pre AI
const now = new Date();
const days = ['Nedeľa', 'Pondelok', 'Utorok', 'Streda', 'Štvrtok', 'Piatok', 'Sobota'];
const currentDateTime = `\n\nAKTUÁLNY ČAS: ${days[now.getDay()]}, ${now.toLocaleDateString('sk-SK')} ${now.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' })}`;

// Vyhľadaj relevantné produkty
let productsContext = '';
const { data: products } = await supabase
  .from('products')
  .select('name, description, price, category, url')
  .eq('client_id', client.id)
  .or(`name.ilike.%${message}%,description.ilike.%${message}%,category.ilike.%${message}%`)
  .limit(5);

if (products && products.length > 0) {
  productsContext = '\n\nRELEVANTNÉ PRODUKTY (použi ich v odpovedi ak sa hodia, pridaj link pomocou [pozrieť](url)):\n';
  products.forEach(p => {
    productsContext += `- ${p.name}`;
    if (p.price) productsContext += ` | ${p.price}€`;
    if (p.description) productsContext += ` | ${p.description}`;
    if (p.url) productsContext += ` | Link: ${p.url}`;
    productsContext += '\n';
  });
}

const systemPrompt = (client.system_prompt || 'Si priateľský zákaznícky asistent. Odpovedaj stručne a pomocne.') + currentDateTime + productsContext;

const stream = anthropic.messages.stream({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  system: systemPrompt,
  messages: messages
});
    
    stream.on('text', (text) => {
      fullResponse += text;
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    });
    
    stream.on('message', (msg) => {
      inputTokens = msg.usage?.input_tokens || 0;
      outputTokens = msg.usage?.output_tokens || 0;
    });
    
    stream.on('error', (error) => {
      console.error('Stream error:', error);
      res.write(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
      res.end();
    });
    
    stream.on('end', async () => {
      // Ulož assistant odpoveď
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: fullResponse
      });
      
      // Vypočítaj cenu (Claude Sonnet: $3/1M input, $15/1M output)
      const costEur = ((inputTokens * 3 / 1000000) + (outputTokens * 15 / 1000000)) * 0.92;
      
      // Ulož spotrebu tokenov
      await supabase.from('token_usage').insert({
        client_id: client.id,
        conversation_id: conversationId,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_eur: costEur,
        model: 'claude-sonnet-4-20250514'
      });
      
      // Aktualizuj conversation updated_at
      await supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId);
      
     // Skontroluj či správa obsahuje kontakt a ulož ho
const contactInfo = checkForContact(fullResponse + ' ' + message);
if (contactInfo.hasContact) {
  const updates = { has_contact: true };
  if (contactInfo.email) updates.visitor_email = contactInfo.email;
  if (contactInfo.phone) updates.visitor_phone = contactInfo.phone;
  
  await supabase
    .from('conversations')
    .update(updates)
    .eq('id', conversationId);
  
  // Pošli email notifikáciu
  const { data: clientData } = await supabase
    .from('clients')
    .select('email')
    .eq('id', client.id)
    .single();
  
  if (clientData?.email) {
    sendLeadNotification(clientData.email, contactInfo, conversationId);
  }
}
      
      res.write('data: [DONE]\n\n');
      res.end();
    });
    
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /messages/:threadId - Získaj históriu správ
app.get('/messages/:threadId', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    const { threadId } = req.params;
    
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }
    
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('api_key', apiKey)
      .single();
    
    if (!client) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
    
    const { data: conversation } = await supabase
      .from('conversations')
      .select('id')
      .eq('client_id', client.id)
      .eq('thread_id', threadId)
      .single();
    
    if (!conversation) {
      return res.json([]);
    }
    
    const { data: messages } = await supabase
      .from('messages')
      .select('role, content, created_at')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true });
    
    res.json(messages || []);
  } catch (error) {
    console.error('Messages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// ADMIN AUTH ENDPOINTS
// ============================================

// POST /auth/register - Registrácia klienta
app.post('/auth/register', async (req, res) => {
  try {
    const { name, email, password, websiteUrl } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password required' });
    }
    
    const passwordHash = await bcrypt.hash(password, 10);
    
    const { data: client, error } = await supabase
      .from('clients')
      .insert({
        name,
        email,
        password_hash: passwordHash,
        website_url: websiteUrl
      })
      .select('id, name, email, api_key')
      .single();
    
    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Email already exists' });
      }
      throw error;
    }
    
    const token = jwt.sign({ clientId: client.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ client, token });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /auth/login - Prihlásenie klienta
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const { data: client, error } = await supabase
      .from('clients')
      .select('id, name, email, api_key, password_hash')
      .eq('email', email)
      .single();
    
    if (error || !client) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const validPassword = await bcrypt.compare(password, client.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ clientId: client.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    
    delete client.password_hash;
    res.json({ client, token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// ADMIN API ENDPOINTS (protected)
// ============================================

// Middleware pre overenie tokenu
const authMiddleware = (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Token required' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.clientId = decoded.clientId;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// GET /admin/profile - Profil klienta
app.get('/admin/profile', authMiddleware, async (req, res) => {
  try {
    const { data: client } = await supabase
      .from('clients')
      .select('id, name, email, api_key, system_prompt, widget_settings, website_url, created_at')
      .eq('id', req.clientId)
      .single();
    
    res.json(client);
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /admin/settings - Aktualizuj nastavenia
app.put('/admin/settings', authMiddleware, async (req, res) => {
  try {
    const { systemPrompt, widgetSettings, websiteUrl } = req.body;
    
    const updates = {};
    if (systemPrompt !== undefined) updates.system_prompt = systemPrompt;
    if (widgetSettings !== undefined) updates.widget_settings = widgetSettings;
    if (websiteUrl !== undefined) updates.website_url = websiteUrl;
    
    const { data: client, error } = await supabase
      .from('clients')
      .update(updates)
      .eq('id', req.clientId)
      .select('id, name, email, api_key, system_prompt, widget_settings, website_url')
      .single();
    
    if (error) throw error;
    
    res.json(client);
  } catch (error) {
    console.error('Settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /admin/conversations - Zoznam konverzácií
app.get('/admin/conversations', authMiddleware, async (req, res) => {
  try {
    const { data: conversations } = await supabase
      .from('conversations')
      .select(`
        id,
        thread_id,
        visitor_name,
        visitor_email,
        visitor_phone,
        has_contact,
        is_read,
        created_at,
        updated_at
      `)
      .eq('client_id', req.clientId)
      .order('updated_at', { ascending: false });
    
    res.json(conversations || []);
  } catch (error) {
    console.error('Conversations error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /admin/conversations/:id - Detail konverzácie
app.get('/admin/conversations/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data: conversation } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', id)
      .eq('client_id', req.clientId)
      .single();
    
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    const { data: messages } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });
    
    // Označ ako prečítané
    await supabase
      .from('conversations')
      .update({ is_read: true })
      .eq('id', id);
    
    res.json({ ...conversation, messages: messages || [] });
  } catch (error) {
    console.error('Conversation detail error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /admin/conversations/:id - Vymaž konverzáciu
app.delete('/admin/conversations/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Overiť že konverzácia patrí klientovi
    const { data: conversation } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', id)
      .eq('client_id', req.clientId)
      .single();
    
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    // Vymaž správy
    await supabase
      .from('messages')
      .delete()
      .eq('conversation_id', id);
    
    // Vymaž konverzáciu
    await supabase
      .from('conversations')
      .delete()
      .eq('id', id);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete conversation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /admin/export/leads - Export leadov do CSV
app.get('/admin/export/leads', authMiddleware, async (req, res) => {
  try {
    const { data: conversations } = await supabase
      .from('conversations')
      .select('visitor_name, visitor_email, visitor_phone, created_at, updated_at')
      .eq('client_id', req.clientId)
      .eq('has_contact', true)
      .order('created_at', { ascending: false });
    
    if (!conversations || conversations.length === 0) {
      return res.status(404).json({ error: 'No leads found' });
    }
    
    const headers = ['Meno', 'Email', 'Telefón', 'Dátum vytvorenia', 'Posledná aktivita'];
    const rows = conversations.map(conv => [
      conv.visitor_name || '',
      conv.visitor_email || '',
      conv.visitor_phone || '',
      new Date(conv.created_at).toLocaleString('sk-SK'),
      new Date(conv.updated_at).toLocaleString('sk-SK')
    ]);
    
    const csv = [
      headers.join(';'),
      ...rows.map(row => row.join(';'))
    ].join('\n');
    
    const csvWithBom = '\ufeff' + csv;
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=leady.csv');
    res.send(csvWithBom);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// TOKEN USAGE ENDPOINTS
// ============================================

app.get('/admin/usage', authMiddleware, async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const daysAgo = parseInt(period);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysAgo);
    
    const { data: totalUsage } = await supabase
      .from('token_usage')
      .select('input_tokens, output_tokens, cost_eur')
      .eq('client_id', req.clientId)
      .gte('created_at', startDate.toISOString());
    
    const totals = (totalUsage || []).reduce((acc, row) => ({
      inputTokens: acc.inputTokens + row.input_tokens,
      outputTokens: acc.outputTokens + row.output_tokens,
      costEur: acc.costEur + parseFloat(row.cost_eur)
    }), { inputTokens: 0, outputTokens: 0, costEur: 0 });
    
    const { data: dailyUsage } = await supabase
      .from('token_usage')
      .select('created_at, input_tokens, output_tokens, cost_eur')
      .eq('client_id', req.clientId)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true });
    
    const dailyStats = {};
    (dailyUsage || []).forEach(row => {
      const date = row.created_at.split('T')[0];
      if (!dailyStats[date]) {
        dailyStats[date] = { date, inputTokens: 0, outputTokens: 0, costEur: 0, requests: 0 };
      }
      dailyStats[date].inputTokens += row.input_tokens;
      dailyStats[date].outputTokens += row.output_tokens;
      dailyStats[date].costEur += parseFloat(row.cost_eur);
      dailyStats[date].requests += 1;
    });
    
    res.json({
      totals: {
        ...totals,
        totalTokens: totals.inputTokens + totals.outputTokens,
        requests: totalUsage?.length || 0
      },
      daily: Object.values(dailyStats)
    });
  } catch (error) {
    console.error('Usage error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// PRODUCTS ENDPOINTS
// ============================================

// GET /admin/products - Zoznam produktov
app.get('/admin/products', authMiddleware, async (req, res) => {
  try {
    const { data: products } = await supabase
      .from('products')
      .select('*')
      .eq('client_id', req.clientId)
      .order('created_at', { ascending: false });
    
    res.json(products || []);
  } catch (error) {
    console.error('Products error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /admin/products/upload - Upload produktov z CSV
app.post('/admin/products/upload', authMiddleware, async (req, res) => {
  try {
    const { products } = req.body;
    
    if (!products || !Array.isArray(products)) {
      return res.status(400).json({ error: 'Products array required' });
    }
    
    // Pridaj client_id ku každému produktu
    const productsWithClient = products.map(p => ({
      client_id: req.clientId,
      name: p.name,
      description: p.description || '',
      price: p.price || null,
      category: p.category || '',
      url: p.url || ''
    }));
    
    // Vlož produkty
    const { data, error } = await supabase
      .from('products')
      .insert(productsWithClient)
      .select();
    
    if (error) throw error;
    
    res.json({ success: true, count: data.length });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /admin/products/:id - Vymaž produkt
app.delete('/admin/products/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    await supabase
      .from('products')
      .delete()
      .eq('id', id)
      .eq('client_id', req.clientId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /admin/products - Vymaž všetky produkty
app.delete('/admin/products', authMiddleware, async (req, res) => {
  try {
    await supabase
      .from('products')
      .delete()
      .eq('client_id', req.clientId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete all products error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /admin/products/search - Vyhľadaj produkty (interné)
app.get('/admin/products/search', authMiddleware, async (req, res) => {
  try {
    const { q } = req.query;
    
    const { data: products } = await supabase
      .from('products')
      .select('*')
      .eq('client_id', req.clientId)
      .or(`name.ilike.%${q}%,description.ilike.%${q}%,category.ilike.%${q}%`)
      .limit(5);
    
    res.json(products || []);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /admin/products/upload-xml - Upload produktov z XML
app.post('/admin/products/upload-xml', authMiddleware, async (req, res) => {
  try {
    const { xmlContent, xmlUrl } = req.body;
    
    let xmlData = xmlContent;
    
    // Ak je URL, stiahni XML
    if (xmlUrl) {
      const response = await fetch(xmlUrl);
      xmlData = await response.text();
    }
    
    if (!xmlData) {
      return res.status(400).json({ error: 'XML content or URL required' });
    }
    
    // Parsuj XML
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(xmlData);
    
    // Nájdi produkty (podporuje rôzne formáty)
    let items = [];
    if (result.SHOP?.SHOPITEM) {
      items = Array.isArray(result.SHOP.SHOPITEM) ? result.SHOP.SHOPITEM : [result.SHOP.SHOPITEM];
    } else if (result.products?.product) {
      items = Array.isArray(result.products.product) ? result.products.product : [result.products.product];
    } else if (result.rss?.channel?.item) {
      items = Array.isArray(result.rss.channel.item) ? result.rss.channel.item : [result.rss.channel.item];
    }
    
    // Mapuj na naše produkty
    const products = items.map(item => ({
      client_id: req.clientId,
      name: item.PRODUCT_NAME || item.PRODUCTNAME || item.name || item.title || item.TITLE || '',
      description: item.DESCRIPTION || item.description || item.DETAIL || item.detail || '',
      price: parseFloat(item.PRICE || item.price || item.PRICE_VAT || 0) || null,
      category: item.CATEGORY || item.CATEGORYTEXT || item.category || '',
      url: item.URL || item.url || item.URL_PRODUCT || item.link || ''
    })).filter(p => p.name);
    
    if (products.length === 0) {
      return res.status(400).json({ error: 'No products found in XML' });
    }
    
    // Vlož produkty
    const { data, error } = await supabase
      .from('products')
      .insert(products)
      .select();
    
    if (error) throw error;
    
    res.json({ success: true, count: data.length });
  } catch (error) {
    console.error('XML Upload error:', error);
    res.status(500).json({ error: 'Failed to parse XML: ' + error.message });
  }
});

// ============================================
// EMAIL NOTIFICATIONS
// ============================================

async function sendLeadNotification(clientEmail, leadInfo, conversationId) {
  try {
    await resend.emails.send({
      from: 'Replai <onboarding@resend.dev>',
      to: clientEmail,
      subject: '🎯 Nový lead z chatu!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
          <h2 style="color: #7c3aed;">🎯 Nový lead!</h2>
          <p>Zákazník zanechal kontakt v chate:</p>
          <div style="background: #f8fafc; padding: 16px; border-radius: 12px; margin: 16px 0;">
            ${leadInfo.email ? `<p><strong>📧 Email:</strong> ${leadInfo.email}</p>` : ''}
            ${leadInfo.phone ? `<p><strong>📱 Telefón:</strong> ${leadInfo.phone}</p>` : ''}
          </div>
          <p style="color: #64748b; font-size: 14px;">
            Odpovedzte čo najskôr pre najlepšiu šancu na konverziu!
          </p>
        </div>
      `
    });
    console.log('Lead notification sent to:', clientEmail);
  } catch (error) {
    console.error('Failed to send lead notification:', error);
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function checkForContact(text) {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const phoneRegex = /(\+421|0)[0-9\s\-]{8,14}/g;
  
  const emails = text.match(emailRegex) || [];
  const phones = text.match(phoneRegex) || [];
  
  return {
    hasContact: emails.length > 0 || phones.length > 0,
    email: emails[0] || null,
    phone: phones[0]?.replace(/[\s\-]/g, '') || null
  };
}

// ============================================
// STATIC FILES (widget)
// ============================================

app.use('/static', express.static('public'));

// ============================================
// START SERVER
// ============================================

app.get('/health', (req, res) => {
  res.json({ status: 'online', timestamp: Date.now() });
});

app.listen(PORT, () => {
  console.log(`🚀 Replai backend running on port ${PORT}`);
});