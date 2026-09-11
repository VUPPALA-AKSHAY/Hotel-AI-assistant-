/**
 * Grand Palm AI Assistant - Frontend JavaScript
 * Dark/Light Theme Support + Blur Text Animation
 */

// DOM Elements
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const messageInputFixed = document.getElementById('messageInputFixed');
const sendButton = document.getElementById('sendButton');
const sendButtonFixed = document.getElementById('sendButtonFixed');
const typingIndicator = document.getElementById('typingIndicator');
const welcomeScreen = document.getElementById('welcomeScreen');
const chatArea = document.getElementById('chatArea');
const fixedInputArea = document.getElementById('fixedInputArea');
const blurTextContainer = document.getElementById('blurTextContainer');

// Sidebar Elements
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const openSidebarBtn = document.getElementById('openSidebarBtn');
const newChatBtn = document.getElementById('newChatBtn');

function isMobileSidebarMode() {
    // Keep JS behavior aligned with the CSS breakpoint used for the off-canvas sidebar.
    return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(max-width: 768px)').matches;
}

function openMobileSidebar() {
    if (!sidebar) return;
    sidebar.classList.add('active');
    if (sidebarOverlay) sidebarOverlay.classList.add('active');
    document.body.classList.add('sidebar-open');
}

function closeMobileSidebar() {
    if (sidebar) sidebar.classList.remove('active');
    if (sidebarOverlay) sidebarOverlay.classList.remove('active');
    document.body.classList.remove('sidebar-open');
}

// Theme Elements
const themeToggle = document.getElementById('themeToggle');
const themeToggleMobile = document.getElementById('themeToggleMobile');

// API Base URL
const API_BASE = '/api';
// Direct stream URL (bypasses Next.js rewrite buffering)
const STREAM_BASE = window.location.port === '3001' ? 'http://localhost:3000/api' : '/api';

// State
let isLoading = false;
let hasMessages = false;
let currentQuestionIndex = 0;
let blurAnimationInterval = null;
let selectedModel = localStorage.getItem('gp-model') || 'ling-3.0-flash-fin-free'; // Default to Ling
let selectedMode = localStorage.getItem('gp-mode') || 'fast'; // Load saved or default "fast"

// Session ID for conversation memory (unique per browser tab)
let sessionId = sessionStorage.getItem('gp-session-id');
if (!sessionId) {
    sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substring(7);
    sessionStorage.setItem('gp-session-id', sessionId);
}
console.log(`🧠 Chat session ID: ${sessionId}`);

// Browser local cache for hotel KB (Vercel Blob/KB cache mirror)
const KB_CACHE_KEY = 'gp-kb-cache:v1';
async function cacheHotelKb() {
    try {
        const cached = localStorage.getItem(KB_CACHE_KEY);
        if (cached) {
            const parsed = JSON.parse(cached);
            // Use cache if less than 24h old
            if (parsed.cachedAt && Date.now() - parsed.cachedAt < 24 * 60 * 60 * 1000) {
                console.log('📦 Hotel KB loaded from browser cache');
                return;
            }
        }
        const res = await fetch(`${API_BASE}/knowledge`);
        if (res.ok) {
            const data = await res.json();
            localStorage.setItem(KB_CACHE_KEY, JSON.stringify({ data, cachedAt: Date.now() }));
            console.log('📦 Hotel KB cached in browser (localStorage)');
        }
    } catch (e) { console.warn('KB cache failed', e); }
}
cacheHotelKb();

// Conversation memory: sent to the server every turn so the AI keeps context.
let conversationHistory = [];
const MAX_CONVERSATION_TURNS = 20;
let thinkingStartTime = 0;

// Hotel Related Questions for Blur Text Animation
const hotelQuestions = [
    "What are your check-in and check-out times?",
    "Do you have family rooms?",
    "What time is breakfast served?",
    "Do you offer airport transfers?",
    "What amenities come with each room type?",
    "Is there a swimming pool?",
    "Can I book a late checkout?",
    "Do you allow pets?",
    "What dining options are available?",
    "Is parking available for guests?",
    "Do you have a gym or fitness center?",
    "What is the cancellation policy?",
    "Do you have connecting rooms?",
    "Can I request a room on a high floor?",
    "Is there a spa or wellness center?"
];

/**
 * Initialize the app
 */
function init() {
    // Event listeners for chat (main input)
    sendButton.addEventListener('click', () => handleSendMessage(messageInput));
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage(messageInput);
        }
    });
    messageInput.addEventListener('input', () => autoResizeTextarea(messageInput));

    // Event listeners for chat (fixed input)
    if (sendButtonFixed) {
        sendButtonFixed.addEventListener('click', () => handleSendMessage(messageInputFixed));
    }
    if (messageInputFixed) {
        messageInputFixed.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage(messageInputFixed);
            }
        });
        messageInputFixed.addEventListener('input', () => autoResizeTextarea(messageInputFixed));
    }

    // Sidebar toggles
    if (openSidebarBtn) {
        openSidebarBtn.addEventListener('click', (e) => {
            // Prevent odd mobile click/tap edge-cases (e.g. focus/scroll jumps).
            e.preventDefault();
            toggleSidebar();
        });
    }
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', closeSidebar);
    }

    // Close sidebar with Escape on mobile
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeMobileSidebar();
    });

    // If we resize out of mobile mode, ensure the off-canvas state is cleared
    window.addEventListener('resize', () => {
        if (!isMobileSidebarMode()) closeMobileSidebar();
    }, { passive: true });

    // New chat button
    if (newChatBtn) {
        newChatBtn.addEventListener('click', startNewChat);
    }

    // Theme toggles
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
    if (themeToggleMobile) {
        themeToggleMobile.addEventListener('click', toggleTheme);
    }

    // Load saved theme
    loadSavedTheme();

    // Load Vapi SDK
    loadVapiWidget();

    // Start blur text animation
    startBlurTextAnimation();

    // Start animated placeholder in search box
    startAnimatedPlaceholder();

    // Listen for input to show/hide animated placeholder
    messageInput.addEventListener('input', handleInputChange);

    // Initialize selectors
    initModelSelector();
    initModeSelector();

    // Focus input on load
    messageInput.focus();
}

/**
 * Start the blur text animation
 */
function startBlurTextAnimation() {
    if (!blurTextContainer) return;

    // Show first question immediately
    animateBlurText(hotelQuestions[currentQuestionIndex]);

    // Cycle through questions every 5 seconds (consistent timing)
    blurAnimationInterval = setInterval(() => {
        currentQuestionIndex = (currentQuestionIndex + 1) % hotelQuestions.length;
        animateBlurText(hotelQuestions[currentQuestionIndex]);
    }, 5000);
}

/**
 * Stop the blur text animation
 */
function stopBlurTextAnimation() {
    if (blurAnimationInterval) {
        clearInterval(blurAnimationInterval);
        blurAnimationInterval = null;
    }
    if (blurTextContainer) {
        blurTextContainer.innerHTML = '';
    }
}

