(() => {
  const scriptTag = document.currentScript;
  const API_KEY = scriptTag?.getAttribute('data-api-key') || '';
  const BACKEND_URL = scriptTag?.getAttribute('data-backend-url') || 'http://localhost:3000';

  const styles = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
.replai-widget {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 999999;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.replai-button {
  width: 60px;
  height: 60px;
  border-radius: 20px;
  background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
  box-shadow: 0 8px 24px rgba(124, 58, 237, 0.4);
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: none;
  position: relative;
}
.replai-button:hover {
  transform: scale(1.05) translateY(-2px);
  box-shadow: 0 12px 32px rgba(124, 58, 237, 0.5);
}
.replai-button svg {
  width: 28px;
  height: 28px;
  color: white;
}
.replai-button-status {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 3px solid white;
  background: #ef4444;
  transition: background 0.3s ease;
}
.replai-button-status.online {
  background: #22c55e;
}
.replai-widget.open .replai-button {
  display: none;
}
.replai-widget.open {
  width: 400px;
  height: 560px;
  max-width: calc(100vw - 48px);
  max-height: calc(100vh - 48px);
}
.replai-container {
  display: none;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: #ffffff;
  border-radius: 24px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15);
  border: 1px solid rgba(0, 0, 0, 0.05);
  overflow: hidden;
}
.replai-widget.open .replai-container {
  display: flex;
}
.replai-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
  color: white;
}
.replai-header-info {
  display: flex;
  align-items: center;
  gap: 12px;
}
.replai-header-avatar {
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.replai-header-avatar svg {
  width: 22px;
  height: 22px;
  color: white;
}
.replai-header h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}
.replai-header-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  margin: 4px 0 0 0;
}
.replai-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
  transition: background 0.3s ease;
}
.replai-status-dot.online {
  background: #4ade80;
  box-shadow: 0 0 8px rgba(74, 222, 128, 0.6);
}
.replai-status-text {
  opacity: 0.9;
}
.replai-header-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}
.replai-header-btn {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 36px;
  height: 36px;
  background: rgba(255, 255, 255, 0.15);
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: white;
}
.replai-header-btn:hover {
  background: rgba(255, 255, 255, 0.25);
}
.replai-header-btn svg {
  width: 18px;
  height: 18px;
}
.replai-messages {
  flex-grow: 1;
  overflow-y: auto;
  padding: 20px;
  background: #f8fafc;
}
.replai-messages::-webkit-scrollbar {
  width: 6px;
}
.replai-messages::-webkit-scrollbar-track {
  background: transparent;
}
.replai-messages::-webkit-scrollbar-thumb {
  background-color: #e2e8f0;
  border-radius: 3px;
}
.replai-message {
  margin-bottom: 16px;
  display: flex;
}
.replai-message.user {
  justify-content: flex-end;
}
.replai-message.assistant {
  justify-content: flex-start;
}
.replai-message-bubble {
  max-width: 80%;
  padding: 14px 18px;
  border-radius: 18px;
  line-height: 1.5;
  font-size: 14px;
}
.replai-message.user .replai-message-bubble {
  background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
  color: white;
  border-bottom-right-radius: 6px;
}
.replai-message.assistant .replai-message-bubble {
  background: white;
  color: #334155;
  border: 1px solid #e2e8f0;
  border-bottom-left-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}
