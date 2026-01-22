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
import crypto from 'crypto';
import Stripe from 'stripe';

dotenv.config();

// Až tu, po dotenv.config()
const resend = new Resend(process.env.RESEND_API_KEY);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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

// Limity pre jednotlivé plány
const PLAN_LIMITS = {
  free: { messages: 50, products: 0 },
  starter: { messages: 500, products: 100 },
  pro: { messages: 2000, products: Infinity },
  business: { messages: Infinity, products: Infinity }
};

// Funkcia na kontrolu a reset mesačných správ
async function checkAndResetMonthlyMessages(clientId) {
  const { data: client } = await supabase
    .from('clients')
    .select('messages_this_month, messages_reset_at, subscription_tier')
    .eq('id', clientId)
    .single();
  
  if (!client) return null;
  
  const resetAt = new Date(client.messages_reset_at);
  const now = new Date();
  
  // Ak prešiel mesiac, resetuj počítadlo
  if (now.getMonth() !== resetAt.getMonth() || now.getFullYear() !== resetAt.getFullYear()) {
    await supabase
      .from('clients')
      .update({ messages_this_month: 0, messages_reset_at: now.toISOString() })
      .eq('id', clientId);
    return { ...client, messages_this_month: 0 };
  }
  
  return client;
}

// Middleware
app.use(cors());

// Stripe webhook - MUST be before express.json()
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const clientId = session.metadata.clientId;
    const plan = session.metadata.plan;
    const service = session.metadata.service;

    // Jednorázová služba (prompt na mieru)
    if (service === 'prompt_custom') {
      await resend.emails.send({
        from: 'Replai <noreply@replai.sk>',
        to: 'info@replai.sk',
        subject: '🎉 Nová objednávka: Prompt na mieru',
        html: `
          <h2>Nová objednávka služby!</h2>
          <p><strong>Služba:</strong> Prompt na mieru (20€)</p>
          <p><strong>Klient:</strong> ${session.metadata.clientName}</p>
          <p><strong>Email:</strong> ${session.metadata.clientEmail}</p>
          <p><strong>Web:</strong> ${session.metadata.clientWebsite || 'Neuvedené'}</p>
          <p><strong>Client ID:</strong> ${clientId}</p>
          <hr>
          <p>Kontaktuj klienta a vytvor mu prompt na mieru.</p>
        `
      });
      
      console.log(`✅ Objednávka prompt_custom od ${session.metadata.clientEmail}`);
      return res.json({ received: true });
    }

    // Predplatné
    if (plan) {
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 1);

      await supabase
        .from('clients')
        .update({
          subscription_tier: plan,
          subscription_expires_at: expiresAt.toISOString(),
          messages_this_month: 0
        })
        .eq('id', clientId);

      console.log(`✅ Aktivované ${plan} pre klienta ${clientId}`);
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    const clientId = subscription.metadata?.clientId;

    if (clientId) {
      await supabase
        .from('clients')
        .update({
          subscription_tier: 'free',
          subscription_expires_at: null
        })
        .eq('id', clientId);

      console.log(`⚠️ Zrušené predplatné pre klienta ${clientId}`);
    }
  }

  res.json({ received: true });
});

// JSON parsing - AFTER webhook
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

// POST /chat - Chat endpoint s VALIDÁCIOU (bez streamingu)
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

    // Skontroluj limit správ
    const clientData = await checkAndResetMonthlyMessages(client.id);
    const tier = clientData?.subscription_tier || 'free';
    const limit = PLAN_LIMITS[tier]?.messages || 10;

    if (clientData.messages_this_month >= limit) {
      return res.status(429).json({ 
        error: 'Dosiahli ste limit správ pre váš plán. Upgradujte na vyšší plán.',
        limit_reached: true 
      });
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
    
    // Aktuálny čas pre AI
    const now = new Date();
    const days = ['Nedeľa', 'Pondelok', 'Utorok', 'Streda', 'Štvrtok', 'Piatok', 'Sobota'];
    const currentDateTime = `\n\nAKTUÁLNY ČAS: ${days[now.getDay()]}, ${now.toLocaleDateString('sk-SK')} ${now.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' })}`;

    // Načítaj produkty pre AI
    let productsContext = '';
    let products = [];

   // Kľúčové slová na ignorovanie
const stopWords = ['máte', 'mate', 'chcem', 'hľadám', 'hladam', 'aké', 'ake', 'ako', 'pre', 'pri', 'a', 'je', 'to', 'na', 'do', 'sa', 'si', 'mi', 'ma', 'prosím', 'prosim', 'ďakujem', 'dakujem', 'chcel', 'by', 'som', 'bicykel', 'bike', 'model'];

// Mapovanie veľkostí kolies na Cube názvoslovie
const wheelSizeMap = {
  '12': '120',
  '14': '140',
  '16': '160',
  '18': '180',
  '20': '200',
  '24': '240',
  '26': '260'
};

// Mapovanie kategórií
const categoryKeywords = {
  'detský': 'Detské',
  'detske': 'Detské',
  'detských': 'Detské',
  'deti': 'Detské',
  'dieta': 'Detské',
  'dieťa': 'Detské',
  'syn': 'Detské',
  'dcéra': 'Detské',
  'dcera': 'Detské'
};

let searchWords = message.toLowerCase()
  .replace(/[''´`'\-]/g, ' ')
  .replace(/[?!.,]/g, '')
  .split(/\s+/)
  .filter(word => word.length > 1 && !stopWords.includes(word));

// Konvertuj veľkosti kolies (24 → 240)
searchWords = searchWords.map(word => {
  if (wheelSizeMap[word]) {
    console.log(`🔄 Konvertujem veľkosť: ${word}" → ${wheelSizeMap[word]}`);
    return wheelSizeMap[word];
  }
  return word;
});

