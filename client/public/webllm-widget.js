/**
 * WebLLM Widget - Non-intrusive AI chat overlay for Mindscribe
 * Independent implementation that preserves existing functionality
 */

class WebLLMWidget {
  constructor() {
    this.isLoaded = false;
    this.isOpen = false;
    this.webllm = null;
    this.engine = null;
    this.currentModel = null;
    this.chatHistory = [];
    this.isStreaming = false;
    this.isInitializing = false;
    this.downloadProgress = {};
    
    // Configuration
    this.config = {
      models: [
        {
          id: 'Llama-3.2-1B-Instruct-q4f32_1-MLC',
          name: 'Llama 3.2 1B',
          size: '1.2GB',
          description: 'Fastest, good for simple tasks'
        },
        {
          id: 'Llama-3.2-3B-Instruct-q4f32_1-MLC', 
          name: 'Llama 3.2 3B',
          size: '2.4GB',
          description: 'Balanced speed and quality'
        },
        {
          id: 'Phi-3.5-mini-instruct-q4f16_1-MLC',
          name: 'Phi-3.5 Mini',
          size: '2.8GB', 
          description: 'Microsoft model, great for education'
        },
        {
          id: 'Llama-3.1-8B-Instruct-q4f32_1-MLC',
          name: 'Llama 3.1 8B',
          size: '5.2GB',
          description: 'High quality, slower'
        }
      ],
      shortcuts: {
        toggle: 'Ctrl+Alt+W',
        send: 'Enter',
        clear: 'Ctrl+K'
      }
    };

    this.initWidget();
    this.loadChatHistory();
    this.setupKeyboardShortcuts();
  }

  async initWidget() {
    // Check WebGPU support
    if (!this.checkWebGPUSupport()) {
      console.warn('WebLLM Widget: WebGPU not supported');
      return;
    }

    this.createFloatingButton();
    this.createModal();
    this.bindEvents();
  }

  checkWebGPUSupport() {
    if (!navigator.gpu) {
      this.showError('WebGPU is not supported in this browser. Please use Chrome/Edge 113+ or Firefox with WebGPU enabled.');
      return false;
    }
    return true;
  }