.replai-link {
  color: #7c3aed;
  text-decoration: underline;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.2s ease;
}
.replai-link:hover {
  color: #5b21b6;
}
.replai-message.user .replai-link {
  color: #e9d5ff;
}
.replai-message.user .replai-link:hover {
  color: white;
}
.replai-input-area {
  padding: 16px 20px 20px;
  background: white;
  border-top: 1px solid #f1f5f9;
}
.replai-input-wrapper {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}
.replai-input {
  flex-grow: 1;
  min-height: 44px;
  max-height: 120px;
  padding: 12px 16px;
  border: 2px solid #e2e8f0;
  border-radius: 14px;
  resize: none;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  background: #f8fafc;
  outline: none;
  transition: all 0.2s ease;
}
.replai-input:focus {
  border-color: #7c3aed;
  background: white;
  box-shadow: 0 0 0 4px rgba(124, 58, 237, 0.1);
}
.replai-input::placeholder {
  color: #94a3b8;
}
.replai-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.replai-send-btn {
  width: 44px;
  height: 44px;
  background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
  color: white;
  border: none;
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.replai-send-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(124, 58, 237, 0.4);
}
.replai-send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}
.replai-send-btn svg {
  width: 20px;
  height: 20px;
}
.replai-typing {
  display: none;
  padding: 0 20px 16px;
}
.replai-typing-bubble {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: white;
  border: 1px solid #e2e8f0;
  padding: 12px 16px;
  border-radius: 18px;
  border-bottom-left-radius: 6px;
}
.replai-typing-dot {
  width: 8px;
  height: 8px;
  background: #94a3b8;
  border-radius: 50%;
  animation: replai-typing 1.4s infinite ease-in-out;
}
.replai-typing-dot:nth-child(2) {
  animation-delay: 0.2s;
}
.replai-typing-dot:nth-child(3) {
  animation-delay: 0.4s;
}
@keyframes replai-typing {
  0%, 60%, 100% {
    transform: translateY(0);
    opacity: 0.4;
  }
  30% {
    transform: translateY(-4px);
    opacity: 1;
  }
}
.replai-offline-msg {
  display: none;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
  padding: 12px 16px;
  margin: 0 20px 16px;
  border-radius: 12px;
  font-size: 13px;
  text-align: center;
}
.replai-powered {
  text-align: center;
  padding: 8px;
  font-size: 11px;
  color: #94a3b8;
  background: #f8fafc;
}
.replai-powered a {
  color: #7c3aed;
  text-decoration: none;
  font-weight: 500;
}
.replai-powered a:hover {
  text-decoration: underline;
}
`;

  const styleSheet = document.createElement("style");
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);

  const widgetHTML = `
  <div class="replai-widget" id="replaiWidget">
    <button class="replai-button" id="replaiButton">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
      <span class="replai-button-status" id="replaiButtonStatus"></span>
    </button>
    <div class="replai-container">
      <div class="replai-header">
        <div class="replai-header-info">
          <div class="replai-header-avatar">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-2.47 2.47a2.25 2.25 0 01-1.591.659H9.061a2.25 2.25 0 01-1.591-.659L5 14.5m14 0V17a2 2 0 01-2 2H7a2 2 0 01-2-2v-2.5" />
            </svg>
          </div>
          <div>
            <h3 id="replaiTitle">Replai Asistent</h3>
            <div class="replai-header-status">
              <span class="replai-status-dot" id="replaiStatusDot"></span>
              <span class="replai-status-text" id="replaiStatusText">Offline</span>
            </div>
          </div>
        </div>
        <div class="replai-header-buttons">
          <button class="replai-header-btn" id="replaiNewThread" title="Nová konverzácia">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
          <button class="replai-header-btn" id="replaiClose" title="Zavrieť">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      <div class="replai-offline-msg" id="replaiOfflineMsg" style="display: none;">
        Asistent je momentálne offline. Skúste to neskôr.
      </div>
      <div class="replai-messages" id="replaiMessages"></div>
      <div class="replai-typing" id="replaiTyping">
        <div class="replai-typing-bubble">
          <span class="replai-typing-dot"></span>
          <span class="replai-typing-dot"></span>
          <span class="replai-typing-dot"></span>
        </div>
      </div>
      <div class="replai-input-area">
        <div class="replai-input-wrapper">
          <textarea 
            class="replai-input"
            placeholder="Napíšte správu..."
            rows="1"
            id="replaiInput"
          ></textarea>
          <button class="replai-send-btn" id="replaiSend">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </div>
      </div>
      <div class="replai-powered">
        Powered by <a href="https://replai.sk" target="_blank">Replai</a>
      </div>
    </div>
  </div>
  `;

  document.body.insertAdjacentHTML('beforeend', widgetHTML);

  class ReplaiWidget {
    constructor() {
      this.widget = document.getElementById('replaiWidget');
      this.button = document.getElementById('replaiButton');
      this.buttonStatus = document.getElementById('replaiButtonStatus');
      this.closeBtn = document.getElementById('replaiClose');
      this.newThreadBtn = document.getElementById('replaiNewThread');
      this.messagesContainer = document.getElementById('replaiMessages');
      this.input = document.getElementById('replaiInput');
      this.sendBtn = document.getElementById('replaiSend');
      this.typingIndicator = document.getElementById('replaiTyping');
      this.titleEl = document.getElementById('replaiTitle');
      this.statusDot = document.getElementById('replaiStatusDot');
      this.statusText = document.getElementById('replaiStatusText');
      this.offlineMsg = document.getElementById('replaiOfflineMsg');

      this.isOpen = false;
      this.isOnline = false;
      this.currentThreadId = localStorage.getItem('replai_thread_id') || null;
      this.messages = [];
      this.settings = null;

      this.init();
    }

    async init() {
      await this.checkOnlineStatus();
      await this.loadSettings();

      if (this.currentThreadId) {
        await this.loadMessagesFromServer();
      } else {
        this.showWelcomeMessage();
      }

      this.initializeEventListeners();

      // Check status every 30 seconds
      setInterval(() => this.checkOnlineStatus(), 30000);
    }

    async checkOnlineStatus() {
      try {
        const response = await fetch(`${BACKEND_URL}/health`, { 
          method: 'GET',
          timeout: 5000 
        });

        if (response.ok) {
          this.setOnlineStatus(true);
        } else {
          this.setOnlineStatus(false);
        }
      } catch (error) {
        this.setOnlineStatus(false);
      }
    }

    setOnlineStatus(online) {
      this.isOnline = online;

      if (online) {
        this.buttonStatus.classList.add('online');
        this.statusDot.classList.add('online');
        this.statusText.textContent = 'Online';
        this.offlineMsg.style.display = 'none';
        this.input.disabled = false;
        this.sendBtn.disabled = false;
        this.input.placeholder = 'Napíšte správu...';
      } else {
        this.buttonStatus.classList.remove('online');
        this.statusDot.classList.remove('online');
        this.statusText.textContent = 'Offline';
        this.offlineMsg.style.display = 'block';
        this.input.disabled = true;
        this.sendBtn.disabled = true;
        this.input.placeholder = 'Asistent je offline...';
      }
    }

    async loadSettings() {
      try {
        const response = await fetch(`${BACKEND_URL}/widget/${API_KEY}`);
        if (response.ok) {
          const data = await response.json();
          this.settings = data.settings;
          this.applySettings();
        }
      } catch (error) {
        console.error('Failed to load widget settings:', error);
      }
    }

    applySettings() {
      if (!this.settings) return;

      if (this.settings.title) {
        this.titleEl.textContent = this.settings.title;
      }
    }

    showWelcomeMessage() {
      const welcomeMsg = this.settings?.welcomeMessage || 'Dobrý deň! Ako vám môžem pomôcť?';
      this.appendMessage(welcomeMsg, false, false);
    }

    async loadMessagesFromServer() {
      try {
        const response = await fetch(`${BACKEND_URL}/messages/${this.currentThreadId}`, {
          headers: { 'X-API-Key': API_KEY }
        });
        if (response.ok) {
          this.messages = await response.json();
          this.renderMessages();
        }
      } catch (error) {
        console.error('Failed to load messages:', error);
        this.showWelcomeMessage();
      }
    }

    renderMessages() {
      this.messagesContainer.innerHTML = '';

      if (this.messages.length === 0) {
        this.showWelcomeMessage();
        return;
      }

      this.messages.forEach(msg => {
        this.appendMessage(msg.content, msg.role === 'user', false);
      });
    }

    createNewThread() {
      this.currentThreadId = Date.now().toString();
      localStorage.setItem('replai_thread_id', this.currentThreadId);
      this.messages = [];
      this.messagesContainer.innerHTML = '';
      this.showWelcomeMessage();
    }

    initializeEventListeners() {
      this.button.addEventListener('click', () => this.openChat());
      this.closeBtn.addEventListener('click', () => this.closeChat());
      this.newThreadBtn.addEventListener('click', () => this.createNewThread());
      this.input.addEventListener('input', () => this.adjustTextareaHeight());
      this.input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });
      this.sendBtn.addEventListener('click', () => this.sendMessage());
    }

    adjustTextareaHeight() {
      this.input.style.height = 'auto';
      this.input.style.height = Math.min(this.input.scrollHeight, 120) + 'px';
    }

    openChat() {
      this.isOpen = true;
      this.widget.classList.add('open');
      setTimeout(() => this.input.focus(), 300);
    }

    closeChat() {
      this.isOpen = false;
      this.widget.classList.remove('open');
    }

    appendMessage(message, isUser = false, save = true) {
      const messageDiv = document.createElement('div');
      messageDiv.classList.add('replai-message', isUser ? 'user' : 'assistant');

      let formattedContent = message
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\[([^\]]+)\]\s*\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="replai-link">$1</a>')
        .replace(/(^|[^"'])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer" class="replai-link">$2</a>');

      messageDiv.innerHTML = `<div class="replai-message-bubble">${formattedContent}</div>`;
      this.messagesContainer.appendChild(messageDiv);
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

      if (save) {
        this.messages.push({
          role: isUser ? 'user' : 'assistant',
          content: message
        });
      }
    }

    showTypingIndicator() {
      this.typingIndicator.style.display = 'block';
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    hideTypingIndicator() {
      this.typingIndicator.style.display = 'none';
    }

    async sendMessage() {
      if (!this.isOnline) return;

      const userInput = this.input.value.trim();
      if (!userInput) return;

      if (!this.currentThreadId) {
        this.createNewThread();
      }

      this.sendBtn.disabled = true;
      this.input.disabled = true;
      this.input.value = '';
      this.adjustTextareaHeight();

      this.appendMessage(userInput, true);

      try {
        this.showTypingIndicator();

        const response = await fetch(`${BACKEND_URL}/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': API_KEY
          },
          body: JSON.stringify({
            message: userInput,
            threadId: this.currentThreadId,
            context: this.messages.slice(-10)
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          this.hideTypingIndicator();
          
          if (errorData.limit_reached) {
            this.appendMessage('Asistent je momentálne nedostupný. Zanechajte nám prosím váš email alebo telefón a budeme vás kontaktovať.', false);
            this.setOnlineStatus(false);
            return;
          }
          
          throw new Error(errorData.error || 'Network error');
        }

        // === SSE STREAMING ===
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let aiResponse = '';
        let responseDiv = null;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(5).trim();
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                if (parsed.text !== undefined) {
                  aiResponse += parsed.text;

                  // Skry typing indicator a vytvor response div pri prvom texte
                  if (!responseDiv) {
                    this.hideTypingIndicator();
                    responseDiv = document.createElement('div');
                    responseDiv.classList.add('replai-message', 'assistant');
                    responseDiv.innerHTML = '<div class="replai-message-bubble"></div>';
                    this.messagesContainer.appendChild(responseDiv);
                  }

                  // Aktualizuj text s formátovaním
                  let formattedContent = aiResponse
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\[([^\]]+)\]\s*\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="replai-link">$1</a>')
                    .replace(/(^|[^"'])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer" class="replai-link">$2</a>');

                  responseDiv.querySelector('.replai-message-bubble').innerHTML = formattedContent;
                  this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
                }
              } catch (e) {}
            }
          }
        }

        // Ulož kompletnú odpoveď
        if (aiResponse) {
          this.messages.push({
            role: 'assistant',
            content: aiResponse
          });
        }

      } catch (error) {
        console.error('Chat error:', error);
        this.hideTypingIndicator();
        this.appendMessage('Prepáčte, nastala chyba. Skúste to znova.', false);
      } finally {
        this.sendBtn.disabled = !this.isOnline;
        this.input.disabled = !this.isOnline;
        this.input.focus();
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new ReplaiWidget());
  } else {
    new ReplaiWidget();
  }
})();