/**
 * Animate blur text with word-by-word reveal (smooth and consistent)
 */
function animateBlurText(text) {
    if (!blurTextContainer) return;

    // Clear existing content
    blurTextContainer.innerHTML = '';

    const words = text.split(' ');
    const wordDelay = 150; // Slower 150ms delay between each word for smooth effect

    words.forEach((word, index) => {
        const span = document.createElement('span');
        span.className = 'blur-word';
        span.textContent = word;
        span.style.animationDelay = `${index * wordDelay}ms`;
        blurTextContainer.appendChild(span);
    });
}

/**
 * Toggle theme between dark and light
 */
function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('gp-theme', newTheme);

    // Update all theme toggle text elements
    updateThemeText(newTheme);

    // Update Vapi Widget Theme
    updateVapiTheme(newTheme);
}

/**
 * Load Vapi SDK script with retry on failure
 */
let vapiLoadRetries = 0;
const VAPI_MAX_RETRIES = 3;
const VAPI_SDK_URL = '/vapi-widget.js';

function loadVapiWidget() {
    if (document.getElementById('vapi-widget-script')) return;
    if (vapiLoadRetries >= VAPI_MAX_RETRIES) {
        console.warn('[Vapi] Max retries reached, skipping SDK load');
        return;
    }

    const script = document.createElement('script');
    script.id = 'vapi-widget-script';
    script.src = VAPI_SDK_URL;
    script.async = true;
    script.type = 'text/javascript';

    script.onload = () => {
        console.log('[Vapi] SDK loaded successfully');
    };

    script.onerror = () => {
        console.warn(`[Vapi] SDK load failed (attempt ${vapiLoadRetries + 1}/${VAPI_MAX_RETRIES})`);
        script.remove();
        vapiLoadRetries++;
        if (vapiLoadRetries < VAPI_MAX_RETRIES) {
            setTimeout(loadVapiWidget, 2000 * vapiLoadRetries);
        }
    };

    document.body.appendChild(script);
}

/**
 * Update Vapi Widget Theme based on app theme
 * Implements Create-or-Update strategy to keep SDK connected
 */
/* eslint-disable no-undef */
async function updateVapiTheme(theme) {
    console.log('[Theme] Updating Vapi Widget to:', theme);

    let vapiWidget = document.querySelector('vapi-widget');
    const isDark = theme === 'dark';

    // Vapi credentials come from the backend so the widget always
    // points at the real assistant for this deployment.
    let publicKey = "faebf4d8-99d7-482a-bef2-1d281d8e9157";
    let assistantId = "5cd0ca4a-cb23-4ddc-ae6c-d8dfcd4965d3";
    try {
        const res = await fetch(`${API_BASE}/voice/config`);
        if (res.ok) {
            const cfg = await res.json();
            if (cfg.publicKey) publicKey = cfg.publicKey;
            if (cfg.assistantId) assistantId = cfg.assistantId;
        }
    } catch (err) {
        console.warn('[Theme] Could not load Vapi config, using defaults', err);
    }

    // 1. If widget doesn't exist (Initial Load), create it
    if (!vapiWidget) {
        console.log('[Theme] Initializing new Vapi Widget...');
        vapiWidget = document.createElement('vapi-widget');
        vapiWidget.setAttribute('mode', 'voice');
        vapiWidget.setAttribute('position', 'bottom-right');
        vapiWidget.setAttribute('size', 'compact');
        vapiWidget.setAttribute('radius', 'large');
        vapiWidget.setAttribute('main-label', 'Click to Talk');
        vapiWidget.setAttribute('start-button-text', 'Click to Talk');
        vapiWidget.setAttribute('end-button-text', 'End Call');
        vapiWidget.setAttribute('empty-voice-message', 'Tap to talk with the hotel assistant');
        document.body.appendChild(vapiWidget);
    }

    // 2. Point the widget at the live assistant creds
    if (publicKey) vapiWidget.setAttribute('public-key', publicKey);
    if (assistantId) vapiWidget.setAttribute('assistant-id', assistantId);

    // 2. Update Theme Attributes (Hot-Swap)
    if (isDark) {
        // Dark Mode: Dark Widget, White Button (Icon Black)
        vapiWidget.setAttribute('theme', 'dark');
        vapiWidget.setAttribute('base-color', '#1a1a1a');
        vapiWidget.setAttribute('button-base-color', '#ffffff'); // White Button
        vapiWidget.setAttribute('button-accent-color', '#000000'); // Black Icon
    } else {
        // Light Mode: White Widget, Black Button (Icon White)
        vapiWidget.setAttribute('theme', 'light');
        vapiWidget.setAttribute('base-color', '#ffffff');
        vapiWidget.setAttribute('button-base-color', '#000000'); // Black Button
        vapiWidget.setAttribute('button-accent-color', '#ffffff'); // White Icon
    }

    console.log(`[Theme] Vapi Widget Updated (Dark: ${isDark})`);
}

/**
 * Update theme toggle button text
 */
function updateThemeText(theme) {
    const textLabel = theme === 'dark' ? 'Light Mode' : 'Dark Mode';

    // Update sidebar toggle text
    const sidebarText = document.querySelector('.theme-toggle-btn span');
    if (sidebarText) sidebarText.textContent = textLabel;

    // Update top bar toggle text
    const topbarText = document.getElementById('themeToggleText');
    if (topbarText) topbarText.textContent = textLabel;
}

/**
 * Load saved theme from localStorage
 */
function loadSavedTheme() {
    const savedTheme = localStorage.getItem('gp-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    // Update all theme text
    updateThemeText(savedTheme);

    // Update Vapi Widget Theme
    updateVapiTheme(savedTheme);
}

/**
 * Auto-resize textarea based on content
 */
function autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
}

/**
 * Toggle sidebar
 */
/**
 * Toggle sidebar
 */
function toggleSidebar() {
    if (!isMobileSidebarMode()) {
        // Desktop: toggle collapsed state
        const appLayout = document.querySelector('.app-layout');
        if (appLayout) {
            appLayout.classList.toggle('collapsed');
        }
    } else {
        // Mobile: toggle active state overlay
        if (!sidebar) return;
        const isOpen = sidebar.classList.toggle('active');
        if (sidebarOverlay) sidebarOverlay.classList.toggle('active', isOpen);
        document.body.classList.toggle('sidebar-open', isOpen);
    }
}

/**
 * Close sidebar
 */
function closeSidebar() {
    closeMobileSidebar();
}

/**
 * Start a new chat
 */
function startNewChat() {
    // Clear messages
    chatMessages.innerHTML = '';
    chatMessages.classList.remove('active');

    // Show welcome screen
    if (welcomeScreen) {
        welcomeScreen.style.display = 'flex';
    }

    // Hide fixed input
    if (fixedInputArea) {
        fixedInputArea.classList.remove('active');
    }

    // Reset state
    hasMessages = false;

    // Clear inputs
    messageInput.value = '';
    if (messageInputFixed) {
        messageInputFixed.value = '';
    }
    autoResizeTextarea(messageInput);

    // Restart blur animation
    startBlurTextAnimation();

    // Close sidebar on mobile
    closeSidebar();

    // Focus input
    messageInput.focus();
}