  createFloatingButton() {
    const button = document.createElement('button');
    button.id = 'webllm-widget-btn';
    button.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        <path d="M8 9h8"/>
        <path d="M8 13h6"/>
      </svg>
      <span class="webllm-widget-label">Local AI</span>
    `;
    button.className = 'webllm-widget-float-btn';
    button.setAttribute('aria-label', 'Open Local AI Chat');
    button.onclick = () => this.toggleModal();
    
    document.body.appendChild(button);
  }

  createModal() {
    const modal = document.createElement('div');
    modal.id = 'webllm-widget-modal';
    modal.className = 'webllm-widget-modal webllm-widget-hidden';
    modal.innerHTML = `
      <div class="webllm-widget-backdrop" onclick="window.webllmWidget.closeModal()"></div>
      <div class="webllm-widget-container">
        <!-- Header -->
        <div class="webllm-widget-header">
          <div class="webllm-widget-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1"/>
            </svg>
            Local AI Chat
            <span class="webllm-widget-status" id="webllm-status">Not Connected</span>
          </div>
          <div class="webllm-widget-header-controls">
            <button id="webllm-settings-btn" class="webllm-widget-icon-btn" title="Settings">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="m12 1 1.5 2.5L16 2l.5 2.5L19 3l-.5 2.5L21 7l-2.5 1.5L20 11l-2.5.5L19 14l-2.5-.5L15 16l-1.5-2.5L11 15l-.5-2.5L8 14l.5-2.5L6 10l2.5-1.5L7 6l2.5-.5L8 3l2.5.5z"/>
              </svg>
            </button>
            <button id="webllm-minimize-btn" class="webllm-widget-icon-btn" title="Minimize">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </button>
            <button id="webllm-close-btn" class="webllm-widget-icon-btn" title="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Model Selection Panel -->
        <div id="webllm-model-panel" class="webllm-widget-panel">
          <h3>Select AI Model</h3>
          <p class="webllm-widget-help">Choose a model to download and run locally in your browser:</p>
          <div id="webllm-model-list" class="webllm-widget-model-list">
            ${this.config.models.map(model => `
              <div class="webllm-widget-model-card" data-model="${model.id}">
                <div class="webllm-widget-model-info">
                  <div class="webllm-widget-model-name">${model.name}</div>
                  <div class="webllm-widget-model-size">${model.size}</div>
                  <div class="webllm-widget-model-desc">${model.description}</div>
                </div>
                <button class="webllm-widget-model-btn" data-model="${model.id}">
                  <span class="webllm-widget-btn-text">Download</span>
                  <div class="webllm-widget-progress-ring webllm-widget-hidden">
                    <svg width="20" height="20">
                      <circle cx="10" cy="10" r="8" fill="none" stroke="#e5e7eb" stroke-width="2"/>
                      <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="2" 
                              stroke-linecap="round" class="webllm-widget-progress-circle"/>
                    </svg>
                  </div>
                </button>
              </div>
            `).join('')}
          </div>
          <div class="webllm-widget-download-info webllm-widget-hidden" id="webllm-download-info">
            <div class="webllm-widget-download-progress">
              <div class="webllm-widget-progress-bar">
                <div class="webllm-widget-progress-fill" id="webllm-progress-fill"></div>
              </div>
              <div class="webllm-widget-progress-text" id="webllm-progress-text">Preparing download...</div>
            </div>
            <div class="webllm-widget-download-details" id="webllm-download-details"></div>
          </div>
        </div>

        <!-- Chat Panel -->
        <div id="webllm-chat-panel" class="webllm-widget-panel webllm-widget-hidden">
          <div class="webllm-widget-chat-header">
            <div class="webllm-widget-model-info">
              <span id="webllm-current-model">No model loaded</span>
              <button id="webllm-change-model" class="webllm-widget-link-btn">Change Model</button>
            </div>
            <button id="webllm-clear-chat" class="webllm-widget-icon-btn" title="Clear Chat">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18"/>
                <path d="m19 6-2 14H7L5 6"/>
                <path d="m10 11 4 4"/>
                <path d="m14 11-4 4"/>
              </svg>
            </button>
          </div>
          
          <div class="webllm-widget-chat-messages" id="webllm-chat-messages">
            <div class="webllm-widget-welcome-message">
              <div class="webllm-widget-ai-avatar">🤖</div>
              <div class="webllm-widget-message-content">
                <p>Hello! I'm your local AI assistant running directly in your browser. How can I help you today?</p>
                <p class="webllm-widget-help-text">💡 Tip: All conversations are private and run locally on your device.</p>
              </div>
            </div>
          </div>
          
          <div class="webllm-widget-input-area">
            <div class="webllm-widget-input-container">
              <textarea 
                id="webllm-input" 
                placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
                rows="1"></textarea>
              <button id="webllm-send-btn" class="webllm-widget-send-btn" title="Send message">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="m22 2-7 20-4-9-9-4Z"/>
                  <path d="M22 2 11 13"/>
                </svg>
              </button>
            </div>
            <div class="webllm-widget-input-help">
              Press <kbd>Enter</kbd> to send • <kbd>Shift+Enter</kbd> for new line • <kbd>Ctrl+K</kbd> to clear
            </div>
          </div>
        </div>

        <!-- Settings Panel -->
        <div id="webllm-settings-panel" class="webllm-widget-panel webllm-widget-hidden">
          <h3>Settings</h3>
          <div class="webllm-widget-setting-group">
            <label class="webllm-widget-setting-label">
              <span>Temperature (Creativity)</span>
              <input type="range" id="webllm-temperature" min="0" max="2" step="0.1" value="0.7">
              <span class="webllm-widget-range-value" id="webllm-temperature-value">0.7</span>
            </label>
          </div>
          <div class="webllm-widget-setting-group">
            <label class="webllm-widget-setting-label">
              <span>Max Response Length</span>
              <input type="range" id="webllm-max-tokens" min="50" max="2048" step="50" value="512">
              <span class="webllm-widget-range-value" id="webllm-max-tokens-value">512</span>
            </label>
          </div>
          <div class="webllm-widget-setting-group">
            <button id="webllm-export-chat" class="webllm-widget-secondary-btn">
              Export Chat History
            </button>
            <button id="webllm-clear-storage" class="webllm-widget-danger-btn">
              Clear All Data
            </button>
          </div>
          <div class="webllm-widget-setting-group">
            <h4>Model Cache Management</h4>
            <div id="webllm-cached-models-list" class="webllm-widget-cached-models">
              <!-- Cached models will be populated here -->
            </div>
            <button id="webllm-clear-cache" class="webllm-widget-danger-btn">
              Clear All Cached Models
            </button>
          </div>
          <div class="webllm-widget-setting-group">
            <div class="webllm-widget-keyboard-shortcuts">
              <h4>Keyboard Shortcuts</h4>
              <div class="webllm-widget-shortcut">
                <span>Toggle Widget</span>
                <kbd>Ctrl+Alt+W</kbd>
              </div>
              <div class="webllm-widget-shortcut">
                <span>Send Message</span>
                <kbd>Enter</kbd>
              </div>
              <div class="webllm-widget-shortcut">
                <span>Clear Chat</span>
                <kbd>Ctrl+K</kbd>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
  }