// Zisti kategóriu z otázky
let categoryFilter = null;
for (const [keyword, category] of Object.entries(categoryKeywords)) {
  if (message.toLowerCase().includes(keyword)) {
    categoryFilter = category;
    console.log(`📁 Detekovaná kategória: ${categoryFilter}`);
    break;
  }
}

    if (searchWords.length > 0) {
      console.log('🔍 Search words:', searchWords);
      
      // Extrahuj cenu z otázky
      const maxPriceMatch = message.match(/do\s*(\d+)\s*€?/i);
      const minPriceMatch = message.match(/od\s*(\d+)\s*€?/i);
      const maxPrice = maxPriceMatch ? parseInt(maxPriceMatch[1]) : null;
      const minPrice = minPriceMatch ? parseInt(minPriceMatch[1]) : null;
      
      let query = supabase
      .from('products')
      .select('name, description, price, category, url')
      .eq('client_id', client.id);
    
    if (maxPrice) query = query.lte('price', maxPrice);
    if (minPrice) query = query.gte('price', minPrice);
    
    // Filtruj podľa kategórie ak bola detekovaná
    if (categoryFilter) {
      query = query.ilike('category', `%${categoryFilter}%`);
    }
      
      const { data: allProducts } = await query.limit(1000);
      
      if (allProducts && allProducts.length > 0) {
        // Filtruj produkty
        products = allProducts.filter(p => {
          const productName = p.name?.toLowerCase().replace(/[''´`'\-]/g, ' ') || '';
          const productCategory = p.category?.toLowerCase() || '';
          
          return searchWords.some(word => 
            productName.includes(word) || productCategory.includes(word)
          );
        });
        
        // Skóruj produkty - čísla majú VEĽMI vysokú váhu
        products = products.map(p => {
          const productName = p.name?.toLowerCase().replace(/[''´`'\-]/g, ' ') || '';
          let score = 0;
          
          searchWords.forEach(word => {
            if (productName.includes(word)) {
              // Čísla (200, 240, 260, 2026) majú 50x väčšiu váhu
              if (/^\d+$/.test(word)) {
                score += 50;
              } else {
                score += 1;
              }
            }
          });
          
          return { ...p, score };
        });
        
        // Zoraď podľa skóre (najvyššie prvé)
        products.sort((a, b) => b.score - a.score);
        products = products.slice(0, 10);
        
        console.log('✅ Found products:', products.map(p => ({ name: p.name, score: p.score })));
      }
    }

    // Ak sa nič nenašlo, skús načítať všetky produkty (pre malé katalógy)
    if (products.length === 0) {
      const { data, count } = await supabase
        .from('products')
        .select('name, description, price, category, url', { count: 'exact' })
        .eq('client_id', client.id)
        .limit(50);
      
      if (count && count <= 50) {
        products = data || [];
      }
    }

    // Vytvor kontext pre AI - STRIKTNÉ PRAVIDLÁ
    if (products.length > 0) {
      productsContext = `

███████████████████████████████████████████████████████
█ STOP! PREČÍTAJ TOTO PRED ODPOVEĎOU! █
███████████████████████████████████████████████████████

🔒 POVINNÉ PRAVIDLÁ PRE PRODUKTY:

TU SÚ JEDINÉ PRODUKTY KTORÉ MÔŽEŠ ODPORÚČAŤ:
`;
      products.forEach((p, i) => {
        productsContext += `
${i + 1}. NÁZOV: "${p.name}"
   CENA: ${p.price}€
   LINK: ${p.url}
`;
      });
      productsContext += `
███████████████████████████████████████████████████████
⛔ ZAKÁZANÉ:
- NIKDY nevymýšľaj produkty ktoré nie sú v zozname vyššie
- NIKDY neodhaduj ceny
- NIKDY nevymýšľaj linky

✅ POVINNÉ:
- Používaj PRESNE názvy produktov zo zoznamu
- Používaj PRESNÉ ceny zo zoznamu  
- Používaj PRESNÉ linky zo zoznamu
- Formát: [pozrieť](PRESNÝ_LINK_ZO_ZOZNAMU)

Ak zákazník hľadá produkt ktorý NIE JE v zozname:
→ Povedz že tento konkrétny model momentálne nemáme v ponuke
→ Ponúkni alternatívy ZO ZOZNAMU VYŠŠIE (ak sú relevantné)
→ Odporuč kontaktovať predajňu pre overenie dostupnosti
███████████████████████████████████████████████████████
`;
    } else {
      productsContext = `

███████████████████████████████████████████████████████
NENAŠLI SA PRODUKTY PRE TÚTO OTÁZKU.

⛔ NIKDY nevymýšľaj produkty, ceny ani linky!

Namiesto toho:
- Opýtaj sa zákazníka na konkrétnejší typ produktu
- Alebo odporuč kontaktovať predajňu
███████████████████████████████████████████████████████
`;
    }

    const systemPrompt = (client.system_prompt || 'Si priateľský zákaznícky asistent.') + currentDateTime + productsContext;

    // === VALIDOVANÁ ODPOVEĎ (bez streamingu) ===
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages
      });

      let fullResponse = response.content[0].text;
      const inputTokens = response.usage?.input_tokens || 0;
      const outputTokens = response.usage?.output_tokens || 0;

      // === VALIDÁCIA LINKOV - ODSTRÁŇ FALOŠNÉ ===
      const validUrls = products.map(p => p.url).filter(Boolean);
      const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;
      let match;
      const originalResponse = fullResponse;

      while ((match = linkRegex.exec(originalResponse)) !== null) {
        const linkText = match[1];
        const linkUrl = match[2];
        
        // Ak URL nie je v databáze produktov, odstráň link (nechaj len text)
        if (validUrls.length > 0 && !validUrls.includes(linkUrl)) {
          console.log('⚠️ Odstránený falošný link:', linkUrl);
          fullResponse = fullResponse.replace(match[0], linkText);
        }
      }

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

      // Skontroluj či správa obsahuje kontakt
      const contactInfo = checkForContact(message);
      if (contactInfo.hasContact) {
        const updates = { has_contact: true };
        if (contactInfo.email) updates.visitor_email = contactInfo.email;
        if (contactInfo.phone) updates.visitor_phone = contactInfo.phone;
        
        await supabase
          .from('conversations')
          .update(updates)
          .eq('id', conversationId);
        
        // Pošli email notifikáciu
        const { data: clientEmailData } = await supabase
          .from('clients')
          .select('email')
          .eq('id', client.id)
          .single();
        
        if (clientEmailData?.email) {
          sendLeadNotification(clientEmailData.email, contactInfo, conversationId);
        }
      }

      // Pripočítaj správu k mesačnému limitu
      await supabase
        .from('clients')
        .update({ messages_this_month: clientData.messages_this_month + 1 })
        .eq('id', client.id);

      // Pošli validovanú odpoveď
      res.json({ 
        text: fullResponse,
        done: true 
      });

    } catch (aiError) {
      console.error('AI Error:', aiError);
      res.status(500).json({ error: 'Chyba pri generovaní odpovede' });
    }
    
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
        website_url: websiteUrl,
        email_verified: false
      })
      .select('id, name, email')
      .single();
    
    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Email already exists' });
      }
      throw error;
    }
    
    // Vygeneruj verifikačný token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hodín
    
    await supabase.from('email_verifications').insert({
      client_id: client.id,
      token: token,
      expires_at: expiresAt.toISOString()
    });
    
    // Pošli verifikačný email
    const verifyUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
    
    await resend.emails.send({
      from: 'Replai <noreply@replai.sk>',
      to: email,
      subject: '✉️ Potvrďte váš email - Replai',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
          <h2 style="color: #7c3aed;">✉️ Potvrďte váš email</h2>
          <p>Ahoj ${name},</p>
          <p>Ďakujeme za registráciu v Replai! Pre aktiváciu účtu potvrďte váš email:</p>
          <a href="${verifyUrl}" style="display: inline-block; background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 16px 0;">
            Potvrdiť email
          </a>
          <p style="color: #64748b; font-size: 14px;">Link je platný 24 hodín.</p>
        </div>
      `
    });
    
    res.json({ 
      success: true, 
      message: 'Registration successful. Please check your email to verify your account.',
      requiresVerification: true
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /auth/verify-email - Overenie emailu
app.post('/auth/verify-email', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'Token required' });
    }
    
    // Nájdi platný token
    const { data: verification } = await supabase
      .from('email_verifications')
      .select('id, client_id, expires_at')
      .eq('token', token)
      .single();
    
    if (!verification) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }
    
    if (new Date(verification.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Token expired' });
    }
    
    // Aktivuj účet
    await supabase
      .from('clients')
      .update({ email_verified: true, is_active: true })
      .eq('id', verification.client_id);
    
    // Vymaž použitý token
    await supabase
      .from('email_verifications')
      .delete()
      .eq('id', verification.id);
    
    res.json({ success: true, message: 'Email verified successfully' });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /auth/login - Prihlásenie klienta
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const { data: client, error } = await supabase
    .from('clients')
    .select('id, name, email, api_key, password_hash, system_prompt, widget_settings, website_url, email_verified')
    .eq('email', email)
    .single();
    
    if (error || !client) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const validPassword = await bcrypt.compare(password, client.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    // Skontroluj či je email overený
if (!client.email_verified) {
  return res.status(401).json({ error: 'Please verify your email first' });
}

    const token = jwt.sign({ clientId: client.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    
    delete client.password_hash;
    res.json({ client, token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /auth/forgot-password - Žiadosť o reset hesla
app.post('/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }
    
    // Nájdi klienta
    const { data: client } = await supabase
      .from('clients')
      .select('id, email, name')
      .eq('email', email)
      .single();
    
    // Vždy vráť success (bezpečnosť - neprezradiť či email existuje)
    if (!client) {
      return res.json({ success: true });
    }
    
    // Vygeneruj token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hodina
    
    // Ulož token
    await supabase.from('password_resets').insert({
      client_id: client.id,
      token: token,
      expires_at: expiresAt.toISOString()
    });
    
    // Pošli email
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    
    await resend.emails.send({
      from: 'Replai <noreply@replai.sk>',
      to: client.email,
      subject: '🔐 Reset hesla - Replai',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
          <h2 style="color: #7c3aed;">🔐 Reset hesla</h2>
          <p>Ahoj ${client.name || ''},</p>
          <p>Dostali sme žiadosť o reset hesla pre tvoj účet.</p>
          <p>Klikni na tlačidlo nižšie pre nastavenie nového hesla:</p>
          <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 16px 0;">
            Resetovať heslo
          </a>
          <p style="color: #64748b; font-size: 14px;">Link je platný 1 hodinu.</p>
          <p style="color: #64748b; font-size: 14px;">Ak si nežiadal o reset hesla, tento email ignoruj.</p>
        </div>
      `
    });
    
    console.log('Password reset email sent to:', client.email);
    res.json({ success: true });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /auth/reset-password - Nastavenie nového hesla