/**
 * Handle send message
 */
async function handleSendMessage(inputElement) {
    const message = inputElement.value.trim();

    if (!message || isLoading) return;

    // Hide welcome screen on first message
    if (!hasMessages) {
        if (welcomeScreen) {
            welcomeScreen.style.display = 'none';
        }
        chatMessages.classList.add('active');
        if (fixedInputArea) {
            fixedInputArea.classList.add('active');
        }
        hasMessages = true;

        // Stop blur animation when chat starts
        stopBlurTextAnimation();
    }

    // Clear input
    inputElement.value = '';
    autoResizeTextarea(inputElement);

    // Add user message to chat
    addMessage(message, 'user');

    // Determine contextual thinking label based on message content
    const lowerMsg = message.toLowerCase();
    let thinkingLabel = 'Looking up information';
    if (/\b(room|rooms?|suites?|availab|book|booking|stay|check.?in|check.?out|nights?|guests?|tomorrow|tonight|next\s+(week|month)|\d+\s*(guests?|rooms?))\b/i.test(lowerMsg)) {
        thinkingLabel = 'Checking room availability';
    } else if (/\b(price|cost|rate|tariff|how much)\b/i.test(lowerMsg)) {
        thinkingLabel = 'Looking up rates';
    } else if (/\b(policies?|policy|cancel|cancellation|refund)\b/i.test(lowerMsg)) {
        thinkingLabel = 'Checking policies';
    } else if (/\b(amenities?|facilities?|pool|gym|spa|restaurant|dining|parking)\b/i.test(lowerMsg)) {
        thinkingLabel = 'Looking up amenities';
    } else if (/\b(nearby|close to|distance|taxi|uber|airport)\b/i.test(lowerMsg)) {
        thinkingLabel = 'Finding nearby info';
    }

    // Show typing indicator with contextual label
    showTypingIndicator(thinkingLabel);

    // Set loading state
    isLoading = true;
    sendButton.disabled = true;
    if (sendButtonFixed) sendButtonFixed.disabled = true;

    // Remember this turn (trimmed, oldest first)
    conversationHistory.push({ role: 'user', content: message });
    if (conversationHistory.length > MAX_CONVERSATION_TURNS) {
        conversationHistory = conversationHistory.slice(-MAX_CONVERSATION_TURNS);
    }
    const history = conversationHistory.slice();

    try {
        if (selectedMode === 'fast') {
            // Send message to streaming API (FAST MODE ONLY)
            console.log(`📤 Streaming to model: ${selectedModel}, mode: ${selectedMode}, session: ${sessionId}`);

            const response = await fetch(`${STREAM_BASE}/chat/stream`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message,
                    model: selectedModel,
                    mode: selectedMode,
                    sessionId: sessionId,
                    history
                })
            });

            // Check if response is SSE
            if (!response.ok) {
                throw new Error('Failed to connect to streaming API');
            }

            const avatarSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
             <path d="M12 2L2 7l10 5 10-5-10-5z"/>
             <path d="M2 17l10 5 10-5"/>
             <path d="M2 12l10 5 10-5"/>
             </svg>`;

            let fullResponse = '';
            let streamingText = null;
            let messageCreated = false;

            // Read the SSE stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const jsonStr = line.slice(6).trim();
                        if (jsonStr) {
                            try {
                                const data = JSON.parse(jsonStr);

                                if (data.chunk) {
                                    fullResponse += data.chunk;

                                    // Create message div only when first real content arrives
                                    if (!messageCreated) {
                                        messageCreated = true;
                                        hideTypingIndicator();
                                        const messageDiv = document.createElement('div');
                                        messageDiv.className = 'message bot-message';
                                        messageDiv.innerHTML = `
                                            <div class="message-avatar">${avatarSvg}</div>
                                            <div class="message-content">
                                                <div class="message-text" id="streamingText"></div>
                                            </div>
                                        `;
                                        chatMessages.appendChild(messageDiv);
                                        streamingText = document.getElementById('streamingText');
                                    }

                                    // Render markdown on every chunk so **bold** etc. never shows raw
                                    streamingText.innerHTML = formatMessage(fullResponse);

                                    scrollToBottom();
                                }

                                if (data.done) {
                                    console.log('✅ Streaming complete');
                                    // Final markdown render (in case anything was missed)
                                    if (streamingText) {
                                        streamingText.innerHTML = formatMessage(fullResponse);
                                        streamingText.removeAttribute('id');
                                    }
                                    conversationHistory.push({ role: 'assistant', content: fullResponse });
                                }

                                if (data.error) {
                                    console.error('Stream error:', data.error);
                                    if (streamingText) {
                                        streamingText.innerHTML = formatMessage(fullResponse + '\n\n⚠️ ' + data.error);
                                    }
                                }
                            } catch (e) {
                                // Ignore parse errors
                            }
                        }
                    }
                }
            }
        } else {
            // Standard API call for non-streaming modes (Thinking, etc.)
            console.log(`📤 Sending to model: ${selectedModel}, mode: ${selectedMode}, session: ${sessionId}`);
            const response = await fetch(`${API_BASE}/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message,
                    model: selectedModel,
                    mode: selectedMode,
                    sessionId: sessionId,
                    history
                })
            });

            const data = await response.json();

            // Keep thinking visible for at least 7s
            const elapsed2 = Date.now() - thinkingStartTime;
            if (elapsed2 < 7000) await new Promise(r => setTimeout(r, 7000 - elapsed2));

            // Hide typing indicator
            hideTypingIndicator();

            if (data.success && data.response) {
                // Handle structured response { answer, sources }
                const botMessage = typeof data.response === 'object' ? data.response.answer : data.response;
                const botSources = typeof data.response === 'object' ? data.response.sources : data.sources;

                // Update thinking animation with sources if in thinking mode
                if (selectedMode === 'thinking' && botSources && botSources.length > 0) {
                    updateThinkingSources(botSources);
                    // Wait a moment for user to see the sources
                    await new Promise(resolve => setTimeout(resolve, 500));
                }

                // Add bot response
                addMessage(botMessage, 'bot', botSources);
                conversationHistory.push({ role: 'assistant', content: botMessage });
            } else {
                // Show error
                addMessage(
                    data.message || 'Sorry, I encountered an error. Please try again.',
                    'bot',
                    null,
                    true
                );
            }
        }

    } catch (error) {
        console.error('Chat error:', error);
        hideTypingIndicator();
        addMessage(
            'Sorry, I\'m having trouble connecting. Please check your internet connection and try again.',
            'bot',
            null,
            true
        );
    } finally {
        isLoading = false;
        sendButton.disabled = false;
        if (sendButtonFixed) sendButtonFixed.disabled = false;

        // Focus the appropriate input
        if (hasMessages && messageInputFixed) {
            messageInputFixed.focus();
        } else {
            messageInput.focus();
        }
    }
}

