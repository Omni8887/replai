(function() {
  // Konfigurácia z data atribútov
  const script = document.currentScript;
  const CLIENT_ID = script.getAttribute('data-client-id');
  const API_URL = script.getAttribute('data-backend-url') || 'https://replai-backend.onrender.com';
  const TRIGGER_SELECTOR = script.getAttribute('data-trigger'); // napr. '#servis-btn' alebo '.booking-btn'
  const PRIMARY_COLOR = script.getAttribute('data-color') || '#111111';
  const SHOW_FLOATING_BUTTON = script.getAttribute('data-floating') !== 'false';

  if (!CLIENT_ID) {
    console.error('Replai Booking: data-client-id je povinný');
    return;
  }

  // Stav
  let isOpen = false;
  let currentStep = 1;
  let currentMonth = new Date();
  let data = {
    locations: [],
    services: [],
    availableDays: [],
    availableSlots: [],
    selectedLocation: null,
    selectedService: null,
    selectedDate: null,
    selectedTime: null,
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    bikeBrand: '',
    bikeModel: '',
    problemDescription: '',
    bookingNumber: null
  };

  // CSS štýly
  const styles = `
    .rb-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      z-index: 999998;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.3s, visibility 0.3s;
    }
    .rb-overlay.rb-open {
      opacity: 1;
      visibility: visible;
    }
    .rb-widget {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) scale(0.9);
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
      width: 95%;
      max-width: 460px;
      max-height: 90vh;
      overflow: hidden;
      z-index: 999999;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.3s, visibility 0.3s, transform 0.3s;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .rb-widget.rb-open {
      opacity: 1;
      visibility: visible;
      transform: translate(-50%, -50%) scale(1);
    }
    .rb-floating-btn {
      position: fixed;
      bottom: 100px;
      right: 24px;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: ${PRIMARY_COLOR};
      color: #fff;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 999997;
      transition: transform 0.2s, box-shadow 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .rb-floating-btn:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 20px rgba(0,0,0,0.2);
    }
    .rb-floating-btn svg {
      width: 24px;
      height: 24px;
    }
    .rb-header {
      padding: 20px 24px;
      border-bottom: 1px solid #f1f1f1;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .rb-header-title {
      font-size: 18px;
      font-weight: 600;
      color: #111;
    }
    .rb-close {
      width: 32px;
      height: 32px;
      border: none;
      background: #f5f5f5;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    }
    .rb-close:hover {
      background: #e5e5e5;
    }
    .rb-progress {
      display: flex;
      gap: 4px;
      padding: 0 24px;
      margin: 16px 0;
    }
    .rb-progress-step {
      flex: 1;
      height: 3px;
      background: #e5e5e5;
      border-radius: 2px;
      transition: background 0.2s;
    }
    .rb-progress-step.rb-active {
      background: ${PRIMARY_COLOR};
    }
    .rb-content {
      padding: 20px 24px;
      min-height: 300px;
      max-height: 50vh;
      overflow-y: auto;
    }
    .rb-step-title {
      font-size: 14px;
      font-weight: 600;
      color: #111;
      margin-bottom: 16px;
    }
    .rb-options {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .rb-option {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      border: 1px solid #e5e5e5;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .rb-option:hover {
      border-color: #ccc;
      background: #fafafa;
    }
    .rb-option.rb-selected {
      border-color: ${PRIMARY_COLOR};
      background: #fafafa;
    }
    .rb-option-radio {
      width: 18px;
      height: 18px;
      border: 2px solid #ccc;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .rb-option.rb-selected .rb-option-radio {
      border-color: ${PRIMARY_COLOR};
    }
    .rb-option.rb-selected .rb-option-radio::after {
      content: '';
      width: 10px;
      height: 10px;
      background: ${PRIMARY_COLOR};
      border-radius: 50%;
    }
    .rb-option-content {
      flex: 1;
    }
    .rb-option-name {
      font-weight: 500;
      color: #111;
      font-size: 14px;
    }
    .rb-option-meta {
      font-size: 12px;
      color: #888;
      margin-top: 2px;
    }
    .rb-option-price {
      font-weight: 600;
      color: #111;
      font-size: 14px;
    }
    .rb-calendar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    .rb-calendar-nav {
      width: 32px;
      height: 32px;
      border: 1px solid #e5e5e5;
      background: #fff;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .rb-calendar-nav:hover {
      background: #f5f5f5;
    }
    .rb-calendar-month {
      font-weight: 600;
      font-size: 14px;
    }
    .rb-calendar-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 4px;
      text-align: center;
    }
    .rb-calendar-day-name {
      font-size: 11px;
      color: #888;
      padding: 8px 0;
      font-weight: 500;
    }
    .rb-calendar-day {
      aspect-ratio: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .rb-calendar-day:hover:not(.rb-disabled):not(.rb-empty) {
      background: #f5f5f5;
    }
    .rb-calendar-day.rb-selected {
      background: ${PRIMARY_COLOR};
      color: #fff;
    }
    .rb-calendar-day.rb-disabled {
      color: #ccc;
      cursor: not-allowed;
    }
    .rb-calendar-day.rb-empty {
      cursor: default;
    }
    .rb-time-slots {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-top: 16px;
    }
    .rb-time-slot {
      padding: 10px;
      text-align: center;
      border: 1px solid #e5e5e5;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .rb-time-slot:hover:not(.rb-disabled) {
      border-color: #ccc;
      background: #fafafa;
    }
    .rb-time-slot.rb-selected {
      background: ${PRIMARY_COLOR};
      color: #fff;
      border-color: ${PRIMARY_COLOR};
    }
    .rb-time-slot.rb-disabled {
      color: #ccc;
      cursor: not-allowed;
      background: #fafafa;
    }
    .rb-form-group {
      margin-bottom: 14px;
    }
    .rb-form-group label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: #333;
      margin-bottom: 6px;
    }
    .rb-form-group input,
    .rb-form-group textarea {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #e5e5e5;
      border-radius: 6px;
      font-size: 14px;
      font-family: inherit;
      box-sizing: border-box;
    }
    .rb-form-group input:focus,
    .rb-form-group textarea:focus {
      outline: none;
      border-color: ${PRIMARY_COLOR};
    }
    .rb-form-group textarea {
      min-height: 80px;
      resize: vertical;
    }
    .rb-footer {
      padding: 16px 24px;
      border-top: 1px solid #f1f1f1;
      display: flex;
      gap: 10px;
    }
    .rb-btn {
      flex: 1;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      font-family: inherit;
      cursor: pointer;
      transition: all 0.15s;
      border: none;
    }
    .rb-btn-secondary {
      background: #fff;
      border: 1px solid #e5e5e5;
      color: #333;
    }
    .rb-btn-secondary:hover {
      background: #f5f5f5;
    }
    .rb-btn-primary {
      background: ${PRIMARY_COLOR};
      color: #fff;
    }
    .rb-btn-primary:hover {
      opacity: 0.9;
    }
    .rb-btn-primary:disabled {
      background: #ccc;
      cursor: not-allowed;
    }
    .rb-success {
      text-align: center;
      padding: 40px 20px;
    }
    .rb-success-icon {
      width: 64px;
      height: 64px;
      background: #dcfce7;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
    }
    .rb-success-icon svg {
      width: 32px;
      height: 32px;
      stroke: #16a34a;
    }
    .rb-success h2 {
      font-size: 18px;
      margin: 0 0 8px 0;
    }
    .rb-success p {
      color: #666;
      font-size: 14px;
      margin: 0;
    }
    .rb-booking-number {
      font-family: monospace;
      font-size: 16px;
      font-weight: 600;
      background: #f5f5f5;
      padding: 8px 16px;
      border-radius: 6px;
      display: inline-block;
      margin: 16px 0;
    }
    .rb-loading {
      text-align: center;
      padding: 40px;
      color: #888;
    }
    .rb-error {
      background: #fef2f2;
      color: #b91c1c;
      padding: 12px;
      border-radius: 6px;
      font-size: 13px;
      margin-bottom: 16px;
    }
    @media (max-width: 480px) {
      .rb-widget {
        width: 100%;
        height: 100%;
        max-height: 100%;
        border-radius: 0;
        top: 0;
        left: 0;
        transform: translateY(100%);
      }
      .rb-widget.rb-open {
        transform: translateY(0);
      }
      .rb-content {
        max-height: calc(100vh - 200px);
      }
    }
  `;

  // Vložiť štýly
  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);

  // HTML štruktúra
  const container = document.createElement('div');
  container.innerHTML = `
    <div class="rb-overlay" id="rb-overlay"></div>
    <div class="rb-widget" id="rb-widget">
      <div class="rb-header">
        <div class="rb-header-title">Rezervácia servisu</div>
        <button class="rb-close" id="rb-close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="rb-progress" id="rb-progress">
        <div class="rb-progress-step rb-active"></div>
        <div class="rb-progress-step"></div>
        <div class="rb-progress-step"></div>
        <div class="rb-progress-step"></div>
        <div class="rb-progress-step"></div>
      </div>
      <div class="rb-content" id="rb-content">
        <div class="rb-loading">Načítavam...</div>
      </div>
      <div class="rb-footer" id="rb-footer">
        <button class="rb-btn rb-btn-secondary" id="rb-back" style="display:none">Späť</button>
        <button class="rb-btn rb-btn-primary" id="rb-next" disabled>Pokračovať</button>
      </div>
    </div>
    ${SHOW_FLOATING_BUTTON ? `
    <button class="rb-floating-btn" id="rb-floating-btn" title="Rezervovať servis">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    </button>
    ` : ''}
  `;
  document.body.appendChild(container);

  // Elementy
  const overlay = document.getElementById('rb-overlay');
  const widget = document.getElementById('rb-widget');
  const content = document.getElementById('rb-content');
  const progress = document.getElementById('rb-progress');
  const footer = document.getElementById('rb-footer');
  const btnBack = document.getElementById('rb-back');
  const btnNext = document.getElementById('rb-next');
  const btnClose = document.getElementById('rb-close');
  const floatingBtn = document.getElementById('rb-floating-btn');

  // Event listeners
  if (floatingBtn) {
    floatingBtn.addEventListener('click', openWidget);
  }
  
  // Custom trigger
  if (TRIGGER_SELECTOR) {
    document.querySelectorAll(TRIGGER_SELECTOR).forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        openWidget();
      });
    });
  }

  overlay.addEventListener('click', closeWidget);
  btnClose.addEventListener('click', closeWidget);
  btnBack.addEventListener('click', prevStep);
  btnNext.addEventListener('click', nextStep);

  // Globálna funkcia pre otvorenie
  window.openReplaiBooking = openWidget;

  function openWidget() {
    isOpen = true;
    overlay.classList.add('rb-open');
    widget.classList.add('rb-open');
    if (!data.locations.length) {
      init();
    }
  }

  function closeWidget() {
    isOpen = false;
    overlay.classList.remove('rb-open');
    widget.classList.remove('rb-open');
  }

  async function init() {
    await loadLocations();
    renderStep();
  }

  async function loadLocations() {
    try {
      const res = await fetch(`${API_URL}/public/booking/locations?client_id=${CLIENT_ID}`);
      data.locations = await res.json();
    } catch (err) {
      console.error('Error loading locations:', err);
    }
  }

  async function loadServices() {
    try {
      const res = await fetch(`${API_URL}/public/booking/services?client_id=${CLIENT_ID}`);
      data.services = await res.json();
    } catch (err) {
      console.error('Error loading services:', err);
    }
  }

  async function loadAvailableDays() {
    try {
      const month = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;
      const res = await fetch(`${API_URL}/public/booking/availability/days?client_id=${CLIENT_ID}&location=${data.selectedLocation.code}&month=${month}`);
      const result = await res.json();
      data.availableDays = result.days || [];
    } catch (err) {
      console.error('Error loading days:', err);
    }
  }

  async function loadAvailableSlots() {
    try {
      const res = await fetch(`${API_URL}/public/booking/availability?client_id=${CLIENT_ID}&location=${data.selectedLocation.code}&date=${data.selectedDate}`);
      const result = await res.json();
      data.availableSlots = result.slots || [];
    } catch (err) {
      console.error('Error loading slots:', err);
    }
  }

  function renderStep() {
    // Update progress
    const steps = progress.querySelectorAll('.rb-progress-step');
    steps.forEach((el, i) => {
      el.classList.toggle('rb-active', i < currentStep);
    });

    btnBack.style.display = currentStep > 1 && currentStep < 5 ? 'block' : 'none';
    footer.style.display = currentStep < 5 ? 'flex' : 'none';

    switch(currentStep) {
      case 1: renderLocations(); break;
      case 2: renderServices(); break;
      case 3: renderCalendar(); break;
      case 4: renderForm(); break;
      case 5: renderSuccess(); break;
    }

    updateNextButton();
  }

  function renderLocations() {
    if (!data.locations.length) {
      content.innerHTML = '<div class="rb-error">Nepodarilo sa načítať prevádzky</div>';
      return;
    }

    content.innerHTML = `
      <div class="rb-step-title">Vyberte prevádzku</div>
      <div class="rb-options">
        ${data.locations.map(loc => `
          <div class="rb-option ${data.selectedLocation?.id === loc.id ? 'rb-selected' : ''}" data-location-id="${loc.id}">
            <div class="rb-option-radio"></div>
            <div class="rb-option-content">
              <div class="rb-option-name">${loc.name}</div>
              <div class="rb-option-meta">${loc.address || ''}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    content.querySelectorAll('.rb-option').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.locationId;
        data.selectedLocation = data.locations.find(l => l.id === id);
        data.selectedDate = null;
        data.selectedTime = null;
        renderStep();
      });
    });
  }

  async function renderServices() {
    if (!data.services.length) {
      content.innerHTML = '<div class="rb-loading">Načítavam služby...</div>';
      await loadServices();
    }

    content.innerHTML = `
      <div class="rb-step-title">Vyberte službu</div>
      <div class="rb-options">
        ${data.services.map(svc => `
          <div class="rb-option ${data.selectedService?.id === svc.id ? 'rb-selected' : ''}" data-service-id="${svc.id}">
            <div class="rb-option-radio"></div>
            <div class="rb-option-content">
              <div class="rb-option-name">${svc.name}</div>
              <div class="rb-option-meta">${svc.description || ''}</div>
            </div>
            <div class="rb-option-price">${svc.price}€${svc.price_type === 'hourly' ? '/hod' : ''}</div>
          </div>
        `).join('')}
      </div>
    `;

    content.querySelectorAll('.rb-option').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.serviceId;
        data.selectedService = data.services.find(s => s.id === id);
        renderStep();
      });
    });
  }

  async function renderCalendar() {
    content.innerHTML = '<div class="rb-loading">Načítavam kalendár...</div>';
    await loadAvailableDays();

    const monthNames = ['Január', 'Február', 'Marec', 'Apríl', 'Máj', 'Jún', 'Júl', 'August', 'September', 'Október', 'November', 'December'];
    const dayNames = ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'];

    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startOffset = firstDay === 0 ? 6 : firstDay - 1;

    let daysHtml = dayNames.map(d => `<div class="rb-calendar-day-name">${d}</div>`).join('');

    for (let i = 0; i < startOffset; i++) {
      daysHtml += '<div class="rb-calendar-day rb-empty"></div>';
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayData = data.availableDays.find(d => d.date === dateStr);
      const available = dayData?.available;
      const selected = data.selectedDate === dateStr;

      daysHtml += `<div class="rb-calendar-day ${selected ? 'rb-selected' : ''} ${!available ? 'rb-disabled' : ''}" data-date="${dateStr}">${day}</div>`;
    }

    content.innerHTML = `
      <div class="rb-step-title">Vyberte dátum a čas</div>
      <div class="rb-calendar">
        <div class="rb-calendar-header">
          <button class="rb-calendar-nav" id="rb-prev-month">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div class="rb-calendar-month">${monthNames[month]} ${year}</div>
          <button class="rb-calendar-nav" id="rb-next-month">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>
        <div class="rb-calendar-grid">${daysHtml}</div>
      </div>
      <div id="rb-time-slots"></div>
    `;

    document.getElementById('rb-prev-month').addEventListener('click', () => {
      currentMonth.setMonth(currentMonth.getMonth() - 1);
      data.selectedDate = null;
      data.selectedTime = null;
      renderCalendar();
    });

    document.getElementById('rb-next-month').addEventListener('click', () => {
      currentMonth.setMonth(currentMonth.getMonth() + 1);
      data.selectedDate = null;
      data.selectedTime = null;
      renderCalendar();
    });

    content.querySelectorAll('.rb-calendar-day:not(.rb-disabled):not(.rb-empty)').forEach(el => {
      el.addEventListener('click', async () => {
        data.selectedDate = el.dataset.date;
        data.selectedTime = null;
        
        // Update selected state
        content.querySelectorAll('.rb-calendar-day').forEach(d => d.classList.remove('rb-selected'));
        el.classList.add('rb-selected');
        
        await renderTimeSlots();
      });
    });

    if (data.selectedDate) {
      await renderTimeSlots();
    }
    
    updateNextButton();
  }

  async function renderTimeSlots() {
    const container = document.getElementById('rb-time-slots');
    if (!container) return;

    container.innerHTML = '<div class="rb-loading" style="padding:20px 0">Načítavam časy...</div>';
    await loadAvailableSlots();

    if (!data.availableSlots.length) {
      container.innerHTML = '<div class="rb-error">Žiadne voľné termíny</div>';
      updateNextButton();
      return;
    }

    container.innerHTML = `
      <div class="rb-step-title" style="margin-top:20px">Vyberte čas</div>
      <div class="rb-time-slots">
        ${data.availableSlots.map(slot => `
          <div class="rb-time-slot ${data.selectedTime === slot.time ? 'rb-selected' : ''} ${!slot.available ? 'rb-disabled' : ''}" data-time="${slot.time}">${slot.time}</div>
        `).join('')}
      </div>
    `;

    container.querySelectorAll('.rb-time-slot:not(.rb-disabled)').forEach(el => {
      el.addEventListener('click', () => {
        data.selectedTime = el.dataset.time;
        container.querySelectorAll('.rb-time-slot').forEach(s => s.classList.remove('rb-selected'));
        el.classList.add('rb-selected');
        updateNextButton();
      });
    });
    
    updateNextButton();
  }

  function renderForm() {
    content.innerHTML = `
      <div class="rb-step-title">Vaše údaje</div>
      <div class="rb-form-group">
        <label>Meno a priezvisko *</label>
        <input type="text" id="rb-name" value="${data.customerName}">
      </div>
      <div class="rb-form-group">
        <label>Email *</label>
        <input type="email" id="rb-email" value="${data.customerEmail}">
      </div>
      <div class="rb-form-group">
        <label>Telefón *</label>
        <input type="tel" id="rb-phone" value="${data.customerPhone}">
      </div>
      <div class="rb-form-group">
        <label>Značka bicykla</label>
        <input type="text" id="rb-brand" value="${data.bikeBrand}">
      </div>
      <div class="rb-form-group">
        <label>Model bicykla</label>
        <input type="text" id="rb-model" value="${data.bikeModel}">
      </div>
      <div class="rb-form-group">
        <label>Popis problému</label>
        <textarea id="rb-problem">${data.problemDescription}</textarea>
      </div>
    `;

    const inputs = {
      name: document.getElementById('rb-name'),
      email: document.getElementById('rb-email'),
      phone: document.getElementById('rb-phone'),
      brand: document.getElementById('rb-brand'),
      model: document.getElementById('rb-model'),
      problem: document.getElementById('rb-problem')
    };

    Object.entries(inputs).forEach(([key, el]) => {
      el.addEventListener('input', () => {
        if (key === 'name') data.customerName = el.value;
        if (key === 'email') data.customerEmail = el.value;
        if (key === 'phone') data.customerPhone = el.value;
        if (key === 'brand') data.bikeBrand = el.value;
        if (key === 'model') data.bikeModel = el.value;
        if (key === 'problem') data.problemDescription = el.value;
        updateNextButton();
      });
    });

    btnNext.textContent = 'Odoslať rezerváciu';
    updateNextButton();
  }

  function renderSuccess() {
    content.innerHTML = `
      <div class="rb-success">
        <div class="rb-success-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
        </div>
        <h2>Rezervácia odoslaná!</h2>
        <p>Číslo vašej rezervácie:</p>
        <div class="rb-booking-number">${data.bookingNumber}</div>
        <p>Potvrdenie sme poslali na ${data.customerEmail}</p>
      </div>
    `;
  }

  function updateNextButton() {
    let enabled = false;

    switch(currentStep) {
      case 1: enabled = !!data.selectedLocation; break;
      case 2: enabled = !!data.selectedService; break;
      case 3: enabled = !!data.selectedDate && !!data.selectedTime; break;
      case 4:
        enabled = data.customerName.trim() && data.customerEmail.trim() && data.customerPhone.trim();
        break;
    }

    btnNext.disabled = !enabled;
  }

  async function nextStep() {
    if (currentStep === 4) {
      await submitBooking();
      return;
    }

    currentStep++;
    renderStep();
  }

  function prevStep() {
    currentStep--;
    renderStep();
  }

  async function submitBooking() {
    btnNext.disabled = true;
    btnNext.textContent = 'Odosielam...';

    try {
      const res = await fetch(`${API_URL}/public/booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          location_code: data.selectedLocation.code,
          service_code: data.selectedService.code,
          customer_name: data.customerName,
          customer_email: data.customerEmail,
          customer_phone: data.customerPhone,
          booking_date: data.selectedDate,
          booking_time: data.selectedTime,
          bike_brand: data.bikeBrand,
          bike_model: data.bikeModel,
          problem_description: data.problemDescription
        })
      });

      const result = await res.json();

      if (result.success) {
        data.bookingNumber = result.booking.booking_number;
        currentStep = 5;
        renderStep();
      } else {
        alert('Chyba: ' + (result.error || 'Nepodarilo sa vytvoriť rezerváciu'));
        btnNext.disabled = false;
        btnNext.textContent = 'Odoslať rezerváciu';
      }
    } catch (err) {
      console.error('Submit error:', err);
      alert('Chyba pri odosielaní rezervácie');
      btnNext.disabled = false;
      btnNext.textContent = 'Odoslať rezerváciu';
    }
  }
})();