  bindEvents() {
    // Header controls
    document.getElementById('webllm-close-btn').onclick = () => this.closeModal();
    document.getElementById('webllm-minimize-btn').onclick = () => this.minimizeModal();
    document.getElementById('webllm-settings-btn').onclick = () => this.showSettings();
    
    // Model selection
    document.querySelectorAll('.webllm-widget-model-btn').forEach(btn => {
      btn.onclick = (e) => this.selectModel(e.target.dataset.model || e.target.closest('.webllm-widget-model-btn').dataset.model);
    });
    
    // Chat controls
    document.getElementById('webllm-change-model').onclick = () => this.showModelPanel();
    document.getElementById('webllm-clear-chat').onclick = () => this.clearChat();
    document.getElementById('webllm-send-btn').onclick = () => this.sendMessage();
    
    // Input handling
    const input = document.getElementById('webllm-input');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
    input.addEventListener('input', () => this.autoResizeInput());
    
    // Settings
    document.getElementById('webllm-temperature').addEventListener('input', (e) => {
      document.getElementById('webllm-temperature-value').textContent = e.target.value;
    });
    document.getElementById('webllm-max-tokens').addEventListener('input', (e) => {
      document.getElementById('webllm-max-tokens-value').textContent = e.target.value;
    });
    document.getElementById('webllm-export-chat').onclick = () => this.exportChat();
    document.getElementById('webllm-clear-storage').onclick = () => this.clearStorage();
    document.getElementById('webllm-clear-cache').onclick = () => this.clearAllModelsCache();
    
    // Update cached models list when settings panel is shown
    const settingsBtn = document.getElementById('webllm-settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => this.updateCachedModelsList());
    }
    
    // Update model button states to show cached models
    this.updateModelButtonStates();
  }