/**
 * Add a message to the chat
 */
function addMessage(content, type, sources = null, isError = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}-message ${isError ? 'error-message' : ''}`;

    const avatarSvg = type === 'user'
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
             <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
             <circle cx="12" cy="7" r="4"/>
           </svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
             <path d="M12 2L2 7l10 5 10-5-10-5z"/>
             <path d="M2 17l10 5 10-5"/>
             <path d="M2 12l10 5 10-5"/>
           </svg>`;

    // Format content (convert markdown-like syntax)
    const formattedContent = formatMessage(content);

    // Build sources HTML if available
    let sourcesHtml = '';
    if (sources && sources.length > 0) {
        sourcesHtml = `
            <div class="message-sources">
                <div class="sources-label">Sources:</div>
                ${sources.map(s => {
            const title = typeof s === 'object' ? s.title : getUrlLabel(s);
            const url = typeof s === 'object' ? s.url : s;
            return `<a href="${url}" target="_blank" class="source-tag">${title}</a>`;
        }).join('')}
            </div>
        `;
    }

    messageDiv.innerHTML = `
        <div class="message-avatar">${avatarSvg}</div>
        <div class="message-content">
            <div class="message-text">
                ${formattedContent}
                ${sourcesHtml}
            </div>
        </div>
    `;

    chatMessages.appendChild(messageDiv);
    scrollToBottom();
}

/**
 * Format message content (enhanced markdown support)
 */
