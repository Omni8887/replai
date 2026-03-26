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

// BOOKING TOOLS DEFINÍCIA
const BOOKING_TOOLS = [
  {
    name: "get_booking_locations",
    description: "Získa zoznam prevádzok s ich ID. VŽDY zavolaj ako prvé keď zákazník chce servis. Vráti location_id ktoré potrebuješ pre ďalšie nástroje.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "get_booking_services", 
    description: "Získa zoznam servisných služieb s cenami pre danú prevádzku. Zavolaj po tom čo zákazník vyberie prevádzku.",
    input_schema: { 
      type: "object", 
      properties: { 
        location_id: { type: "string", description: "UUID prevádzky z get_booking_locations" } 
      }, 
      required: ["location_id"] 
    }
  },
  {
    name: "get_available_days",
    description: "Získa zoznam dostupných dní pre rezerváciu. Vráti dátumy vo formáte YYYY-MM-DD.",
    input_schema: { 
      type: "object", 
      properties: { 
        location_id: { type: "string", description: "UUID prevádzky" } 
      }, 
      required: ["location_id"] 
    }
  },
  {
    name: "get_available_slots",
    description: "KRITICKÉ: Získa voľné časové sloty pre konkrétny deň. VŽDY zavolaj tento nástroj keď zákazník spomenie konkrétny dátum alebo deň (napr. 'zajtra', 'utorok', '18.2.'). Parameter date MUSÍ byť vo formáte YYYY-MM-DD.",
    input_schema: { 
      type: "object", 
      properties: { 
        location_id: { type: "string", description: "UUID prevádzky" },
        date: { type: "string", description: "Dátum vo formáte YYYY-MM-DD (napr. 2026-02-18)" }
      }, 
      required: ["location_id", "date"] 
    }
  },
  {
    name: "create_booking",
    description: "Vytvorí rezerváciu servisu. Zavolaj AŽ keď máš všetky údaje: location_id, service_id, date, time a kontaktné údaje zákazníka.",
    input_schema: { 
      type: "object", 
      properties: { 
        location_id: { type: "string", description: "UUID prevádzky" },
        service_id: { type: "string", description: "UUID služby z get_booking_services" },
        date: { type: "string", description: "Dátum vo formáte YYYY-MM-DD" },
        time: { type: "string", description: "Čas vo formáte HH:MM (napr. 10:00)" },
        customer_name: { type: "string", description: "Meno zákazníka" },
        customer_email: { type: "string", description: "Email zákazníka" },
        customer_phone: { type: "string", description: "Telefón zákazníka" },
        note: { type: "string", description: "Poznámka (voliteľné)" }
      }, 
      required: ["location_id", "service_id", "date", "time", "customer_name", "customer_email", "customer_phone"] 
    }
  }
];
// Detekcia či správa súvisí s bookingom
function isBookingRelated(message, context = []) {
  const bookingKeywords = [
    'servis', 'objedna', 'rezerv', 'termin', 'oprav', 
    'prehliadka', 'udrzba', 'kontrola', 'nastavenie',
    'prevadzk', 'otvarac', 'kedy', 'volny', 'cas',
    'hodina', 'prines', 'donies', 'bicykel',
    'pondelok', 'utorok', 'streda', 'stvrtok', 'piatok', 'sobota', 'nedela',
    'zajtra', 'dnes', 'buduci', 'tento tyzden', 'rano', 'poobede',
    'ano', 'hej', 'jasne', 'ok', 'dobre', 'super', 'fajn',
    'tri veze', 'sport mall', 'bajkalska', 'vajnorska'
  ];
  
  const msgLower = message.toLowerCase();
  
  // Kontroluj aktuálnu správu
  if (bookingKeywords.some(kw => msgLower.includes(kw))) {
    return true;
  }
  
  // Kontroluj či predchádzajúca ASSISTANT správa bola o bookingu
  if (context.length > 0) {
    const lastAssistant = [...context].reverse().find(m => m.role === 'assistant');
    if (lastAssistant) {
      const assistantMsg = lastAssistant.content.toLowerCase();
      const bookingIndicators = ['prevádzk', 'servis', 'termín', 'rezerv', 'ktorá', 'kedy', 'vyhovoval'];
      if (bookingIndicators.some(kw => assistantMsg.includes(kw))) {
        return true;
      }
    }
  }
  
  return false;
}