app.post('/auth/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    
    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    // Nájdi platný token
    const { data: resetRecord } = await supabase
      .from('password_resets')
      .select('id, client_id, expires_at, used')
      .eq('token', token)
      .single();
    
    if (!resetRecord) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }
    
    if (resetRecord.used) {
      return res.status(400).json({ error: 'Token already used' });
    }
    
    if (new Date(resetRecord.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Token expired' });
    }
    
    // Aktualizuj heslo
    const passwordHash = await bcrypt.hash(password, 10);
    
    await supabase
      .from('clients')
      .update({ password_hash: passwordHash })
      .eq('id', resetRecord.client_id);
    
    // Označ token ako použitý
    await supabase
      .from('password_resets')
      .update({ used: true })
      .eq('id', resetRecord.id);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Reset password error:', error);
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

// Admin middleware - len pre admina
const adminMiddleware = async (req, res, next) => {
  try {
    const { data: client } = await supabase
      .from('clients')
      .select('is_admin')
      .eq('id', req.clientId)
      .single();
    
    if (!client?.is_admin) {
      return res.status(403).json({ error: 'Prístup zamietnutý' });
    }
    
    next();
  } catch (error) {
    res.status(403).json({ error: 'Prístup zamietnutý' });
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
    // Supabase má limit 1000, musíme načítať vo viacerých dávkach
    let allProducts = [];
    let from = 0;
    const batchSize = 1000;
    
    while (true) {
      const { data: batch } = await supabase
        .from('products')
        .select('*')
        .eq('client_id', req.clientId)
        .order('created_at', { ascending: false })
        .range(from, from + batchSize - 1);
      
      if (!batch || batch.length === 0) break;
      
      allProducts = [...allProducts, ...batch];
      
      if (batch.length < batchSize) break;
      from += batchSize;
    }
    
    res.json(allProducts);
  } catch (error) {
    console.error('Products error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /admin/products/upload - Upload produktov z CSV
app.post('/admin/products/upload', authMiddleware, async (req, res) => {
  try {
    const { products } = req.body;
    // Skontroluj limit produktov
const { data: clientData } = await supabase
.from('clients')
.select('subscription_tier')
.eq('id', req.clientId)
.single();

const tier = clientData?.subscription_tier || 'free';
const productLimit = PLAN_LIMITS[tier]?.products || 0;

if (productLimit === 0) {
return res.status(403).json({ error: 'FREE plán neumožňuje nahrávať produkty. Upgradujte na STARTER.' });
}

// Skontroluj aktuálny počet produktov
const { count } = await supabase
.from('products')
.select('*', { count: 'exact', head: true })
.eq('client_id', req.clientId);

if (count + products.length > productLimit && productLimit !== Infinity) {
return res.status(403).json({ error: `Limit produktov pre váš plán je ${productLimit}. Máte ${count} produktov.` });
}
    
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
    // Skontroluj limit produktov
const { data: clientData } = await supabase
.from('clients')
.select('subscription_tier')
.eq('id', req.clientId)
.single();

const tier = clientData?.subscription_tier || 'free';
const productLimit = PLAN_LIMITS[tier]?.products || 0;

if (productLimit === 0) {
return res.status(403).json({ error: 'FREE plán neumožňuje nahrávať produkty. Upgradujte na STARTER.' });
}
    
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
let isGoogleFeed = false;

if (result.SHOP?.SHOPITEM) {
  // Heureka formát (veľké)
  items = Array.isArray(result.SHOP.SHOPITEM) ? result.SHOP.SHOPITEM : [result.SHOP.SHOPITEM];
} else if (result.shop?.shopitem) {
  // Heureka formát (malé)
  items = Array.isArray(result.shop.shopitem) ? result.shop.shopitem : [result.shop.shopitem];
} else if (result.products?.product) {
  // Generic products formát
  items = Array.isArray(result.products.product) ? result.products.product : [result.products.product];
} else if (result.rss?.channel?.item) {
  // Google Merchant / RSS formát
  items = Array.isArray(result.rss.channel.item) ? result.rss.channel.item : [result.rss.channel.item];
  isGoogleFeed = true;
} else if (result.feed?.entry) {
  // Atom feed formát
  items = Array.isArray(result.feed.entry) ? result.feed.entry : [result.feed.entry];
  isGoogleFeed = true;
}
    
   // Mapuj na naše produkty
const products = items.map(item => {
  // Google Merchant feed používa g: namespace
  const gTitle = item['g:title'] || item['g:title']?.[0] || item['g:title']?._ || '';
  const gDesc = item['g:description'] || item['g:description']?.[0] || item['g:description']?._ || '';
  const gPrice = item['g:price'] || item['g:price']?.[0] || item['g:price']?._ || '';
  const gLink = item['g:link'] || item['g:link']?.[0] || item['g:link']?._ || '';
  const gCategory = item['g:product_type'] || item['g:product_type']?.[0] || item['g:google_product_category'] || '';

  // Extrahuj cenu z Google formátu "19.99 EUR" alebo "19.99"
  let price = null;
  const priceStr = gPrice || item.PRICE || item.price || item.PRICE_VAT || '';
  const priceMatch = priceStr.toString().match(/[\d.]+/);
  if (priceMatch) {
    price = parseFloat(priceMatch[0]);
  }

  return {
    client_id: req.clientId,
    name: gTitle || item.PRODUCT_NAME || item.PRODUCTNAME || item.name || item.title || item.TITLE || '',
    description: gDesc || item.DESCRIPTION || item.description || item.DETAIL || item.detail || '',
    price: price,
    category: gCategory || item.CATEGORY || item.CATEGORYTEXT || item.category || '',
    url: gLink || item.URL || item.url || item.URL_PRODUCT || item.link || ''
  };
}).filter(p => p.name);
    
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
      from: 'Replai <noreply@replai.sk>',
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
// ANALYTICS ENDPOINTS
// ============================================

// GET /admin/analytics - Štatistiky konverzácií
app.get('/admin/analytics', authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(todayStart);
    monthStart.setDate(monthStart.getDate() - 30);

    // Celkové štatistiky
    const { data: allConversations } = await supabase
      .from('conversations')
      .select('id, has_contact, created_at')
      .eq('client_id', req.clientId);

    const total = allConversations?.length || 0;
    const totalLeads = allConversations?.filter(c => c.has_contact).length || 0;
    
    const weekConversations = allConversations?.filter(c => new Date(c.created_at) >= weekStart) || [];
    const monthConversations = allConversations?.filter(c => new Date(c.created_at) >= monthStart) || [];
    
    const weekTotal = weekConversations.length;
    const weekLeads = weekConversations.filter(c => c.has_contact).length;
    
    const monthTotal = monthConversations.length;
    const monthLeads = monthConversations.filter(c => c.has_contact).length;

    // Konverzný pomer
    const conversionRate = total > 0 ? Math.round((totalLeads / total) * 100) : 0;
    const weekConversionRate = weekTotal > 0 ? Math.round((weekLeads / weekTotal) * 100) : 0;
    const monthConversionRate = monthTotal > 0 ? Math.round((monthLeads / monthTotal) * 100) : 0;

    // Graf - posledných 30 dní
    const dailyData = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date(todayStart);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayConversations = allConversations?.filter(c => {
        const convDate = new Date(c.created_at).toISOString().split('T')[0];
        return convDate === dateStr;
      }) || [];
      
      dailyData.push({
        date: dateStr,
        label: `${date.getDate()}.${date.getMonth() + 1}`,
        conversations: dayConversations.length,
        leads: dayConversations.filter(c => c.has_contact).length
      });
    }

    // Najaktívnejšie hodiny
    const hourlyStats = Array(24).fill(0);
    allConversations?.forEach(c => {
      const hour = new Date(c.created_at).getHours();
      hourlyStats[hour]++;
    });
    
    const hourlyData = hourlyStats.map((count, hour) => ({
      hour: `${hour}:00`,
      count
    }));

    // Najčastejšie otázky (prvé správy z konverzácií TOHTO klienta)
const conversationIds = allConversations?.map(c => c.id) || [];

let messages = [];
if (conversationIds.length > 0) {
  const { data: msgs } = await supabase
    .from('messages')
    .select('content, conversation_id')
    .eq('role', 'user')
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: true });
  messages = msgs || [];
}

   // Získaj len prvé správy z každej konverzácie
const firstMessages = {};
messages.forEach(m => {
      if (!firstMessages[m.conversation_id]) {
        firstMessages[m.conversation_id] = m.content;
      }
    });

    // Spočítaj podobné otázky (jednoduchá verzia)
    const questionCounts = {};
    Object.values(firstMessages).forEach(content => {
      const normalized = content.toLowerCase().substring(0, 50);
      questionCounts[normalized] = (questionCounts[normalized] || 0) + 1;
    });

    const topQuestions = Object.entries(questionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([question, count]) => ({ question, count }));

    res.json({
      overview: {
        total,
        totalLeads,
        conversionRate,
        week: { total: weekTotal, leads: weekLeads, conversionRate: weekConversionRate },
        month: { total: monthTotal, leads: monthLeads, conversionRate: monthConversionRate }
      },
      dailyData,
      hourlyData,
      topQuestions
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

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
// CONTACT FORM ENDPOINT
// ============================================

app.post('/contact', async (req, res) => {
  try {
    const { name, email, company, phone, message } = req.body;
    
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Meno, email a správa sú povinné' });
    }
    
    // Pošli email na tvoju adresu
    await resend.emails.send({
      from: 'Replai <noreply@replai.sk>',
      to: 'info@replai.sk', // Sem daj svoj reálny email
      subject: `📬 Nová správa z kontaktného formulára - ${name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #7c3aed;">📬 Nová správa z webu</h2>
          <div style="background: #f8fafc; padding: 20px; border-radius: 12px; margin: 16px 0;">
            <p><strong>👤 Meno:</strong> ${name}</p>
            <p><strong>📧 Email:</strong> ${email}</p>
            ${company ? `<p><strong>🏢 Firma:</strong> ${company}</p>` : ''}
            ${phone ? `<p><strong>📱 Telefón:</strong> ${phone}</p>` : ''}
          </div>
          <div style="background: white; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <p><strong>💬 Správa:</strong></p>
            <p style="white-space: pre-wrap;">${message}</p>
          </div>
        </div>
      `
    });
    
    // Pošli potvrdenie zákazníkovi
    await resend.emails.send({
      from: 'Replai <noreply@replai.sk>',
      to: email,
      subject: '✅ Prijali sme vašu správu - Replai',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
          <h2 style="color: #7c3aed;">✅ Ďakujeme za správu!</h2>
          <p>Ahoj ${name},</p>
          <p>Prijali sme tvoju správu a ozveme sa ti čo najskôr, zvyčajne do 24 hodín.</p>
          <p style="color: #64748b; font-size: 14px; margin-top: 24px;">S pozdravom,<br>Tím Replai</p>
        </div>
      `
    });
    
    console.log('Contact form submitted by:', email);
    res.json({ success: true });
  } catch (error) {
    console.error('Contact form error:', error);
    res.status(500).json({ error: 'Nepodarilo sa odoslať správu' });
  }
});

// GET /admin/subscription - Stav predplatného
app.get('/admin/subscription', authMiddleware, async (req, res) => {
  try {
    const client = await checkAndResetMonthlyMessages(req.clientId);
    
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    const tier = client.subscription_tier || 'free';
    const limit = PLAN_LIMITS[tier]?.messages || 10;
    const used = client.messages_this_month || 0;
    const remaining = Math.max(0, limit - used);
    const percentage = limit === Infinity ? 0 : Math.round((used / limit) * 100);
    
    res.json({
      tier,
      messagesUsed: used,
      messagesLimit: limit === Infinity ? 'Neobmedzené' : limit,
      messagesRemaining: limit === Infinity ? 'Neobmedzené' : remaining,
      percentage,
      isLimitReached: limit !== Infinity && used >= limit
    });
  } catch (error) {
    console.error('Subscription error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /auth/me - Get current user from token
app.get('/auth/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const { data: client, error } = await supabase
      .from('clients')
      .select('id, name, email, api_key, system_prompt, widget_settings, website_url, email_verified')
      .eq('id', decoded.clientId)
      .single();
    
    if (error || !client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    res.json(client);
  } catch (error) {
    console.error('Auth me error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

// ============================================
// STRIPE PAYMENTS
// ============================================

const STRIPE_PRICES = {
  starter: 'price_1So4AeC6Xvli9PAWGfRkaBHP',
  pro: 'price_1So4AvC6Xvli9PAW339ZbCp5',
  prompt_custom: 'price_1Sp4nhC6Xvli9PAWc8WSJGqK'
};

// POST /create-checkout-session - Vytvorí Stripe checkout
app.post('/create-checkout-session', authMiddleware, async (req, res) => {
  try {
    const { plan } = req.body;
    
    if (!STRIPE_PRICES[plan]) {
      return res.status(400).json({ error: 'Neplatný plán' });
    }
    
    // Získaj klienta
    const { data: client } = await supabase
      .from('clients')
      .select('id, email, name')
      .eq('id', req.clientId)
      .single();
    
    if (!client) {
      return res.status(404).json({ error: 'Klient nenájdený' });
    }
    
    // Vytvor Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer_email: client.email,
      line_items: [{
        price: STRIPE_PRICES[plan],
        quantity: 1
      }],
      metadata: {
        clientId: client.id,
        plan: plan
      },
      success_url: `${process.env.FRONTEND_URL}/settings?payment=success`,
      cancel_url: `${process.env.FRONTEND_URL}/settings?payment=cancelled`
    });
    
    res.json({ url: session.url });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    res.status(500).json({ error: 'Nepodarilo sa vytvoriť platbu' });
  }
});

// GET /admin/billing - Získaj billing info
app.get('/admin/billing', authMiddleware, async (req, res) => {
  try {
    const { data: client } = await supabase
      .from('clients')
      .select('subscription_tier, subscription_expires_at')
      .eq('id', req.clientId)
      .single();
    
    res.json({
      tier: client?.subscription_tier || 'free',
      expiresAt: client?.subscription_expires_at
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /admin/profile - Update client profile
app.put('/admin/profile', authMiddleware, async (req, res) => {
  try {
    const { name, email, website_url } = req.body;
    
    const { data, error } = await supabase
      .from('clients')
      .update({ 
        name, 
        email, 
        website_url,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.clientId)
      .select()
      .single();
    
    if (error) throw error;
    
    res.json(data);
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Nepodarilo sa uložiť profil' });
  }
});

// POST /create-service-checkout - Jednorázová platba za služby
app.post('/create-service-checkout', authMiddleware, async (req, res) => {
  try {
    const { service } = req.body;
    
    const servicePrices = {
      prompt_custom: 'price_1Sp6L9C6Xvli9PAWxdbAx2HR'
    };
    
    if (!servicePrices[service]) {
      return res.status(400).json({ error: 'Neplatná služba' });
    }
    
    const { data: client } = await supabase
      .from('clients')
      .select('id, email, name, website_url')
      .eq('id', req.clientId)
      .single();
    
    if (!client) {
      return res.status(404).json({ error: 'Klient nenájdený' });
    }
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: client.email,
      line_items: [{
        price: servicePrices[service],
        quantity: 1
      }],
      metadata: {
        clientId: client.id,
        clientEmail: client.email,
        clientName: client.name,
        clientWebsite: client.website_url,
        service: service
      },
      success_url: `${process.env.FRONTEND_URL}/settings?service=success`,
      cancel_url: `${process.env.FRONTEND_URL}/settings?service=cancelled`
    });
    
    res.json({ url: session.url });
  } catch (error) {
    console.error('Service checkout error:', error);
    res.status(500).json({ error: 'Nepodarilo sa vytvoriť platbu' });
  }
});

// ============================================
// SUPER ADMIN ENDPOINTS
// ============================================

// GET /superadmin/stats - Celkové štatistiky
app.get('/superadmin/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { data: clients } = await supabase
      .from('clients')
      .select('id, subscription_tier, created_at');
    
    const { data: conversations } = await supabase
      .from('conversations')
      .select('id, created_at');
    
    const stats = {
      totalClients: clients?.length || 0,
      freeClients: clients?.filter(c => c.subscription_tier === 'free').length || 0,
      starterClients: clients?.filter(c => c.subscription_tier === 'starter').length || 0,
      proClients: clients?.filter(c => c.subscription_tier === 'pro').length || 0,
      businessClients: clients?.filter(c => c.subscription_tier === 'business').length || 0,
      totalConversations: conversations?.length || 0,
      monthlyRevenue: (clients?.filter(c => c.subscription_tier === 'starter').length || 0) * 29 + 
                      (clients?.filter(c => c.subscription_tier === 'pro').length || 0) * 59
    };
    
    res.json(stats);
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /superadmin/clients - Zoznam všetkých klientov
app.get('/superadmin/clients', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { data: clients, error } = await supabase
      .from('clients')
      .select('id, name, email, website_url, subscription_tier, messages_this_month, created_at, email_verified')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    res.json(clients);
  } catch (error) {
    console.error('Admin clients error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /superadmin/clients/:id - Upraviť klienta (plán atď.)
app.put('/superadmin/clients/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { subscription_tier, is_admin } = req.body;
    
    const updateData = {};
    if (subscription_tier) updateData.subscription_tier = subscription_tier;
    if (typeof is_admin === 'boolean') updateData.is_admin = is_admin;
    
    const { data, error } = await supabase
      .from('clients')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    res.json(data);
  } catch (error) {
    console.error('Admin update client error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /superadmin/clients/:id - Zmazať klienta
app.delete('/superadmin/clients/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Zmaž všetky súvisiace dáta
    await supabase.from('messages').delete().eq('client_id', id);
    await supabase.from('conversations').delete().eq('client_id', id);
    await supabase.from('products').delete().eq('client_id', id);
    await supabase.from('clients').delete().eq('id', id);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Admin delete client error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// PROMO CODES ENDPOINTS
// ============================================

// GET /superadmin/promo-codes - Zoznam všetkých kódov
app.get('/superadmin/promo-codes', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { data: codes } = await supabase
      .from('promo_codes')
      .select('*')
      .order('created_at', { ascending: false });
    
    // Pridaj počet použití ku každému kódu
    const codesWithUsage = await Promise.all((codes || []).map(async (code) => {
      const { count } = await supabase
        .from('promo_code_uses')
        .select('*', { count: 'exact', head: true })
        .eq('promo_code_id', code.id);
      
      return { ...code, uses_count: count || 0 };
    }));
    
    res.json(codesWithUsage);
  } catch (error) {
    console.error('Promo codes error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /superadmin/promo-codes - Vytvoriť nový kód
app.post('/superadmin/promo-codes', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { code, description, reward_type, reward_value, reward_plan, max_uses, valid_until } = req.body;
    
    if (!code || !reward_type || !reward_value) {
      return res.status(400).json({ error: 'Kód, typ odmeny a hodnota sú povinné' });
    }
    
    const { data, error } = await supabase
      .from('promo_codes')
      .insert({
        code: code.toUpperCase(),
        description,
        reward_type,
        reward_value,
        reward_plan: reward_plan || 'business',
        max_uses: max_uses || null,
        valid_until: valid_until || null
      })
      .select()
      .single();
    
    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Kód už existuje' });
      }
      throw error;
    }
    
    res.json(data);
  } catch (error) {
    console.error('Create promo code error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /superadmin/promo-codes/:id - Upraviť kód
app.put('/superadmin/promo-codes/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active, description, max_uses, valid_until } = req.body;
    
    const updateData = {};
    if (typeof is_active === 'boolean') updateData.is_active = is_active;
    if (description !== undefined) updateData.description = description;
    if (max_uses !== undefined) updateData.max_uses = max_uses;
    if (valid_until !== undefined) updateData.valid_until = valid_until;
    
    const { data, error } = await supabase
      .from('promo_codes')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    res.json(data);
  } catch (error) {
    console.error('Update promo code error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /superadmin/promo-codes/:id - Zmazať kód
app.delete('/superadmin/promo-codes/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    await supabase
      .from('promo_code_uses')
      .delete()
      .eq('promo_code_id', id);
    
    await supabase
      .from('promo_codes')
      .delete()
      .eq('id', id);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete promo code error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /superadmin/promo-codes/:id/uses - Kto použil kód
app.get('/superadmin/promo-codes/:id/uses', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data: uses } = await supabase
      .from('promo_code_uses')
      .select(`
        id,
        client_email,
        used_at,
        clients (name, email)
      `)
      .eq('promo_code_id', id)
      .order('used_at', { ascending: false });
    
    res.json(uses || []);
  } catch (error) {
    console.error('Promo code uses error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /promo/apply - Použiť promo kód (pre prihláseného zákazníka)
app.post('/promo/apply', authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Zadajte promo kód' });
    }
    
    // Nájdi kód
    const { data: promoCode } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('code', code.toUpperCase())
      .eq('is_active', true)
      .single();
    
    if (!promoCode) {
      return res.status(400).json({ error: 'Neplatný promo kód' });
    }
    
    // Skontroluj platnosť
    if (promoCode.valid_until && new Date(promoCode.valid_until) < new Date()) {
      return res.status(400).json({ error: 'Promo kód vypršal' });
    }
    
    // Skontroluj max použití
    if (promoCode.max_uses) {
      const { count } = await supabase
        .from('promo_code_uses')
        .select('*', { count: 'exact', head: true })
        .eq('promo_code_id', promoCode.id);
      
      if (count >= promoCode.max_uses) {
        return res.status(400).json({ error: 'Promo kód bol už vyčerpaný' });
      }
    }
    
    // Získaj email klienta
    const { data: client } = await supabase
      .from('clients')
      .select('email')
      .eq('id', req.clientId)
      .single();
    
    // Skontroluj či tento email už nepoužil kód
    const { data: existingUse } = await supabase
      .from('promo_code_uses')
      .select('id')
      .eq('promo_code_id', promoCode.id)
      .eq('client_email', client.email)
      .single();
    
    if (existingUse) {
      return res.status(400).json({ error: 'Tento kód ste už použili' });
    }
    
    // Aplikuj odmenu
    if (promoCode.reward_type === 'free_days') {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + promoCode.reward_value);
      
      await supabase
        .from('clients')
        .update({
          subscription_tier: promoCode.reward_plan,
          subscription_expires_at: expiresAt.toISOString(),
          messages_this_month: 0
        })
        .eq('id', req.clientId);
    }
    
    // Zaznamenaj použitie
    await supabase
      .from('promo_code_uses')
      .insert({
        promo_code_id: promoCode.id,
        client_id: req.clientId,
        client_email: client.email
      });
    
    res.json({ 
      success: true, 
      message: `Promo kód aktivovaný! Máte ${promoCode.reward_value} dní ${promoCode.reward_plan} plánu zadarmo.`,
      reward_type: promoCode.reward_type,
      reward_value: promoCode.reward_value,
      reward_plan: promoCode.reward_plan
    });
  } catch (error) {
    console.error('Apply promo code error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// START SERVER
// ============================================

app.get('/health', (req, res) => {
  res.json({ status: 'online', timestamp: Date.now() });
});

app.listen(PORT, () => {
  console.log(`🚀 Replai backend running on port ${PORT}`);
});