function formatMessage(content) {
    // Escape HTML first
    let formatted = escapeHtml(content);

    // Horizontal rules (must be before lists to avoid conflicts)
    formatted = formatted.replace(/^---+$/gm, '<hr class="message-divider">');

    // Headers (process from most # to least #)
    formatted = formatted.replace(/^#### (.*$)/gm, '<h4>$1</h4>');
    formatted = formatted.replace(/^### (.*$)/gm, '<h3>$1</h3>');
    formatted = formatted.replace(/^## (.*$)/gm, '<h2>$1</h2>');
    formatted = formatted.replace(/^# (.*$)/gm, '<h1>$1</h1>');

    // Links [text](url)
    formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Bold/Italic/Code (Inline)
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/__(.+?)__/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\*(.+?)\*/g, '<em>$1</em>');
    formatted = formatted.replace(/_(.+?)_/g, '<em>$1</em>');
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Tables - Parse markdown tables
    formatted = formatted.replace(/((?:^\|.+\|$\n?)+)/gm, (tableMatch) => {
        const rows = tableMatch.trim().split('\n').filter(r => r.trim());
        if (rows.length < 2) return tableMatch;

        let tableHtml = '<div class="table-wrapper"><table class="message-table">';

        rows.forEach((row, index) => {
            // Skip separator row (|---|---|)
            if (/^\|[\s-:|]+\|$/.test(row)) return;

            const cells = row.split('|').filter(c => c.trim() !== '');
            const tag = index === 0 ? 'th' : 'td';
            const rowClass = index === 0 ? 'table-header' : '';

            tableHtml += `<tr class="${rowClass}">`;
            cells.forEach(cell => {
                tableHtml += `<${tag}>${cell.trim()}</${tag}>`;
            });
            tableHtml += '</tr>';
        });

        tableHtml += '</table></div>';
        return tableHtml;
    });

    // Lists
    // Unordered
    formatted = formatted.replace(/^\s*[-*]\s+(.*)$/gm, '<li>$1</li>');
    // Ordered
    formatted = formatted.replace(/^\s*\d+\.\s+(.*)$/gm, '<li class="ordered">$1</li>');

    // Group Lists - Handle multiline lists and loose spacing
    formatted = formatted.replace(/((?:<li.*?>.*?<\/li>\s*)+)/gs, (match) => {
        const cleanMatch = match.trim();
        if (cleanMatch.includes('class="ordered"')) return `<ol>${cleanMatch}</ol>`;
        return `<ul>${cleanMatch}</ul>`;
    });

    // Paragraphs - Split by double newline
    let blocks = formatted.split(/\n\n+/);

    formatted = blocks.map(block => {
        block = block.trim();
        if (!block) return '';

        // Don't wrap block elements in p
        if (block.startsWith('<h') || block.startsWith('<ul') || block.startsWith('<ol') ||
            block.startsWith('<hr') || block.startsWith('<div') || block.startsWith('<table')) {
            return block;
        }

        // Wrap text in paragraph, handling single newlines as breaks
        return `<p>${block.replace(/\n/g, '<br>')}</p>`;
    }).join('');

    return formatted;
}

/**
 * Get a readable label for URL
 */
function getUrlLabel(url) {
    try {
        const urlObj = new URL(url);
        const path = urlObj.pathname.replace(/\/$/, '').split('/').pop() || 'home';
        return path.replace(/-/g, ' ').replace(/_/g, ' ');
    } catch {
        return 'The Grand Palm Website';
    }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Show typing indicator with React ThinkingIndicator
 * @param {string} [label] - Optional contextual label like "Checking availability"
 */
function showTypingIndicator(label) {
    thinkingStartTime = Date.now();
    typingIndicator.classList.add('active');
    const fallback = document.querySelector('#thinkingIndicatorRoot .thinking-fallback');
    if (fallback) fallback.style.display = 'flex';
    if (window.__showThinking) {
        window.__showThinking(label);
        if (fallback) setTimeout(() => { if (document.querySelector('#thinkingIndicatorRoot > div:not(.thinking-fallback)')) fallback.style.display = 'none'; }, 300);
    }
    scrollToBottom();
}

/**
 * Hide typing indicator
 */
function hideTypingIndicator() {
    const elapsed = Date.now() - thinkingStartTime;
    const remaining = 7000 - elapsed;
    const doHide = () => {
        if (window.__hideThinking) window.__hideThinking();
        const fallback = document.querySelector('#thinkingIndicatorRoot .thinking-fallback');
        if (fallback) fallback.style.display = 'flex';
        typingIndicator.classList.remove('active');
    };
    if (remaining > 0) setTimeout(doHide, remaining);
    else doHide();
    // Don't immediately hide thinking animation - it will be removed after sources are shown
    setTimeout(() => {
        hideThinkingAnimation();
    }, 800);
}

/**
 * Show Thinking mode search animation - Expandable action cards
 */
function showThinkingAnimation(query = 'loading...') {
    // Remove existing animation if any
    hideThinkingAnimation();

    // Create the thinking animation container
    const thinkingDiv = document.createElement('div');
    thinkingDiv.className = 'thinking-animation';
    thinkingDiv.id = 'thinkingAnimation';

    thinkingDiv.innerHTML = `
        <div class="action-card expanded">
            <div class="action-card-header" onclick="this.parentElement.classList.toggle('expanded')">
                <div class="action-card-left">
                    <span class="action-provider">Thinking</span>
                    <span class="action-separator">›</span>
                    <span class="action-name">web search</span>
                </div>
                <div class="action-card-right">
                    <span class="action-status" id="searchStatus">searching...</span>
                    <svg class="action-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </div>
            </div>
            <div class="action-card-body">
                <div class="action-request">
                    <div class="request-label">Request</div>
                    <pre class="request-content"><span class="json-brace">{</span>
  <span class="json-key">"query"</span>: <span class="json-value">"${query}"</span>,
  <span class="json-key">"search_depth"</span>: <span class="json-value">"advanced"</span>,
  <span class="json-key">"max_results"</span>: <span class="json-number">7</span>
<span class="json-brace">}</span></pre>
                </div>
                <div class="action-sources" id="actionSources" style="display: none;">
                    <div class="request-label">Sources Found</div>
                    <div class="sources-list" id="sourcesList"></div>
                </div>
            </div>
        </div>
    `;

    // Inject INTO the typing indicator content area
    const typingContent = typingIndicator.querySelector('.typing-content');
    if (typingContent) {
        // Hide the default typing content
        typingContent.style.display = 'none';
        // Insert action card after typing avatar
        typingIndicator.appendChild(thinkingDiv);
    } else {
        chatMessages.appendChild(thinkingDiv);
    }

    // Auto-expand after a short delay
    setTimeout(() => {
        const card = thinkingDiv.querySelector('.action-card');
        if (card) card.classList.add('expanded');
    }, 300);

    scrollToBottom();
}

/**
 * Update the search query in the thinking animation
 */
function updateThinkingQuery(query) {
    const queryText = document.getElementById('searchQueryText');
    if (queryText) {
        queryText.textContent = query;
    }
}

/**
 * Update thinking animation with sources found
 */
function updateThinkingSources(sources) {
    const sourcesContainer = document.getElementById('actionSources');
    const sourcesList = document.getElementById('sourcesList');
    const statusEl = document.getElementById('searchStatus');

    if (!sourcesContainer || !sourcesList) return;

    // Update status
    if (statusEl) {
        statusEl.textContent = `found ${sources.length} sources`;
        statusEl.style.color = '#10b981';
    }

    // Show sources container
    sourcesContainer.style.display = 'block';

    // Build sources HTML
    const sourcesHtml = sources.map((source, i) => `
        <div class="source-item">
            <span class="source-icon">🔗</span>
            <a href="${source.url}" target="_blank" class="source-link">
                ${source.title || `Source ${i + 1}`}
            </a>
        </div>
    `).join('');

    sourcesList.innerHTML = sourcesHtml;

    scrollToBottom();
}

/**
 * Hide Thinking animation
 */
function hideThinkingAnimation() {
    const thinkingDiv = document.getElementById('thinkingAnimation');
    if (thinkingDiv) {
        thinkingDiv.remove();
    }
    // Restore typing content visibility
    const typingContent = typingIndicator.querySelector('.typing-content');
    if (typingContent) {
        typingContent.style.display = '';
    }
}

/**
 * Scroll chat to bottom
 */
function scrollToBottom() {
    chatArea.scrollTo({
        top: chatArea.scrollHeight,
        behavior: 'smooth'
    });
}

// ===================================
// Animated Placeholder in Search Box
// ===================================
const animatedPlaceholder = document.getElementById('animatedPlaceholder');
let placeholderIndex = 0;
let placeholderInterval = null;

// Questions for animated placeholder
const placeholderQuestions = [
    "What are your check-in times?",
    "Do you have family rooms?",
    "What time is breakfast?",
    "Do you offer airport transfers?",
    "Is there a swimming pool?",
    "Can I book a late checkout?",
    "Do you allow pets?",
    "What amenities come with each room?",
    "Do you have a gym?",
    "What is the cancellation policy?"
];

/**
 * Start animated placeholder cycling
 */
function startAnimatedPlaceholder() {
    if (!animatedPlaceholder) return;

    const placeholderText = animatedPlaceholder.querySelector('.placeholder-text');
    if (!placeholderText) return;

    // Set initial placeholder
    updatePlaceholder(placeholderText, placeholderQuestions[0]);

    // Cycle every 3 seconds
    placeholderInterval = setInterval(() => {
        placeholderIndex = (placeholderIndex + 1) % placeholderQuestions.length;

        // Animate out
        placeholderText.classList.add('slide-out');

        // After slide out, update text and slide in
        setTimeout(() => {
            updatePlaceholder(placeholderText, placeholderQuestions[placeholderIndex]);
            placeholderText.classList.remove('slide-out');
        }, 300);
    }, 3000);

    // Handle tab visibility
    document.addEventListener('visibilitychange', handleVisibilityChange);
}

/**
 * Update placeholder text
 */
function updatePlaceholder(element, text) {
    element.textContent = text;
    element.style.animation = 'none';
    element.offsetHeight; // Trigger reflow
    element.style.animation = '';
}

/**
 * Handle visibility change for animation
 */
function handleVisibilityChange() {
    if (document.visibilityState !== 'visible') {
        // Pause animation when tab not visible
        if (placeholderInterval) {
            clearInterval(placeholderInterval);
            placeholderInterval = null;
        }
    } else {
        // Resume animation when tab visible
        startAnimatedPlaceholder();
    }
}

/**
 * Handle input change - show/hide placeholder
 */
function handleInputChange() {
    if (!animatedPlaceholder) return;

    if (messageInput.value.trim().length > 0) {
        animatedPlaceholder.classList.add('hidden');
    } else {
        animatedPlaceholder.classList.remove('hidden');
    }
}

/**
 * Stop animated placeholder
 */
function stopAnimatedPlaceholder() {
    if (placeholderInterval) {
        clearInterval(placeholderInterval);
        placeholderInterval = null;
    }
}

// ===================================
// Model Selector
// ===================================

/**
 * Fetch models from /api/models and render into both dropdowns.
 */
async function fetchAndRenderModels() {
    try {
        const res = await fetch(`${API_BASE}/models`);
        if (!res.ok) throw new Error('Failed to fetch models');
        const data = await res.json();
        if (!data.ok || !data.grouped) throw new Error('Invalid models response');

        renderModelList('modelList', data.grouped, 'model-option');
        renderModelList('modelListFixed', data.grouped, 'model-option-fixed');
    } catch (err) {
        console.warn('Could not fetch models, using fallback:', err);
        // Fallback: render just the default model
        renderModelList('modelList', { 'Models': [{ id: 'ling-3.0-flash-fin-free', name: 'Ling 3.0 Flash', description: 'Fast, low-latency assistant' }] }, 'model-option');
        renderModelList('modelListFixed', { 'Models': [{ id: 'ling-3.0-flash-fin-free', name: 'Ling 3.0 Flash', description: 'Fast, low-latency assistant' }] }, 'model-option-fixed');
    }
}

/**
 * Render model options into a container element.
 */
function renderModelList(containerId, grouped, optionClass) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    const categories = Object.entries(grouped);
    const singleGroup = categories.length <= 1;

    for (const [category, models] of categories) {
        const catDiv = document.createElement('div');
        catDiv.className = 'model-category';

        // Skip category header if only one group (flat list)
        if (!singleGroup) {
            const header = document.createElement('div');
            header.className = 'category-header';
            header.textContent = category;
            catDiv.appendChild(header);
        }

        for (const m of models) {
            const opt = document.createElement('div');
            opt.className = optionClass;
            opt.dataset.model = m.id;
            opt.dataset.name = m.name;
            opt.innerHTML = `
                <span class="model-option-name">${m.name}</span>
                <span class="model-option-desc">${m.description || ''}</span>
            `;
            catDiv.appendChild(opt);
        }

        container.appendChild(catDiv);
    }
}

/**
 * Initialize model selector (both main and fixed)
 */
function initModelSelector() {
    // Fetch models from API and populate dropdowns
    fetchAndRenderModels().then(() => {
        // After rendering, re-bind events and apply saved selection
        bindModelSelectorEvents();
        applySavedModel();
    });
}

/**
 * Bind all model selector click/search/close events.
 * Called after dynamic model list rendering.
 */
function bindModelSelectorEvents() {
    const modelSelectorBtn = document.getElementById('modelSelectorBtn');
    const modelDropdown = document.getElementById('modelDropdown');
    const modelSelectorBtnFixed = document.getElementById('modelSelectorBtnFixed');
    const modelDropdownFixed = document.getElementById('modelDropdownFixed');

    function applySelectedLogo(imgEl, modelKey) {
        if (!imgEl) return;
        const optionEl =
            document.querySelector(`.model-option[data-model="${modelKey}"]`) ||
            document.querySelector(`.model-option-fixed[data-model="${modelKey}"]`);
        const providerImg = optionEl?.closest('.model-category')?.querySelector('.category-header img');
        if (!providerImg) {
            imgEl.hidden = true;
            return;
        }
        imgEl.hidden = false;
        imgEl.src = providerImg.getAttribute('src') || '';
        imgEl.alt = providerImg.getAttribute('alt') || '';
        imgEl.className = 'provider-img selected-model-logo';
        for (const cls of providerImg.classList) {
            if (cls !== 'provider-img') imgEl.classList.add(cls);
        }
    }

    function updateModelUI(modelKey, modelName) {
        const selectedModelNameMain = document.getElementById('selectedModelName');
        const selectedModelNameFixed = document.getElementById('selectedModelNameFixed');
        const selectedModelLogoMain = document.getElementById('selectedModelLogo');
        const selectedModelLogoFixed = document.getElementById('selectedModelLogoFixed');
        if (selectedModelNameMain) selectedModelNameMain.textContent = modelName;
        if (selectedModelNameFixed) selectedModelNameFixed.textContent = modelName;
        applySelectedLogo(selectedModelLogoMain, modelKey);
        applySelectedLogo(selectedModelLogoFixed, modelKey);
    }

    function updateSelectedState(modelKey) {
        document.querySelectorAll('.model-option, .model-option-fixed').forEach(opt => {
            opt.classList.toggle('selected', opt.dataset.model === modelKey);
        });
    }

    function handleModelSelect(newModel, newName) {
        selectedModel = newModel;
        localStorage.setItem('gp-model', newModel);
        updateModelUI(newModel, newName);
        updateSelectedState(newModel);
        console.log(`Switched to: ${newName}`);
    }

    const positionDropdown = (dropdown, btn) => {
        const rect = btn.getBoundingClientRect();
        const padding = 12;
        const desiredWidth = 280;
        const width = Math.min(desiredWidth, Math.max(220, window.innerWidth - padding * 2));
        dropdown.style.position = 'fixed';
        dropdown.style.width = width + 'px';
        dropdown.style.maxHeight = Math.min(520, window.innerHeight - padding * 2) + 'px';
        dropdown.style.zIndex = '10001';
        let left = rect.right - width;
        left = Math.max(padding, Math.min(left, window.innerWidth - width - padding));
        dropdown.style.left = left + 'px';
        const spaceAbove = rect.top - padding;
        const spaceBelow = window.innerHeight - rect.bottom - padding;
        if (spaceAbove >= spaceBelow) {
            dropdown.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
            dropdown.style.top = 'auto';
        } else {
            dropdown.style.top = (rect.bottom + 8) + 'px';
            dropdown.style.bottom = 'auto';
        }
    };

    // Close on outer scroll/resize
    window.addEventListener('scroll', (e) => {
        if (e.target.closest && (e.target.closest('.model-dropdown') || e.target.closest('.model-dropdown-fixed'))) return;
        if (modelDropdown) modelDropdown.classList.remove('active');
        if (modelDropdownFixed) modelDropdownFixed.classList.remove('active');
    }, true);
    window.addEventListener('resize', () => {
        if (modelDropdown) modelDropdown.classList.remove('active');
        if (modelDropdownFixed) modelDropdownFixed.classList.remove('active');
    });

    // Main selector toggle
    if (modelSelectorBtn && modelDropdown) {
        modelSelectorBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (modelDropdownFixed) modelDropdownFixed.classList.remove('active');
            modelDropdown.classList.toggle('active');
            if (modelDropdown.classList.contains('active')) {
                positionDropdown(modelDropdown, modelSelectorBtn);
                const searchInput = modelDropdown.querySelector('.model-search-input');
                if (searchInput) setTimeout(() => searchInput.focus(), 50);
            }
        });
    }

    // Fixed selector toggle
    if (modelSelectorBtnFixed && modelDropdownFixed) {
        modelSelectorBtnFixed.addEventListener('click', (e) => {
            e.stopPropagation();
            if (modelDropdown) modelDropdown.classList.remove('active');
            modelDropdownFixed.classList.toggle('active');
            if (modelDropdownFixed.classList.contains('active')) {
                positionDropdown(modelDropdownFixed, modelSelectorBtnFixed);
                const searchInput = modelDropdownFixed.querySelector('.model-search-input');
                if (searchInput) setTimeout(() => searchInput.focus(), 50);
            }
        });
    }

    // Option clicks (delegated)
    document.addEventListener('click', (e) => {
        const opt = e.target.closest('.model-option, .model-option-fixed');
        if (opt && !opt.classList.contains('model-disabled')) {
            handleModelSelect(opt.dataset.model, opt.dataset.name);
            if (modelDropdown) modelDropdown.classList.remove('active');
            if (modelDropdownFixed) modelDropdownFixed.classList.remove('active');
        }
    });

    // Search functionality
    function setupSearch(searchInputId) {
        const searchInput = document.getElementById(searchInputId);
        if (!searchInput) return;
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            document.querySelectorAll('.model-category').forEach(category => {
                const categoryName = category.querySelector('.category-header')?.textContent.toLowerCase() || '';
                const options = category.querySelectorAll('.model-option, .model-option-fixed');
                let hasVisible = false;
                options.forEach(option => {
                    const name = (option.dataset.name || '').toLowerCase();
                    const desc = option.querySelector('.model-option-desc')?.textContent.toLowerCase() || '';
                    const show = !query || categoryName.includes(query) || name.includes(query) || desc.includes(query);
                    option.style.display = show ? 'flex' : 'none';
                    if (show) hasVisible = true;
                });
                category.style.display = hasVisible ? 'block' : 'none';
            });
        });
        searchInput.addEventListener('click', (e) => e.stopPropagation());
    }
    setupSearch('modelSearchInput');
    setupSearch('modelSearchInputFixed');

    // Close dropdowns on outside click
    document.addEventListener('click', (e) => {
        if (modelSelectorBtn && modelDropdown && !modelSelectorBtn.contains(e.target) && !modelDropdown.contains(e.target)) {
            modelDropdown.classList.remove('active');
        }
        if (modelSelectorBtnFixed && modelDropdownFixed && !modelSelectorBtnFixed.contains(e.target) && !modelDropdownFixed.contains(e.target)) {
            modelDropdownFixed.classList.remove('active');
        }
        // Mode dropdowns
        const modeSelectorBtn = document.getElementById('modeSelectorBtn');
        const modeDropdown = document.getElementById('modeDropdown');
        const modeSelectorBtnFixed = document.getElementById('modeSelectorBtnFixed');
        const modeDropdownFixed = document.getElementById('modeDropdownFixed');
        if (modeSelectorBtn && modeDropdown && !modeSelectorBtn.contains(e.target) && !modeDropdown.contains(e.target)) {
            modeDropdown.classList.remove('active');
        }
        if (modeSelectorBtnFixed && modeDropdownFixed && !modeSelectorBtnFixed.contains(e.target) && !modeDropdownFixed.contains(e.target)) {
            modeDropdownFixed.classList.remove('active');
        }
    });
}