// BOOKING TOOL HANDLER
async function handleBookingTool(toolName, toolInput, clientId) {
  console.log(`🔧 Booking tool: ${toolName}`, JSON.stringify(toolInput));
  
  switch (toolName) {
    case 'get_booking_locations': {
      const { data } = await supabase
        .from('booking_locations')
        .select('id, name, address')
        .eq('client_id', clientId)
        .eq('is_active', true)
        .order('name');
      
      if (!data || data.length === 0) {
        return { message: 'Momentálne nie sú dostupné žiadne prevádzky.' };
      }
      return { locations: data };
    }
    
    case 'get_booking_services': {
      // Najprv zisti client_id z location
      const { data: location } = await supabase
        .from('booking_locations')
        .select('client_id')
        .eq('id', toolInput.location_id)
        .single();
      
      if (!location) {
        return { message: 'Prevádzka nebola nájdená.' };
      }
      
      const { data } = await supabase
        .from('booking_services')
        .select('id, name, description, duration_minutes, price')
        .eq('client_id', location.client_id)
        .eq('is_active', true)
        .order('price');
      
      if (!data || data.length === 0) {
        return { message: 'Pre túto prevádzku nie sú dostupné služby.' };
      }
      return { services: data };
    }
    
    case 'get_available_days': {
      const { data: settings } = await supabase
        .from('booking_settings')
        .select('*')
        .eq('client_id', clientId)
        .maybeSingle();
      
      const minAdvanceHours = settings?.min_advance_hours || 24;
      const maxAdvanceDays = settings?.max_advance_days || 30;
      
      const { data: hours } = await supabase
        .from('booking_working_hours')
        .select('*')
        .eq('location_id', toolInput.location_id);
      
      const openDays = new Set((hours || []).filter(h => !h.is_closed).map(h => h.day_of_week));
      
      // Získaj kapacitu prevádzky
      const { data: locData } = await supabase
        .from('booking_locations')
        .select('daily_capacity')
        .eq('id', toolInput.location_id)
        .single();
      const maxPerDay = locData?.daily_capacity || 2;

      // Získaj blokované dni
      const { data: blocked } = await supabase
        .from('booking_blocked_slots')
        .select('blocked_date')
        .eq('location_id', toolInput.location_id);
      const blockedDates = new Set((blocked || []).map(b => new Date(b.blocked_date).toISOString().split('T')[0]));

      // Získaj existujúce rezervácie na najbližších 30 dní
      const now = new Date();
      const endDate = new Date(now);
      endDate.setDate(endDate.getDate() + maxAdvanceDays);
      
      const { data: bookings } = await supabase
        .from('bookings')
        .select('booking_date')
        .eq('location_id', toolInput.location_id)
        .gte('booking_date', now.toISOString().split('T')[0])
        .lte('booking_date', endDate.toISOString().split('T')[0])
        .neq('status', 'cancelled');
      
      // Spočítaj rezervácie na deň
      const bookingsPerDay = {};
      (bookings || []).forEach(b => {
        const dateStr = new Date(b.booking_date).toISOString().split('T')[0];
        bookingsPerDay[dateStr] = (bookingsPerDay[dateStr] || 0) + 1;
      });

      const availableDays = [];
      const minDate = new Date(now.getTime() + minAdvanceHours * 60 * 60 * 1000);
      const dayNames = ['Nedeľa', 'Pondelok', 'Utorok', 'Streda', 'Štvrtok', 'Piatok', 'Sobota'];
      
      for (let i = 0; i < maxAdvanceDays && availableDays.length < 7; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        
        if (date < minDate) continue;
        if (!openDays.has(date.getDay())) continue;
        if (blockedDates.has(dateStr)) continue;
        if ((bookingsPerDay[dateStr] || 0) >= maxPerDay) continue;
        
        availableDays.push({
          date: dateStr,
          day_name: dayNames[date.getDay()],
          formatted: `${dayNames[date.getDay()]} ${date.getDate()}.${date.getMonth() + 1}.`
        });
      }
      
      if (availableDays.length === 0) {
        return { message: 'V najbližšom období nie sú dostupné termíny.' };
      }
      return { available_days: availableDays };
    }
    
    case 'get_available_slots': {
      // Skontroluj blokované dni
      const { data: blockedSlot } = await supabase
        .from('booking_blocked_slots')
        .select('id, reason')
        .eq('location_id', toolInput.location_id)
        .eq('blocked_date', toolInput.date)
        .maybeSingle();
      
        if (blockedSlot) {
          // Nájdi najbližší voľný deň
          const { data: allBlocked } = await supabase
            .from('booking_blocked_slots')
            .select('blocked_date')
            .eq('location_id', toolInput.location_id);
          const blockedSet = new Set((allBlocked || []).map(b => new Date(b.blocked_date).toISOString().split('T')[0]));
          
          const { data: wh } = await supabase
            .from('booking_working_hours')
            .select('day_of_week, is_closed')
            .eq('location_id', toolInput.location_id);
          const closedDays = new Set((wh || []).filter(h => h.is_closed).map(h => h.day_of_week));
          
          let nextFree = null;
          const dayNames = ['Nedeľa', 'Pondelok', 'Utorok', 'Streda', 'Štvrtok', 'Piatok', 'Sobota'];
          for (let i = 1; i <= 30; i++) {
            const d = new Date(toolInput.date);
            d.setDate(d.getDate() + i);
            const ds = d.toISOString().split('T')[0];
            if (!closedDays.has(d.getDay()) && !blockedSet.has(ds)) {
              nextFree = `${dayNames[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
              break;
            }
          }
          
          return { message: `Tento deň je obsadený. Najbližší voľný termín je ${nextFree || 'nedostupný'}. Ak by sa skôr uvoľnil termín, radi vás kontaktujeme — stačí zanechať meno, email a telefón.` };
        }

      // Skontroluj kapacitu
      const { data: locCap } = await supabase
        .from('booking_locations')
        .select('daily_capacity')
        .eq('id', toolInput.location_id)
        .single();
      const maxPerDay = locCap?.daily_capacity || 2;

      const { data: dayBookings } = await supabase
        .from('bookings')
        .select('id')
        .eq('location_id', toolInput.location_id)
        .eq('booking_date', toolInput.date)
        .neq('status', 'cancelled');

        if ((dayBookings || []).length >= maxPerDay) {
          const { data: allBlocked } = await supabase
            .from('booking_blocked_slots')
            .select('blocked_date')
            .eq('location_id', toolInput.location_id);
          const blockedSet = new Set((allBlocked || []).map(b => new Date(b.blocked_date).toISOString().split('T')[0]));
          
          const { data: wh } = await supabase
            .from('booking_working_hours')
            .select('day_of_week, is_closed')
            .eq('location_id', toolInput.location_id);
          const closedDays = new Set((wh || []).filter(h => h.is_closed).map(h => h.day_of_week));
          
          let nextFree = null;
          const dayNames = ['Nedeľa', 'Pondelok', 'Utorok', 'Streda', 'Štvrtok', 'Piatok', 'Sobota'];
          for (let i = 1; i <= 30; i++) {
            const d = new Date(toolInput.date);
            d.setDate(d.getDate() + i);
            const ds = d.toISOString().split('T')[0];
            if (!closedDays.has(d.getDay()) && !blockedSet.has(ds)) {
              nextFree = `${dayNames[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
              break;
            }
          }
          
          return { message: `Tento deň je už plne obsadený. Najbližší voľný termín je ${nextFree || 'nedostupný'}. Ak by sa skôr uvoľnil termín, radi vás kontaktujeme — stačí zanechať meno, email a telefón.` };
        }

      const dateObj = new Date(toolInput.date);
      const dayOfWeek = dateObj.getDay();
      
      const { data: hours } = await supabase
        .from('booking_working_hours')
        .select('*')
        .eq('location_id', toolInput.location_id)
        .eq('day_of_week', dayOfWeek)
        .maybeSingle();
      
      if (!hours || hours.is_closed) {
        return { message: 'V tento deň je prevádzka zatvorená.' };
      }
      
      const { data: settings } = await supabase
        .from('booking_settings')
        .select('slot_duration')
        .eq('client_id', clientId)
        .maybeSingle();
      
      const slotDuration = settings?.slot_duration || 60;
      
      const { data: existingBookings } = await supabase
        .from('bookings')
        .select('booking_time')
        .eq('location_id', toolInput.location_id)
        .eq('booking_date', toolInput.date)
        .in('status', ['pending', 'confirmed']);
      
      const bookedTimes = new Set((existingBookings || []).map(b => b.booking_time));
      
      const slots = [];
      const [openH, openM] = hours.open_time.split(':').map(Number);
      const [closeH, closeM] = hours.close_time.split(':').map(Number);
      
      let currentMinutes = openH * 60 + openM;
      const closeMinutes = closeH * 60 + closeM;
      
      const now = new Date();
      const isToday = toolInput.date === now.toISOString().split('T')[0];
      const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();
      
      while (currentMinutes + slotDuration <= closeMinutes) {
        const h = Math.floor(currentMinutes / 60);
        const m = currentMinutes % 60;
        const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        
        if ((!isToday || currentMinutes > currentTimeMinutes + 60) && !bookedTimes.has(timeStr)) {
          slots.push({ time: timeStr });
        }
        currentMinutes += slotDuration;
      }
      
      if (slots.length === 0) {
        return { message: 'Pre tento deň nie sú voľné termíny.' };
      }
      return { available_slots: slots };
    }
    
    case 'create_booking': {
      const { location_id, service_id, date, time, customer_name, customer_email, customer_phone, note } = toolInput;
      
      // Skontroluj či slot nie je obsadený
      const { data: existing } = await supabase
        .from('bookings')
        .select('id')
        .eq('location_id', location_id)
        .eq('booking_date', date)
        .eq('booking_time', time)
        .in('status', ['pending', 'confirmed'])
        .maybeSingle();
      
      if (existing) {
        return { error: 'Tento termín je už obsadený. Vyberte iný čas.' };
      }
      
      // Nájdi service
      let serviceData = null;
      const { data: serviceById } = await supabase
        .from('booking_services')
        .select('id, name, price')
        .eq('id', service_id)
        .maybeSingle();
      
      if (serviceById) {
        serviceData = serviceById;
      } else {
        const { data: serviceByName } = await supabase
          .from('booking_services')
          .select('id, name, price')
          .ilike('name', `%${service_id}%`)
          .limit(1)
          .maybeSingle();
        serviceData = serviceByName;
      }
      
      if (!serviceData) {
        return { error: 'Služba nebola nájdená: ' + service_id };
      }
      
      // Získaj location info
      const { data: location } = await supabase
        .from('booking_locations')
        .select('name, address, client_id')
        .eq('id', location_id)
        .single();
      
      if (!location) {
        return { error: 'Prevádzka nebola nájdená.' };
      }
      
      // Generuj booking number
      const year = new Date().getFullYear();
      const { count } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', location.client_id);
      
      const bookingNumber = `FB-${year}-${String((count || 0) + 1).padStart(4, '0')}`;
      
      // Vytvor rezerváciu
      const { data: booking, error } = await supabase
        .from('bookings')
        .insert({
          client_id: location.client_id,
          location_id: location_id,
          service_id: serviceData.id,
          booking_number: bookingNumber,
          customer_name: customer_name,
          customer_email: customer_email,
          customer_phone: customer_phone,
          booking_date: date,
          booking_time: booking_time || '00:00',
          problem_description: note || null,
          estimated_price: serviceData.price,
          status: 'pending'
        })
        .select()
        .single();
      
      if (error) {
        console.error('Create booking error:', error);
        return { error: 'Nepodarilo sa vytvoriť rezerváciu: ' + error.message };
      }
      
      // Priprav dáta pre response a email
      const dateObj = new Date(date);
      const dayNames = ['Nedeľa', 'Pondelok', 'Utorok', 'Streda', 'Štvrtok', 'Piatok', 'Sobota'];
      const formattedDate = `${dayNames[dateObj.getDay()]} ${dateObj.getDate()}.${dateObj.getMonth() + 1}.${dateObj.getFullYear()}`;
      
      // Pošli potvrdzujúci email
      try {
        await sendBookingCreatedEmail({
          booking_number: bookingNumber,
          customer_name: customer_name,
          customer_email: customer_email,
          booking_date: date,
          booking_time: time,
          booking_locations: { name: location.name, address: location.address },
          booking_services: { name: serviceData.name, price: serviceData.price }
        });
        console.log('📧 Booking email sent to:', customer_email);
      } catch (emailErr) {
        console.error('Email error:', emailErr);
      }
      
      return {
        success: true,
        booking: {
          booking_number: bookingNumber,
          service: serviceData.name,
          price: serviceData.price,
          location: location.name,
          address: location.address,
          date: formattedDate,
          time: time,
          customer_name: customer_name,
          customer_email: customer_email
        }
      };
    }
    
    default:
      return { error: 'Neznámy nástroj' };
  }
}

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

    // ============================================
    // VYLEPŠENÉ VYHĽADÁVANIE PRODUKTOV v2
    // ============================================
    
    // Normalizuj text - odstráň diakritiku
    const normalize = (text) => {
      return text.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[áä]/g, 'a').replace(/[éě]/g, 'e').replace(/[íý]/g, 'i')
        .replace(/[óô]/g, 'o').replace(/[úů]/g, 'u').replace(/ž/g, 'z')
        .replace(/š/g, 's').replace(/č/g, 'c').replace(/ř/g, 'r')
        .replace(/ď/g, 'd').replace(/ť/g, 't').replace(/ň/g, 'n').replace(/ľ/g, 'l');
    };

    const msgNorm = normalize(message);

    let isDualModel = false;
    let dualModelName = null;
    
   // Spoj s kontextom z predchádzajúcich správ
    // ALE ak aktuálna správa je o novej téme, IGNORUJ kontext
    let fullContext = msgNorm;
    let useContext = true;
    
    // Detekuj či aktuálna správa je nová téma
    const currentTopicKeywords = /detsk|dieta|deti|cestn|cestny|horsk|gravel|trek|mest|prilb|stojan|blatnik|nosic|pedal|sedlo|svetl|zamok|pump|dres|rukav|obuv|nohav|bund|okuli|batohy|task|flasa|narad|pocitac/;
    
    // CUBE modely - pre priame vyhľadávanie
const CUBE_MODELS = [
  // Cestné
  'agree', 'attain', 'litening', 'aerium',
  // Gravel
  'nuroad', 'cross race',
  // Horské
  'reaction', 'aim', 'attention', 'acid', 'analog',
  // Celoodpružené
  // Celoodpružené
   'one44', 'one22', 'one77', 'one55', 'stereo', 'ams', 'hanzz', 'fritzz',
  // Trekingové
  'kathmandu', 'touring', 'nature', 'nuride', 'travel',
  // Mestské
  'hyde', 'ella', 'supreme', 'nulane', 'town',
  // Detské
  'cubie', 'kid', 'race kid'
      ];
    
    const hasOwnTopic = currentTopicKeywords.test(msgNorm) || 
                        CUBE_MODELS.some(m => msgNorm.includes(m)) ||
                        /\b(12|14|16|18|20|24|26|27|28|29)\b/.test(msgNorm);
    
    if (hasOwnTopic && context.length > 0) {
      // Aktuálna správa má vlastnú tému - použi LEN aktuálnu správu
      useContext = false;
      console.log('🔄 Nová téma detekovaná - ignorujem kontext');
    }
    
    if (useContext && context.length > 0) {
      const prevMessages = context.filter(m => m.role === 'user').map(m => normalize(m.content)).join(' ');
      fullContext = prevMessages + ' ' + msgNorm;
    }
    
    console.log('🔍 Hľadám produkty pre:', message.substring(0, 80));
    console.log('📝 Full context:', fullContext.substring(0, 100));

    // === DETEKCIA TYPU PRODUKTU ===
    const CATEGORY_KEYWORDS = {
      // Bicykle
      'Bicykle > Cestné': ['cestn', 'cestak', 'cestny', 'cestnej', 'silnic', 'road', 'roadbike', 'zavod', 'asfalt'],
      'Bicykle > Horské pevné': ['horsk', 'horsky', 'mtb', 'mountain', 'hardtail', 'teren', 'les'],
      'Bicykle > Celoodpružené bicykle': ['celoodpruz', 'celo', 'fullsus', 'full sus', 'full suspension', 'enduro', 'trail', 'downhill'],
      'Bicykle > Gravel': ['gravel', 'gravelak', 'cyklokros', 'sotorik'],
      'Bicykle > Trekingové': ['trek', 'treking', 'turistik', 'vylet', 'touring'],
      'Bicykle > Mestské': ['mest', 'mestsky', 'city', 'urban', 'dochadz'],
      'Bicykle > Detské': ['detsk', 'detsky', 'dieta', 'deti', 'syn', 'dcer'],
      'Bicykle > Juniorské': ['junior', 'juniorsk'],
      'Bicykle > Dirt': ['dirt', 'jump', 'skakan'],
      
      // Komponenty
      'Komponenty > Pedále': ['pedal', 'spd', 'nozn', 'clickr'],
      'Komponenty > Sedlá': ['sedlo', 'sedla', 'seat', 'sattel'],
      'Komponenty > Vidlice': ['vidlic', 'vidlica', 'fork', 'rockshox', 'fox', 'sr suntour'],
      'Komponenty > Brzdy': ['brzd', 'brzda', 'brzdov', 'brake', 'kotuc', 'hydraul'],
      'Komponenty > Kolesá': ['koleso', 'kolesa', 'wheel', 'zaplet', 'plynom'],
      'Komponenty > Plášte': ['plast', 'pneumatik', 'tire', 'schwalbe', 'continental', 'maxxis'],
      'Komponenty > Duše': ['dusa', 'duse', 'tube', 'hadica'],
      'Komponenty > Reťaze': ['retaz', 'chain', 'shimano', 'sram'],
      'Komponenty > Riadidlá': ['riaditk', 'handlebar', 'kormidl'],
      'Komponenty > Predstavce': ['predstav', 'stem', 'mostek'],
      'Komponenty > Sedlovky': ['sedlovk', 'seatpost', 'dropper', 'teleskop'],
      
      // Doplnky
      'Doplnky > Svetlá': ['svetl', 'svetlo', 'light', 'blikac', 'osvetl'],
      'Doplnky > Pumpy': ['pump', 'hustil', 'kompresor'],
      'Doplnky > Zámky': ['zamok', 'zamk', 'lock', 'zabezpec', 'uzamk'],
      'Doplnky > Nosiče': ['nosic', 'carrier', 'bagazin'],
      'Doplnky > Blatníky': ['blatnik', 'fender', 'mudguard'],
      'Doplnky > Tašky': ['task', 'sacka', 'bag', 'brasna'],
      'Doplnky > Batohy a Ľadvinky': ['batoh', 'ladvin', 'backpack', 'ruksak'],
      'Doplnky > Fľašky': ['flas', 'flasa', 'bottle', 'bidon', 'camel'],
      'Doplnky > Držiaky na fľašu': ['drziak', 'holder', 'cage'],
      'Doplnky > Cyklopočítače': ['pocitac', 'computer', 'tachometer', 'garmin', 'wahoo', 'sigma'],
      'Doplnky > Stojany': ['stojan', 'stand', 'montaz'],
      'Doplnky > Náradie': ['narad', 'tool', 'kluc', 'imbus', 'sada'],
      
      // Oblečenie
      'Oblečenie > Prilby': ['prilb', 'helmet', 'helma', 'ochran.*hlav'],
      'Oblečenie > Dresy': ['dres', 'jersey', 'cyklodres', 'triko'],
      'Oblečenie > Bundy': ['bund', 'jacket', 'vetrovk', 'softshell'],
      'Oblečenie > Nohavice': ['nohav', 'krat', 'pants', 'shorts', 'elast'],
      'Oblečenie > Rukavice': ['rukav', 'glove', 'gelove'],
      'Oblečenie > Ponožky': ['ponozk', 'socks'],
      'Oblečenie > Obuv': ['obuv', 'tretry', 'shoes', 'topank', 'cykloobuv'],
      'Oblečenie > Okuliare': ['okulia', 'glasses', 'slnec']
    };

    const ELEKTRO_KEYWORDS = {
      'Elektrobicykle > Celoodpružené elektro': ['celoodpruz', 'celo', 'fullsus', 'full sus', 'full suspension', 'enduro', 'trail', 'downhill'],
      'Elektrobicykle > Horské - Pevné elektro': ['horsk', 'horsky', 'mtb', 'mountain', 'hardtail', 'teren', 'les'],
      'Elektrobicykle > Trekingové elektro': ['trek', 'treking', 'turistik', 'touring', 'vylet'],
      'Elektrobicykle > Mestské elektro': ['mest', 'mestsky', 'city', 'urban', 'dochadz'],
      'Elektrobicykle > Gravel elektro': ['gravel', 'gravelak', 'cyklokros'],
      'Elektrobicykle > Juniorské elektro': ['junior', 'juniorsk', 'detsk', 'mlad'],
      'Elektrobicykle > Transportné': ['cargo', 'naklad', 'transport', 'preprav', 'rodinn']
    };



    // Detekuj či hľadá e-bike - PRIORITA aktuálna správa
    let wantsElektro = /elektr|ebike|e-bike|e bike|motor|bosch|bater|hybrid/.test(msgNorm);
    // Ak v aktuálnej správe nie je, skús kontext ALE len ak aktuálna správa nie je o inom type
    if (!wantsElektro && /elektr|ebike|e-bike|e bike|motor|bosch|bater|hybrid/.test(fullContext)) {
      // Ak aktuálna správa je o detských/cestných/iných bicykloch, IGNORUJ elektro z kontextu
      const newTopicKeywords = /detsk|dieta|deti|cestn|horsk|gravel|trek|mest|20"|24"|16"|velkost/;
      if (!newTopicKeywords.test(msgNorm)) {
        wantsElektro = true;
      }
    }
// Nájdi cieľové kategórie - PRIORITA: aktuálna správa > kontext
let targetCategories = [];
const keywordMap = wantsElektro ? ELEKTRO_KEYWORDS : CATEGORY_KEYWORDS;

// 1. Najprv hľadaj v AKTUÁLNEJ správe
for (const [category, keywords] of Object.entries(keywordMap)) {
  for (const keyword of keywords) {
    if (msgNorm.includes(keyword)) {
      if (!targetCategories.includes(category)) {
        targetCategories.push(category);
      }
      break;
    }
  }
}

// 2. Ak sa v aktuálnej správe nič nenašlo, skús kontext
if (targetCategories.length === 0) {
  for (const [category, keywords] of Object.entries(keywordMap)) {
    for (const keyword of keywords) {
      if (fullContext.includes(keyword)) {
        if (!targetCategories.includes(category)) {
          targetCategories.push(category);
        }
        break;
      }
    }
  }
}

console.log('🎯 Kategórie z aktuálnej správy:', targetCategories.length > 0 ? 'ÁNO' : 'NIE (fallback na kontext)');
    
    // Ak nenašiel kategóriu ale hľadá konkrétny model, urči kategóriu podľa modelu
    const MODEL_CATEGORIES = {
      // Cestné
      'agree': 'Bicykle > Cestné',
      'attain': 'Bicykle > Cestné',
      'litening': 'Bicykle > Cestné',
      'aerium': 'Bicykle > Cestné',
      // Gravel
      'nuroad': 'Bicykle > Gravel',
      'cross race': 'Bicykle > Gravel',
      // Horské pevné
      'reaction': 'Bicykle > Horské pevné',
      'aim': 'Bicykle > Horské pevné',
      'attention': 'Bicykle > Horské pevné',
      'acid': 'Bicykle > Horské pevné',
      'analog': 'Bicykle > Horské pevné',
      // Celoodpružené
      'stereo': 'Bicykle > Celoodpružené bicykle',
      'ams': 'Bicykle > Celoodpružené bicykle',
      'hanzz': 'Bicykle > Celoodpružené bicykle',
      'fritzz': 'Bicykle > Celoodpružené bicykle',
      'one44': 'Bicykle > Celoodpružené bicykle',
      'one22': 'Bicykle > Celoodpružené bicykle',
      'one77': 'Bicykle > Celoodpružené bicykle',
      'one55': 'Bicykle > Celoodpružené bicykle',
      // Trekingové
      'kathmandu': 'Bicykle > Trekingové',
      'touring': 'Bicykle > Trekingové',
      'nature': 'Bicykle > Trekingové',
      'nuride': 'Bicykle > Trekingové',
      'travel': 'Bicykle > Trekingové',
      // Mestské
      'hyde': 'Bicykle > Mestské',
      'ella': 'Bicykle > Mestské',
      'supreme': 'Bicykle > Mestské',
      'nulane': 'Bicykle > Mestské',
      'town': 'Bicykle > Mestské',
      // Detské
      'cubie': 'Bicykle > Detské',
      'kid': 'Bicykle > Detské'
    };
    
    // Elektro verzie modelov
    const MODEL_CATEGORIES_ELEKTRO = {
      'stereo': 'Elektrobicykle > Celoodpružené elektro',
      'ams': 'Elektrobicykle > Celoodpružené elektro',
      'one44': 'Elektrobicykle > Celoodpružené elektro',
      'one22': 'Elektrobicykle > Celoodpružené elektro',
      'one77': 'Elektrobicykle > Celoodpružené elektro',
      'one55': 'Elektrobicykle > Celoodpružené elektro',
      'reaction': 'Elektrobicykle > Horské - Pevné elektro',
      'kathmandu': 'Elektrobicykle > Trekingové elektro',
      'touring': 'Elektrobicykle > Trekingové elektro',
      'nature': 'Elektrobicykle > Trekingové elektro',
      'nuride': 'Elektrobicykle > Trekingové elektro',
      'supreme': 'Elektrobicykle > Mestské elektro',
      'ella': 'Elektrobicykle > Mestské elektro',
      'town': 'Elektrobicykle > Mestské elektro',
      'nuroad': 'Elektrobicykle > Gravel elektro',
      'cargo': 'Elektrobicykle > Transportné'
          };
    
    // Ak nemáme kategóriu, skús ju odvodiť z modelu v kontexte
    const modelCatMap = wantsElektro ? MODEL_CATEGORIES_ELEKTRO : MODEL_CATEGORIES;
    if (targetCategories.length === 0) {
      for (const [model, category] of Object.entries(modelCatMap)) {
        if (fullContext.includes(model)) {
          targetCategories.push(category);
          console.log(`📁 Kategória odvodená z modelu "${model}": ${category}`);
          break;
        }
      }
    }
    
    // Ak hľadá elektro a nenašiel špecifickú kategóriu, daj všetky elektro
    if (wantsElektro && targetCategories.length === 0) {
      targetCategories = [
        'Elektrobicykle > Celoodpružené elektro',
        'Elektrobicykle > Horské - Pevné elektro',
        'Elektrobicykle > Trekingové elektro',
        'Elektrobicykle > Mestské elektro'
      ];
    }
    
    console.log('📁 Kategórie:', targetCategories.join(', ') || 'žiadne');
    console.log('⚡ Elektro:', wantsElektro);

    // === DETEKCIA CENY ===
    let maxPrice = null;
    let minPrice = null;
    let displayMaxPrice = null;
    
    // Detekcia "lacnejšie" / "drahšie" - relatívna cena
    const wantsCheaper = /lacnejs|lacnejsie|menej|nizs|levnejs|levnejsi/.test(msgNorm);
    const wantsMoreExpensive = /drahs|drahsie|viac|leps|kvalitne|vyssi/.test(msgNorm);
    
    if (wantsCheaper || wantsMoreExpensive) {
      // Nájdi cenu z kontextu (predchádzajúce USER správy)
      // Hľadaj: "okolo 5000", "do 4000", "cca 3000", alebo len číslo 4-5 ciferné
      const pricePatterns = [
        /okolo\s*(\d{3,})/g,
        /cca\s*(\d{3,})/g,
        /do\s*(\d{3,})/g,
        /od\s*(\d{3,})/g,
        /(\d{4,})\s*€/g,
        /(\d{4,})\s*eur/gi
      ];
      
      let foundPrice = null;
      for (const pattern of pricePatterns) {
        const matches = fullContext.match(pattern);
        if (matches) {
          const lastMatch = matches[matches.length - 1];
          const numMatch = lastMatch.match(/\d+/);
          if (numMatch) {
            foundPrice = parseInt(numMatch[0]);
            break;
          }
        }
      }
      
      if (foundPrice) {
        if (wantsCheaper) {
          // "Lacnejšie" = hľadaj 30-80% pôvodnej ceny
          maxPrice = Math.round(foundPrice * 0.80);
          minPrice = Math.round(foundPrice * 0.30);
          console.log(`💰 "Lacnejšie" ako ${foundPrice}€ → ${minPrice}€ - ${maxPrice}€`);
        } else {
          // "Drahšie" = hľadaj 120-200% pôvodnej ceny
          minPrice = Math.round(foundPrice * 1.20);
          maxPrice = Math.round(foundPrice * 2.0);
          console.log(`💰 "Drahšie" ako ${foundPrice}€ → ${minPrice}€ - ${maxPrice}€`);
        }
      } else {
        console.log(`⚠️ "${wantsCheaper ? 'Lacnejšie' : 'Drahšie'}" - nenašla sa referenčná cena`);
      }
    }
    
    // "do X€" - iba ak nebolo "lacnejšie/drahšie"
    if (!maxPrice) {
      const maxMatch = fullContext.match(/do\s*(\d+)/);
      if (maxMatch) {
        displayMaxPrice = parseInt(maxMatch[1]);
        maxPrice = Math.round(displayMaxPrice * 1.10);
        minPrice = Math.round(displayMaxPrice * 0.70);
        console.log(`💰 "Do ${displayMaxPrice}€" → filter ${minPrice}€ - ${maxPrice}€`);
      }
    }
    
    // "od X€" - prepíše automatické minimum
    const minMatch = msgNorm.match(/od\s*(\d+)/);
    if (minMatch) {
      minPrice = parseInt(minMatch[1]);
      console.log(`💰 Od ${minPrice}€`);
    }
    
    // "okolo X€", "cca X€", "tak X€", "priblizne X€"
    const aroundMatch = msgNorm.match(/(?:okolo|cca|tak|priblizne|zhruba)\s*(\d+)/);
    if (aroundMatch && !wantsCheaper && !wantsMoreExpensive) {
      const aroundPrice = parseInt(aroundMatch[1]);
      minPrice = Math.round(aroundPrice * 0.7);
      maxPrice = Math.round(aroundPrice * 1.3);
      console.log(`💰 "Okolo ${aroundPrice}€" → ${minPrice}€ - ${maxPrice}€`);
    }

    // === DETEKCIA VEĽKOSTI BATÉRIE (pre elektrobicykle) ===
    let batterySize = null;
    const batteryMatch = fullContext.match(/(\d{3})\s*wh|(\d{3})\s*w|bateria\s*(\d{3})|baterka\s*(\d{3})|(\d{3})\s*bateria/i);
    if (batteryMatch) {
      batterySize = batteryMatch[1] || batteryMatch[2] || batteryMatch[3] || batteryMatch[4] || batteryMatch[5];
      console.log(`🔋 Batéria: ${batterySize}Wh`);
    }
    
    // Detekcia "veľká/malá batéria"
    if (/velk.*bater|velk.*kapacit|dlh.*dojazd|daleko/i.test(fullContext)) {
      batterySize = '750'; // Veľká = 750+ Wh
      console.log(`🔋 "Veľká batéria" → 750+ Wh`);
    }
    if (/mal.*bater|mal.*kapacit|krat.*dojazd|lahk/i.test(fullContext) && wantsElektro) {
      batterySize = '400'; // Malá = do 500 Wh
      console.log(`🔋 "Malá batéria" → 400-500 Wh`);
    }

    // === DETEKCIA VEĽKOSTI KOLESA (pre detské bicykle) ===
    let wheelSize = null;
    
    // Priama detekcia: "20 palcov", "24"", "26 inch"
    const wheelMatch = msgNorm.match(/(\d{2})\s*(?:palc|"|´|inch|cole|")/);
    if (wheelMatch) {
      wheelSize = wheelMatch[1];
      console.log(`🎡 Veľkosť kolesa (priama): ${wheelSize}"`);
    }
    
    // Detekcia veľkosti bez jednotky ak je v kontexte detský bicykel
    if (!wheelSize && /detsk|dieta|deti|syn|dcer|velkost|velk/i.test(msgNorm)) {
      const sizeMatch = msgNorm.match(/\b(12|14|16|18|20|24|26)\b/);
      if (sizeMatch) {
        wheelSize = sizeMatch[1];
        console.log(`🎡 Veľkosť kolesa (z čísla v správe): ${wheelSize}"`);
      }
    }
    
    // Detekcia výšky dieťaťa - PRIORITNE z aktuálnej správy
    // Tabuľka: 12"=85-100cm | 16"=100-115cm | 20"=116-124cm | 24"=125-145cm | 26"=140-160cm
    if (!wheelSize) {
      // Najprv skús aktuálnu správu
      let heightMatch = msgNorm.match(/(\d{2,3})\s*cm|(\d{2,3})\s*centim|vysk.*?(\d{2,3})|mer.*?(\d{2,3})/i);
      let heightSource = 'aktuálna správa';
      
      // Ak nie je v aktuálnej správe, skús kontext (ale len ak je tam detské kľúčové slovo)
      if (!heightMatch && /detsk|dieta|deti|syn|dcer|vnuk|vnuc/i.test(fullContext)) {
        // Vezmi POSLEDNÚ výšku z kontextu (nie prvú)
        const allHeights = fullContext.match(/(\d{2,3})\s*cm/gi);
        if (allHeights && allHeights.length > 0) {
          const lastHeight = allHeights[allHeights.length - 1];
          heightMatch = lastHeight.match(/(\d{2,3})/);
          heightSource = 'kontext (posledná)';
        }
      }
      
      if (heightMatch) {
        const childHeight = parseInt(heightMatch[1] || heightMatch[2] || heightMatch[3] || heightMatch[4]);
        console.log(`👶 Výška dieťaťa: ${childHeight}cm (zdroj: ${heightSource})`);
        
        // Mapovanie výšky na veľkosť kolesa
        if (childHeight >= 85 && childHeight < 100) {
          wheelSize = '12';
        } else if (childHeight >= 100 && childHeight < 116) {
          wheelSize = '16';
        } else if (childHeight >= 116 && childHeight < 125) {
          wheelSize = '20';
        } else if (childHeight >= 125 && childHeight < 145) {
          wheelSize = '24';
        } else if (childHeight >= 140 && childHeight <= 160) {
          wheelSize = '26';
        }
        
        if (wheelSize) {
          console.log(`🎡 Veľkosť kolesa (z výšky ${childHeight}cm): ${wheelSize}"`);
        }
      }
    }
    
    // Mapovanie veľkosti kolesa na číslo v názve CUBE produktov (160, 200, 240...)
    const wheelSizeToProductName = {
      '12': '120',
      '14': '140',
      '16': '160',
      '18': '180',
      '20': '200',
      '24': '240',
      '26': '260'
    };
    const wheelSizeFilter = wheelSize ? wheelSizeToProductName[wheelSize] : null;
    if (wheelSizeFilter) {
      console.log(`🔍 Filter produktov: názov obsahuje "${wheelSizeFilter}"`);
    }

    // === DETEKCIA ČI CHCE ALTERNATÍVY ===
    const wantsAlternatives = /podobn|ine |iny |alternativ|dals|nemusi|nemus|okrem|bez /.test(msgNorm);
    if (wantsAlternatives) {
      console.log('🔄 Zákazník chce alternatívy/iné modely');
    }

    // === DETEKCIA KONKRÉTNEHO MODELU ===
    let searchModel = null;
    let searchedModel = null; // Model z kontextu pre vylúčenie pri alternatívach
    let modelInCurrentMsg = false;
    
    // Najprv skontroluj či je model v AKTUÁLNEJ správe
    for (const model of CUBE_MODELS) {
      if (msgNorm.includes(model)) {
        searchModel = model;
        modelInCurrentMsg = true;
        console.log(`🏷️ Model v aktuálnej správe: ${model}`);
        break;
      }
    }
    
    // Ak nie je v aktuálnej správe, hľadaj v kontexte
    if (!searchModel) {
      for (const model of CUBE_MODELS) {
        if (fullContext.includes(model)) {
          searchedModel = model; // Ulož pre prípadné vylúčenie
          if (!wantsAlternatives) {
            searchModel = model;
            console.log(`🏷️ Model z kontextu: ${model}`);
          } else {
            console.log(`🔄 Model "${model}" z kontextu - bude vylúčený`);
          }
          break;
        }
      }
    } else {
      searchedModel = searchModel;
    }
    
    // === RESET CENOVÉHO FILTRA PRE NOVÝ MODEL ===
    // Ak je nový model v aktuálnej správe BEZ novej ceny, resetuj cenový filter
    if (modelInCurrentMsg) {
      const hasPriceInCurrentMsg = /do\s*\d|od\s*\d|okolo\s*\d|cca\s*\d|tak\s*\d|priblizne\s*\d|zhruba\s*\d|\d+\s*€|\d+\s*eur/i.test(message.toLowerCase());
      if (!hasPriceInCurrentMsg) {
        maxPrice = null;
        minPrice = null;
        console.log('💰 Reset cenového filtra - nový model bez ceny');
      }
    }

// === DETEKCIA VÁGNEHO DOTAZU ===
const isVagueQuery = /^(bicykl|elektrobicykl|ebike|e-bike|e bike|prilb|oblecen|doplnk|co mate|ponuk|sortiment|mate|hlad)/.test(msgNorm)
  && msgNorm.split(/\s+/).length <= 3
  && !maxPrice
  && !minPrice
  && !wheelSize
  && !searchModel
  && targetCategories.length === 0 || (wantsElektro && targetCategories.length > 0 && msgNorm.split(/\s+/).length <= 2);

let skipProductSearch = false;

if (isVagueQuery) {
  skipProductSearch = true;
  console.log('⏸️ Vágny dotaz - preskakujem hľadanie produktov');
}

// === DETEKCIA DUAL VERZIE (klasický + elektro) ===
const DUAL_MODELS = [
  'stereo', 'ams', 'one44', 'one22', 'one77', 'one55',
  'reaction', 'kathmandu', 'touring', 'nature', 'nuride',
  'supreme', 'ella', 'town', 'nuroad'
];

// Zisti či zákazník zadal kombináciu modelov (napr. "AMS one44")
let dualCheckModel = searchModel;
if (searchModel) {
  // Skontroluj či v správe nie je aj iný DUAL model
  const otherModels = DUAL_MODELS.filter(m => m !== searchModel && msgNorm.includes(m));
  if (otherModels.length > 0) {
    // Zákazník napísal viac modelov - použi kombináciu ako searchModel
    // napr. "ams one44" → searchModel = "ams" + hľadaj "one44" v názve
    dualCheckModel = searchModel; // Stále checkujeme hlavný model
  }
}

if (dualCheckModel && !wantsElektro && DUAL_MODELS.includes(dualCheckModel)) {
  const hasTypeIndication = /klasick|normal|obycajn|bez motor|hardtail|celoodpruz|fullsus/.test(msgNorm) ||
                             /elektr|ebike|e-bike|e bike|motor|bosch|bater|hybrid/.test(msgNorm);
  if (!hasTypeIndication) {
    isDualModel = true;
    // Pre zobrazenie použi všetky modely z správy
    const allModelsInMsg = DUAL_MODELS.filter(m => msgNorm.includes(m));
    dualModelName = allModelsInMsg.map(m => m.charAt(0).toUpperCase() + m.slice(1)).join(' ');
    skipProductSearch = true;
    console.log(`🔀 Dual model detected: ${allModelsInMsg.join(' + ')} - asking customer`);
  }
}

  // === HĽADANIE PRODUKTOV ===
let products = [];

if (skipProductSearch) {
  products = [];
  if (isDualModel) {
    productsContext = `\nModel ${dualModelName} máme v klasickej aj elektrickej verzii (${dualModelName} Hybrid). MUSÍŠ sa zákazníka opýtať ktorú verziu chce. Odpovedz PRESNE: "Model ${dualModelName} máme v klasickej aj elektrickej verzii. Ktorá vás zaujíma?"\n`;
  } else {
    productsContext = '\nZákazník zadal všeobecný dotaz. NEHĽADAJ produkty. Postupuj podľa POSTUPNOSTI OTÁZOK - opýtaj sa na typ, rozpočet a výšku.\n';
  }
}
    
if (!skipProductSearch) {

// === PRIAME HĽADANIE CELÉHO NÁZVU ===

   

    // 1. Ak hľadá konkrétny model - hľadaj v názve
    if (searchModel && products.length === 0) {
      // Ak je v správe aj číslo (napr. "ACID 240"), hľadaj model + číslo
      const numberMatch = msgNorm.match(new RegExp(searchModel + '\\s*(\\d{2,4})'));
      const searchTerm = numberMatch ? `${searchModel} ${numberMatch[1]}` : searchModel;
      
      // Ak hľadáme s číslom, nehľadaj v kategórii ale priamo v názve
      const isSpecificModel = !!numberMatch;
      
      console.log(`🔍 Hľadám model: "${searchTerm}"${isSpecificModel ? ' (presný model s číslom)' : ''}`);
      
      let query = supabase
        .from('products')
        .select('name, description, price, category, url')
        .eq('client_id', client.id)
        .ilike('name', `%${searchTerm}%`);
      
      if (maxPrice) query = query.lte('price', maxPrice);
      if (minPrice) query = query.gte('price', minPrice);
      
      // Ak hľadá elektro model, filtruj na Hybrid
      if (wantsElektro) {
        query = query.ilike('name', '%Hybrid%');
      } else {
        // Ak NEhľadá elektro, vylúč Hybrid
        query = query.not('name', 'ilike', '%Hybrid%');
      }
      
      const { data } = await query.order('price', { ascending: true }).limit(20);
      products = data || [];
      console.log(`📦 Model "${searchModel}": ${products.length} produktov`);
      
      // Ak sa nenašiel model v cenovom rozpätí, skús bez cenového filtra
      if (products.length === 0 && (maxPrice || minPrice)) {
        console.log(`⚠️ Model "${searchModel}" nenájdený v cenovom rozpätí, skúšam bez limitu...`);
        let queryNoPrice = supabase
          .from('products')
          .select('name, description, price, category, url')
          .eq('client_id', client.id)
          .ilike('name', `%${searchModel}%`);
        
        if (wantsElektro) {
          queryNoPrice = queryNoPrice.ilike('name', '%Hybrid%');
        } else {
          queryNoPrice = queryNoPrice.not('name', 'ilike', '%Hybrid%');
        }
        
        const { data: noPriceData } = await queryNoPrice.order('price', { ascending: true }).limit(5);
        
        if (noPriceData && noPriceData.length > 0) {
          console.log(`📦 Model "${searchModel}" mimo cenový rozsah: ${noPriceData.length} produktov`);
          // Model existuje ale mimo cenový rozsah - ponúkneme alternatívy z kategórie
          searchModel = null; // Reset aby sa hľadalo podľa kategórie
        }
      }
    }
    
    // 2. Ak máme kategórie a (nenašli sme model ALEBO chce alternatívy) - hľadaj podľa kategórií
    if ((products.length === 0 || wantsAlternatives) && targetCategories.length > 0) {
      // === FIX: Ak chce PRILBU, odstráň bicyklové kategórie ===
    const wantsHelmet = /prilb|helmet|helma|ochran.*hlav/.test(fullContext);
    const wantsBike = /bicyk|bike|kolo|koleso|ebike|e-bike/.test(msgNorm);
    
    if (wantsHelmet && !wantsBike) {
      // Zákazník chce prilbu, nie bicykel
      targetCategories = targetCategories.filter(c => c.includes('Prilby'));
      console.log('🪖 Len prilby (odstránené bicyklové kategórie)');
    }
      console.log(`📁 Hľadám podľa kategórií: ${targetCategories.join(', ')}`);
      let categoryProducts = [];
      

      
      for (const category of targetCategories.slice(0, 4)) {
        let query = supabase
          .from('products')
          .select('name, description, price, category, url')
          .eq('client_id', client.id)
          .eq('category', category);
        
        if (maxPrice) query = query.lte('price', maxPrice);
        if (minPrice) query = query.gte('price', minPrice);
        
        // Filter batérie pre elektrobicykle (v názve je napr. "800" pre 800Wh)
        if (batterySize && wantsElektro) {
          query = query.ilike('name', `%${batterySize}%`);
        }
        
        // Filter veľkosti kolesa pre detské bicykle (v názve je napr. "200" pre 20")
        if (wheelSizeFilter && category.includes('Detské')) {
          query = query.ilike('name', `%${wheelSizeFilter}%`);
        }
        
        // Ak je maxPrice, zoraď od najdrahšieho (zákazník chce "najlepšie" v rozpočte)
        const sortAsc = !maxPrice;
        const { data } = await query.order('price', { ascending: sortAsc }).limit(3000);
        if (data) categoryProducts.push(...data);
      }


     // Ak sa nenašli produkty v cenovom rozpätí, skús bez cenového filtra
     if (categoryProducts.length === 0 && (maxPrice || minPrice)) {
      console.log('⚠️ Žiadne produkty v cenovom rozpätí, skúšam bez limitu...');
      for (const category of targetCategories.slice(0, 4)) {
        let query = supabase
          .from('products')
          .select('name, description, price, category, url')
          .eq('client_id', client.id)
          .eq('category', category);
        
        const { data } = await query.order('price', { ascending: true }).limit(5);
        if (data) categoryProducts.push(...data);
      }
      if (categoryProducts.length > 0) {
        console.log(`📦 Bez cenového filtra: ${categoryProducts.length} produktov (ukáže najbližšie)`);
      }
    }

      
      // Ak sa nenašlo s batériou, skús bez filtra batérie
      if (categoryProducts.length === 0 && batterySize && wantsElektro) {
        console.log(`⚠️ Nenašlo sa s batériou ${batterySize}Wh, skúšam bez filtra...`);
        for (const category of targetCategories.slice(0, 4)) {
          let query = supabase
            .from('products')
            .select('name, description, price, category, url')
            .eq('client_id', client.id)
            .eq('category', category);
          
          if (maxPrice) query = query.lte('price', maxPrice);
          if (minPrice) query = query.gte('price', minPrice);
          
          const sortAsc = !maxPrice;
          const { data } = await query.order('price', { ascending: sortAsc }).limit(3000);
          if (data) categoryProducts.push(...data);
        }
      }
      
      // Ak sa nenašlo s veľkosťou kolesa, informuj ale ponúkni aj iné veľkosti
      if (categoryProducts.length === 0 && wheelSizeFilter) {
        console.log(`⚠️ Nenašlo sa s veľkosťou ${wheelSize}", skúšam bez filtra...`);
        for (const category of targetCategories.slice(0, 4)) {
          let query = supabase
            .from('products')
            .select('name, description, price, category, url')
            .eq('client_id', client.id)
            .eq('category', category);
          
          if (maxPrice) query = query.lte('price', maxPrice);
          if (minPrice) query = query.gte('price', minPrice);
          
          const sortAsc = !maxPrice;
          const { data } = await query.order('price', { ascending: sortAsc }).limit(3000);
          if (data) categoryProducts.push(...data);
        }
      }
      
      // Ak sme hľadali konkrétny model a chceme alternatívy, vylúč ten model
      if (searchedModel && wantsAlternatives && categoryProducts.length > 0) {
        categoryProducts = categoryProducts.filter(p => 
          !p.name.toLowerCase().includes(searchedModel)
        );
        console.log(`🔄 Vylúčený model "${searchedModel}", zostáva: ${categoryProducts.length} alternatív`);
      }
      
      // === FALLBACK NA PRÍBUZNÉ KATEGÓRIE ===
      // Ak sa nenašli produkty, skús príbuzné kategórie
      if (categoryProducts.length === 0 && (wantsCheaper || wantsMoreExpensive)) {
        console.log(`⚠️ Žiadne produkty v kategórii, skúšam príbuzné...`);
        
        const RELATED_CATEGORIES = {
          'Elektrobicykle > Celoodpružené elektro': ['Elektrobicykle > Horské - Pevné elektro'],
          'Elektrobicykle > Horské - Pevné elektro': ['Elektrobicykle > Celoodpružené elektro', 'Elektrobicykle > Trekingové elektro'],
          'Bicykle > Celoodpružené bicykle': ['Bicykle > Horské pevné'],
          'Bicykle > Horské pevné': ['Bicykle > Celoodpružené bicykle'],
          'Bicykle > Cestné': ['Bicykle > Gravel'],
          'Bicykle > Gravel': ['Bicykle > Cestné', 'Bicykle > Trekingové']
        };
        
        for (const originalCat of targetCategories) {
          const relatedCats = RELATED_CATEGORIES[originalCat] || [];
          for (const relatedCat of relatedCats) {
            let query = supabase
              .from('products')
              .select('name, description, price, category, url')
              .eq('client_id', client.id)
              .eq('category', relatedCat);
            
            if (maxPrice) query = query.lte('price', maxPrice);
            if (minPrice) query = query.gte('price', minPrice);
            
            const { data } = await query.order('price', { ascending: !maxPrice }).limit(10);
            if (data && data.length > 0) {
              categoryProducts.push(...data);
              console.log(`📦 Príbuzná kategória "${relatedCat}": ${data.length} produktov`);
            }
          }
        }
      }
      
      if (categoryProducts.length > 0) {
        products = categoryProducts;
      }
      console.log(`📦 Kategórie: ${products.length} produktov`);
    }
    
    // 3. Fallback - hľadaj kľúčové slová v názve
    if (products.length === 0) {
      const keywords = msgNorm.split(/\s+/).filter(w => w.length > 3).slice(0, 3);
      console.log(`🔎 Fallback keywords: ${keywords.join(', ')}`);
      
      for (const keyword of keywords) {
        let query = supabase
          .from('products')
          .select('name, description, price, category, url')
          .eq('client_id', client.id)
          .ilike('name', `%${keyword}%`);
        
        if (maxPrice) query = query.lte('price', maxPrice);
        if (minPrice) query = query.gte('price', minPrice);
        
        const { data } = await query.limit(10);
        if (data) products.push(...data);
      }
    } // koniec if (!skipProductSearch)
      console.log(`📦 Fallback: ${products.length} produktov`);
    }
  
    // === POST-PROCESSING ===
    
    // Odstráň duplikáty podľa URL
    const seen = new Set();
    products = products.filter(p => {
      if (seen.has(p.url)) return false;
      seen.add(p.url);
      return true;
    });
    
    // Odstráň duplikáty podľa modelu (nechaj len 1 farebnú variantu)
    const seenModels = new Set();
    products = products.filter(p => {
      // Extrahuj model z názvu - odstráň farbu a rok
      const modelName = p.name
        .replace(/\d{4}$/, '')
        .replace(/(black|white|grey|blue|red|green|orange|yellow|pink|olive|darkblue|lightblue|flashwhite|ružová|čierna|biela|šedá|modrá|červená|zelená|teal|mint|coral|berry|lime|amber|violet|sage|petrol|polarblue|frostwhite|metallicteal|smaragd|xenon|golddust|prism|cyclamen|carbon|glossy|matte|matt|shiny|n\'|´n´)/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      
      if (seenModels.has(modelName)) return false;
      seenModels.add(modelName);
      return true;
    });

    // Ak hľadá elektro, nechaj len elektro
    if (wantsElektro) {
      products = products.filter(p => 
        p.name.toLowerCase().includes('hybrid') || 
        p.category.toLowerCase().includes('elektro')
      );
    }
    
    // Ak NEhľadá elektro ale hľadá bicykel, vylúč elektro
    if (!wantsElektro && targetCategories.some(c => c.startsWith('Bicykle'))) {
      products = products.filter(p => 
        !p.name.toLowerCase().includes('hybrid') && 
        !p.category.toLowerCase().includes('elektro')
      );
    }

    // Zoraď od najdrahšieho (zákazník chce "najlepšie" v rozpočte) a limituj
    // Ak máme produkty z viacerých kategórií, rozdeľ limit spravodlivo
    if (targetCategories.length > 1) {
      const perCategory = Math.max(3, Math.floor(10 / targetCategories.length));
      const balancedProducts = [];
      const productsByCategory = {};
      
      products.forEach(p => {
        const cat = p.category || 'other';
        if (!productsByCategory[cat]) productsByCategory[cat] = [];
        productsByCategory[cat].push(p);
      });
      
      for (const [cat, catProducts] of Object.entries(productsByCategory)) {
        catProducts.sort((a, b) => (b.price || 0) - (a.price || 0));
        balancedProducts.push(...catProducts.slice(0, perCategory));
      }
      
      products = balancedProducts;
      console.log(`📊 Vyvážené: ${Object.keys(productsByCategory).length} kategórií, ${products.length} produktov`);
    }
    



    
  // === ROZDELENIE PRILBY PODĽA TYPU ===
  if (targetCategories.includes('Oblečenie > Prilby') && products.length > 0) {
    const HELMET_TYPES = {
      child: ['fink', 'talok', 'ant', 'linok'],
      road: ['road race', 'heron'],
      mtb: ['trooper', 'strover', 'stray', 'steep', 'offpath', 'fleet', 'pathos', 'badger', 'frisk', 'rook', 'quest', 'cinity', 'evoy'],
      dirt: ['dirt'],
      universal: ['evoy', 'pathos', 'steep', 'offpath', 'cinity', 'fleet', 'quest']
    };
    const categorizeHelmet = (name) => {
      const n = name.toLowerCase();
      const types = [];
      if (HELMET_TYPES.child.some(m => n.includes(m))) types.push('child');
      if (HELMET_TYPES.road.some(m => n.includes(m))) types.push('road');
      if (HELMET_TYPES.mtb.some(m => n.includes(m))) types.push('mtb');
      if (HELMET_TYPES.dirt.some(m => n.includes(m))) types.push('dirt');
      if (HELMET_TYPES.universal.some(m => n.includes(m))) types.push('universal');
      return types.length > 0 ? types : ['unknown'];
    };
    const wantsChild = /detsk|dieta|deti|syn|dcer|junior|kid|malo/.test(fullContext);
    const wantsRoad = /cestn|cestny|cestak|silnic|road|asfalt|zavod/.test(fullContext);
    const wantsMTB = /horsk|mtb|mountain|teren|les|enduro|trail/.test(fullContext);
    const wantsDirt = /dirt|jump|skakan|park/.test(fullContext);
    const wantsAdult = /dospel|pre mna|pre seba|na seba/.test(fullContext);
    let filteredHelmets = products;
    let helmetFilterApplied = false;
    if (wantsChild && !wantsAdult) {
      filteredHelmets = products.filter(p => categorizeHelmet(p.name).includes('child'));
      helmetFilterApplied = true;
      console.log(`🪖 Detské prilby: ${filteredHelmets.length}`);
    } else if (wantsRoad) {
      // Debug: ukáž aj road typy
      products.forEach(p => {
        const types = categorizeHelmet(p.name);
        if (types.includes('road')) console.log(`🏁 ROAD: ${p.name}`);
      });
      filteredHelmets = products.filter(p => {
        const types = categorizeHelmet(p.name);
        return types.includes('road') || types.includes('universal');
      });
      helmetFilterApplied = true;
      console.log(`🪖 Cestné/univerzálne prilby: ${filteredHelmets.length}`);
    } else if (wantsMTB) {
      filteredHelmets = products.filter(p => {
        const types = categorizeHelmet(p.name);
        return types.includes('mtb') || types.includes('universal');
      });
      helmetFilterApplied = true;
      console.log(`🪖 MTB/univerzálne prilby: ${filteredHelmets.length}`);
    } else if (wantsDirt) {
      filteredHelmets = products.filter(p => categorizeHelmet(p.name).includes('dirt'));
      helmetFilterApplied = true;
      console.log(`🪖 Dirt prilby: ${filteredHelmets.length}`);
    } else if (wantsAdult) {
      filteredHelmets = products.filter(p => !categorizeHelmet(p.name).includes('child'));
      helmetFilterApplied = true;
      console.log(`🪖 Dospelé prilby (všetky typy): ${filteredHelmets.length}`);
    }
    if (helmetFilterApplied && filteredHelmets.length > 0) {
      products = filteredHelmets;
    } else if (helmetFilterApplied && filteredHelmets.length === 0) {
      console.log(`⚠️ Filter prilbiek nenašiel výsledky, ponechávam všetky`);
    }
  }

  products.sort((a, b) => (b.price || 0) - (a.price || 0));
  products = products.slice(0, 10);
  console.log(`✅ Finálne: ${products.length} produktov`);
  if (products.length > 0) {
    products.forEach((p, i) => console.log(`   ${i+1}. ${p.name.substring(0, 45)} | ${p.price}€`));
  }

// === KOMPATIBILITA PRÍSLUŠENSTVA ===
let compatContext = '';
const wantsAccessory = /stojan|blatnik|blatniky|nosic|carrier|mudguard|kickstand|doplnok|prislusen|pasuje|kompatibil|hodí sa|vhodný/.test(msgNorm);

if (wantsAccessory && searchModel) {
  // Nájdi frame_description pre model
 // Skús nájsť presnejší match s celou správou
let bikeWithFrame = null;
const msgLower = message.toLowerCase().replace(/[´`'']/g, '');

const variantRegex = new RegExp(`(${searchModel}[^,\\.\\?!]*)`, 'i');
const variantMatch = msgLower.match(variantRegex);
let bikeSearchVariants = [];

if (variantMatch) {
    let cleaned = variantMatch[1]
        .replace(/\s*-?\s*(xxl|xl|l|m|s|xs)\b/gi, '')
        .replace(/\s*(smaragd|black|white|grey|blue|red|green|orange|prism|dazzle|nebula|chrome)\S*/gi, '')
        .replace(/\s*\d{4}\s*$/, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (cleaned.length > searchModel.length) {
        bikeSearchVariants.push(cleaned);
    }
}
bikeSearchVariants.push(searchModel);

console.log(`🔧 Bike search variants:`, bikeSearchVariants);

for (const variant of bikeSearchVariants) {
    const { data: bikeResults } = await supabase
        .from('products')
        .select('name, frame_description')
        .eq('client_id', client.id)
        .ilike('name', `%${variant}%`)
        .not('frame_description', 'is', null)
        .limit(1);
    
    if (bikeResults?.length > 0) {
        bikeWithFrame = bikeResults[0];
        console.log(`🔧 Match na "${variant}": ${bikeWithFrame.name} (${bikeWithFrame.frame_description})`);
        break;
    }
}


  
  if (bikeWithFrame?.frame_description) {
    console.log(`🔧 Kompatibilita pre: ${bikeWithFrame.name} (${bikeWithFrame.frame_description})`);
    
    // Zisti aký typ príslušenstva chce
    let accTypes = [];
    if (/stojan|kickstand/.test(msgNorm)) accTypes.push('kickstand');
    if (/blatnik|blatniky|mudguard/.test(msgNorm)) accTypes.push('mudguard');
    if (/nosic|carrier/.test(msgNorm)) accTypes.push('carrier');
    if (accTypes.length === 0) accTypes = ['kickstand', 'mudguard', 'carrier'];
    
    const { data: compatible } = await supabase
      .from('frame_compatibility')
      .select('accessory_type, accessory_name, accessory_short_name, item_number, compatibility_type')
      .eq('frame_description', bikeWithFrame.frame_description)
      .in('accessory_type', accTypes);
    
      if (compatible && compatible.length > 0) {
        compatContext = `\n\nKOMPATIBILNÉ PRÍSLUŠENSTVO pre ${bikeWithFrame.name.replace(/^CUBE\s+/i, '')}:\n`;
        
        const byType = { kickstand: [], mudguard: [], carrier: [] };
        compatible.forEach(c => byType[c.accessory_type]?.push(c));
        
        const typeNames = { kickstand: 'STOJANY', mudguard: 'BLATNÍKY', carrier: 'NOSIČE' };
        const typeExplanation = {
          compatible: '✅ kompatibilný',
          pre_installed: '📦 už namontovaný na bicykli',
          needs_other: '⚠️ vyžaduje ďalší produkt'
        };
        
        let readyText = '';
        
        for (const [type, items] of Object.entries(byType)) {
          if (items.length > 0) {
            readyText += `\n${typeNames[type]}:\n`;
            for (const item of items) {
              const status = typeExplanation[item.compatibility_type] || '';
              
              let productMatches = [];
            
              // 1. Skús accessory_short_name ale presnejšie
              const shortClean = item.accessory_short_name.replace(/"/g, '').trim();
              const { data: matches1 } = await supabase
                .from('products')
                .select('url, price, name')
                .eq('client_id', client.id)
                .ilike('name', `%${shortClean}%`)
                .limit(5);
              
              // Filtruj - vylúč false matche (ROOKIE, Kid)
              if (matches1?.length > 0) {
                const exactMatch = matches1.find(m => {
                  const mName = m.name.toLowerCase();
                  const sName = shortClean.toLowerCase();
                  return mName.endsWith(sName) || 
                         (mName.includes(` ${sName}`) && !mName.includes(`${sName} rookie`) && !mName.includes(`${sName} kid`));
                });
                if (exactMatch) productMatches = [exactMatch];
                else if (shortClean.length > 5) productMatches = [matches1[0]];
              }
              
              // 2. Ak nenašiel, skús kľúčové slová z accessory_name
              if (productMatches.length === 0 && item.accessory_name) {
                const keywords = item.accessory_name
                  .replace(/^(ACID|CUBE|RFR)\s+/i, '')
                  .replace(/Set\s+/i, '')
                  .replace(/\n/g, ' ')
                  .replace(/"/g, '')
                  .trim();
                const { data: matches2 } = await supabase
                  .from('products')
                  .select('url, price, name')
                  .eq('client_id', client.id)
                  .ilike('name', `%${keywords}%`)
                  .limit(1);
                if (matches2?.length > 0) productMatches = matches2;
              }
              
              const productMatch = productMatches?.[0] || null;
              
              if (productMatch?.url) {
                readyText += `- [${item.accessory_name}](${productMatch.url}) — ${productMatch.price}€ ${status}\n`;
              } else {
                readyText += `- ${item.accessory_name} (č. ${item.item_number}) ${status}\n`;
              }
            }
          }
        }
        
        compatContext += readyText;
        compatContext += `\nINŠTRUKCIE PRE ODPOVEĎ:
  - Zobraz PRESNE tieto produkty vrátane linkov v ROVNAKOM formáte [názov](url)
  - NEKOPÍRUJ linky do textu ako čistý text, použi VŽDY markdown formát [text](url)
  - Ak má produkt cenu, uveď ju
  - Ak je "už namontovaný" informuj zákazníka
  - Nepridávaj žiadne iné produkty\n`;
        
        console.log(`✅ Nájdených ${compatible.length} kompatibilných produktov`);
        console.log('📋 Kontext:', readyText.substring(0, 300));
      } else {
        compatContext = `\n\nPre bicykel ${bikeWithFrame.name.replace(/^CUBE\s+/i, '')} nie sú dostupné kompatibilné ${accTypes.join('/')}.`;
        console.log(`⚠️ Žiadne kompatibilné produkty pre ${bikeWithFrame.frame_description}`);
      }
    }
  }


// === VYTVOR KONTEXT PRE AI ===
let productsContext = '';
if (products.length > 0) {
productsContext = `
DOSTUPNÉ PRODUKTY (použi IBA tieto):
`;
products.forEach((p, i) => {
    const shortName = p.name
      .replace(/^CUBE\s+/i, '')
      .replace(/\s*20\d{2}\s*$/, '')
      .trim();
    productsContext += `${i + 1}. ${shortName} | ${p.price}€ | ${p.url}\n`;
  });
productsContext += `
PRAVIDLÁ:
- Odporúčaj IBA produkty zo zoznamu vyššie
- Používaj PRESNÉ názvy a ceny
- Formát linku: [názov](url)
- Ak produkt nie je v zozname, povedz že ho nemáme
`;
    } else {
      productsContext = `

NENAŠLI SA PRODUKTY PRE TÚTO OTÁZKU.
Opýtaj sa zákazníka na konkrétnejší typ produktu alebo odporuč kontaktovať predajňu.
`;
    }


// Kompatibilné produkty - vlož priamo do productsContext pre AI
if (compatContext && compatContext.includes('](')) {
  const compatLines = compatContext.split('\n').filter(l => l.includes('](') && l.startsWith('- ['));
  if (compatLines.length > 0) {
    productsContext = '\n\nNÁJDENÉ KOMPATIBILNÉ PRÍSLUŠENSTVO PRE ZÁKAZNÍKOV BICYKEL:\n';
    compatLines.forEach(line => {
      productsContext += line.trim() + '\n';
    });
    productsContext += '\nODPOVEDZ ZÁKAZNÍKOVI TAKTO:\n';
    productsContext += '1. Povedz "Pre váš [model] máme tieto kompatibilné [stojany/blatníky/nosiče]:"\n';
    productsContext += '2. Vypíš KAŽDÝ produkt PRESNE v tomto formáte: • [názov](url) — cena\n';
    productsContext += '3. NIKDY nehovor "nemáme v ponuke" alebo "nemám kompatibilné"\n';
    productsContext += '4. Ignoruj farbu bicykla - kompatibilita závisí od modelu nie od farby\n';
    compatContext = '';
  }
}



    const systemPrompt = (client.system_prompt || 'Si priateľský zákaznícky asistent.') + currentDateTime + productsContext + compatContext;

    // === VALIDOVANÁ ODPOVEĎ (bez streamingu) ===
// === ODPOVEĎ S BOOKING TOOLS ===
try {
  const useBookingTools = isBookingRelated(message, context);
  let fullResponse = '';
  let inputTokens = 0;
  let outputTokens = 0;
  
  if (useBookingTools) {
    // === BOOKING FLOW S TOOLS ===
    console.log('🔧 Booking mode - using tools');
    
    const bookingInstructions = `
REZERVAČNÝ SYSTÉM - STRIKTNÉ PRAVIDLÁ:

DNEŠNÝ DÁTUM: ${now.toISOString().split('T')[0]} (${days[now.getDay()]})
Zajtra: ${new Date(now.getTime() + 24*60*60*1000).toISOString().split('T')[0]}

PREVÁDZKY:
- "Tri Veže" / "Bajkalská" = location_id: 703f75e8-6aea-4588-86a4-139f6b9f2ca2
- "Sport Mall" / "Vajnorská" = location_id: ded49cea-1957-48e6-b946-4932780dbe0f

POSTUP (dodržuj presne!):
1. Zákazník chce servis → get_booking_locations
2. Vyberie prevádzku → get_booking_services + get_available_days
3. Vyberie službu a deň → get_available_slots
4. Vyberie čas → opýtaj sa: "Máte nejakú poznámku k servisu? (napr. čo treba skontrolovať, aký máte problém)"
5. Odpovie na poznámku (alebo povie "nie") → opýtaj sa na VŠETKY kontaktné údaje: "Pre dokončenie rezervácie potrebujem vaše meno, email a telefónne číslo."
6. Dá kontakt → SKONTROLUJ či máš všetky 3 údaje (meno, email, telefón). Ak chýba email alebo telefón, DOPÝTAJ SA!
7. Máš všetko → create_booking (nezabudni poslať note ak zákazník niečo napísal)

KRITICKÉ PRAVIDLÁ:
- VŽDY sa opýtaj na poznámku pred kontaktnými údajmi
- VŽDY vyžaduj VŠETKY 3: meno, email, telefón - ak niečo chýba, dopýtaj sa!
- Keď zákazník povie DEŇ alebo DÁTUM, IHNEĎ zavolaj get_available_slots
- Dátum VŽDY preveď na formát YYYY-MM-DD (napr. "18.2." = "2026-02-18")
- NIKDY nehovor že termín je/nie je voľný bez zavolania get_available_slots
- Pri create_booking použi parameter "note" pre poznámku zákazníka
`;
    
    let claudeMessages = [...messages];
    let iterations = 0;
    const maxIterations = 6;
    let lastToolResult = null; // Pre quick replies
    
    while (iterations < maxIterations) {
      iterations++;
      console.log(`🔄 Tool iteration ${iterations}`);
      
      const claudeResponse = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt + bookingInstructions,
        tools: BOOKING_TOOLS,
        messages: claudeMessages
      });
      
      inputTokens += claudeResponse.usage?.input_tokens || 0;
      outputTokens += claudeResponse.usage?.output_tokens || 0;
      
      if (claudeResponse.stop_reason === 'tool_use') {
        const toolUseBlocks = claudeResponse.content.filter(b => b.type === 'tool_use');
        const textBlocks = claudeResponse.content.filter(b => b.type === 'text');
        
        if (textBlocks.length > 0) {
          fullResponse += textBlocks.map(b => b.text).join('\n');
        }
        
        claudeMessages.push({ role: 'assistant', content: claudeResponse.content });
        
        const toolResults = [];
        for (const toolUse of toolUseBlocks) {
          const result = await handleBookingTool(toolUse.name, toolUse.input, client.id);
          console.log(`📥 ${toolUse.name} result:`, JSON.stringify(result).substring(0, 100));
          
          // Ulož posledný výsledok pre quick replies
          lastToolResult = { name: toolUse.name, data: result };
          
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result)
          });
        }
        
        claudeMessages.push({ role: 'user', content: toolResults });
      } else {
        const textBlocks = claudeResponse.content.filter(b => b.type === 'text');
        fullResponse = textBlocks.map(b => b.text).join('\n');
        break;
      }
    }
    
 // === GENERUJ QUICK REPLIES ===
    let quickReplies = [];
    
    if (lastToolResult) {
      const { name, data } = lastToolResult;
      
      if (name === 'get_booking_locations' && data.locations) {
        quickReplies = data.locations.map(l => l.name.replace('CUBE Store - ', ''));
      }
      else if (name === 'get_booking_services' && data.services) {
        quickReplies = data.services.slice(0, 4).map(s => `${s.name} (${s.price}€)`);
      }
      else if (name === 'get_available_days' && data.available_days) {
        // Max 5 dní (cca týždeň pracovných)
        quickReplies = data.available_days.slice(0, 5).map(d => d.formatted);
      }
      else if (name === 'get_available_slots' && data.available_slots) {
        // Všetky časy (max 10)
        quickReplies = data.available_slots.slice(0, 10).map(s => s.time);
      }
      else if (name === 'create_booking' && data.success) {
        quickReplies = [];
      }
    }
    
    if (quickReplies.length === 0 && fullResponse.toLowerCase().includes('poznámk')) {
      quickReplies = ['Nemám', 'Áno, napíšem'];
    }
    
    res.quickReplies = quickReplies;
 
 
    
  } else {
    // === ŠTANDARDNÝ FLOW (produkty) ===
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages
    });
    
    fullResponse = response.content[0].text;

    inputTokens = response.usage?.input_tokens || 0;
    outputTokens = response.usage?.output_tokens || 0;
    
    // Validácia linkov
    // Validácia linkov - pridaj aj URL z kompatibilného príslušenstva
    const validUrls = products.map(p => p.url).filter(Boolean);
    // Extrahuj URL z compatContext/productsContext
    const compatUrlMatches = (productsContext + compatContext).match(/https?:\/\/[^\s)]+/g);
    if (compatUrlMatches) validUrls.push(...compatUrlMatches);
    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;
    let match;
    const originalResponse = fullResponse;
    
    while ((match = linkRegex.exec(originalResponse)) !== null) {
      const linkText = match[1];
      const linkUrl = match[2];
      if (validUrls.length > 0 && !validUrls.includes(linkUrl)) {
        console.log('⚠️ Odstránený falošný link:', linkUrl);
        fullResponse = fullResponse.replace(match[0], linkText);
      }
    }
  }

  // Ulož odpoveď
  await supabase.from('messages').insert({
    conversation_id: conversationId,
    role: 'assistant',
    content: fullResponse
  });

  // Vypočítaj cenu
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

  // Aktualizuj conversation
  await supabase
    .from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId);

  // Check kontakt
  const contactInfo = checkForContact(message);
  if (contactInfo.hasContact) {
    const updates = { has_contact: true };
    if (contactInfo.email) updates.visitor_email = contactInfo.email;
    if (contactInfo.phone) updates.visitor_phone = contactInfo.phone;
    
    await supabase
      .from('conversations')
      .update(updates)
      .eq('id', conversationId);
    
    const { data: clientEmailData } = await supabase
      .from('clients')
      .select('email')
      .eq('id', client.id)
      .single();
    
    if (clientEmailData?.email) {
      sendLeadNotification(clientEmailData.email, contactInfo, conversationId, client.id);
    }
  }

  // Počítadlo správ
  await supabase
    .from('clients')
    .update({ messages_this_month: clientData.messages_this_month + 1 })
    .eq('id', client.id);

// Simulovaný streaming
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('Connection', 'keep-alive');

// Pošli quick replies na začiatku ak existujú
if (res.quickReplies && res.quickReplies.length > 0) {
  res.write(`data: ${JSON.stringify({ quickReplies: res.quickReplies })}\n\n`);
} else if (isDualModel) {
  res.write(`data: ${JSON.stringify({ quickReplies: ['Klasický bicykel', 'Elektrobicykel'] })}\n\n`);
}

const words = fullResponse.split(/(\s+)/);
const chunkSize = 4;

for (let i = 0; i < words.length; i += chunkSize) {
  const chunk = words.slice(i, i + chunkSize).join('');
  res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
  await new Promise(resolve => setTimeout(resolve, 35));
}

res.write('data: [DONE]\n\n');
res.end();

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
          <table cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;"><tr><td align="center" bgcolor="#7c3aed" style="border-radius:8px;padding:12px 24px;"><a href="${verifyUrl}" style="color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;display:inline-block;">Potvrdiť email</a></td></tr></table>
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
    
    // 1. Skús hlavný účet (clients tabuľka)
    const { data: client, error } = await supabase
      .from('clients')
      .select('id, name, email, api_key, password_hash, system_prompt, widget_settings, website_url, email_verified')
      .eq('email', email)
      .single();
    
    if (client) {
      const validPassword = await bcrypt.compare(password, client.password_hash);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      if (!client.email_verified) {
        return res.status(401).json({ error: 'Please verify your email first' });
      }
      const token = jwt.sign({ clientId: client.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
      delete client.password_hash;
      return res.json({ client, token });
    }
    
    // 2. Skús client_users tabuľku
    const { data: clientUser } = await supabase
      .from('client_users')
      .select('id, client_id, email, password_hash, name, role')
      .eq('email', email)
      .eq('is_active', true)
      .single();
    
    if (!clientUser) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const validPassword = await bcrypt.compare(password, clientUser.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Načítaj klientský účet
    const { data: parentClient } = await supabase
      .from('clients')
      .select('id, name, email, api_key, system_prompt, widget_settings, website_url, email_verified')
      .eq('id', clientUser.client_id)
      .single();
    
    if (!parentClient) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ clientId: parentClient.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    
    // Vráť klientské dáta ale s menom prihláseného používateľa
    res.json({ 
      client: { ...parentClient, user_name: clientUser.name, user_role: clientUser.role },
      token 
    });
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
          <table cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;"><tr><td align="center" bgcolor="#7c3aed" style="border-radius:8px;padding:12px 24px;"><a href="${resetUrl}" style="color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;display:inline-block;">Resetovať heslo</a></td></tr></table>
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

// GET /admin/notification-emails
app.get('/admin/notification-emails', authMiddleware, async (req, res) => {
  try {
    const { data } = await supabase
      .from('clients')
      .select('notification_emails')
      .eq('id', req.clientId)
      .single();
    
    res.json({ emails: data?.notification_emails || [] });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /admin/notification-emails
app.post('/admin/notification-emails', authMiddleware, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Neplatný email' });
    }

    const { data: client } = await supabase
      .from('clients')
      .select('notification_emails')
      .eq('id', req.clientId)
      .single();

    const emails = client?.notification_emails || [];
    if (emails.includes(email)) {
      return res.status(400).json({ error: 'Email už existuje' });
    }
    if (emails.length >= 10) {
      return res.status(400).json({ error: 'Maximum 10 emailov' });
    }

    await supabase
      .from('clients')
      .update({ notification_emails: [...emails, email] })
      .eq('id', req.clientId);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /admin/notification-emails
app.delete('/admin/notification-emails', authMiddleware, async (req, res) => {
  try {
    const { email } = req.body;

    const { data: client } = await supabase
      .from('clients')
      .select('notification_emails')
      .eq('id', req.clientId)
      .single();

    const emails = (client?.notification_emails || []).filter(e => e !== email);

    await supabase
      .from('clients')
      .update({ notification_emails: emails })
      .eq('id', req.clientId);

    res.json({ success: true });
  } catch (error) {
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
      .order('created_at', { ascending: false });    
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
    
   // Upsert - vlož nové, aktualizuj existujúce (podľa URL)
   let totalProcessed = 0;
   const batchSize = 500;
   
   for (let i = 0; i < products.length; i += batchSize) {
     const batch = products.slice(i, i + batchSize);
     
     const { data, error } = await supabase
       .from('products')
       .upsert(batch, { 
         onConflict: 'client_id,url',
         ignoreDuplicates: false 
       })
       .select();
     
     if (error) throw error;
     totalProcessed += data?.length || 0;
   }
   
   console.log(`📦 XML upsert: ${totalProcessed} produktov spracovaných`);
   
   res.json({ success: true, count: totalProcessed });
  } catch (error) {
    console.error('XML Upload error:', error);
    res.status(500).json({ error: 'Failed to parse XML: ' + error.message });
  }
});

// ============================================
// EMAIL NOTIFICATIONS
// ============================================

async function sendLeadNotification(clientEmail, leadInfo, conversationId, clientId) {
  try {
    // Získaj notifikačné emaily
    let recipients = [clientEmail];
    if (clientId) {
      const { data } = await supabase
        .from('clients')
        .select('notification_emails')
        .eq('id', clientId)
        .single();
      if (data?.notification_emails?.length > 0) {
        recipients = [...new Set([...recipients, ...data.notification_emails])];
      }
    }

    await resend.emails.send({
      from: 'Replai <noreply@replai.sk>',
      to: recipients,
      subject: '🎯 Nový lead z chatu!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
          <h2 style="color: #7c3aed;">🎯 Nový lead!</h2>
          <p>Zákazník zanechal kontakt v chate:</p>
          <div style="background: #f8fafc; padding: 16px; border-radius: 12px; margin: 16px 0;">
            ${leadInfo.email ? `<p><strong>📧 Email:</strong> ${leadInfo.email}</p>` : ''}
            ${leadInfo.phone ? `<p><strong>📱 Telefón:</strong> ${leadInfo.phone}</p>` : ''}
          </div>
          <table cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;"><tr><td align="center" bgcolor="#7c3aed" style="border-radius:8px;padding:12px 24px;"><a href="${process.env.FRONTEND_URL}/conversations/${conversationId}" style="color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;display:inline-block;">Zobraziť konverzáciu</a></td></tr></table>
          <p style="color: #64748b; font-size: 14px;">
            Odpovedzte čo najskôr pre najlepšiu šancu na konverziu!
          </p>
        </div>
      `
    });
    console.log('Lead notification sent to:', recipients);
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
  const phoneRegex = /(\+421|0)[0-9\s\-\/]{8,14}/g;
  
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
// BOOKING SYSTEM ENDPOINTS
// ============================================

// GET /bookings - Zoznam rezervácií klienta
app.get('/bookings', authMiddleware, async (req, res) => {
  try {
    const { location, status, search } = req.query;
    
    let query = supabase
      .from('bookings')
      .select(`
        *,
        booking_locations(name),
        booking_services(name, price)
      `)
      .eq('client_id', req.clientId)
      .order('booking_date', { ascending: false });
    
    if (status) {
      query = query.eq('status', status);
    }
    
    if (search) {
      query = query.or(`customer_name.ilike.%${search}%,customer_email.ilike.%${search}%,customer_phone.ilike.%${search}%,booking_number.ilike.%${search}%`);
    }
    
    const { data: bookings, error } = await query;
    
    if (error) throw error;
    
    // Filtruj podľa location ak je zadaná
    let filtered = bookings || [];
    if (location) {
      const { data: loc } = await supabase
        .from('booking_locations')
        .select('id')
        .eq('client_id', req.clientId)
        .eq('code', location)
        .single();
      
      if (loc) {
        filtered = filtered.filter(b => b.location_id === loc.id);
      }
    }
    
    // Transformuj dáta
    const result = filtered.map(b => ({
      ...b,
      location_name: b.booking_locations?.name,
      service_name: b.booking_services?.name,
      estimated_price: b.booking_services?.price
    }));
    
    res.json({ bookings: result });
  } catch (error) {
    console.error('Bookings list error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /bookings/stats - Štatistiky rezervácií
app.get('/bookings/stats', authMiddleware, async (req, res) => {
  try {
    const { data: bookings } = await supabase
      .from('bookings')
      .select('status')
      .eq('client_id', req.clientId);
    
    const stats = {
      total: bookings?.length || 0,
      pending: bookings?.filter(b => b.status === 'pending').length || 0,
      confirmed: bookings?.filter(b => b.status === 'confirmed').length || 0,
      in_progress: bookings?.filter(b => b.status === 'in_progress').length || 0,
      completed: bookings?.filter(b => b.status === 'completed').length || 0,
      cancelled: bookings?.filter(b => b.status === 'cancelled').length || 0
    };
    
    res.json(stats);
  } catch (error) {
    console.error('Bookings stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /bookings/locations - Prevádzky klienta
app.get('/bookings/locations', authMiddleware, async (req, res) => {
  try {
    const { data: locations } = await supabase
      .from('booking_locations')
      .select('*')
      .eq('client_id', req.clientId)
      .eq('is_active', true)
      .order('name');
    
    res.json(locations || []);
  } catch (error) {
    console.error('Booking locations error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /bookings/services - Služby klienta
app.get('/bookings/services', authMiddleware, async (req, res) => {
  try {
    const { data: services } = await supabase
      .from('booking_services')
      .select('*')
      .eq('client_id', req.clientId)
      .eq('is_active', true)
      .order('sort_order');
    
    res.json(services || []);
  } catch (error) {
    console.error('Booking services error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});


// GET /bookings/settings - Nastavenia rezervačného systému
app.get('/bookings/settings', authMiddleware, async (req, res) => {
  try {
    const { data: settings } = await supabase
      .from('booking_settings')
      .select('*')
      .eq('client_id', req.clientId)
      .maybeSingle();
    
    res.json(settings || {
      slot_duration: 60,
      max_bookings_per_day: 2,
      min_advance_hours: 24,
      max_advance_days: 30,
      rental_enabled: false
    });
  } catch (error) {
    console.error('Booking settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /bookings/settings - Uložiť nastavenia
app.put('/bookings/settings', authMiddleware, async (req, res) => {
  try {
    const { slot_duration, max_bookings_per_day, min_advance_hours, max_advance_days, rental_enabled } = req.body;
    
    // Skontroluj či existuje záznam
    const { data: existing } = await supabase
      .from('booking_settings')
      .select('id')
      .eq('client_id', req.clientId)
      .maybeSingle();
    
    let result;
    if (existing) {
      // Update
      const updateData = { updated_at: new Date().toISOString() };
      if (slot_duration !== undefined) updateData.slot_duration = slot_duration;
      if (max_bookings_per_day !== undefined) updateData.max_bookings_per_day = max_bookings_per_day;
      if (min_advance_hours !== undefined) updateData.min_advance_hours = min_advance_hours;
      if (max_advance_days !== undefined) updateData.max_advance_days = max_advance_days;
      if (rental_enabled !== undefined) updateData.rental_enabled = rental_enabled;
      
      result = await supabase
        .from('booking_settings')
        .update(updateData)
        .eq('client_id', req.clientId)
        .select()
        .single();
    } else {
      // Insert
      result = await supabase
        .from('booking_settings')
        .insert({
          client_id: req.clientId,
          slot_duration: slot_duration || 60,
          max_bookings_per_day: max_bookings_per_day || 2,
          min_advance_hours: min_advance_hours || 24,
          max_advance_days: max_advance_days || 30,
          rental_enabled: rental_enabled || false
        })
        .select()
        .single();
    }
    
    if (result.error) throw result.error;
    
    res.json(result.data);
  } catch (error) {
    console.error('Update booking settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /bookings/:id - Detail rezervácie
app.get('/bookings/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data: booking, error } = await supabase
      .from('bookings')
      .select(`
        *,
        booking_locations(name, address, phone),
        booking_services(name, price)
      `)
      .eq('id', id)
      .eq('client_id', req.clientId)
      .single();
    
    if (error || !booking) {
      return res.status(404).json({ error: 'Rezervácia nenájdená' });
    }
    
    res.json({
      ...booking,
      location_name: booking.booking_locations?.name,
      location_address: booking.booking_locations?.address,
      location_phone: booking.booking_locations?.phone,
      service_name: booking.booking_services?.name,
      estimated_price: booking.booking_services?.price
    });
  } catch (error) {
    console.error('Booking detail error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /bookings/:id - Úprava rezervácie
app.put('/bookings/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, final_price, admin_notes } = req.body;
    
    // Najprv načítaj pôvodnú rezerváciu (pre porovnanie statusu)
    const { data: oldBooking } = await supabase
      .from('bookings')
      .select(`
        *,
        booking_locations(name, address, phone),
        booking_services(name, price)
      `)
      .eq('id', id)
      .eq('client_id', req.clientId)
      .single();
    
    // Aktualizuj rezerváciu
    const { data: booking, error } = await supabase
      .from('bookings')
      .update({
        status,
        final_price: final_price || null,
        admin_notes,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('client_id', req.clientId)
      .select()
      .single();
    
    if (error) throw error;
    
    // Ak sa status zmenil na "completed" a zákazník má email, pošli notifikáciu
    if (status === 'completed' && oldBooking?.status !== 'completed' && oldBooking?.customer_email) {
      await sendServiceCompletedEmail(oldBooking, final_price);
    }
    
    res.json({ success: true, booking });
  } catch (error) {
    console.error('Booking update error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Email: Servis dokončený
async function sendServiceCompletedEmail(booking, finalPrice) {
  try {
    const serviceName = booking.booking_services?.name || 'Servis';
    const locationName = booking.booking_locations?.name || 'Predajňa';
    const locationAddress = booking.booking_locations?.address || '';
    const locationPhone = booking.booking_locations?.phone || '';
    const price = finalPrice || booking.booking_services?.price || 0;

    // Získaj otváracie hodiny
    let openingHours = '';
    try {
      const { data: loc } = await supabase
        .from('booking_locations')
        .select('id')
        .eq('name', locationName)
        .maybeSingle();
      
      if (loc) {
        const { data: hours } = await supabase
          .from('booking_working_hours')
          .select('day_of_week, open_time, close_time, is_closed')
          .eq('location_id', loc.id)
          .order('day_of_week');
        
        if (hours && hours.length > 0) {
          const dayNames = ['Nedeľa', 'Pondelok', 'Utorok', 'Streda', 'Štvrtok', 'Piatok', 'Sobota'];
          openingHours = hours.map(h => 
            `<tr><td style="padding:4px 12px 4px 0;color:#666;font-size:13px;">${dayNames[h.day_of_week]}</td><td style="padding:4px 0;font-size:13px;font-weight:500;">${h.is_closed ? 'Zatvorené' : `${h.open_time?.substring(0,5)} – ${h.close_time?.substring(0,5)}`}</td></tr>`
          ).join('');
        }
      }
    } catch(e) { console.error('Hours fetch error:', e); }
    
    await resend.emails.send({
      from: 'CUBE Store Bratislava <noreply@replai.sk>',
      to: booking.customer_email,
      subject: `Váš bicykel je pripravený - ${booking.booking_number}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
          
        <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:20px;text-align:center;background-color:#ffffff;"><img src="https://replai-backend.onrender.com/static/cube-light.png" alt="CUBE Store Bratislava" style="max-height:80px;display:block;margin:0 auto;" /></td></tr></table>          
          <div style="padding: 30px 30px 20px; text-align: center; border-bottom: 1px solid #eee;">
          <div style="text-align: center; margin: 0 auto 15px;">
          <span style="font-size: 48px;">✅</span>
        </div>
            <h1 style="margin: 0; font-size: 22px; font-weight: 600; color: #111;">Servis dokončený</h1>
            <p style="margin: 10px 0 0; color: #666; font-size: 14px;">Váš bicykel je pripravený na vyzdvihnutie</p>
          </div>
          
          <div style="padding: 30px;">
            <p style="color: #333; font-size: 15px; line-height: 1.6;">Dobrý deň <strong>${booking.customer_name}</strong>,</p>
            <p style="color: #333; font-size: 15px; line-height: 1.6;">váš servis bol úspešne dokončený. Bicykel si môžete vyzdvihnúť počas otváracích hodín.</p>
            
            <div style="background: #f8f8f8; border-radius: 8px; padding: 20px; margin: 25px 0; border-left: 3px solid #22c55e;">
              <h3 style="margin: 0 0 15px; font-size: 14px; font-weight: 600; color: #111; text-transform: uppercase; letter-spacing: 1px;">Detaily zákazky</h3>
              <table style="width: 100%; font-size: 14px; color: #333;">
                <tr><td style="padding: 5px 0; color: #666;">Číslo:</td><td style="padding: 5px 0; font-weight: 600;">${booking.booking_number}</td></tr>
                <tr><td style="padding: 5px 0; color: #666;">Služba:</td><td style="padding: 5px 0;">${serviceName}</td></tr>
                <tr><td style="padding: 5px 0; color: #666;">Cena:</td><td style="padding: 5px 0; font-weight: 600; font-size: 16px;">${price}€</td></tr>
              </table>
              ${booking.admin_notes ? `<p style="margin: 15px 0 0; padding-top: 15px; border-top: 1px solid #ddd; font-size: 14px; color: #666;"><strong>Poznámka:</strong> ${booking.admin_notes}</p>` : ''}
            </div>
            
            <div style="background: #f8f8f8; border-radius: 8px; padding: 20px; margin: 25px 0;">
              <h3 style="margin: 0 0 15px; font-size: 14px; font-weight: 600; color: #111; text-transform: uppercase; letter-spacing: 1px;">📍 Vyzdvihnutie</h3>
              <p style="margin: 0; font-size: 15px; font-weight: 600; color: #111;">${locationName}</p>
              <p style="margin: 5px 0 0; font-size: 14px; color: #666;">${locationAddress}</p>
              <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationName + ' ' + locationAddress)}" style="display: inline-block; margin: 8px 0 0; font-size: 13px; color: #f26522; text-decoration: none;">📍 Navigovať na Google Maps →</a>
              ${locationPhone ? `<p style="margin: 10px 0 0; font-size: 14px; color: #333;">📞 ${locationPhone}</p>` : ''}
              <p style="margin: 10px 0 0; font-size: 14px; color: #333;">📧 ${locationName.toLowerCase().includes('tri') ? 'servis.triveze@fenixbike.sk' : 'servis@fenixbike.sk'}</p>
            </div>

            ${openingHours ? `
            <div style="background: #f8f8f8; border-radius: 8px; padding: 20px; margin: 25px 0;">
            <h3 style="margin: 0 0 15px; font-size: 14px; font-weight: 600; color: #111; text-transform: uppercase; letter-spacing: 1px;">🕐 Otváracie hodiny</h3>
              <table style="width: 100%;">${openingHours}</table>
            </div>
            ` : ''}
            
            <p style="color: #333; font-size: 15px; line-height: 1.6;">Tešíme sa na vás!</p>
            <p style="color: #333; font-size: 15px; margin-top: 25px;">S pozdravom,<br><strong>Tím CUBE Store Bratislava</strong></p>
          </div>
          
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="#000000" style="padding:20px;text-align:center;font-size:12px;color:#888;background-color:#000000;"><p style="margin:0 0 8px;">Tento email bol vygenerovaný automaticky, prosím neodpovedajte naň.</p>© 2025 CUBE Store Bratislava | fenixbike.sk</td></tr></table>

        </div>
      `
    });
    console.log(`📧 Email "servis dokončený" odoslaný na ${booking.customer_email}`);
  } catch (error) {
    console.error('Failed to send service completed email:', error);
  }
}

// DELETE /bookings/:id - Vymazanie rezervácie
app.delete('/bookings/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const { error } = await supabase
      .from('bookings')
      .delete()
      .eq('id', id)
      .eq('client_id', req.clientId);
    
    if (error) throw error;
    
    res.json({ success: true });
  } catch (error) {
    console.error('Booking delete error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// PUBLIC BOOKING ENDPOINTS (pre widget/chatbot)
// ============================================


// GET /public/booking/settings - Nastavenia pre widget
app.get('/public/booking/settings', async (req, res) => {
  try {
    const { client_id } = req.query;
    
    if (!client_id) {
      return res.status(400).json({ error: 'client_id required' });
    }
    
    const { data: settings } = await supabase
    .from('booking_settings')
    .select('rental_enabled')
    .eq('client_id', client_id)
    .maybeSingle();
    
    res.json({ 
      rental_enabled: settings?.rental_enabled || false 
    });
  } catch (error) {
    console.error('Public settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});
// GET /public/booking/locations - Prevádzky pre widget
app.get('/public/booking/locations', async (req, res) => {
  try {
    const { client_id } = req.query;
    
    if (!client_id) {
      return res.status(400).json({ error: 'client_id required' });
    }
    
    const { data: locations } = await supabase
      .from('booking_locations')
      .select('id, code, name, address, phone')
      .eq('client_id', client_id)
      .eq('is_active', true)
      .order('name');
    
    res.json(locations || []);
  } catch (error) {
    console.error('Public locations error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /public/booking/services - Služby pre widget
app.get('/public/booking/services', async (req, res) => {
  try {
    const { client_id } = req.query;
    
    if (!client_id) {
      return res.status(400).json({ error: 'client_id required' });
    }
    
    const { data: services } = await supabase
      .from('booking_services')
      .select('id, code, name, description, price, price_type, duration_minutes')
      .eq('client_id', client_id)
      .eq('is_active', true)
      .order('sort_order');
    
    res.json(services || []);
  } catch (error) {
    console.error('Public services error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /public/booking/availability/days - Dostupné dni v mesiaci
app.get('/public/booking/availability/days', async (req, res) => {
  try {
    const { client_id, location, month } = req.query;
    
    if (!client_id || !location || !month) {
      return res.status(400).json({ error: 'client_id, location and month required' });
    }
    
    // Získaj location vrátane daily_capacity
    const { data: loc } = await supabase
      .from('booking_locations')
      .select('id, daily_capacity')
      .eq('client_id', client_id)
      .eq('code', location)
      .single();
    
    if (!loc) {
      return res.status(400).json({ error: 'Invalid location' });
    }
    
    const maxPerDay = loc.daily_capacity || 2;
    
    // Získaj working hours
    const { data: workingHours } = await supabase
      .from('booking_working_hours')
      .select('day_of_week, is_closed, open_time, close_time')
      .eq('location_id', loc.id);
    
    const closedDays = (workingHours || [])
      .filter(w => w.is_closed)
      .map(w => w.day_of_week);
    
    // Mapa otváracích hodín podľa dňa
    const hoursMap = {};
    (workingHours || []).forEach(w => {
      if (!w.is_closed) {
        hoursMap[w.day_of_week] = { open: w.open_time?.substring(0, 5), close: w.close_time?.substring(0, 5) };
      }
    });
    
    // Získaj blokované dni
    const { data: blocked } = await supabase
      .from('booking_blocked_slots')
      .select('blocked_date')
      .eq('location_id', loc.id);
    
    const blockedDates = (blocked || []).map(b => {
      const d = new Date(b.blocked_date);
      return d.toISOString().split('T')[0];
    });
    
    // Získaj počet rezervácií pre každý deň v mesiaci
    const [year, monthNum] = month.split('-').map(Number);
    const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(monthNum).padStart(2, '0')}-31`;
    
    const { data: bookings } = await supabase
      .from('bookings')
      .select('booking_date')
      .eq('location_id', loc.id)
      .gte('booking_date', startDate)
      .lte('booking_date', endDate)
      .neq('status', 'cancelled');
    
    // Spočítaj rezervácie na deň
    const bookingsPerDay = {};
    (bookings || []).forEach(b => {
      const dateStr = new Date(b.booking_date).toISOString().split('T')[0];
      bookingsPerDay[dateStr] = (bookingsPerDay[dateStr] || 0) + 1;
    });
    
    // Vygeneruj dni v mesiaci
    const daysInMonth = new Date(year, monthNum, 0).getDate();
    const today = new Date().toISOString().split('T')[0];
    
    const days = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const date = new Date(dateStr);
      const dayOfWeek = date.getDay();
      const dayBookings = bookingsPerDay[dateStr] || 0;
      const spotsLeft = maxPerDay - dayBookings;
      const hours = hoursMap[dayOfWeek] || null;
      
      const available = 
        dateStr >= today &&
        !closedDays.includes(dayOfWeek) &&
        !blockedDates.includes(dateStr) &&
        dayBookings < maxPerDay;
      
      days.push({ 
        date: dateStr, 
        available, 
        bookings: dayBookings,
        spots_left: available ? spotsLeft : 0,
        max_capacity: maxPerDay,
        open_time: hours?.open || null,
        close_time: hours?.close || null
      });
    }
    
    res.json({ days });
  } catch (error) {
    console.error('Availability days error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /public/booking/availability - Voľné sloty pre deň
app.get('/public/booking/availability', async (req, res) => {
  try {
    const { client_id, location, date } = req.query;
    
    if (!client_id || !location || !date) {
      return res.status(400).json({ error: 'client_id, location and date required' });
    }
    
    // Získaj location
    const { data: loc } = await supabase
      .from('booking_locations')
      .select('id')
      .eq('client_id', client_id)
      .eq('code', location)
      .single();
    
    if (!loc) {
      return res.status(400).json({ error: 'Invalid location' });
    }
    
    // Získaj settings
    const { data: settings } = await supabase
      .from('booking_settings')
      .select('slot_duration, max_bookings_per_day')
      .eq('client_id', client_id)
      .single();
    
    const slotDuration = settings?.slot_duration || 60;
    const maxPerDay = settings?.max_bookings_per_day || 2;
    
    // Získaj working hours pre daný deň
    const dayOfWeek = new Date(date).getDay();
    const { data: wh } = await supabase
      .from('booking_working_hours')
      .select('open_time, close_time, is_closed')
      .eq('location_id', loc.id)
      .eq('day_of_week', dayOfWeek)
      .single();
    
    if (!wh || wh.is_closed) {
      return res.json({ slots: [] });
    }
    
    // Získaj existujúce rezervácie na daný deň
    const { data: existingBookings } = await supabase
      .from('bookings')
      .select('booking_time')
      .eq('location_id', loc.id)
      .eq('booking_date', date)
      .neq('status', 'cancelled');
    
    const totalBookingsToday = (existingBookings || []).length;
    
    // Ak už je max rezervácií na deň, vráť prázdne sloty
    if (totalBookingsToday >= maxPerDay) {
      return res.json({ slots: [], message: 'Tento deň je už plne obsadený' });
    }
    
    // Generuj sloty
    const slots = [];
    let currentTime = new Date(`2000-01-01T${wh.open_time}`);
    const endTime = new Date(`2000-01-01T${wh.close_time}`);
    const now = new Date();
    const isToday = date === now.toISOString().split('T')[0];
    
    while (currentTime < endTime) {
      const timeStr = currentTime.toTimeString().substring(0, 5);
      
      let available = true;
      
      if (isToday) {
        const slotDateTime = new Date(`${date}T${timeStr}`);
        if (slotDateTime <= now) {
          available = false;
        }
      }
      
      slots.push({ time: timeStr, available });
      
      currentTime = new Date(currentTime.getTime() + slotDuration * 60000);
    }
    
    res.json({ slots });
  } catch (error) {
    console.error('Availability error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /public/booking/upload-photo - Upload fotky pre rezerváciu
app.post('/public/booking/upload-photo', express.raw({ type: 'image/*', limit: '25mb' }), async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'];
    if (!clientId) {
      return res.status(400).json({ error: 'client_id required' });
    }

    const contentType = req.headers['content-type'];
    const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
    const fileName = `${clientId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

    const { data, error } = await supabase.storage
      .from('booking-photos')
      .upload(fileName, req.body, {
        contentType: contentType,
        upsert: false
      });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from('booking-photos')
      .getPublicUrl(fileName);

    res.json({ url: urlData.publicUrl });
  } catch (error) {
    console.error('Photo upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// POST /public/booking - Vytvorenie rezervácie
app.post('/public/booking', async (req, res) => {
  try {
    const {
      client_id,
      location_code,
      service_code,
      customer_name,
      customer_email,
      customer_phone,
      booking_date,
      booking_time,
      bike_brand,
      bike_model,
      problem_description,
      conversation_id,
      photos
    } = req.body;
    
    if (!client_id || !location_code || !service_code || !customer_name || !customer_email || !customer_phone || !booking_date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Získaj location
    const { data: loc } = await supabase
      .from('booking_locations')
      .select('id')
      .eq('client_id', client_id)
      .eq('code', location_code)
      .single();
    
    if (!loc) {
      return res.status(400).json({ error: 'Invalid location' });
    }
    
    // Získaj service
    const { data: svc } = await supabase
      .from('booking_services')
      .select('id, price')
      .eq('client_id', client_id)
      .eq('code', service_code)
      .single();
    
    if (!svc) {
      return res.status(400).json({ error: 'Invalid service' });
    }
    
    // Skontroluj max rezervácií na deň pre danú prevádzku
  // Získaj kapacitu z location
  const { data: locData } = await supabase
  .from('booking_locations')
  .select('daily_capacity')
  .eq('id', loc.id)
  .single();

const maxPerDay = locData?.daily_capacity || 2;
    
    const { data: existingBookings } = await supabase
      .from('bookings')
      .select('id')
      .eq('location_id', loc.id)
      .eq('booking_date', booking_date)
      .neq('status', 'cancelled');
    
    if ((existingBookings || []).length >= maxPerDay) {
      return res.status(400).json({ error: 'Tento deň je už plne obsadený. Vyberte prosím iný termín.' });
    }
    
    // Získaj prefix pre booking number
    const { data: clientData } = await supabase
      .from('clients')
      .select('name')
      .eq('id', client_id)
      .single();
    
    const prefix = clientData?.name?.substring(0, 2).toUpperCase() || 'BK';
    const year = new Date().getFullYear();
    
    // Počet rezervácií tohto roka
    const { count } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', client_id)
      .gte('created_at', `${year}-01-01`);
    
    const bookingNumber = `${prefix}-${year}-${String((count || 0) + 1).padStart(4, '0')}`;
    
    // Vytvor rezerváciu
    const { data: booking, error } = await supabase
      .from('bookings')
      .insert({
        client_id,
        location_id: loc.id,
        service_id: svc.id,
        booking_number: bookingNumber,
        customer_name,
        customer_email,
        customer_phone,
        booking_date,
        booking_time,
        bike_brand,
        bike_model,
        problem_description,
        photos: photos || [],
        estimated_price: svc.price,
        conversation_id,
        status: 'pending'
      })
      .select()
      .single();
    
    if (error) throw error;
    
    // Pošli potvrdzujúci email zákazníkovi
    const { data: locationData } = await supabase
      .from('booking_locations')
      .select('name, address, phone')
      .eq('id', loc.id)
      .single();
    
    const { data: serviceData } = await supabase
      .from('booking_services')
      .select('name, price')
      .eq('id', svc.id)
      .single();
    
    await sendBookingCreatedEmail({
      ...booking,
      booking_locations: locationData,
      booking_services: serviceData
    });
    
    res.json({ success: true, booking });
  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Email: Rezervácia vytvorená
async function sendBookingCreatedEmail(booking) {
  try {
    const serviceName = booking.booking_services?.name || 'Servis';
    const servicePrice = booking.booking_services?.price || 0;
    const locationName = booking.booking_locations?.name || 'Predajňa';
    const locationAddress = booking.booking_locations?.address || '';
    const locationPhone = booking.booking_locations?.phone || '';
    
    const bookingDate = booking.booking_date ? new Date(booking.booking_date).toLocaleDateString('sk-SK') : '';

    // Získaj otváracie hodiny pre location
    let openingHours = '';
    try {
      const { data: loc } = await supabase
        .from('booking_locations')
        .select('id')
        .eq('name', locationName)
        .maybeSingle();
      
      if (loc) {
        const { data: hours } = await supabase
          .from('booking_working_hours')
          .select('day_of_week, open_time, close_time, is_closed')
          .eq('location_id', loc.id)
          .order('day_of_week');
        
        if (hours && hours.length > 0) {
          const dayNames = ['Nedeľa', 'Pondelok', 'Utorok', 'Streda', 'Štvrtok', 'Piatok', 'Sobota'];
          openingHours = hours.map(h => 
            `<tr><td style="padding:4px 12px 4px 0;color:#666;font-size:13px;">${dayNames[h.day_of_week]}</td><td style="padding:4px 0;font-size:13px;font-weight:500;">${h.is_closed ? 'Zatvorené' : `${h.open_time?.substring(0,5)} – ${h.close_time?.substring(0,5)}`}</td></tr>`
          ).join('');
        }
      }
    } catch(e) { console.error('Hours fetch error:', e); }
    
    await resend.emails.send({
      from: 'CUBE Store Bratislava <noreply@replai.sk>',
      to: booking.customer_email,
      subject: `Rezervácia servisu prijatá - ${booking.booking_number}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
          
        <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:20px;text-align:center;background-color:#ffffff;"><img src="https://replai-backend.onrender.com/static/cube-light.png" alt="CUBE Store Bratislava" style="max-height:80px;display:block;margin:0 auto;" /></td></tr></table>          <div style="padding: 30px 30px 20px; text-align: center; border-bottom: 1px solid #eee;">
            <h1 style="margin: 0; font-size: 22px; font-weight: 600; color: #111;">Rezervácia prijatá</h1>
            <p style="margin: 10px 0 0; color: #666; font-size: 14px;">Ďakujeme za vašu rezerváciu</p>
          </div>
          
          <div style="padding: 30px;">
            <p style="color: #333; font-size: 15px; line-height: 1.6;">Dobrý deň <strong>${booking.customer_name}</strong>,</p>
            <p style="color: #333; font-size: 15px; line-height: 1.6;">vašu rezerváciu sme úspešne prijali. Nižšie nájdete všetky detaily.</p>
            
            <div style="background: #f8f8f8; border-radius: 8px; padding: 20px; margin: 25px 0; border-left: 3px solid #f26522;">
              <h3 style="margin: 0 0 15px; font-size: 14px; font-weight: 600; color: #111; text-transform: uppercase; letter-spacing: 1px;">Detaily rezervácie</h3>
              <table style="width: 100%; font-size: 14px; color: #333;">
                <tr><td style="padding: 5px 0; color: #666;">Číslo:</td><td style="padding: 5px 0; font-weight: 600;">${booking.booking_number}</td></tr>
                <tr><td style="padding: 5px 0; color: #666;">Služba:</td><td style="padding: 5px 0;">${serviceName}</td></tr>
                <tr><td style="padding: 5px 0; color: #666;">Cena od:</td><td style="padding: 5px 0; font-weight: 600;">${servicePrice}€</td></tr>
                <tr><td style="padding: 5px 0; color: #666;">Dátum:</td><td style="padding: 5px 0;">${bookingDate}</td></tr>
              </table>
              ${booking.problem_description ? `<p style="margin: 15px 0 0; padding-top: 15px; border-top: 1px solid #ddd; font-size: 14px; color: #666;"><strong>Popis:</strong> ${booking.problem_description}</p>` : ''}
            </div>
            
            <div style="background: #f8f8f8; border-radius: 8px; padding: 20px; margin: 25px 0;">
              <h3 style="margin: 0 0 15px; font-size: 14px; font-weight: 600; color: #111; text-transform: uppercase; letter-spacing: 1px;">📍 Prevádzka</h3>
              <p style="margin: 0; font-size: 15px; font-weight: 600; color: #111;">${locationName}</p>
              <p style="margin: 5px 0 0; font-size: 14px; color: #666;">${locationAddress}</p>
              <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationName + ' ' + locationAddress)}" style="display: inline-block; margin: 8px 0 0; font-size: 13px; color: #f26522; text-decoration: none;">📍 Navigovať na Google Maps →</a>
              ${locationPhone ? `<p style="margin: 10px 0 0; font-size: 14px; color: #333;">📞 ${locationPhone}</p>` : ''}
              <p style="margin: 10px 0 0; font-size: 14px; color: #333;">📧 ${locationName.toLowerCase().includes('tri') ? 'servis.triveze@fenixbike.sk' : 'servis@fenixbike.sk'}</p>
            </div>

            ${openingHours ? `
            <div style="background: #f8f8f8; border-radius: 8px; padding: 20px; margin: 25px 0;">
              <h3 style="margin: 0 0 15px; font-size: 14px; font-weight: 600; color: #111; text-transform: uppercase; letter-spacing: 1px;">🕐 Otváracie hodiny</h3>
              <table style="width: 100%;">${openingHours}</table>
              <p style="margin: 15px 0 0; font-size: 13px; color: #888; border-top: 1px solid #eee; padding-top: 12px;">
                <strong style="color:#333;">Servis preberáme:</strong> ${locationName.toLowerCase().includes('tri') ? 'Utorok – Piatok 10:00 – 18:00' : 'Pondelok – Piatok 11:00 – 18:00'}
              </p>
            </div>
            ` : ''}
            
            <div style="background: #fff8e6; border-radius: 8px; padding: 12px 16px; margin: 20px 0; border-left: 3px solid #ffc107;">
            <p style="margin: 0; font-size: 13px; color: #8a6d00;">Výsledná cena práce závisí od vykonanej práce. Približná sa stanoví pri obhliadke bicykla.</p>
          </div>
          <p style="color: #888; font-size: 13px; line-height: 1.6;">Ak potrebujete zmeniť alebo zrušiť rezerváciu, kontaktujte nás telefonicky alebo emailom.</p>            <p style="color: #333; font-size: 15px; margin-top: 25px;">S pozdravom,<br><strong>Tím CUBE Store Bratislava</strong></p>
          </div>
          
          <div style="background: #111111; color: #888; padding: 20px; text-align: center; font-size: 12px;">
            <p style="margin: 0;">© 2025 CUBE Store Bratislava | fenixbike.sk</p>
          </div>
        </div>
      `
    });
    console.log(`📧 Email "rezervácia vytvorená" odoslaný na ${booking.customer_email}`);

    // Pošli notifikáciu prevádzke
    try {
      const { data: locNotif } = await supabase
        .from('booking_locations')
        .select('notification_email')
        .eq('name', locationName)
        .maybeSingle();
      
      if (locNotif?.notification_email) {
        await resend.emails.send({
          from: 'Replai <noreply@replai.sk>',
          to: locNotif.notification_email,
          subject: `🔧 Nová rezervácia servisu - ${booking.booking_number}`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
              <div style="padding: 24px; border-bottom: 2px solid #f26522;">
                <h1 style="margin: 0; font-size: 20px; color: #111;">🔧 Nová rezervácia servisu</h1>
                <p style="margin: 6px 0 0; color: #666; font-size: 14px;">${booking.booking_number} | ${locationName}</p>
              </div>
              
              <div style="padding: 24px;">
                <div style="background: #f8f8f8; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                  <h3 style="margin: 0 0 12px; font-size: 13px; font-weight: 600; color: #888; text-transform: uppercase;">Zákazník</h3>
                  <p style="margin: 0; font-size: 16px; font-weight: 600; color: #111;">${booking.customer_name}</p>
                  <p style="margin: 6px 0 0; font-size: 14px;">📞 <a href="tel:${booking.customer_phone}" style="color: #111; text-decoration: none;">${booking.customer_phone}</a></p>
                  <p style="margin: 4px 0 0; font-size: 14px;">📧 <a href="mailto:${booking.customer_email}" style="color: #111; text-decoration: none;">${booking.customer_email}</a></p>
                </div>

                <div style="background: #f8f8f8; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                  <h3 style="margin: 0 0 12px; font-size: 13px; font-weight: 600; color: #888; text-transform: uppercase;">Detaily</h3>
                  <table style="width: 100%; font-size: 14px; color: #333;">
                    <tr><td style="padding: 4px 0; color: #666;">Služba:</td><td style="padding: 4px 0; font-weight: 600;">${serviceName}</td></tr>
                    <tr><td style="padding: 4px 0; color: #666;">Cena od:</td><td style="padding: 4px 0; font-weight: 600;">${servicePrice}€</td></tr>
                    <tr><td style="padding: 4px 0; color: #666;">Dátum:</td><td style="padding: 4px 0; font-weight: 600;">${bookingDate}</td></tr>
                    ${booking.bike_brand ? `<tr><td style="padding: 4px 0; color: #666;">Bicykel:</td><td style="padding: 4px 0;">${booking.bike_brand} ${booking.bike_model || ''}</td></tr>` : ''}
                  </table>
                </div>

                ${booking.problem_description ? `
                <div style="background: #fff8e6; border-radius: 8px; padding: 16px; margin-bottom: 20px; border-left: 3px solid #ffc107;">
                  <h3 style="margin: 0 0 8px; font-size: 13px; font-weight: 600; color: #8a6d00;">Popis problému</h3>
                  <p style="margin: 0; font-size: 14px; color: #333;">${booking.problem_description}</p>
                </div>
                ` : ''}

                ${booking.photos && booking.photos.length > 0 ? `
                <div style="margin-bottom: 20px;">
                  <h3 style="margin: 0 0 12px; font-size: 13px; font-weight: 600; color: #888; text-transform: uppercase;">Fotky od zákazníka</h3>
                  <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    ${booking.photos.map(url => `<a href="${url}" target="_blank"><img src="${url}" style="width: 120px; height: 120px; object-fit: cover; border-radius: 8px; border: 1px solid #e5e5e5;" /></a>`).join('')}
                  </div>
                </div>
                ` : ''}
              </div>
            </div>
          `
        });
        console.log(`📧 Notifikácia prevádzke odoslaná na ${locNotif.notification_email}`);
      }
    } catch (notifErr) {
      console.error('Location notification error:', notifErr);
    }

  } catch (error) {
    console.error('Failed to send booking created email:', error);
  }
}

// ============================================
// BOOKING SETTINGS ENDPOINTS
// ============================================



// ============================================
// LOCATIONS CRUD
// ============================================

// POST /bookings/locations - Pridať prevádzku
app.post('/bookings/locations', authMiddleware, async (req, res) => {
  try {
    const { code, name, address, city, phone, email } = req.body;
    
    const { data, error } = await supabase
      .from('booking_locations')
      .insert({
        client_id: req.clientId,
        code,
        name,
        address,
        city,
        phone,
        email
      })
      .select()
      .single();
    
    if (error) throw error;
    
    res.json(data);
  } catch (error) {
    console.error('Create location error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /bookings/locations/:id - Upraviť prevádzku
app.put('/bookings/locations/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, address, city, phone, email, is_active, daily_capacity } = req.body;
    
    const { data, error } = await supabase
      .from('booking_locations')
      .update({ name, address, city, phone, email, is_active, daily_capacity, updated_at: new Date().toISOString() })      .eq('id', id)
      .eq('client_id', req.clientId)
      .select()
      .single();
    
    if (error) throw error;
    
    res.json(data);
  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// SERVICES CRUD
// ============================================

// POST /bookings/services - Pridať službu
app.post('/bookings/services', authMiddleware, async (req, res) => {
  try {
    const { code, name, description, price, price_type, duration_minutes, sort_order } = req.body;
    
    const { data, error } = await supabase
      .from('booking_services')
      .insert({
        client_id: req.clientId,
        code,
        name,
        description,
        price,
        price_type: price_type || 'fixed',
        duration_minutes: duration_minutes || 60,
        sort_order: sort_order || 0
      })
      .select()
      .single();
    
    if (error) throw error;
    
    res.json(data);
  } catch (error) {
    console.error('Create service error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /bookings/services/:id - Upraviť službu
app.put('/bookings/services/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { code, name, description, price, price_type, duration_minutes, sort_order, is_active } = req.body;

const { data, error } = await supabase
      .from('booking_services')
      .update({ code, name, description, price, price_type, duration_minutes, sort_order, is_active })
      .eq('id', id)
      .eq('client_id', req.clientId)
      .select()
      .single();
    
    if (error) throw error;
    
    res.json(data);
  } catch (error) {
    console.error('Update service error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /bookings/services/:id - Deaktivuj službu (soft delete)
app.delete('/bookings/services/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('booking_services')
      .update({ is_active: false })
      .eq('id', id)
      .select();
    
    if (error) throw error;
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete service error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// WORKING HOURS
// ============================================

// GET /bookings/locations/:id/hours - Otváracie hodiny prevádzky
app.get('/bookings/locations/:id/hours', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data } = await supabase
      .from('booking_working_hours')
      .select('*')
      .eq('location_id', id)
      .order('day_of_week');
    
    res.json(data || []);
  } catch (error) {
    console.error('Working hours error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /bookings/locations/:id/hours - Uložiť otváracie hodiny
app.put('/bookings/locations/:id/hours', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { hours } = req.body; // Array of { day_of_week, open_time, close_time, is_closed }
    
    // Vymaž staré
    await supabase
      .from('booking_working_hours')
      .delete()
      .eq('location_id', id);
    
    // Vlož nové
    if (hours && hours.length > 0) {
      const { error } = await supabase
        .from('booking_working_hours')
        .insert(hours.map(h => ({
          location_id: id,
          day_of_week: h.day_of_week,
          open_time: h.open_time,
          close_time: h.close_time,
          is_closed: h.is_closed || false
        })));
      
      if (error) throw error;
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Update working hours error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// RENTAL BIKES - POŽIČOVŇA TESTOVACÍCH BICYKLOV
// ============================================

// GET /public/rental/bikes - Zoznam bicyklov na požičanie
app.get('/public/rental/bikes', async (req, res) => {
  try {
    const { client_id } = req.query;
    
    if (!client_id) {
      return res.status(400).json({ error: 'client_id required' });
    }
    
    const { data: bikes, error } = await supabase
      .from('rental_bikes')
      .select('*')
      .eq('client_id', client_id)
      .eq('is_active', true)
      .order('price_per_day', { ascending: true });
    
    if (error) throw error;
    
    res.json({ bikes: bikes || [] });
  } catch (error) {
    console.error('Rental bikes list error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /public/rental/availability - Dostupnosť bicykla na dátumy
app.get('/public/rental/availability', async (req, res) => {
  try {
    const { client_id, bike_id, size, pickup_date, return_date } = req.query;
    
    if (!client_id || !bike_id || !size || !pickup_date || !return_date) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    // Skontroluj či nie je bicykel už rezervovaný v danom období
    const { data: existingBookings } = await supabase
      .from('rental_bookings')
      .select('id')
      .eq('bike_id', bike_id)
      .eq('selected_size', size)
      .neq('status', 'cancelled')
      .neq('status', 'returned')
      .or(`pickup_date.lte.${return_date},return_date.gte.${pickup_date}`);
    
    const available = !existingBookings || existingBookings.length === 0;
    
    res.json({ available });
  } catch (error) {
    console.error('Rental availability error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /public/rental/booking - Vytvorenie rezervácie bicykla
app.post('/public/rental/booking', async (req, res) => {
  try {
    const {
      client_id,
      bike_id,
      location_code,
      customer_name,
      customer_email,
      customer_phone,
      selected_size,
      pickup_date,
      return_date
    } = req.body;
    
    if (!client_id || !bike_id || !location_code || !customer_name || !customer_email || !customer_phone || !selected_size || !pickup_date || !return_date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Získaj bicykel
    const { data: bike } = await supabase
      .from('rental_bikes')
      .select('*')
      .eq('id', bike_id)
      .single();
    
    if (!bike) {
      return res.status(400).json({ error: 'Bike not found' });
    }
    
    // Skontroluj veľkosť
    if (!bike.sizes.includes(selected_size)) {
      return res.status(400).json({ error: 'Invalid size for this bike' });
    }
    
    // Získaj location
    const { data: loc } = await supabase
      .from('booking_locations')
      .select('id')
      .eq('client_id', client_id)
      .eq('code', location_code)
      .single();
    
    if (!loc) {
      return res.status(400).json({ error: 'Invalid location' });
    }
    
    // Skontroluj dostupnosť
    const { data: existingBookings } = await supabase
      .from('rental_bookings')
      .select('id')
      .eq('bike_id', bike_id)
      .eq('selected_size', selected_size)
      .neq('status', 'cancelled')
      .neq('status', 'returned')
      .or(`pickup_date.lte.${return_date},return_date.gte.${pickup_date}`);
    
    if (existingBookings && existingBookings.length > 0) {
      return res.status(400).json({ error: 'Bicykel nie je dostupný v zvolenom termíne' });
    }
    
    // Vypočítaj počet dní a celkovú cenu
    const days = Math.ceil((new Date(return_date) - new Date(pickup_date)) / (1000 * 60 * 60 * 24)) + 1;
    const totalPrice = days * bike.price_per_day;
    
    // Generuj booking number
    const year = new Date().getFullYear();
    const { count } = await supabase
      .from('rental_bookings')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', client_id)
      .gte('created_at', `${year}-01-01`);
    
    const bookingNumber = `RB-${year}-${String((count || 0) + 1).padStart(4, '0')}`;
    
    // Vytvor rezerváciu
    const { data: booking, error } = await supabase
      .from('rental_bookings')
      .insert({
        client_id,
        bike_id,
        location_id: loc.id,
        booking_number: bookingNumber,
        customer_name,
        customer_email,
        customer_phone,
        selected_size,
        pickup_date,
        return_date,
        total_price: totalPrice,
        deposit: bike.deposit,
        status: 'pending'
      })
      .select()
      .single();
    
    if (error) throw error;
    
    // Pošli email
    try {
      const { data: locationData } = await supabase
        .from('booking_locations')
        .select('name, address, phone')
        .eq('id', loc.id)
        .single();
      
      await sendRentalBookingEmail({
        ...booking,
        bike_name: bike.name,
        location_name: locationData?.name,
        location_address: locationData?.address,
        location_phone: locationData?.phone,
        days
      });
    } catch (emailErr) {
      console.error('Email error:', emailErr);
    }
    
    res.json({ 
      success: true, 
      booking_number: bookingNumber,
      total_price: totalPrice,
      deposit: bike.deposit,
      days
    });
  } catch (error) {
    console.error('Rental booking error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Email pre rental booking
async function sendRentalBookingEmail(booking) {
  try {
    const pickupDate = new Date(booking.pickup_date).toLocaleDateString('sk-SK');
    const returnDate = new Date(booking.return_date).toLocaleDateString('sk-SK');
    
    await resend.emails.send({
      from: 'CUBE Store Bratislava <noreply@replai.sk>',
      to: booking.customer_email,
      subject: `Rezervácia testovacieho bicykla - ${booking.booking_number}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
          
          <!-- Header -->
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:20px;text-align:center;background-color:#ffffff;"><img src="https://replai-backend.onrender.com/static/cube-light.png" alt="CUBE Store Bratislava" style="max-height:80px;display:block;margin:0 auto;" /></td></tr></table>          
          <!-- Title -->
          <div style="padding: 30px 30px 20px; text-align: center; border-bottom: 1px solid #eee;">
            <h1 style="margin: 0; font-size: 22px; font-weight: 600; color: #111;">Rezervácia testovacieho bicykla</h1>
            <p style="margin: 10px 0 0; color: #666; font-size: 14px;">Ďakujeme za vašu rezerváciu</p>
          </div>
          
          <!-- Content -->
          <div style="padding: 30px;">
            <p style="color: #333; font-size: 15px; line-height: 1.6;">Dobrý deň <strong>${booking.customer_name}</strong>,</p>
            
            <p style="color: #333; font-size: 15px; line-height: 1.6;">vašu rezerváciu testovacieho bicykla sme úspešne prijali.</p>
            
            <!-- Bike Details -->
            <div style="background: #f8f8f8; border-radius: 8px; padding: 20px; margin: 25px 0; border-left: 3px solid #f26522;">
              <h3 style="margin: 0 0 15px; font-size: 14px; font-weight: 600; color: #111; text-transform: uppercase; letter-spacing: 1px;">Detaily rezervácie</h3>
              <table style="width: 100%; font-size: 14px; color: #333;">
                <tr><td style="padding: 5px 0; color: #666;">Číslo:</td><td style="padding: 5px 0; font-weight: 600;">${booking.booking_number}</td></tr>
                <tr><td style="padding: 5px 0; color: #666;">Bicykel:</td><td style="padding: 5px 0; font-weight: 600;">${booking.bike_name}</td></tr>
                <tr><td style="padding: 5px 0; color: #666;">Veľkosť:</td><td style="padding: 5px 0;">${booking.selected_size}</td></tr>
                <tr><td style="padding: 5px 0; color: #666;">Vyzdvihnutie:</td><td style="padding: 5px 0;">${pickupDate}</td></tr>
                <tr><td style="padding: 5px 0; color: #666;">Vrátenie:</td><td style="padding: 5px 0;">${returnDate}</td></tr>
                <tr><td style="padding: 5px 0; color: #666;">Počet dní:</td><td style="padding: 5px 0;">${booking.days}</td></tr>
                <tr><td style="padding: 5px 0; color: #666;">Cena:</td><td style="padding: 5px 0; font-weight: 600; font-size: 16px;">${booking.total_price}€</td></tr>
              </table>
            </div>
            
            <!-- Deposit Warning -->
            <div style="background: #fff3cd; border-radius: 8px; padding: 15px 20px; margin: 25px 0; border-left: 3px solid #ffc107;">
              <p style="margin: 0; font-size: 14px; color: #856404;">
                <strong>Kaucia:</strong> Pri vyzdvihnutí bicykla je potrebné uhradiť vratnú kauciu <strong>${booking.deposit}€</strong> v hotovosti.
              </p>
            </div>
            
            <!-- Location -->
            <div style="background: #f8f8f8; border-radius: 8px; padding: 20px; margin: 25px 0;">
              <h3 style="margin: 0 0 15px; font-size: 14px; font-weight: 600; color: #111; text-transform: uppercase; letter-spacing: 1px;">Miesto vyzdvihnutia</h3>
              <p style="margin: 0; font-size: 15px; font-weight: 600; color: #111;">${booking.location_name}</p>
              <p style="margin: 5px 0 0; font-size: 14px; color: #666;">${booking.location_address}</p>
              ${booking.location_phone ? `<p style="margin: 10px 0 0; font-size: 14px; color: #333;">Tel: ${booking.location_phone}</p>` : ''}
            </div>
            
            <p style="color: #888; font-size: 13px; line-height: 1.6;">Ak potrebujete zmeniť alebo zrušiť rezerváciu, kontaktujte nás telefonicky.</p>
            
            <p style="color: #333; font-size: 15px; margin-top: 25px;">S pozdravom,<br><strong>Tím CUBE Store Bratislava</strong></p>
          </div>
          
          <!-- Footer -->
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="#000000" style="padding:20px;text-align:center;font-size:12px;color:#888;background-color:#000000;">© 2025 CUBE Store Bratislava | fenixbike.sk</td></tr></table>
        </div>
      `
    });
    console.log(`📧 Email "rental booking" odoslaný na ${booking.customer_email}`);
  } catch (error) {
    console.error('Failed to send rental booking email:', error);
  }
}

// GET /rental/bookings - Admin zoznam rental rezervácií
app.get('/rental/bookings', authMiddleware, async (req, res) => {
  try {
    const { status } = req.query;
    
    let query = supabase
      .from('rental_bookings')
      .select(`
        *,
        rental_bikes(name, image_url),
        booking_locations(name)
      `)
      .eq('client_id', req.clientId)
      .order('pickup_date', { ascending: false });
    
    if (status) {
      query = query.eq('status', status);
    }
    
    const { data: bookings, error } = await query;
    
    if (error) throw error;
    
    const result = (bookings || []).map(b => ({
      ...b,
      bike_name: b.rental_bikes?.name,
      bike_image: b.rental_bikes?.image_url,
      location_name: b.booking_locations?.name
    }));
    
    res.json({ bookings: result });
  } catch (error) {
    console.error('Rental bookings list error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /rental/bookings/:id - Aktualizácia rental rezervácie
app.put('/rental/bookings/:id', authMiddleware, async (req, res) => {
  try {
    const { status, admin_notes } = req.body;
    
    const { data, error } = await supabase
      .from('rental_bookings')
      .update({ 
        status, 
        admin_notes,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .eq('client_id', req.clientId)
      .select()
      .single();
    
    if (error) throw error;
    
    res.json(data);
  } catch (error) {
    console.error('Update rental booking error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});
// ============================================
// BLOCKED SLOTS CRUD
// ============================================

// GET /bookings/locations/:id/blocked - Zoznam blokovaných dní
app.get('/bookings/locations/:id/blocked', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('booking_blocked_slots')
      .select('*')
      .eq('location_id', id)
      .order('blocked_date', { ascending: true });
    
    if (error) throw error;
    
    res.json(data || []);
  } catch (error) {
    console.error('Blocked slots error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /bookings/locations/:id/blocked - Pridať blokovaný deň
app.post('/bookings/locations/:id/blocked', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { blocked_date, reason } = req.body;
    
    if (!blocked_date) {
      return res.status(400).json({ error: 'Dátum je povinný' });
    }
    
    // Skontroluj či už nie je blokovaný
    const { data: existing } = await supabase
      .from('booking_blocked_slots')
      .select('id')
      .eq('location_id', id)
      .eq('blocked_date', blocked_date)
      .maybeSingle();
    
    if (existing) {
      return res.status(400).json({ error: 'Tento deň je už blokovaný' });
    }
    
    const { data, error } = await supabase
      .from('booking_blocked_slots')
      .insert({
        location_id: id,
        blocked_date,
        reason: reason || null
      })
      .select()
      .single();
    
    if (error) throw error;
    
    res.json(data);
  } catch (error) {
    console.error('Block day error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /bookings/locations/:locationId/blocked/:id - Odblokovať deň
app.delete('/bookings/locations/:locationId/blocked/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const { error } = await supabase
      .from('booking_blocked_slots')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    
    res.json({ success: true });
  } catch (error) {
    console.error('Unblock day error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /public/booking/widget-settings - Farba pre booking widget
app.get('/public/booking/widget-settings', async (req, res) => {
  try {
    const { client_id } = req.query;
    if (!client_id) return res.status(400).json({ error: 'client_id required' });
    
    const { data: client } = await supabase
      .from('clients')
      .select('widget_settings')
      .eq('id', client_id)
      .single();
    
    res.json({ 
      primaryColor: client?.widget_settings?.primaryColor || '#111111'
    });
  } catch (error) {
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