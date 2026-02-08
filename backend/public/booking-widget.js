(function() {
  // Načítaj konfiguráciu zo script tagu
  const currentScript = document.currentScript || document.querySelector('script[data-client-id]');
  const API_URL = currentScript?.getAttribute('data-backend-url') || 'https://replai-backend.onrender.com';
  const CLIENT_ID = currentScript?.getAttribute('data-client-id');
  
  if (!CLIENT_ID) {
    console.error('Fenix Booking Widget: Chýba data-client-id atribút');
    return;
  }
  
  let state = {
    mode: null, // 'service' or 'rental'
    step: 0,
    // Service state
    locations: [],
    services: [],
    selectedLocation: null,
    selectedService: null,
    selectedDate: null,
    selectedTime: null,
    availableDays: [],
    availableSlots: [],
    currentMonth: new Date(),
    // Rental state
    bikes: [],
    selectedBike: null,
    selectedSize: null,
    pickupDate: null,
    returnDate: null,
    selectingDate: 'pickup', // 'pickup' or 'return'
    rentalMonth: new Date()
  };

  function createWidget() {
    const widget = document.createElement('div');
    widget.id = 'fbw';
    widget.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
        
        #fbw {
          font-family: 'Inter', system-ui, sans-serif;
          width: 100%;
          max-width: 480px;
          margin: 0 auto;
          background: #fff;
          border-radius: 16px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.05);
          overflow: hidden;
          color: #1a1a1a;
          font-size: 14px;
          line-height: 1.5;
        }
        
        .fbw-header {
          padding: 24px 28px;
          border-bottom: 1px solid #f0f0f0;
        }
        
        .fbw-brand {
          font-size: 13px;
          font-weight: 500;
          color: #666;
          margin-bottom: 4px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .fbw-title {
          font-size: 20px;
          font-weight: 600;
          color: #111;
          margin: 0;
        }
        
        .fbw-steps {
          display: flex;
          padding: 16px 28px;
          background: #fafafa;
          border-bottom: 1px solid #f0f0f0;
          gap: 4px;
        }
        
        .fbw-step-indicator {
          flex: 1;
          height: 3px;
          background: #e0e0e0;
          border-radius: 3px;
          transition: background 0.3s ease;
        }
        
        .fbw-step-indicator.active,
        .fbw-step-indicator.done {
          background: #111;
        }
        
        .fbw-content {
          padding: 24px 28px;
          min-height: 320px;
        }
        
        .fbw-section {
          display: none;
        }
        
        .fbw-section.active {
          display: block;
          animation: fbwFade 0.25s ease;
        }
        
        @keyframes fbwFade {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .fbw-section-title {
          font-size: 15px;
          font-weight: 600;
          color: #111;
          margin: 0 0 4px;
        }
        
        .fbw-section-desc {
          font-size: 13px;
          color: #666;
          margin: 0 0 20px;
        }
        
        /* Mode Selection */
        .fbw-mode-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        
        .fbw-mode-card {
          padding: 24px 16px;
          border: 2px solid #e5e5e5;
          border-radius: 12px;
          cursor: pointer;
          text-align: center;
          transition: all 0.2s ease;
        }
        
        .fbw-mode-card:hover {
          border-color: #111;
          background: #fafafa;
        }
        
        .fbw-mode-card.selected {
          border-color: #111;
          background: #111;
          color: #fff;
        }
        
        .fbw-mode-icon {
          width: 48px;
          height: 48px;
          margin: 0 auto 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f5f5f5;
          border-radius: 12px;
        }
        
        .fbw-mode-icon svg {
          width: 28px;
          height: 28px;
        }
        
        .fbw-mode-card.selected .fbw-mode-icon {
          background: rgba(255,255,255,0.2);
        }
        
        .fbw-mode-card.selected .fbw-mode-icon svg {
          stroke: #fff;
        }
        
        .fbw-mode-title {
          font-size: 14px;
          font-weight: 600;
        }
        
        .fbw-mode-desc {
          font-size: 12px;
          opacity: 0.7;
          margin-top: 4px;
        }
        
        /* List items */
        .fbw-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        
        .fbw-list-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          border: 1px solid #e5e5e5;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        
        .fbw-list-item:hover {
          border-color: #111;
          background: #fafafa;
        }
        
        .fbw-list-item.selected {
          border-color: #111;
          background: #111;
          color: #fff;
        }
        
        .fbw-list-item-info {
          display: flex;
          flex-direction: column;
        }
        
        .fbw-list-item-name {
          font-weight: 500;
          font-size: 14px;
        }
        
        .fbw-list-item-meta {
          font-size: 12px;
          color: #888;
          margin-top: 2px;
        }
        
        .fbw-list-item.selected .fbw-list-item-meta {
          color: rgba(255,255,255,0.7);
        }
        
        .fbw-list-item-price {
          font-weight: 600;
          font-size: 15px;
        }
        
        /* Bike Grid */
        .fbw-bikes-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }
        
        .fbw-bike-card {
          border: 2px solid #e5e5e5;
          border-radius: 12px;
          overflow: hidden;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .fbw-bike-card:hover {
          border-color: #111;
        }
        
        .fbw-bike-card.selected {
          border-color: #111;
          box-shadow: 0 0 0 2px #111;
        }
        
        .fbw-bike-img {
          width: 100%;
          height: 120px;
          object-fit: contain;
          background: #f8f8f8;
          padding: 8px;
        }
        
        .fbw-bike-info {
          padding: 12px;
        }
        
        .fbw-bike-name {
          font-size: 12px;
          font-weight: 600;
          color: #111;
          line-height: 1.3;
          min-height: 32px;
        }
        
        .fbw-bike-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 8px;
        }
        
        .fbw-bike-sizes {
          font-size: 11px;
          color: #666;
        }
        
        .fbw-bike-price {
          font-size: 14px;
          font-weight: 600;
          color: #111;
        }
        
        /* Size selector */
        .fbw-sizes {
          display: flex;
          gap: 8px;
          margin-top: 16px;
        }
        
        .fbw-size-btn {
          width: 48px;
          height: 48px;
          border: 2px solid #e5e5e5;
          border-radius: 8px;
          background: #fff;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
        }
        
        .fbw-size-btn:hover {
          border-color: #111;
        }
        
        .fbw-size-btn.selected {
          background: #111;
          border-color: #111;
          color: #fff;
        }
        
        /* Calendar */
        .fbw-calendar-nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }
        
        .fbw-calendar-title {
          font-weight: 600;
          font-size: 15px;
        }
        
        .fbw-calendar-arrows {
          display: flex;
          gap: 4px;
        }
        
        .fbw-calendar-arrows button {
          width: 32px;
          height: 32px;
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          background: #fff;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .fbw-calendar-arrows button:hover {
          background: #f5f5f5;
        }
        
        .fbw-calendar-arrows svg {
          width: 16px;
          height: 16px;
          stroke: currentColor;
        }
        
        .fbw-calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 4px;
        }
        
        .fbw-calendar-header {
          text-align: center;
          font-size: 11px;
          font-weight: 500;
          color: #999;
          padding: 8px 0;
        }
        
        .fbw-calendar-day {
          aspect-ratio: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s;
          color: #333;
        }
        
        .fbw-calendar-day:hover:not(.disabled):not(.empty) {
          background: #f0f0f0;
        }
        
        .fbw-calendar-day.today {
          font-weight: 600;
        }
        
        .fbw-calendar-day.selected {
          background: #111;
          color: #fff;
        }
        
        .fbw-calendar-day.in-range {
          background: #e5e5e5;
        }
        
        .fbw-calendar-day.pickup {
          background: #111;
          color: #fff;
          border-radius: 8px 0 0 8px;
        }
        
        .fbw-calendar-day.return {
          background: #111;
          color: #fff;
          border-radius: 0 8px 8px 0;
        }
        
        .fbw-calendar-day.pickup.return {
          border-radius: 8px;
        }
        
        .fbw-calendar-day.disabled {
          color: #ccc;
          cursor: default;
        }
        
        .fbw-calendar-day.empty {
          cursor: default;
        }
        
        /* Date selection info */
        .fbw-date-info {
          display: flex;
          gap: 12px;
          margin-bottom: 20px;
          padding: 12px;
          background: #f8f8f8;
          border-radius: 8px;
        }
        
        .fbw-date-box {
          flex: 1;
          padding: 10px;
          background: #fff;
          border-radius: 6px;
          border: 2px solid transparent;
          cursor: pointer;
          transition: border-color 0.15s;
        }
        
        .fbw-date-box.active {
          border-color: #111;
        }
        
        .fbw-date-box-label {
          font-size: 11px;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .fbw-date-box-value {
          font-size: 14px;
          font-weight: 600;
          margin-top: 4px;
        }
        
        /* Times */
        .fbw-times {
          margin-top: 20px;
          padding-top: 20px;
          border-top: 1px solid #f0f0f0;
        }
        
        .fbw-times-title {
          font-size: 13px;
          font-weight: 500;
          color: #666;
          margin-bottom: 12px;
        }
        
        .fbw-times-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
        }
        
        .fbw-time {
          padding: 10px 8px;
          text-align: center;
          font-size: 13px;
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s;
        }
        
        .fbw-time:hover:not(.disabled) {
          border-color: #111;
        }
        
        .fbw-time.selected {
          background: #111;
          border-color: #111;
          color: #fff;
        }
        
        .fbw-time.disabled {
          color: #ccc;
          background: #fafafa;
          cursor: default;
          border-color: transparent;
        }
        
        /* Form */
        .fbw-form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        
        .fbw-field {
          margin-bottom: 16px;
        }
        
        .fbw-field label {
          display: block;
          font-size: 13px;
          font-weight: 500;
          color: #333;
          margin-bottom: 6px;
        }
        
        .fbw-field label span {
          color: #999;
          font-weight: 400;
        }
        
        .fbw-field input,
        .fbw-field textarea {
          width: 100%;
          padding: 11px 14px;
          border: 1px solid #ddd;
          border-radius: 8px;
          font-size: 14px;
          font-family: inherit;
          transition: border-color 0.15s;
          box-sizing: border-box;
        }
        
        .fbw-field input:focus,
        .fbw-field textarea:focus {
          outline: none;
          border-color: #111;
        }
        
        .fbw-field textarea {
          min-height: 80px;
          resize: vertical;
        }
        
        /* Summary */
        .fbw-summary-list {
          background: #fafafa;
          border-radius: 10px;
          padding: 16px;
        }
        
        .fbw-summary-item {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #eee;
        }
        
        .fbw-summary-item:last-child {
          border-bottom: none;
        }
        
        .fbw-summary-label {
          color: #666;
          font-size: 13px;
        }
        
        .fbw-summary-value {
          font-weight: 500;
          font-size: 13px;
          text-align: right;
        }
        
        .fbw-summary-item.total {
          margin-top: 8px;
          padding-top: 12px;
          border-top: 2px solid #ddd;
          border-bottom: none;
        }
        
        .fbw-summary-item.total .fbw-summary-label,
        .fbw-summary-item.total .fbw-summary-value {
          font-size: 15px;
          font-weight: 600;
        }
        
        /* Deposit warning */
        .fbw-deposit-warning {
          background: #fff8e6;
          border: 1px solid #ffd666;
          border-radius: 8px;
          padding: 12px 14px;
          margin-top: 16px;
          font-size: 13px;
          color: #8a6d00;
        }
        
        .fbw-deposit-warning strong {
          color: #6b5300;
        }
        
        /* Footer */
        .fbw-footer {
          display: flex;
          justify-content: space-between;
          padding: 16px 28px 24px;
          gap: 12px;
        }
        
        .fbw-btn {
          flex: 1;
          padding: 14px 20px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.15s ease;
          border: none;
        }
        
        .fbw-btn-back {
          background: #f5f5f5;
          color: #333;
          flex: 0 0 auto;
          padding: 14px 18px;
        }
        
        .fbw-btn-back:hover {
          background: #eaeaea;
        }
        
        .fbw-btn-next {
          background: #111;
          color: #fff;
        }
        
        .fbw-btn-next:hover {
          background: #000;
        }
        
        .fbw-btn-next:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        
        /* Success */
        .fbw-success {
          text-align: center;
          padding: 20px 0;
        }
        
        .fbw-success-icon {
          width: 64px;
          height: 64px;
          background: #111;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
        }
        
        .fbw-success-icon svg {
          width: 32px;
          height: 32px;
          stroke: #fff;
        }
        
        .fbw-success-title {
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 8px;
        }
        
        .fbw-success-text {
          font-size: 14px;
          color: #666;
        }
        
        .fbw-success-number {
          font-size: 24px;
          font-weight: 600;
          font-family: monospace;
          background: #f5f5f5;
          padding: 12px 24px;
          border-radius: 8px;
          display: inline-block;
          margin: 16px 0;
        }
        
        /* Error */
        .fbw-error {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #dc2626;
          padding: 12px 14px;
          border-radius: 8px;
          font-size: 13px;
          margin-bottom: 16px;
        }
        
        /* Loading */
        .fbw-loading {
          text-align: center;
          padding: 40px 0;
          color: #888;
        }
        
        @keyframes fbwSpin {
          to { transform: rotate(360deg); }
        }
        
        .fbw-spinner {
          width: 24px;
          height: 24px;
          border: 2px solid #e5e5e5;
          border-top-color: #111;
          border-radius: 50%;
          animation: fbwSpin 0.8s linear infinite;
          margin: 0 auto 12px;
        }
      </style>
      
      <div class="fbw-header">
        <div class="fbw-brand">CUBE Store Bratislava</div>
        <h1 class="fbw-title" id="fbw-main-title">Online rezervácia</h1>
      </div>
      
      <div class="fbw-steps" id="fbw-steps">
        <div class="fbw-step-indicator"></div>
        <div class="fbw-step-indicator"></div>
        <div class="fbw-step-indicator"></div>
        <div class="fbw-step-indicator"></div>
        <div class="fbw-step-indicator"></div>
      </div>
      
      <div class="fbw-content">
        <!-- Step 0: Mode Selection -->
        <div class="fbw-section active" data-step="0">
          <h2 class="fbw-section-title">Čo by ste chceli?</h2>
          <p class="fbw-section-desc">Vyberte typ rezervácie</p>
          <div class="fbw-mode-grid">
            <div class="fbw-mode-card" onclick="FenixBooking.selectMode('service')">
              <div class="fbw-mode-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                </svg>
              </div>
              <div class="fbw-mode-title">Servis</div>
              <div class="fbw-mode-desc">Oprava a údržba bicykla</div>
            </div>
            <div class="fbw-mode-card" onclick="FenixBooking.selectMode('rental')">
              <div class="fbw-mode-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <circle cx="5.5" cy="17.5" r="3.5"/>
                  <circle cx="18.5" cy="17.5" r="3.5"/>
                  <path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5V14l-3-3 4-3 2 3h3"/>
                </svg>
              </div>
              <div class="fbw-mode-title">Požičovňa</div>
              <div class="fbw-mode-desc">Testovací bicykel na deň</div>
            </div>
          </div>
        </div>
        
        <!-- SERVICE FLOW -->
        <!-- Step S1: Location -->
        <div class="fbw-section" data-step="s1">
          <h2 class="fbw-section-title">Vyberte prevádzku</h2>
          <p class="fbw-section-desc">Kde chcete dať bicykel na servis?</p>
          <div class="fbw-list" id="fbw-locations"></div>
        </div>
        
        <!-- Step S2: Service -->
        <div class="fbw-section" data-step="s2">
          <h2 class="fbw-section-title">Vyberte typ servisu</h2>
          <p class="fbw-section-desc">Aký servis potrebujete?</p>
          <div class="fbw-list" id="fbw-services"></div>
        </div>
        
        <!-- Step S3: Date/Time -->
        <div class="fbw-section" data-step="s3">
          <h2 class="fbw-section-title">Vyberte termín</h2>
          <p class="fbw-section-desc">Kedy vám to vyhovuje?</p>
          <div class="fbw-calendar-nav">
            <span class="fbw-calendar-title" id="fbw-month"></span>
            <div class="fbw-calendar-arrows">
              <button onclick="FenixBooking.prevMonth()">
                <svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <button onclick="FenixBooking.nextMonth()">
                <svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </div>
          </div>
          <div class="fbw-calendar-grid" id="fbw-calendar"></div>
          <div id="fbw-times-wrap" style="display:none;">
            <div class="fbw-times">
              <div class="fbw-times-title">Dostupné časy</div>
              <div class="fbw-times-grid" id="fbw-times"></div>
            </div>
          </div>
        </div>
        
        <!-- Step S4: Form -->
        <div class="fbw-section" data-step="s4">
          <h2 class="fbw-section-title">Vaše údaje</h2>
          <p class="fbw-section-desc">Kontaktné informácie pre rezerváciu</p>
          <div id="fbw-form-error" class="fbw-error" style="display:none;"></div>
          <div class="fbw-field">
            <label>Meno a priezvisko</label>
            <input type="text" id="fbw-name" placeholder="Ján Novák">
          </div>
          <div class="fbw-form-row">
            <div class="fbw-field">
              <label>Email</label>
              <input type="email" id="fbw-email" placeholder="jan@email.sk">
            </div>
            <div class="fbw-field">
              <label>Telefón</label>
              <input type="tel" id="fbw-phone" placeholder="+421 9XX XXX XXX">
            </div>
          </div>
          <div class="fbw-form-row">
            <div class="fbw-field">
              <label>Značka bicykla <span>(voliteľné)</span></label>
              <input type="text" id="fbw-bike-brand" placeholder="CUBE, Trek...">
            </div>
            <div class="fbw-field">
              <label>Model <span>(voliteľné)</span></label>
              <input type="text" id="fbw-bike-model" placeholder="Reaction...">
            </div>
          </div>
          <div class="fbw-field">
            <label>Popis problému <span>(voliteľné)</span></label>
            <textarea id="fbw-problem" placeholder="Popíšte problém alebo čo potrebujete..."></textarea>
          </div>
        </div>
        
        <!-- Step S5: Summary -->
        <div class="fbw-section" data-step="s5">
          <h2 class="fbw-section-title">Zhrnutie</h2>
          <p class="fbw-section-desc">Skontrolujte údaje pred odoslaním</p>
          <div class="fbw-summary-list" id="fbw-summary"></div>
          <div id="fbw-submit-error" class="fbw-error" style="display:none;"></div>
        </div>
        
        <!-- RENTAL FLOW -->
        <!-- Step R1: Bikes -->
        <div class="fbw-section" data-step="r1">
          <h2 class="fbw-section-title">Vyberte bicykel</h2>
          <p class="fbw-section-desc">Testovacie bicykle na prenájom</p>
          <div class="fbw-bikes-grid" id="fbw-bikes"></div>
        </div>
        
        <!-- Step R2: Size -->
        <div class="fbw-section" data-step="r2">
          <h2 class="fbw-section-title">Vyberte veľkosť</h2>
          <p class="fbw-section-desc" id="fbw-selected-bike-name"></p>
          <div class="fbw-sizes" id="fbw-sizes"></div>
        </div>
        
        <!-- Step R3: Location for pickup -->
        <div class="fbw-section" data-step="r3">
          <h2 class="fbw-section-title">Vyberte prevádzku</h2>
          <p class="fbw-section-desc">Kde si bicykel vyzdvihnete?</p>
          <div class="fbw-list" id="fbw-rental-locations"></div>
        </div>
        
        <!-- Step R4: Dates -->
        <div class="fbw-section" data-step="r4">
          <h2 class="fbw-section-title">Vyberte termín</h2>
          <p class="fbw-section-desc">Dátum vyzdvihnutia a vrátenia</p>
          <div class="fbw-date-info">
            <div class="fbw-date-box active" id="fbw-pickup-box" onclick="FenixBooking.setDateMode('pickup')">
              <div class="fbw-date-box-label">Vyzdvihnutie</div>
              <div class="fbw-date-box-value" id="fbw-pickup-display">Vyberte dátum</div>
            </div>
            <div class="fbw-date-box" id="fbw-return-box" onclick="FenixBooking.setDateMode('return')">
              <div class="fbw-date-box-label">Vrátenie</div>
              <div class="fbw-date-box-value" id="fbw-return-display">Vyberte dátum</div>
            </div>
          </div>
          <div class="fbw-calendar-nav">
            <span class="fbw-calendar-title" id="fbw-rental-month"></span>
            <div class="fbw-calendar-arrows">
              <button onclick="FenixBooking.prevRentalMonth()">
                <svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <button onclick="FenixBooking.nextRentalMonth()">
                <svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </div>
          </div>
          <div class="fbw-calendar-grid" id="fbw-rental-calendar"></div>
        </div>
        
        <!-- Step R5: Form -->
        <div class="fbw-section" data-step="r5">
          <h2 class="fbw-section-title">Vaše údaje</h2>
          <p class="fbw-section-desc">Kontaktné informácie pre rezerváciu</p>
          <div id="fbw-rental-form-error" class="fbw-error" style="display:none;"></div>
          <div class="fbw-field">
            <label>Meno a priezvisko</label>
            <input type="text" id="fbw-rental-name" placeholder="Ján Novák">
          </div>
          <div class="fbw-form-row">
            <div class="fbw-field">
              <label>Email</label>
              <input type="email" id="fbw-rental-email" placeholder="jan@email.sk">
            </div>
            <div class="fbw-field">
              <label>Telefón</label>
              <input type="tel" id="fbw-rental-phone" placeholder="+421 9XX XXX XXX">
            </div>
          </div>
        </div>
        
        <!-- Step R6: Summary -->
        <div class="fbw-section" data-step="r6">
          <h2 class="fbw-section-title">Zhrnutie</h2>
          <p class="fbw-section-desc">Skontrolujte údaje pred odoslaním</p>
          <div class="fbw-summary-list" id="fbw-rental-summary"></div>
          <div class="fbw-deposit-warning">
            <strong>Kaucia 500€</strong><br>
            Pri vyzdvihnutí bicykla je potrebné uhradiť vratnú kauciu v hotovosti.
          </div>
          <div id="fbw-rental-submit-error" class="fbw-error" style="display:none; margin-top: 16px;"></div>
        </div>
        
        <!-- Success (shared) -->
        <div class="fbw-section" data-step="success">
          <div class="fbw-success">
            <div class="fbw-success-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
            </div>
            <div class="fbw-success-title">Rezervácia bola vytvorená</div>
            <div class="fbw-success-text">Číslo vašej rezervácie:</div>
            <div class="fbw-success-number" id="fbw-booking-number"></div>
            <div class="fbw-success-text">Potvrdenie sme poslali na váš email.</div>
          </div>
        </div>
      </div>
      
      <div class="fbw-footer" id="fbw-footer">
        <button class="fbw-btn fbw-btn-back" id="fbw-back" onclick="FenixBooking.back()" style="display:none;">Späť</button>
        <button class="fbw-btn fbw-btn-next" id="fbw-next" onclick="FenixBooking.next()" style="display:none;">Pokračovať</button>
      </div>
    `;
    
    document.getElementById('fenix-booking-widget').appendChild(widget);
    updateSteps();
  }

  function updateSteps() {
    const stepsContainer = document.getElementById('fbw-steps');
    const maxSteps = state.mode === 'rental' ? 6 : 5;
    
    // Update step indicators count
    let stepsHtml = '';
    for (let i = 0; i < maxSteps; i++) {
      const currentStep = getCurrentStepNumber();
      const isActive = i < currentStep;
      stepsHtml += `<div class="fbw-step-indicator ${isActive ? 'done' : ''}"></div>`;
    }
    stepsContainer.innerHTML = stepsHtml;
  }
  
  function getCurrentStepNumber() {
    if (state.step === 0) return 0;
    if (state.mode === 'service') {
      return parseInt(state.step.replace('s', ''));
    } else {
      return parseInt(state.step.replace('r', ''));
    }
  }

  function showSection(step) {
    document.querySelectorAll('.fbw-section').forEach(s => s.classList.remove('active'));
    const section = document.querySelector(`.fbw-section[data-step="${step}"]`);
    if (section) section.classList.add('active');
    
    state.step = step;
    updateSteps();
    updateButtons();
    
    // Update title based on mode
    const title = document.getElementById('fbw-main-title');
    if (state.mode === 'service') {
      title.textContent = 'Rezervácia servisu';
    } else if (state.mode === 'rental') {
      title.textContent = 'Požičovňa bicyklov';
    } else {
      title.textContent = 'Online rezervácia';
    }
  }

  function updateButtons() {
    const backBtn = document.getElementById('fbw-back');
    const nextBtn = document.getElementById('fbw-next');
    
    if (state.step === 0 || state.step === 'success') {
      backBtn.style.display = 'none';
      nextBtn.style.display = 'none';
      return;
    }
    
    backBtn.style.display = 'block';
    nextBtn.style.display = 'block';
    
    // Update next button text
    if (state.mode === 'service' && state.step === 's5') {
      nextBtn.textContent = 'Odoslať rezerváciu';
    } else if (state.mode === 'rental' && state.step === 'r6') {
      nextBtn.textContent = 'Odoslať rezerváciu';
    } else {
      nextBtn.textContent = 'Pokračovať';
    }
    
    // Enable/disable next based on selection
    nextBtn.disabled = !canProceed();
  }

  function canProceed() {
    if (state.mode === 'service') {
      switch (state.step) {
        case 's1': return !!state.selectedLocation;
        case 's2': return !!state.selectedService;
        case 's3': return !!state.selectedDate && !!state.selectedTime;
        case 's4': return validateServiceForm();
        case 's5': return true;
      }
    } else if (state.mode === 'rental') {
      switch (state.step) {
        case 'r1': return !!state.selectedBike;
        case 'r2': return !!state.selectedSize;
        case 'r3': return !!state.selectedLocation;
        case 'r4': return !!state.pickupDate && !!state.returnDate;
        case 'r5': return validateRentalForm();
        case 'r6': return true;
      }
    }
    return false;
  }

  function validateServiceForm() {
    const name = document.getElementById('fbw-name')?.value.trim();
    const email = document.getElementById('fbw-email')?.value.trim();
    const phone = document.getElementById('fbw-phone')?.value.trim();
    return name && email && phone && email.includes('@');
  }

  function validateRentalForm() {
    const name = document.getElementById('fbw-rental-name')?.value.trim();
    const email = document.getElementById('fbw-rental-email')?.value.trim();
    const phone = document.getElementById('fbw-rental-phone')?.value.trim();
    return name && email && phone && email.includes('@');
  }

  // Mode selection
  function selectMode(mode) {
    state.mode = mode;
    document.querySelectorAll('.fbw-mode-card').forEach(c => c.classList.remove('selected'));
    event.currentTarget.classList.add('selected');
    
    setTimeout(() => {
      if (mode === 'service') {
        showSection('s1');
        loadLocations();
      } else {
        showSection('r1');
        loadBikes();
      }
    }, 200);
  }

  // Load data functions
  async function loadLocations() {
    try {
      const res = await fetch(`${API_URL}/public/booking/locations?client_id=${CLIENT_ID}`);
      const data = await res.json();
      // API vracia priamo pole, nie objekt s locations
      state.locations = Array.isArray(data) ? data : (data.locations || []);
      renderLocations();
    } catch (err) {
      console.error('Error loading locations:', err);
    }
  }

  async function loadServices() {
    try {
      const res = await fetch(`${API_URL}/public/booking/services?client_id=${CLIENT_ID}`);
      const data = await res.json();
      // API vracia priamo pole, nie objekt s services
      state.services = Array.isArray(data) ? data : (data.services || []);
      renderServices();
    } catch (err) {
      console.error('Error loading services:', err);
    }
  }

  async function loadBikes() {
    try {
      const res = await fetch(`${API_URL}/public/rental/bikes?client_id=${CLIENT_ID}`);
      const data = await res.json();
      // API vracia priamo pole, nie objekt s bikes
      state.bikes = Array.isArray(data) ? data : (data.bikes || []);
      renderBikes();
    } catch (err) {
      console.error('Error loading bikes:', err);
    }
  }

  async function loadAvailableDays() {
    if (!state.selectedLocation) return;
    
    try {
      const year = state.currentMonth.getFullYear();
      const month = state.currentMonth.getMonth() + 1;
      const res = await fetch(
        `${API_URL}/public/booking/availability/days?client_id=${CLIENT_ID}&location=${state.selectedLocation.code}&year=${year}&month=${month}`
      );
      const data = await res.json();
      // API vracia priamo pole, nie objekt s days
      state.availableDays = Array.isArray(data) ? data : (data.days || []);
      renderCalendar();
    } catch (err) {
      console.error('Error loading availability:', err);
    }
  }

  async function loadAvailableSlots(date) {
    if (!state.selectedLocation) return;
    
    try {
      const res = await fetch(
        `${API_URL}/public/booking/availability?client_id=${CLIENT_ID}&location=${state.selectedLocation.code}&date=${date}`
      );
      const data = await res.json();
      // API vracia priamo pole, nie objekt s slots
      state.availableSlots = Array.isArray(data) ? data : (data.slots || []);
      renderTimes();
    } catch (err) {
      console.error('Error loading slots:', err);
    }
  }

  // Render functions
  function renderLocations() {
    const containerId = state.mode === 'rental' ? 'fbw-rental-locations' : 'fbw-locations';
    const container = document.getElementById(containerId);
    if (!container) {
      console.error('Container not found:', containerId);
      return;
    }
    container.innerHTML = state.locations.map(loc => `
      <div class="fbw-list-item ${state.selectedLocation?.id === loc.id ? 'selected' : ''}" 
           onclick="FenixBooking.selectLocation('${loc.id}')">
        <div class="fbw-list-item-info">
          <div class="fbw-list-item-name">${loc.name}</div>
          <div class="fbw-list-item-meta">${loc.address || ''}</div>
        </div>
      </div>
    `).join('');
  }

  function renderServices() {
    const container = document.getElementById('fbw-services');
    container.innerHTML = state.services.map(svc => `
      <div class="fbw-list-item ${state.selectedService?.id === svc.id ? 'selected' : ''}"
           onclick="FenixBooking.selectService('${svc.id}')">
        <div class="fbw-list-item-info">
          <div class="fbw-list-item-name">${svc.name}</div>
          <div class="fbw-list-item-meta">${svc.duration || 60} min</div>
        </div>
        <div class="fbw-list-item-price">${svc.price}€</div>
      </div>
    `).join('');
  }

  function renderBikes() {
    const container = document.getElementById('fbw-bikes');
    container.innerHTML = state.bikes.map(bike => `
      <div class="fbw-bike-card ${state.selectedBike?.id === bike.id ? 'selected' : ''}"
           onclick="FenixBooking.selectBike('${bike.id}')">
        <img class="fbw-bike-img" src="${bike.image_url}" alt="${bike.name}">
        <div class="fbw-bike-info">
          <div class="fbw-bike-name">${bike.name}</div>
          <div class="fbw-bike-meta">
            <span class="fbw-bike-sizes">${bike.sizes.join(', ')}</span>
            <span class="fbw-bike-price">${bike.price_per_day}€/deň</span>
          </div>
        </div>
      </div>
    `).join('');
  }

  function renderSizes() {
    if (!state.selectedBike) return;
    
    document.getElementById('fbw-selected-bike-name').textContent = state.selectedBike.name;
    
    const container = document.getElementById('fbw-sizes');
    container.innerHTML = state.selectedBike.sizes.map(size => `
      <button class="fbw-size-btn ${state.selectedSize === size ? 'selected' : ''}"
              onclick="FenixBooking.selectSize('${size}')">${size}</button>
    `).join('');
  }

  function renderCalendar() {
    const container = document.getElementById('fbw-calendar');
    const monthTitle = document.getElementById('fbw-month');
    
    const year = state.currentMonth.getFullYear();
    const month = state.currentMonth.getMonth();
    const today = new Date();
    
    const monthNames = ['Január', 'Február', 'Marec', 'Apríl', 'Máj', 'Jún', 
                        'Júl', 'August', 'September', 'Október', 'November', 'December'];
    monthTitle.textContent = `${monthNames[month]} ${year}`;
    
    const dayNames = ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'];
    let html = dayNames.map(d => `<div class="fbw-calendar-header">${d}</div>`).join('');
    
    const firstDay = new Date(year, month, 1);
    let startDay = firstDay.getDay() - 1;
    if (startDay < 0) startDay = 6;
    
    for (let i = 0; i < startDay; i++) {
      html += '<div class="fbw-calendar-day empty"></div>';
    }
    
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayData = state.availableDays.find(d => d.date === dateStr);
      const isAvailable = dayData?.available;
      const isPast = new Date(dateStr) < new Date(today.toDateString());
      const isToday = new Date(dateStr).toDateString() === today.toDateString();
      const isSelected = state.selectedDate === dateStr;
      
      const classes = [
        'fbw-calendar-day',
        isToday ? 'today' : '',
        isSelected ? 'selected' : '',
        (!isAvailable || isPast) ? 'disabled' : ''
      ].filter(Boolean).join(' ');
      
      html += `<div class="${classes}" onclick="FenixBooking.selectDate('${dateStr}', ${isAvailable && !isPast})">${day}</div>`;
    }
    
    container.innerHTML = html;
  }

  function renderRentalCalendar() {
    const container = document.getElementById('fbw-rental-calendar');
    const monthTitle = document.getElementById('fbw-rental-month');
    
    const year = state.rentalMonth.getFullYear();
    const month = state.rentalMonth.getMonth();
    const today = new Date();
    
    const monthNames = ['Január', 'Február', 'Marec', 'Apríl', 'Máj', 'Jún', 
                        'Júl', 'August', 'September', 'Október', 'November', 'December'];
    monthTitle.textContent = `${monthNames[month]} ${year}`;
    
    const dayNames = ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'];
    let html = dayNames.map(d => `<div class="fbw-calendar-header">${d}</div>`).join('');
    
    const firstDay = new Date(year, month, 1);
    let startDay = firstDay.getDay() - 1;
    if (startDay < 0) startDay = 6;
    
    for (let i = 0; i < startDay; i++) {
      html += '<div class="fbw-calendar-day empty"></div>';
    }
    
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isPast = new Date(dateStr) < new Date(today.toDateString());
      const isToday = new Date(dateStr).toDateString() === today.toDateString();
      const isPickup = state.pickupDate === dateStr;
      const isReturn = state.returnDate === dateStr;
      const isInRange = state.pickupDate && state.returnDate && 
                        dateStr > state.pickupDate && dateStr < state.returnDate;
      
      const classes = [
        'fbw-calendar-day',
        isToday ? 'today' : '',
        isPickup ? 'pickup' : '',
        isReturn ? 'return' : '',
        isInRange ? 'in-range' : '',
        isPast ? 'disabled' : ''
      ].filter(Boolean).join(' ');
      
      html += `<div class="${classes}" onclick="FenixBooking.selectRentalDate('${dateStr}', ${!isPast})">${day}</div>`;
    }
    
    container.innerHTML = html;
    
    // Update date boxes
    document.getElementById('fbw-pickup-display').textContent = 
      state.pickupDate ? formatDate(state.pickupDate) : 'Vyberte dátum';
    document.getElementById('fbw-return-display').textContent = 
      state.returnDate ? formatDate(state.returnDate) : 'Vyberte dátum';
  }

  function renderTimes() {
    const container = document.getElementById('fbw-times');
    const wrap = document.getElementById('fbw-times-wrap');
    
    if (state.availableSlots.length === 0) {
      wrap.style.display = 'none';
      return;
    }
    
    wrap.style.display = 'block';
    container.innerHTML = state.availableSlots.map(slot => `
      <div class="fbw-time ${!slot.available ? 'disabled' : ''} ${state.selectedTime === slot.time ? 'selected' : ''}"
           onclick="FenixBooking.selectTime('${slot.time}', ${slot.available})">${slot.time}</div>
    `).join('');
  }

  function renderServiceSummary() {
    const loc = state.selectedLocation;
    const svc = state.selectedService;
    
    document.getElementById('fbw-summary').innerHTML = `
      <div class="fbw-summary-item">
        <span class="fbw-summary-label">Prevádzka</span>
        <span class="fbw-summary-value">${loc?.name || ''}</span>
      </div>
      <div class="fbw-summary-item">
        <span class="fbw-summary-label">Služba</span>
        <span class="fbw-summary-value">${svc?.name || ''}</span>
      </div>
      <div class="fbw-summary-item">
        <span class="fbw-summary-label">Termín</span>
        <span class="fbw-summary-value">${formatDate(state.selectedDate)}, ${state.selectedTime}</span>
      </div>
      <div class="fbw-summary-item">
        <span class="fbw-summary-label">Meno</span>
        <span class="fbw-summary-value">${document.getElementById('fbw-name').value}</span>
      </div>
      <div class="fbw-summary-item">
        <span class="fbw-summary-label">Email</span>
        <span class="fbw-summary-value">${document.getElementById('fbw-email').value}</span>
      </div>
      <div class="fbw-summary-item">
        <span class="fbw-summary-label">Telefón</span>
        <span class="fbw-summary-value">${document.getElementById('fbw-phone').value}</span>
      </div>
      <div class="fbw-summary-item total">
        <span class="fbw-summary-label">Odhadovaná cena</span>
        <span class="fbw-summary-value">${svc?.price || 0}€</span>
      </div>
    `;
  }

  function renderRentalSummary() {
    const bike = state.selectedBike;
    const loc = state.selectedLocation;
    const days = calculateDays();
    const totalPrice = days * (bike?.price_per_day || 0);
    
    document.getElementById('fbw-rental-summary').innerHTML = `
      <div class="fbw-summary-item">
        <span class="fbw-summary-label">Bicykel</span>
        <span class="fbw-summary-value">${bike?.name || ''}</span>
      </div>
      <div class="fbw-summary-item">
        <span class="fbw-summary-label">Veľkosť</span>
        <span class="fbw-summary-value">${state.selectedSize || ''}</span>
      </div>
      <div class="fbw-summary-item">
        <span class="fbw-summary-label">Prevádzka</span>
        <span class="fbw-summary-value">${loc?.name || ''}</span>
      </div>
      <div class="fbw-summary-item">
        <span class="fbw-summary-label">Vyzdvihnutie</span>
        <span class="fbw-summary-value">${formatDate(state.pickupDate)}</span>
      </div>
      <div class="fbw-summary-item">
        <span class="fbw-summary-label">Vrátenie</span>
        <span class="fbw-summary-value">${formatDate(state.returnDate)}</span>
      </div>
      <div class="fbw-summary-item">
        <span class="fbw-summary-label">Počet dní</span>
        <span class="fbw-summary-value">${days}</span>
      </div>
      <div class="fbw-summary-item">
        <span class="fbw-summary-label">Meno</span>
        <span class="fbw-summary-value">${document.getElementById('fbw-rental-name').value}</span>
      </div>
      <div class="fbw-summary-item">
        <span class="fbw-summary-label">Email</span>
        <span class="fbw-summary-value">${document.getElementById('fbw-rental-email').value}</span>
      </div>
      <div class="fbw-summary-item total">
        <span class="fbw-summary-label">Celková cena</span>
        <span class="fbw-summary-value">${totalPrice}€</span>
      </div>
    `;
  }

  function calculateDays() {
    if (!state.pickupDate || !state.returnDate) return 0;
    const pickup = new Date(state.pickupDate);
    const ret = new Date(state.returnDate);
    return Math.ceil((ret - pickup) / (1000 * 60 * 60 * 24)) + 1;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  // Selection handlers
  function selectLocation(id) {
    state.selectedLocation = state.locations.find(l => l.id === id);
    renderLocations();
    updateButtons();
  }

  function selectService(id) {
    state.selectedService = state.services.find(s => s.id === id);
    renderServices();
    updateButtons();
  }

  function selectBike(id) {
    state.selectedBike = state.bikes.find(b => b.id === id);
    state.selectedSize = null; // Reset size when bike changes
    renderBikes();
    updateButtons();
  }

  function selectSize(size) {
    state.selectedSize = size;
    renderSizes();
    updateButtons();
  }

  function selectDate(date, available) {
    if (!available) return;
    state.selectedDate = date;
    state.selectedTime = null;
    renderCalendar();
    loadAvailableSlots(date);
    updateButtons();
  }

  function selectTime(time, available) {
    if (!available) return;
    state.selectedTime = time;
    renderTimes();
    updateButtons();
  }

  function setDateMode(mode) {
    state.selectingDate = mode;
    document.getElementById('fbw-pickup-box').classList.toggle('active', mode === 'pickup');
    document.getElementById('fbw-return-box').classList.toggle('active', mode === 'return');
  }

  function selectRentalDate(date, available) {
    if (!available) return;
    
    if (state.selectingDate === 'pickup') {
      state.pickupDate = date;
      // If return date is before pickup, reset it
      if (state.returnDate && state.returnDate < date) {
        state.returnDate = null;
      }
      // Auto-switch to return date selection
      state.selectingDate = 'return';
      setDateMode('return');
    } else {
      // Return date must be >= pickup date
      if (state.pickupDate && date >= state.pickupDate) {
        state.returnDate = date;
      } else if (!state.pickupDate) {
        // If no pickup date, set pickup first
        state.pickupDate = date;
        state.selectingDate = 'return';
        setDateMode('return');
      }
    }
    
    renderRentalCalendar();
    updateButtons();
  }

  // Navigation
  function next() {
    if (state.mode === 'service') {
      switch (state.step) {
        case 's1':
          showSection('s2');
          loadServices();
          break;
        case 's2':
          showSection('s3');
          loadAvailableDays();
          break;
        case 's3':
          showSection('s4');
          break;
        case 's4':
          showSection('s5');
          renderServiceSummary();
          break;
        case 's5':
          submitServiceBooking();
          break;
      }
    } else if (state.mode === 'rental') {
      switch (state.step) {
        case 'r1':
          showSection('r2');
          renderSizes();
          break;
        case 'r2':
          showSection('r3');
          loadLocations();
          break;
        case 'r3':
          showSection('r4');
          renderRentalCalendar();
          break;
        case 'r4':
          showSection('r5');
          break;
        case 'r5':
          showSection('r6');
          renderRentalSummary();
          break;
        case 'r6':
          submitRentalBooking();
          break;
      }
    }
  }

  function back() {
    if (state.mode === 'service') {
      switch (state.step) {
        case 's1': showSection(0); state.mode = null; break;
        case 's2': showSection('s1'); break;
        case 's3': showSection('s2'); break;
        case 's4': showSection('s3'); break;
        case 's5': showSection('s4'); break;
      }
    } else if (state.mode === 'rental') {
      switch (state.step) {
        case 'r1': showSection(0); state.mode = null; break;
        case 'r2': showSection('r1'); break;
        case 'r3': showSection('r2'); break;
        case 'r4': showSection('r3'); break;
        case 'r5': showSection('r4'); break;
        case 'r6': showSection('r5'); break;
      }
    }
  }

  function prevMonth() {
    state.currentMonth.setMonth(state.currentMonth.getMonth() - 1);
    loadAvailableDays();
  }

  function nextMonth() {
    state.currentMonth.setMonth(state.currentMonth.getMonth() + 1);
    loadAvailableDays();
  }

  function prevRentalMonth() {
    state.rentalMonth.setMonth(state.rentalMonth.getMonth() - 1);
    renderRentalCalendar();
  }

  function nextRentalMonth() {
    state.rentalMonth.setMonth(state.rentalMonth.getMonth() + 1);
    renderRentalCalendar();
  }

  // Submit functions
  async function submitServiceBooking() {
    const nextBtn = document.getElementById('fbw-next');
    const errorDiv = document.getElementById('fbw-submit-error');
    
    nextBtn.disabled = true;
    nextBtn.textContent = 'Odosielam...';
    errorDiv.style.display = 'none';
    
    try {
      const res = await fetch(`${API_URL}/public/booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          location_code: state.selectedLocation.code,
          service_id: state.selectedService.id,
          booking_date: state.selectedDate,
          booking_time: state.selectedTime,
          customer_name: document.getElementById('fbw-name').value.trim(),
          customer_email: document.getElementById('fbw-email').value.trim(),
          customer_phone: document.getElementById('fbw-phone').value.trim(),
          bike_brand: document.getElementById('fbw-bike-brand').value.trim(),
          bike_model: document.getElementById('fbw-bike-model').value.trim(),
          problem_description: document.getElementById('fbw-problem').value.trim()
        })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Chyba pri odoslaní');
      }
      
      document.getElementById('fbw-booking-number').textContent = data.booking_number;
      showSection('success');
      
    } catch (err) {
      errorDiv.textContent = err.message;
      errorDiv.style.display = 'block';
      nextBtn.disabled = false;
      nextBtn.textContent = 'Odoslať rezerváciu';
    }
  }

  async function submitRentalBooking() {
    const nextBtn = document.getElementById('fbw-next');
    const errorDiv = document.getElementById('fbw-rental-submit-error');
    
    nextBtn.disabled = true;
    nextBtn.textContent = 'Odosielam...';
    errorDiv.style.display = 'none';
    
    try {
      const res = await fetch(`${API_URL}/public/rental/booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          bike_id: state.selectedBike.id,
          location_code: state.selectedLocation.code,
          selected_size: state.selectedSize,
          pickup_date: state.pickupDate,
          return_date: state.returnDate,
          customer_name: document.getElementById('fbw-rental-name').value.trim(),
          customer_email: document.getElementById('fbw-rental-email').value.trim(),
          customer_phone: document.getElementById('fbw-rental-phone').value.trim()
        })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Chyba pri odoslaní');
      }
      
      document.getElementById('fbw-booking-number').textContent = data.booking_number;
      showSection('success');
      
    } catch (err) {
      errorDiv.textContent = err.message;
      errorDiv.style.display = 'block';
      nextBtn.disabled = false;
      nextBtn.textContent = 'Odoslať rezerváciu';
    }
  }

  // Initialize
  createWidget();

  // Expose public API
  window.FenixBooking = {
    selectMode,
    selectLocation,
    selectService,
    selectBike,
    selectSize,
    selectDate,
    selectTime,
    selectRentalDate,
    setDateMode,
    next,
    back,
    prevMonth,
    nextMonth,
    prevRentalMonth,
    nextRentalMonth
  };
})();