/**
 * Apply saved model selection to UI after models are rendered.
 */
function applySavedModel() {
    const currentModel = selectedModel;
    const currentOption =
        document.querySelector(`.model-option[data-model="${currentModel}"]`) ||
        document.querySelector(`.model-option-fixed[data-model="${currentModel}"]`);
    if (currentOption) {
        const name = currentOption.dataset.name;
        const selectedModelNameMain = document.getElementById('selectedModelName');
        const selectedModelNameFixed = document.getElementById('selectedModelNameFixed');
        if (selectedModelNameMain) selectedModelNameMain.textContent = name;
        if (selectedModelNameFixed) selectedModelNameFixed.textContent = name;
        document.querySelectorAll('.model-option, .model-option-fixed').forEach(opt => {
            opt.classList.toggle('selected', opt.dataset.model === currentModel);
        });
    }
}

/**
 * Initialize mode selector (Fast / Thinking)
 */
function initModeSelector() {
    const modeSelectorBtn = document.getElementById('modeSelectorBtn');
    const modeDropdown = document.getElementById('modeDropdown');
    const selectedModeNameMain = document.getElementById('selectedModeName');
    const modeOptions = document.querySelectorAll('#modeDropdown .mode-option');

    const modeSelectorBtnFixed = document.getElementById('modeSelectorBtnFixed');
    const modeDropdownFixed = document.getElementById('modeDropdownFixed');
    const selectedModeNameFixed = document.getElementById('selectedModeNameFixed');
    const modeOptionsFixed = document.querySelectorAll('#modeDropdownFixed .mode-option');

    function updateModeUI(mode) {
        const label = mode === 'thinking' ? 'Thinking' : 'Fast';
        if (selectedModeNameMain) selectedModeNameMain.textContent = label;
        if (selectedModeNameFixed) selectedModeNameFixed.textContent = label;

        // Update active class
        [...modeOptions, ...modeOptionsFixed].forEach(opt => {
            if (opt.dataset.mode === mode) {
                opt.classList.add('active');
            } else {
                opt.classList.remove('active');
            }
        });
    }

    // Load initial state
    updateModeUI(selectedMode);

    function handleModeSelect(mode) {
        selectedMode = mode;
        localStorage.setItem('gp-mode', mode);
        updateModeUI(mode);
        console.log(`🧠 Mode switched to: ${mode}`);
    }

    // Toggles
    if (modeSelectorBtn) {
        modeSelectorBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            modeDropdown.classList.toggle('active');
            // Close others
            if (modeDropdownFixed) modeDropdownFixed.classList.remove('active');
            const modelDropdown = document.getElementById('modelDropdown');
            if (modelDropdown) modelDropdown.classList.remove('active');
        });
    }

    if (modeSelectorBtnFixed) {
        modeSelectorBtnFixed.addEventListener('click', (e) => {
            e.stopPropagation();
            modeDropdownFixed.classList.toggle('active');
            // Close others
            if (modeDropdown) modeDropdown.classList.remove('active');
            const modelDropdownFixed = document.getElementById('modelDropdownFixed');
            if (modelDropdownFixed) modelDropdownFixed.classList.remove('active');
        });
    }

    // Option clicks
    modeOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            handleModeSelect(opt.dataset.mode);
            modeDropdown.classList.remove('active');
        });
    });

    modeOptionsFixed.forEach(opt => {
        opt.addEventListener('click', () => {
            handleModeSelect(opt.dataset.mode);
            modeDropdownFixed.classList.remove('active');
        });
    });
}