  updateModelButtonStates() {
    const cachedModels = this.getCachedModels();
    
    document.querySelectorAll('.webllm-widget-model-btn').forEach(btn => {
      const modelId = btn.dataset.model;
      const textEl = btn.querySelector('.webllm-widget-btn-text');
      
      if (cachedModels.includes(modelId)) {
        btn.classList.add('webllm-widget-cached');
        textEl.textContent = 'Load';
      } else {
        btn.classList.remove('webllm-widget-cached');
        textEl.textContent = 'Download';
      }
    });
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Toggle widget: Ctrl+Alt+W
      if (e.ctrlKey && e.altKey && e.key === 'w') {
        e.preventDefault();
        this.toggleModal();
      }
      
      // Clear chat: Ctrl+K (when widget is open)
      if (e.ctrlKey && e.key === 'k' && this.isOpen) {
        e.preventDefault();
        this.clearChat();
      }
    });
  }

  toggleModal() {
    if (this.isOpen) {
      this.closeModal();
    } else {
      this.openModal();
    }
  }

  openModal() {
    const modal = document.getElementById('webllm-widget-modal');
    modal.classList.remove('webllm-widget-hidden');
    this.isOpen = true;
    
    // Focus input if chat panel is visible
    const chatPanel = document.getElementById('webllm-chat-panel');
    if (!chatPanel.classList.contains('webllm-widget-hidden')) {
      setTimeout(() => {
        document.getElementById('webllm-input').focus();
      }, 100);
    }
  }

  closeModal() {
    const modal = document.getElementById('webllm-widget-modal');
    modal.classList.add('webllm-widget-hidden');
    this.isOpen = false;
  }

  minimizeModal() {
    // For now, just close. Could implement actual minimize later
    this.closeModal();
  }

  showSettings() {
    this.hideAllPanels();
    document.getElementById('webllm-settings-panel').classList.remove('webllm-widget-hidden');
  }

  showModelPanel() {
    this.hideAllPanels();
    document.getElementById('webllm-model-panel').classList.remove('webllm-widget-hidden');
  }

  showChatPanel() {
    this.hideAllPanels();
    document.getElementById('webllm-chat-panel').classList.remove('webllm-widget-hidden');
    setTimeout(() => {
      document.getElementById('webllm-input').focus();
    }, 100);
  }

  hideAllPanels() {
    document.querySelectorAll('.webllm-widget-panel').forEach(panel => {
      panel.classList.add('webllm-widget-hidden');
    });
  }

  async selectModel(modelId) {
    if (this.isInitializing) return;
    
    const model = this.config.models.find(m => m.id === modelId);
    if (!model) return;
    
    // Check if model is already cached
    const cachedModels = this.getCachedModels();
    const isModelCached = cachedModels.includes(modelId);
    
    try {
      this.isInitializing = true;
      this.downloadStartTime = Date.now();
      this.lastBytesLoaded = 0;
      
      // Prevent page unload during download
      this.preventNavigationDuringDownload();
      
      this.updateModelButton(modelId, 'loading');
      this.showDownloadProgress();
      
      if (isModelCached) {
        this.updateStatus('Loading cached model...');
      } else {
        this.updateStatus('Downloading model...');
      }
      
      // Lazy load WebLLM
      if (!this.webllm) {
        await this.loadWebLLM();
      }
      
      // Initialize engine with enhanced progress tracking
      this.engine = new this.webllm.MLCEngine();
      this.engine.setInitProgressCallback((progress) => {
        this.handleDownloadProgress(progress, modelId, isModelCached);
      });
      
      await this.engine.reload(modelId);
      
      this.currentModel = model;
      this.markModelAsCached(modelId);
      this.updateStatus('Connected');
      this.updateModelButton(modelId, 'loaded');
      this.hideDownloadProgress();
      this.showChatPanel();
      this.updateCurrentModelDisplay();
      this.allowNavigation();
      
      this.addSystemMessage(`${model.name} is now ready! You can start chatting.`);
      
    } catch (error) {
      console.error('Error loading model:', error);
      this.updateStatus('Error');
      this.updateModelButton(modelId, 'error');
      this.hideDownloadProgress();
      this.allowNavigation();
      this.showError(`Failed to load ${model.name}: ${error.message}`);
    } finally {
      this.isInitializing = false;
    }
  }

  handleDownloadProgress(progress, modelId, isModelCached) {
    const percentage = Math.round(progress.progress * 100);
    
    if (isModelCached) {
      this.updateDownloadProgress({
        progress: progress.progress,
        text: `Loading cached model: ${percentage}%`
      });
    } else {
      // Calculate detailed download information
      const downloadInfo = this.calculateDownloadDetails(progress);
      
      this.updateDownloadProgress({
        progress: progress.progress,
        text: `Downloading: ${percentage}% (${downloadInfo.downloaded}MB / ${downloadInfo.total}MB)`,
        details: `Speed: ${downloadInfo.speed}MB/s • ETA: ${downloadInfo.eta}`
      });
    }
  }

  calculateDownloadDetails(progress) {
    const currentTime = Date.now();
    const totalMB = progress.total ? Math.round(progress.total / (1024 * 1024)) : 0;
    const downloadedMB = progress.loaded ? Math.round(progress.loaded / (1024 * 1024)) : 0;
    
    // Calculate download speed
    const timeDiff = (currentTime - this.downloadStartTime) / 1000; // seconds
    const bytesDiff = (progress.loaded || 0) - this.lastBytesLoaded;
    const speedMBps = timeDiff > 0 ? Math.round((bytesDiff / timeDiff) / (1024 * 1024) * 10) / 10 : 0;
    
    // Calculate ETA
    let eta = 'Calculating...';
    if (speedMBps > 0 && progress.total && progress.loaded) {
      const remainingBytes = progress.total - progress.loaded;
      const remainingSeconds = remainingBytes / (speedMBps * 1024 * 1024);
      
      if (remainingSeconds < 60) {
        eta = `${Math.round(remainingSeconds)}s`;
      } else if (remainingSeconds < 3600) {
        eta = `${Math.round(remainingSeconds / 60)}m`;
      } else {
        eta = `${Math.round(remainingSeconds / 3600)}h`;
      }
    }
    
    this.lastBytesLoaded = progress.loaded || 0;
    
    return {
      total: totalMB,
      downloaded: downloadedMB,
      speed: speedMBps,
      eta: eta
    };
  }

  preventNavigationDuringDownload() {
    // Prevent accidental navigation during download
    this.beforeUnloadHandler = (e) => {
      if (this.isInitializing) {
        e.preventDefault();
        e.returnValue = 'Model download is in progress. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
  }

  allowNavigation() {
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
      this.beforeUnloadHandler = null;
    }
  }

  getCachedModels() {
    return JSON.parse(localStorage.getItem('webllm-cached-models') || '[]');
  }

  markModelAsCached(modelId) {
    const cachedModels = this.getCachedModels();
    if (!cachedModels.includes(modelId)) {
      cachedModels.push(modelId);
      localStorage.setItem('webllm-cached-models', JSON.stringify(cachedModels));
    }
  }

  clearModelCache(modelId = null) {
    if (modelId) {
      // Clear specific model
      const cachedModels = this.getCachedModels();
      const updated = cachedModels.filter(id => id !== modelId);
      localStorage.setItem('webllm-cached-models', JSON.stringify(updated));
      
      // Also try to clear from browser cache
      if ('caches' in window) {
        caches.delete(`webllm-${modelId}`);
      }
    } else {
      // Clear all models
      localStorage.removeItem('webllm-cached-models');
      localStorage.removeItem('webllm-widget-data');
      
      // Clear browser caches
      if ('caches' in window) {
        caches.keys().then(names => {
          names.forEach(name => {
            if (name.startsWith('webllm-')) {
              caches.delete(name);
            }
          });
        });
      }
      
      // Clear IndexedDB
      if ('indexedDB' in window) {
        ['webllm-cache', 'webllm-models', 'mlc-llm'].forEach(dbName => {
          const deleteReq = indexedDB.deleteDatabase(dbName);
          deleteReq.onsuccess = () => console.log(`Cleared ${dbName} database`);
        });
      }
    }
  }

  async loadWebLLM() {
    if (this.webllm) return;
    
    try {
      // Import WebLLM from CDN
      const module = await import('https://esm.run/@mlc-ai/web-llm');
      this.webllm = module;
    } catch (error) {
      throw new Error(`Failed to load WebLLM: ${error.message}`);
    }
  }

  updateModelButton(modelId, state) {
    const btn = document.querySelector(`[data-model="${modelId}"]`);
    if (!btn) return;
    
    const textEl = btn.querySelector('.webllm-widget-btn-text');
    const progressEl = btn.querySelector('.webllm-widget-progress-ring');
    
    btn.classList.remove('webllm-widget-loading', 'webllm-widget-loaded', 'webllm-widget-error');
    
    const cachedModels = this.getCachedModels();
    const isCached = cachedModels.includes(modelId);
    
    switch (state) {
      case 'loading':
        btn.classList.add('webllm-widget-loading');
        textEl.textContent = isCached ? 'Loading...' : 'Downloading...';
        progressEl.classList.remove('webllm-widget-hidden');
        btn.disabled = true;
        break;
      case 'loaded':
        btn.classList.add('webllm-widget-loaded');
        textEl.textContent = 'Loaded';
        progressEl.classList.add('webllm-widget-hidden');
        btn.disabled = true;
        break;
      case 'error':
        btn.classList.add('webllm-widget-error');
        textEl.textContent = 'Error';
        progressEl.classList.add('webllm-widget-hidden');
        btn.disabled = false;
        break;
      default:
        if (isCached) {
          btn.classList.add('webllm-widget-cached');
          textEl.textContent = 'Load';
        } else {
          btn.classList.remove('webllm-widget-cached');
          textEl.textContent = 'Download';
        }
        progressEl.classList.add('webllm-widget-hidden');
        btn.disabled = false;
    }
  }

  showDownloadProgress() {
    document.getElementById('webllm-download-info').classList.remove('webllm-widget-hidden');
  }

  hideDownloadProgress() {
    document.getElementById('webllm-download-info').classList.add('webllm-widget-hidden');
  }

  updateDownloadProgress(progress) {
    const progressFill = document.getElementById('webllm-progress-fill');
    const progressText = document.getElementById('webllm-progress-text');
    const progressDetails = document.getElementById('webllm-download-details');
    
    if (progress.progress !== undefined) {
      const percent = Math.round(progress.progress * 100);
      progressFill.style.width = `${percent}%`;
      progressText.textContent = progress.text || `${percent}% - Loading...`;
    }
    
    if (progress.details) {
      progressDetails.textContent = progress.details;
      progressDetails.classList.remove('webllm-widget-hidden');
    } else if (progress.text) {
      progressDetails.textContent = progress.text;
      progressDetails.classList.remove('webllm-widget-hidden');
    }
  }

  updateStatus(status) {
    document.getElementById('webllm-status').textContent = status;
  }

  updateCurrentModelDisplay() {
    if (this.currentModel) {
      document.getElementById('webllm-current-model').textContent = this.currentModel.name;
    }
  }

  async sendMessage() {
    const input = document.getElementById('webllm-input');
    const message = input.value.trim();
    
    if (!message || !this.engine || this.isStreaming) return;
    
    // Add user message
    this.addUserMessage(message);
    input.value = '';
    this.autoResizeInput();
    
    // Show typing indicator
    const typingId = this.addTypingIndicator();
    
    try {
      this.isStreaming = true;
      
      // Prepare chat history
      const messages = this.chatHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
      
      // Add current message
      messages.push({ role: 'user', content: message });
      
      // Get settings
      const temperature = parseFloat(document.getElementById('webllm-temperature').value);
      const maxTokens = parseInt(document.getElementById('webllm-max-tokens').value);
      
      // Stream response
      let response = '';
      const completion = await this.engine.chat.completions.create({
        messages: messages,
        temperature: temperature,
        max_tokens: maxTokens,
        stream: true,
      });
      
      // Remove typing indicator and add message bubble
      this.removeTypingIndicator(typingId);
      const messageId = this.addAIMessage('');
      
      // Stream tokens
      for await (const chunk of completion) {
        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta) {
          response += delta;
          this.updateAIMessage(messageId, response);
          this.scrollToBottom();
        }
      }
      
      // Save to history
      this.chatHistory.push(
        { role: 'user', content: message, timestamp: Date.now() },
        { role: 'assistant', content: response, timestamp: Date.now() }
      );
      this.saveChatHistory();
      
    } catch (error) {
      console.error('Error generating response:', error);
      this.removeTypingIndicator(typingId);
      this.addErrorMessage(`Error: ${error.message}`);
    } finally {
      this.isStreaming = false;
    }
  }

  addUserMessage(content) {
    const messagesContainer = document.getElementById('webllm-chat-messages');
    const messageEl = document.createElement('div');
    messageEl.className = 'webllm-widget-message webllm-widget-user-message';
    messageEl.innerHTML = `
      <div class="webllm-widget-message-content">
        <p>${this.escapeHtml(content)}</p>
      </div>
      <div class="webllm-widget-user-avatar">👤</div>
    `;
    messagesContainer.appendChild(messageEl);
    this.scrollToBottom();
  }

  addAIMessage(content) {
    const messagesContainer = document.getElementById('webllm-chat-messages');
    const messageEl = document.createElement('div');
    const messageId = `msg-${Date.now()}`;
    messageEl.id = messageId;
    messageEl.className = 'webllm-widget-message webllm-widget-ai-message';
    messageEl.innerHTML = `
      <div class="webllm-widget-ai-avatar">🤖</div>
      <div class="webllm-widget-message-content">
        <p>${this.escapeHtml(content)}</p>
      </div>
    `;
    messagesContainer.appendChild(messageEl);
    this.scrollToBottom();
    return messageId;
  }

  updateAIMessage(messageId, content) {
    const messageEl = document.getElementById(messageId);
    if (messageEl) {
      const contentEl = messageEl.querySelector('.webllm-widget-message-content p');
      contentEl.innerHTML = this.formatMessage(content);
    }
  }

  addSystemMessage(content) {
    const messagesContainer = document.getElementById('webllm-chat-messages');
    const messageEl = document.createElement('div');
    messageEl.className = 'webllm-widget-message webllm-widget-system-message';
    messageEl.innerHTML = `
      <div class="webllm-widget-system-content">
        <div class="webllm-widget-system-icon">ℹ️</div>
        <p>${this.escapeHtml(content)}</p>
      </div>
    `;
    messagesContainer.appendChild(messageEl);
    this.scrollToBottom();
  }

  addErrorMessage(content) {
    const messagesContainer = document.getElementById('webllm-chat-messages');
    const messageEl = document.createElement('div');
    messageEl.className = 'webllm-widget-message webllm-widget-error-message';
    messageEl.innerHTML = `
      <div class="webllm-widget-error-content">
        <div class="webllm-widget-error-icon">⚠️</div>
        <p>${this.escapeHtml(content)}</p>
      </div>
    `;
    messagesContainer.appendChild(messageEl);
    this.scrollToBottom();
  }

  addTypingIndicator() {
    const messagesContainer = document.getElementById('webllm-chat-messages');
    const typingId = `typing-${Date.now()}`;
    const typingEl = document.createElement('div');
    typingEl.id = typingId;
    typingEl.className = 'webllm-widget-message webllm-widget-ai-message webllm-widget-typing';
    typingEl.innerHTML = `
      <div class="webllm-widget-ai-avatar">🤖</div>
      <div class="webllm-widget-message-content">
        <div class="webllm-widget-typing-indicator">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    `;
    messagesContainer.appendChild(typingEl);
    this.scrollToBottom();
    return typingId;
  }

  removeTypingIndicator(typingId) {
    const typingEl = document.getElementById(typingId);
    if (typingEl) {
      typingEl.remove();
    }
  }

  clearChat() {
    const messagesContainer = document.getElementById('webllm-chat-messages');
    // Keep welcome message, remove others
    const messages = messagesContainer.querySelectorAll('.webllm-widget-message:not(.webllm-widget-welcome-message)');
    messages.forEach(msg => msg.remove());
    
    this.chatHistory = [];
    this.saveChatHistory();
  }

  autoResizeInput() {
    const input = document.getElementById('webllm-input');
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  }

  scrollToBottom() {
    const messagesContainer = document.getElementById('webllm-chat-messages');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  formatMessage(content) {
    // Simple markdown-like formatting
    return this.escapeHtml(content)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  loadChatHistory() {
    try {
      const stored = localStorage.getItem('webllm-widget-chat-history');
      if (stored) {
        this.chatHistory = JSON.parse(stored);
      }
    } catch (error) {
      console.warn('Failed to load chat history:', error);
      this.chatHistory = [];
    }
  }

  saveChatHistory() {
    try {
      localStorage.setItem('webllm-widget-chat-history', JSON.stringify(this.chatHistory));
    } catch (error) {
      console.warn('Failed to save chat history:', error);
    }
  }

  updateCachedModelsList() {
    const cachedModels = this.getCachedModels();
    const listContainer = document.getElementById('webllm-cached-models-list');
    
    if (cachedModels.length === 0) {
      listContainer.innerHTML = '<p class="webllm-widget-no-cache">No models cached yet</p>';
      return;
    }
    
    listContainer.innerHTML = cachedModels.map(modelId => {
      const model = this.config.models.find(m => m.id === modelId);
      const modelName = model ? model.name : modelId;
      const modelSize = model ? model.size : 'Unknown size';
      
      return `
        <div class="webllm-widget-cached-model">
          <div class="webllm-widget-cached-model-info">
            <span class="webllm-widget-cached-model-name">${modelName}</span>
            <span class="webllm-widget-cached-model-size">${modelSize}</span>
          </div>
          <button class="webllm-widget-remove-model-btn" onclick="window.webllmWidget.clearSpecificModelCache('${modelId}')">
            Remove
          </button>
        </div>
      `;
    }).join('');
  }

  clearSpecificModelCache(modelId) {
    if (confirm(`Are you sure you want to remove this model from cache? It will need to be downloaded again.`)) {
      this.clearModelCache(modelId);
      this.updateCachedModelsList();
      
      // Update model button state
      this.updateModelButton(modelId, 'default');
      
      this.addSystemMessage(`Model cache cleared for ${modelId}`);
    }
  }

  clearAllModelsCache() {
    if (confirm('Are you sure you want to clear all cached models? They will need to be downloaded again.')) {
      this.clearModelCache(); // Clear all
      this.updateCachedModelsList();
      
      // Reset all model buttons
      document.querySelectorAll('.webllm-widget-model-btn').forEach(btn => {
        const modelId = btn.dataset.model;
        this.updateModelButton(modelId, 'default');
      });
      
      this.addSystemMessage('All model caches cleared successfully.');
    }
  }

  calculateCacheSize() {
    // Estimate cache size based on cached models
    const cachedModels = this.getCachedModels();
    let totalSize = 0;
    
    cachedModels.forEach(modelId => {
      const model = this.config.models.find(m => m.id === modelId);
      if (model && model.sizeGB) {
        totalSize += model.sizeGB;
      }
    });
    
    return totalSize;
  }

  exportChat() {
    const chatData = {
      model: this.currentModel?.name || 'Unknown',
      timestamp: new Date().toISOString(),
      messages: this.chatHistory
    };
    
    const blob = new Blob([JSON.stringify(chatData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `webllm-chat-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  clearStorage() {
    if (confirm('Are you sure you want to clear all chat history and settings? This cannot be undone.')) {
      localStorage.removeItem('webllm-widget-chat-history');
      this.chatHistory = [];
      this.clearChat();
      this.addSystemMessage('All data cleared successfully.');
    }
  }

  showError(message) {
    // Create toast notification
    const toast = document.createElement('div');
    toast.className = 'webllm-widget-toast webllm-widget-toast-error';
    toast.innerHTML = `
      <div class="webllm-widget-toast-content">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M15 9l-6 6"/>
          <path d="M9 9l6 6"/>
        </svg>
        <span>${this.escapeHtml(message)}</span>
      </div>
      <button onclick="this.parentElement.remove()" class="webllm-widget-toast-close">×</button>
    `;
    
    document.body.appendChild(toast);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      if (toast.parentElement) {
        toast.remove();
      }
    }, 5000);
  }
}

// Initialize widget when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.webllmWidget = new WebLLMWidget();
  });
} else {
  window.webllmWidget = new WebLLMWidget();
}

// Expose for manual initialization if needed
window.WebLLMWidget = WebLLMWidget;