/**
 * Aceternity-style Glowing Effect for Fact Cards
 * Exact implementation with inactiveZone, proximity detection, and smooth angle animation
 */
function initGlowingEffect() {
    const factCards = document.querySelectorAll('.fact-card-wrapper');
    const proximity = 64; // How close mouse needs to be to trigger
    const inactiveZone = 0.01; // Very small center zone (like Aceternity demo)
    const spread = 40; // Width of the glow arc

    factCards.forEach(card => {
        let lastAngle = 0;
        let animationFrame = null;
        let lastPosition = { x: 0, y: 0 };

        const handleMove = (e) => {
            if (animationFrame) cancelAnimationFrame(animationFrame);

            animationFrame = requestAnimationFrame(() => {
                const rect = card.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                const mouseX = e?.clientX ?? lastPosition.x;
                const mouseY = e?.clientY ?? lastPosition.y;

                if (e) {
                    lastPosition = { x: mouseX, y: mouseY };
                }

                // Check if mouse is within proximity
                const isNearCard =
                    mouseX > rect.left - proximity &&
                    mouseX < rect.right + proximity &&
                    mouseY > rect.top - proximity &&
                    mouseY < rect.bottom + proximity;

                // Check if in inactive zone (very small center area)
                const distanceFromCenter = Math.hypot(mouseX - centerX, mouseY - centerY);
                const inactiveRadius = 0.5 * Math.min(rect.width, rect.height) * inactiveZone;
                const isInInactiveZone = distanceFromCenter < inactiveRadius;

                if (!isNearCard || isInInactiveZone) {
                    card.style.setProperty('--glow-active', '0');
                    return;
                }

                // Calculate angle from card center to mouse
                const angle = Math.atan2(mouseY - centerY, mouseX - centerX);
                let targetAngle = (angle * 180 / Math.PI) + 90;

                // Smooth angle transition (handle wrap-around)
                const angleDiff = ((targetAngle - lastAngle + 180) % 360) - 180;
                lastAngle = lastAngle + angleDiff;

                card.style.setProperty('--glow-start', lastAngle.toString());
                card.style.setProperty('--glow-spread', spread.toString());
                card.style.setProperty('--glow-active', '1');
            });
        };

        // Use document-level listener for better tracking
        document.addEventListener('pointermove', handleMove, { passive: true });

        // Handle scroll - update position
        window.addEventListener('scroll', () => handleMove(), { passive: true });
    });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    init();
    initGlowingEffect();
});

// ══════════════════════════════════════════════════
// Chat History — sidebar conversations panel
// ══════════════════════════════════════════════════
(function () {
    const HISTORY_KEY = 'grand-palm-chats';
    const CONVO_LIMIT = 20;
    const historyListEl = document.getElementById('historyList');

    function loadStore() {
        try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
        catch (e) { return []; }
    }

    let store = loadStore();
    let currentChatId = null;

    function saveStore() {
        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(store)); } catch (e) { /* ignore */ }
    }

    function chatIndex(id) {
        return store.findIndex(c => c.id === id);
    }

    function chatTitle(chat) {
        const first = (chat.messages || []).find(m => m.role === 'user');
        if (first && first.content) {
            return first.content.replace(/\s+/g, ' ').trim().slice(0, 48) || 'New Chat';
        }
        return chat.title || 'New Chat';
    }

    function readMessagesFromDom() {
        const out = [];
        chatMessages.querySelectorAll('.message').forEach(el => {
            const isUser = el.classList.contains('user-message');
            const textEl = el.querySelector('.message-text');
            if (!textEl) return;
            const text = (textEl.textContent || '').trim();
            if (!text) return;
            out.push({ role: isUser ? 'user' : 'bot', content: text });
        });
        return out;
    }

    function snapshotCurrentChat() {
        const idx = chatIndex(currentChatId);
        if (idx < 0) return;
        const messages = readMessagesFromDom();
        if (!messages.length) return;
        store[idx].messages = messages;
        store[idx].title = chatTitle(store[idx]);
        store[idx].updatedAt = Date.now();
        saveStore();
    }

    function createChatRecord() {
        const rec = { id: 'c' + Date.now() + Math.random().toString(36).slice(2, 7), title: '', messages: [], createdAt: Date.now(), updatedAt: Date.now() };
        store.unshift(rec);
        if (store.length > CONVO_LIMIT) store.length = CONVO_LIMIT;
        return rec;
    }

    function renderHistory() {
        if (!historyListEl) return;
        historyListEl.innerHTML = '';
        if (!store.length) {
            historyListEl.innerHTML = '<div class="history-empty">No chats yet</div>';
            return;
        }
        [...store].reverse().forEach(chat => {
            const item = document.createElement('div');
            item.className = 'history-item' + (chat.id === currentChatId ? ' active' : '');
            item.setAttribute('data-id', chat.id);

            item.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
                '<span class="history-item-title"></span>' +
                '<button class="history-item-delete" data-id="' + chat.id + '" title="Delete chat">×</button>';
            item.querySelector('.history-item-title').textContent = chatTitle(chat);

            item.addEventListener('click', () => loadChat(chat.id));
            item.querySelector('.history-item-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                deleteChat(chat.id);
            });
            historyListEl.appendChild(item);
        });
    }

    function loadChat(id) {
        const idx = chatIndex(id);
        if (idx < 0) return;
        snapshotCurrentChat();
        currentChatId = store[idx].id;

        chatMessages.innerHTML = '';
        stopBlurTextAnimation();

        const chat = store[idx];
        if (chat.messages.length) {
            if (welcomeScreen) welcomeScreen.style.display = 'none';
            chatMessages.classList.add('active');
            if (fixedInputArea) fixedInputArea.classList.add('active');
            hasMessages = true;
            chat.messages.forEach(m => addMessage(m.content, m.role));
        } else {
            chatMessages.classList.remove('active');
            if (welcomeScreen) welcomeScreen.style.display = 'flex';
            if (fixedInputArea) fixedInputArea.classList.remove('active');
            hasMessages = false;
            startBlurTextAnimation();
        }

        if (messageInput) messageInput.value = '';
        if (messageInputFixed) messageInputFixed.value = '';
        autoResizeTextarea(messageInput);
        messageInput.focus();
        closeSidebar();
        renderHistory();
    }

    function deleteChat(id) {
        if (!confirm('Delete this chat?')) return;
        const idx = chatIndex(id);
        if (idx < 0) return;
        snapshotCurrentChat();
        const wasActive = id === currentChatId;
        store.splice(idx, 1);
        if (wasActive) currentChatId = null;
        saveStore();

        if (wasActive) {
            chatMessages.innerHTML = '';
            chatMessages.classList.remove('active');
            if (welcomeScreen) welcomeScreen.style.display = 'flex';
            if (fixedInputArea) fixedInputArea.classList.remove('active');
            hasMessages = false;
            startBlurTextAnimation();
            if (messageInput) messageInput.value = '';
            if (messageInputFixed) messageInputFixed.value = '';
            autoResizeTextarea(messageInput);
        }
        renderHistory();
    }

    // Hook: wrap startNewChat to save the outgoing chat and open a fresh record
    const originalStartNewChat = startNewChat;
    startNewChat = function () {
        // If already in a new/empty chat, don't create a duplicate
        if (!hasMessages) {
            const idx = chatIndex(currentChatId);
            const domMessages = readMessagesFromDom();
            if (domMessages.length === 0) {
                if (idx >= 0 && (!store[idx].messages || store[idx].messages.length === 0)) {
                    return originalStartNewChat();
                }
                if (idx < 0) {
                    return originalStartNewChat();
                }
            }
        }
        snapshotCurrentChat();
        conversationHistory = [];
        const rec = createChatRecord();
        currentChatId = rec.id;
        saveStore();
        renderHistory();
        originalStartNewChat();
    };

    // Hook: first send in a fresh session creates the record
    const originalHandleSendMessage = handleSendMessage;
    handleSendMessage = function (inputElement) {
        if (!currentChatId) {
            const rec = createChatRecord();
            currentChatId = rec.id;
            saveStore();
            renderHistory();
        }
        return originalHandleSendMessage.apply(this, arguments);
    };

    // Autosave: whenever the chat DOM changes, snapshot after a quiet moment
    let saveTimer = null;
    new MutationObserver(() => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            snapshotCurrentChat();
            renderHistory();
        }, 450);
    }).observe(chatMessages, { childList: true, subtree: true, characterData: true });

    // Init: just render the panel; a record is created on first send or New Chat
    renderHistory();
})();
