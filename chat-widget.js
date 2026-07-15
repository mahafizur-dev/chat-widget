(function () {
  "use strict";

  const API = {
    GET: "https://server.presswayy.com/webhook/api/v1/get-data-chatbot",
    POST: "https://server.presswayy.com/webhook/api/v1/post-data-chatbot",

    UPLOAD_IMAGE:
      "https://server.presswayy.com/webhook/api/v1/upload-image-chatbot",
    IMAGE_STATUS:
      "https://server.presswayy.com/webhook/api/v1/get-image-status-chatbot",
    ABLY_TOKEN:
      "https://server.presswayy.com/webhook/api/v1/ably-token-chatbot",
  };

  const SESSION_KEY = "presswayy_chat_session_id";
  const THEME_KEY = "presswayy_chat_theme";
  const COMPANY_ID = "f1767d60-ac8c-485a-b89a-ab739cf48f5f";

  // Static, trusted SVG markup (no user data interpolated) - safe to set via innerHTML.
  const BOT_AVATAR_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="12" rx="3"></rect><circle cx="9" cy="14" r="1.2" fill="currentColor" stroke="none"></circle><circle cx="15" cy="14" r="1.2" fill="currentColor" stroke="none"></circle><path d="M12 8V5"></path><circle cx="12" cy="3.3" r="1.3" fill="currentColor" stroke="none"></circle><path d="M2 13h2M20 13h2"></path></svg>';
  const USER_AVATAR_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"></circle><path d="M4 20c0-4 3.5-7 8-7s8 3 8 7"></path></svg>';

  const IMG_ACCEPT =
    "image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif";

  // Keep in sync with the @media breakpoint in the widget's <style> block.
  const MOBILE_QUERY = "(max-width: 640px)";

  function randToken(len = 9) {
    const bytes = new Uint8Array(len);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes, (b) => (b % 36).toString(36)).join("");
  }

  const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
  }

  const SAFE_COLOR = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+\s*)?\))$/;
  function sanitizeColor(value, fallback) {
    return typeof value === "string" && SAFE_COLOR.test(value.trim())
      ? value.trim()
      : fallback;
  }

  // Reads the embedding page's own branding so the widget can default to
  // "look like this site" instead of a fixed name/icon.
  function detectHostSiteInfo() {
    let name = "";
    try {
      const ogSite = document.querySelector('meta[property="og:site_name"]');
      if (ogSite && ogSite.content) name = ogSite.content.trim();
    } catch (e) {}
    if (!name) {
      try {
        name = (document.title || "").trim();
      } catch (e) {}
    }
    if (!name) {
      try {
        name = window.location.hostname;
      } catch (e) {}
    }

    let favicon = "";
    try {
      const iconLink =
        document.querySelector('link[rel="icon"]') ||
        document.querySelector('link[rel="shortcut icon"]') ||
        document.querySelector('link[rel="apple-touch-icon"]');
      // .href (not getAttribute) resolves relative paths to an absolute URL.
      if (iconLink && iconLink.href) favicon = iconLink.href;
    } catch (e) {}
    if (!favicon) {
      try {
        favicon = window.location.origin + "/favicon.ico";
      } catch (e) {}
    }

    return { name, favicon };
  }

  function formatTimestamp(ms) {
    const d = new Date(ms);
    const datePart = d.toLocaleDateString(undefined, {
      month: "numeric",
      day: "numeric",
      year: "2-digit",
    });
    const timePart = d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    return `${datePart}, ${timePart}`;
  }

  class ChatWidget {
    constructor(userConfig = {}) {
      const hostInfo = detectHostSiteInfo();
      this.config = {
        primaryColor: "#378ADD",
        companyName: hostInfo.name || "Presswayy",
        faviconUrl: hostInfo.favicon || "",
        welcomeMessage: "Hello! How can I help you today?",
        placeholder: "Message...",
        companyId: COMPANY_ID,
        ...userConfig,
      };
      this.config.primaryColor = sanitizeColor(this.config.primaryColor, "#378ADD");

      this.sessionId = this.loadSessionId();
      this.theme = this.loadTheme();
      this.isOpen = false;
      this.isSending = false;
      this.hasLoadedHistory = false;
      // Lets an in-flight pollForReply() bail out early once the Ably
      // handler has already delivered the reply, so the two paths don't
      // race and double-render the same message.
      this.replyReceivedViaRealtime = false;

      this.pendingAttachments = [];
      this.init();
    }

    loadSessionId() {
      let id = null;
      try {
        id = localStorage.getItem(SESSION_KEY);
      } catch (e) {}
      if (!id) {
        id = "sess_" + Date.now().toString(36) + randToken(16);
        try {
          localStorage.setItem(SESSION_KEY, id);
        } catch (e) {}
      }
      return id;
    }

    loadTheme() {
      try {
        const saved = localStorage.getItem(THEME_KEY);
        if (saved === "light" || saved === "dark") return saved;
      } catch (e) {}
      try {
        if (
          window.matchMedia &&
          window.matchMedia("(prefers-color-scheme: light)").matches
        ) {
          return "light";
        }
      } catch (e) {}
      return "dark";
    }

    generateMid() {
      return (
        this.sessionId + "_" + Date.now().toString(36) + "_" + randToken(5)
      );
    }

    init() {
      const container = document.createElement("div");
      container.style.cssText =
        "position:fixed; bottom:20px; right:20px; z-index:2147483647;";
      if (this.theme === "light") container.classList.add("cw-theme-light");
      this.container = container;

      this.shadow = container.attachShadow({ mode: "open" });

      this.shadow.innerHTML = `
        <style>
          :host {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            --primary: ${this.config.primaryColor};
            --msg-bg: #18191a;
            --msg-panel: #242526;
            --msg-border: #3a3b3c;
            --msg-bubble-bot: #3a3b3c;
            --msg-bubble-user: var(--primary);
            --msg-text: #e4e6eb;
            --msg-sub: #8a8d91;
            --msg-icon-hover: rgba(255,255,255,0.08);
            --msg-avatar-user: #6b7280;
            --msg-focus-ring: var(--primary);
          }
          :host(.cw-theme-light) {
            --msg-bg: #ffffff;
            --msg-panel: #ffffff;
            --msg-border: #e5e7eb;
            --msg-bubble-bot: #f0f2f5;
            --msg-bubble-user: var(--primary);
            --msg-text: #1c1e21;
            --msg-sub: #65676b;
            --msg-icon-hover: rgba(0,0,0,0.06);
            --msg-avatar-user: #9ca3af;
          }

          .cw-btn {
            width: 65px;
            height: 65px;
            background: var(--primary);
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 10px 30px -8px rgba(0,0,0,0.5);
            cursor: pointer;
            border: none;
            transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease;
          }

          .cw-btn:hover {
            transform: scale(1.08) translateY(-2px);
            box-shadow: 0 15px 35px -8px rgba(0,0,0,0.6);
          }

          .cw-btn:active {
            transform: scale(0.95) translateY(0);
          }

          .cw-btn svg {
            transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          }

          .cw-btn:hover svg {
            transform: rotate(-8deg) scale(1.05);
          }
          
          /* Messenger/IG-DM-style floating card — dark surface, no device bezel. */
          .cw-window {
            position:fixed; bottom:95px; right:24px; width:360px; height:min(600px, 80vh);
            background:var(--msg-panel); border-radius:20px; box-sizing:border-box;
            box-shadow:0 12px 40px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.2);
            display:flex; align-items:stretch; justify-content:stretch;
            overflow:hidden;
            pointer-events:none;

            opacity:0;
            transform: translateY(80px) scale(0.95);
            transform-origin: bottom right;
            transition: opacity 0.4s ease, transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), width 0.25s ease, height 0.25s ease;
          }
          .cw-window.open {
            opacity:1;
            transform: translateY(0) scale(1);
            pointer-events:auto;
          }
          .cw-window.expanded {
            width: 440px; height: min(760px, 88vh);
          }

          .cw-screen {
            flex:1; width:100%; background:var(--msg-bg);
            display:flex; flex-direction:column; position:relative;
          }
          .cw-header { background:var(--msg-panel); color:var(--msg-text); padding:14px 16px; padding-top:34px; display:flex; align-items:center; gap:12px; border-bottom:1px solid var(--msg-border); }
          .cw-avatar {
            order:1; width:36px; height:36px; border-radius:50%; flex:0 0 auto;
            background:var(--primary); color:#fff;
            display:flex; align-items:center; justify-content:center;
          }
          .cw-avatar svg, .cw-avatar img { width:20px; height:20px; }
          .cw-avatar img { object-fit:contain; border-radius:50%; }
          .cw-avatar:has(img) { background:transparent; }
          .cw-header-text { order:2; display:flex; flex-direction:column; line-height:1.25; overflow:hidden; }
          .cw-header-text strong { font-size:14px; font-weight:600; color:var(--msg-text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .cw-status { font-size:12px; color:var(--msg-sub); }
          .cw-theme-btn, .cw-expand-btn, .cw-close-btn {
            background:none; border:none; color:var(--msg-text); cursor:pointer;
            display:flex; align-items:center; justify-content:center;
            width:32px; height:32px; border-radius:50%; flex:0 0 auto;
            transition: background-color 0.15s;
          }
          .cw-theme-btn:hover, .cw-expand-btn:hover, .cw-close-btn:hover { background-color: var(--msg-icon-hover); }
          .cw-theme-btn { order:3; margin-left:auto; }
          .cw-theme-btn .cw-icon-sun { display:none; }
          .cw-theme-btn .cw-icon-moon { display:flex; }
          :host(.cw-theme-light) .cw-theme-btn .cw-icon-sun { display:flex; }
          :host(.cw-theme-light) .cw-theme-btn .cw-icon-moon { display:none; }
          .cw-expand-btn { order:4; }
          .cw-expand-btn svg { transition: transform 0.2s; }
          .cw-expand-btn.active svg { transform: rotate(180deg); }
          .cw-close-btn { order:5; font-size:26px; line-height:1; padding:0; }
          .cw-messages { flex:1; padding:20px; overflow-y:auto; background:var(--msg-bg); display:flex; flex-direction:column; }
          .cw-time-divider { text-align:center; font-size:11px; color:var(--msg-sub); margin:14px 0 8px; }
          .cw-msg-row { display:flex; align-items:flex-end; gap:8px; margin:10px 0; }
          .cw-msg-row.bot { justify-content:flex-start; }
          .cw-msg-row.user { justify-content:flex-end; }
          .cw-msg-avatar-slot { width:36px; height:36px; flex:0 0 auto; }
          .cw-mini-avatar {
            width:36px; height:36px; border-radius:50%;
            display:flex; align-items:center; justify-content:center;
            color:#fff;
          }
          .cw-mini-avatar svg, .cw-mini-avatar img { width:24px; height:24px; }
          .cw-mini-avatar img { object-fit:contain; border-radius:50%; }
          .cw-mini-avatar.bot { background: var(--primary); }
          .cw-mini-avatar.bot:has(img) { background:transparent; }
          .cw-mini-avatar.user { background: var(--msg-avatar-user); }
          .cw-message { padding:8px 12px; max-width:80%; word-break:break-word; font-size:14px; line-height:1.35; }
          .cw-message.bot { background:var(--msg-bubble-bot); border:none; color:var(--msg-text); align-self:flex-start; border-radius:18px; }
          .cw-message.user { background:var(--msg-bubble-user); border:none; color:#fff; align-self:flex-end; border-radius:18px; }
          /* Image-only messages float without a colored bubble behind them. */
          .cw-message.cw-message--media { background:transparent; padding:0; }
          .cw-message--media .cw-image-grid { margin-top:0; }

          /* Clickable Chat Images */
          .cw-message img { 
            max-width:200px; max-height:200px; border-radius:10px; margin-top:6px; display:block; 
            cursor: zoom-in; transition: opacity 0.2s ease;
          }
          .cw-message img:hover { opacity: 0.9; }

          .cw-image-grid {
            display:grid; grid-template-columns:repeat(2, 1fr); grid-auto-rows:98px; gap:4px;
            margin-top:6px; width:200px;
          }
          .cw-image-grid.single {
            grid-template-columns: 1fr; grid-auto-rows:200px;
          }
          .cw-image-grid img {
            /* Fixed row height (not aspect-ratio) so the grid still lays out
               correctly on webviews/browsers without aspect-ratio support. */
            width:100%; height:100%; object-fit:cover;
            border-radius:8px; display:block; margin:0; max-width:none; max-height:none;
          }
          .cw-typing-bubble { display:flex; align-items:center; gap:4px; padding:12px 14px; }
          .cw-dot {
            width:6px; height:6px; border-radius:50%; background:var(--msg-sub);
            animation: cw-bounce 1.2s infinite ease-in-out;
          }
          .cw-dot:nth-child(2) { animation-delay: 0.15s; }
          .cw-dot:nth-child(3) { animation-delay: 0.3s; }
          @keyframes cw-bounce {
            0%, 60%, 100% { transform:translateY(0); opacity:0.4; }
            30% { transform:translateY(-4px); opacity:1; }
          }
          
          .cw-input-area {
            padding: 10px 12px;
            background: var(--msg-panel);
            border-top: 1px solid var(--msg-border);
          }
          .cw-pending-images { display:none; gap:8px; flex-wrap:wrap; padding-bottom:10px; }
          .cw-pending-thumb { position:relative; width:56px; height:56px; }
          .cw-pending-thumb img { width:100%; height:100%; object-fit:cover; border-radius:8px; display:block; }
          .cw-pending-remove {
            position:absolute; top:-8px; right:-8px; width:24px; height:24px; border-radius:50%;
            background:#333; color:white; border:none; font-size:14px; line-height:1; cursor:pointer;
            display:flex; align-items:center; justify-content:center; padding:0;
          }

          .cw-input-row {
            display: flex;
            gap: 6px;
            align-items: center;
          }
          .cw-input-field {
            flex: 1;
            min-height: 36px;
            max-height: 120px;
            height: 36px;
            padding: 8px 16px;
            border-radius: 18px;
            border: 1px solid transparent;
            background: var(--msg-bubble-bot);
            color: var(--msg-text);
            resize: none;
            font-family: inherit;
            font-size: 14px;
            line-height: 1.4;
            outline: none;
            box-sizing: border-box;
            transition: box-shadow 0.2s;
            overflow-y: auto;
            scrollbar-width: none;
            -ms-overflow-style: none;
          }
          .cw-input-field:focus { box-shadow: 0 0 0 2px var(--msg-focus-ring); }
          .cw-input-field::placeholder { color: var(--msg-sub); }
          .cw-input-field::-webkit-scrollbar { display: none; }

          .cw-icon-btn {
            width: 36px; height: 36px; flex: 0 0 auto; background: transparent; color: var(--msg-text);
            border: none; border-radius: 50%; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            transition: background-color 0.2s, color 0.2s;
          }
          .cw-icon-btn:hover { background-color: var(--msg-icon-hover); }
          .cw-send-btn { color: var(--primary); }
          .cw-send-btn.hidden, .cw-mic-btn.hidden { display: none; }
          .cw-send-btn:active { transform: scale(0.9); }

          /* Lightbox/Zoom Image Styles */
          .cw-lightbox {
            position: fixed; inset: 0; background: rgba(0, 0, 0, 0.85);
            display: none; align-items: center; justify-content: center;
            z-index: 2147483647; opacity: 0;
            transition: opacity 0.3s ease; pointer-events: none;
            backdrop-filter: blur(4px);
          }
          .cw-lightbox.open { display: flex; opacity: 1; pointer-events: auto; }
          .cw-lightbox-img {
            max-width: 90%; max-height: 80vh; object-fit: contain;
            border-radius: 12px; transform: scale(0.9);
            transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
          }
          .cw-lightbox.open .cw-lightbox-img { transform: scale(1); }
          .cw-lightbox-close {
            position: absolute; top: 20px; right: 25px; color: #fff;
            font-size: 38px; font-weight: 300; cursor: pointer; user-select: none;
            line-height: 1; transition: transform 0.2s;
          }
          .cw-lightbox-close:hover { transform: scale(1.2); }

          /* Real mobile devices layout overrides */
          @media (max-width: 640px) {
            .cw-window {
              position:fixed; inset:0; width:100%; height:100%;
              padding:0; background:var(--msg-panel); border-radius:0; box-shadow:none;
              opacity:1;
              transform: translateY(100%);
              transition: transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
            }
            .cw-window.open {
              opacity:1;
              transform: translateY(0);
            }
            .cw-window.expanded { width:100%; height:100%; }
            .cw-screen { border-radius:0; }
            .cw-expand-btn { display:none; }
            .cw-window.open .cw-header { padding-top: calc(16px + env(safe-area-inset-top)); }
            .cw-window.open .cw-close-btn { order:-1; margin-left:0; font-size:0; }
            .cw-window.open .cw-close-btn::before { content:"‹"; font-size:30px; color:var(--msg-text); }
            .cw-window.open .cw-input-area {
              padding-bottom: calc(12px + env(safe-area-inset-bottom));
              border-top: 1px solid var(--msg-border);
            }
            .cw-lightbox-img { max-width: 95%; max-height: 70vh; }
          }
        </style>

        <button class="cw-btn" id="cw-btn">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
          </svg>
        </button>

        <div class="cw-window" id="cw-window">
          <div class="cw-screen">
            <div class="cw-header">
              <button class="cw-close-btn" id="cw-close" aria-label="Close">×</button>
              <div class="cw-avatar" id="cw-header-avatar"></div>
              <div class="cw-header-text">
                <strong>${escapeHtml(this.config.companyName)}</strong>
                <span class="cw-status">Reply within one minute</span>
              </div>
              <button class="cw-theme-btn" id="cw-theme" aria-label="Switch to light theme" title="Switch theme">
                <svg class="cw-icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="4"></circle>
                  <line x1="12" y1="1" x2="12" y2="3"></line>
                  <line x1="12" y1="21" x2="12" y2="23"></line>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                  <line x1="1" y1="12" x2="3" y2="12"></line>
                  <line x1="21" y1="12" x2="23" y2="12"></line>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                </svg>
                <svg class="cw-icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                </svg>
              </button>
              <button class="cw-expand-btn" id="cw-expand" aria-label="Expand" title="Expand">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <polyline points="9 21 3 21 3 15"></polyline>
                  <line x1="21" y1="3" x2="14" y2="10"></line>
                  <line x1="3" y1="21" x2="10" y2="14"></line>
                </svg>
              </button>
            </div>
            <div class="cw-messages" id="cw-messages"></div>
            <div class="cw-input-area">
              <div class="cw-pending-images" id="cw-pending"></div>
              <div class="cw-input-row">
                <textarea id="cw-input" class="cw-input-field" placeholder="${escapeHtml(this.config.placeholder)}" rows="1"></textarea>
                <button class="cw-icon-btn cw-mic-btn" id="cw-mic" type="button" tabindex="-1" aria-label="Voice message" title="Voice message">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                    <line x1="12" y1="19" x2="12" y2="23"></line>
                    <line x1="8" y1="23" x2="16" y2="23"></line>
                  </svg>
                </button>
                <button class="cw-icon-btn" id="cw-attach" type="button" title="Send an image">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="4"></rect>
                    <circle cx="8.5" cy="8.5" r="1.75"></circle>
                    <path d="M21 15l-5-5L5 21"></path>
                  </svg>
                </button>
                <button class="cw-icon-btn cw-send-btn hidden" id="cw-send" aria-label="Send message">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                </button>
              </div>
              <input type="file" id="cw-file" accept="${IMG_ACCEPT}" multiple style="display:none;">
            </div>
          </div>
        </div>

        <!-- Pop-up Lightbox Structure -->
        <div class="cw-lightbox" id="cw-lightbox">
          <span class="cw-lightbox-close" id="cw-lightbox-close">&times;</span>
          <img class="cw-lightbox-img" id="cw-lightbox-img" src="" alt="Enlarged view">
        </div>
      `;

      document.body.appendChild(container);
      this.renderBotAvatarInto(this.shadow.getElementById("cw-header-avatar"));
      this.bindEvents();
    }

    // Prefers the host site's own favicon; falls back to the generic bot
    // icon if there is no favicon or it fails to load (e.g. 404).
    renderBotAvatarInto(el) {
      if (!el) return;
      if (this.config.faviconUrl) {
        const img = document.createElement("img");
        img.src = this.config.faviconUrl;
        img.alt = "";
        img.addEventListener("error", () => {
          el.innerHTML = BOT_AVATAR_SVG;
        });
        el.innerHTML = "";
        el.appendChild(img);
      } else {
        el.innerHTML = BOT_AVATAR_SVG;
      }
    }

    bindEvents() {
      const btn = this.shadow.getElementById("cw-btn");
      const close = this.shadow.getElementById("cw-close");
      const expand = this.shadow.getElementById("cw-expand");
      const themeBtn = this.shadow.getElementById("cw-theme");
      const sendBtn = this.shadow.getElementById("cw-send");
      const input = this.shadow.getElementById("cw-input");
      const attachBtn = this.shadow.getElementById("cw-attach");
      const fileInput = this.shadow.getElementById("cw-file");
      const lightbox = this.shadow.getElementById("cw-lightbox");
      const lightboxClose = this.shadow.getElementById("cw-lightbox-close");

      btn.addEventListener("click", () => this.toggle());
      close.addEventListener("click", () => this.close());
      expand.addEventListener("click", () => this.toggleExpand());
      themeBtn.addEventListener("click", () => this.toggleTheme());
      sendBtn.addEventListener("click", () => this.sendMessage());

      // Close lightbox on clicking close button or background backdrop
      lightboxClose.addEventListener("click", () => this.closeLightbox());
      lightbox.addEventListener("click", (e) => {
        if (e.target === lightbox) this.closeLightbox();
      });

      input.addEventListener("input", () => {
        input.style.height = "auto";
        input.style.height = input.scrollHeight + "px";
        this.updateSendMicVisibility();
      });

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });

      input.addEventListener("paste", (e) => this.handlePaste(e));

      attachBtn.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", () => {
        const files = Array.from(fileInput.files || []);
        fileInput.value = "";
        if (files.length) this.addPendingFiles(files);
      });
    }

    openLightbox(src) {
      const lightbox = this.shadow.getElementById("cw-lightbox");
      const lightboxImg = this.shadow.getElementById("cw-lightbox-img");
      lightboxImg.src = src;
      lightbox.classList.add("open");
    }

    closeLightbox() {
      const lightbox = this.shadow.getElementById("cw-lightbox");
      lightbox.classList.remove("open");
    }

    handlePaste(e) {
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;

      const imageFiles = [];
      for (const item of items) {
        if (
          item.kind === "file" &&
          item.type &&
          item.type.startsWith("image/")
        ) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length) {
        e.preventDefault();
        this.addPendingFiles(imageFiles);
        return;
      }

      const text = e.clipboardData.getData("text/plain")?.trim();
      if (text && this.isImageUrl(text)) {
        e.preventDefault();
        this.addPendingImageUrl(text);
      }
    }

    async toggle() {
      const win = this.shadow.getElementById("cw-window");
      const btn = this.shadow.getElementById("cw-btn");

      this.isOpen = !this.isOpen;
      win.classList.toggle("open", this.isOpen);
      this.lockBodyScroll(this.isOpen);

      if (this.isOpen) {
        btn.style.display = "none";
        this.shadow.getElementById("cw-input").focus();
        if (!this.hasLoadedHistory) {
          this.hasLoadedHistory = true;
          await this.loadHistory();
          this.setupRealtime();
        }
      } else {
        btn.style.display = "flex";
      }
    }

    toggleExpand() {
      const win = this.shadow.getElementById("cw-window");
      const expandBtn = this.shadow.getElementById("cw-expand");
      const isExpanded = win.classList.toggle("expanded");
      expandBtn.classList.toggle("active", isExpanded);
      expandBtn.setAttribute("aria-label", isExpanded ? "Collapse" : "Expand");
      expandBtn.setAttribute("title", isExpanded ? "Collapse" : "Expand");
    }

    toggleTheme() {
      this.theme = this.theme === "light" ? "dark" : "light";
      this.container.classList.toggle("cw-theme-light", this.theme === "light");
      try {
        localStorage.setItem(THEME_KEY, this.theme);
      } catch (e) {}
      const themeBtn = this.shadow.getElementById("cw-theme");
      themeBtn.setAttribute(
        "aria-label",
        this.theme === "light" ? "Switch to dark theme" : "Switch to light theme",
      );
    }

    updateSendMicVisibility() {
      const input = this.shadow.getElementById("cw-input");
      const sendBtn = this.shadow.getElementById("cw-send");
      const micBtn = this.shadow.getElementById("cw-mic");
      const hasContent =
        input.value.trim().length > 0 || this.pendingAttachments.length > 0;
      sendBtn.classList.toggle("hidden", !hasContent);
      micBtn.classList.toggle("hidden", hasContent);
    }

    async setupRealtime() {
      try {
        await this.loadAblyScript();
        const client = new window.Ably.Realtime({
          authCallback: (tokenParams, callback) =>
            this.ablyAuthCallback(callback),
        });
        const channel = client.channels.get(
          `chat-${this.config.companyId}-${this.sessionId}`,
        );
        channel.subscribe("new_message", (msg) =>
          this.handleRealtimeMessage(msg),
        );
      } catch (e) {
        console.error(
          "[ChatWidget] realtime setup failed, falling back to polling only:",
          e,
        );
      }
    }

    // Ably calls this whenever it needs a (re)new(ed) token. The token is
    // minted server-side, scoped to subscribe-only on this exact session's
    // channel - the browser never holds a key with publish/account-wide
    // capability.
    async ablyAuthCallback(callback) {
      try {
        const res = await fetch(API.ABLY_TOKEN, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId: this.config.companyId,
            sessionId: this.sessionId,
          }),
        });
        if (!res.ok) throw new Error("Token auth failed " + res.status);
        callback(null, await res.json());
      } catch (err) {
        callback(err, null);
      }
    }

    loadAblyScript() {
      if (window.Ably) return Promise.resolve();
      if (this._ablyScriptPromise) return this._ablyScriptPromise;
      this._ablyScriptPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        // Pinned to an exact release (not the mutable "-2" major-version
        // alias) so the SRI hash below stays valid across Ably CDN updates.
        script.src = "https://cdn.ably.com/lib/ably.min-2.24.0.js";
        script.integrity =
          "sha384-4LYoUOkRhHCnlsoivLT2egmUsq+JXhDqdMSLTR2Y14PD8RK+kOvEWoWkBga0I2x7";
        script.crossOrigin = "anonymous";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Ably SDK"));
        document.head.appendChild(script);
      });
      return this._ablyScriptPromise;
    }

    async handleRealtimeMessage(msg) {
      this.replyReceivedViaRealtime = true;
      this.hideTyping();

      const data = (msg && msg.data) || {};
      if (!data.text && !(Array.isArray(data.images) && data.images.length)) {
        // Payload didn't carry a renderable message (older/misconfigured
        // publisher) - fall back to a full resync instead of showing nothing.
        try {
          this.renderMessages(await this.fetchHistory());
        } catch (e) {}
        return;
      }

      this.appendBubble({
        sender: "bot",
        text: data.text || "",
        images: data.images || [],
      });
    }

    close() {
      this.isOpen = false;
      this.shadow.getElementById("cw-window").classList.remove("open");
      this.shadow.getElementById("cw-btn").style.display = "flex";
      this.lockBodyScroll(false);
    }

    lockBodyScroll(shouldLock) {
      if (!window.matchMedia(MOBILE_QUERY).matches) return;
      document.body.style.overflow = shouldLock ? "hidden" : "";
    }

    renderMessages(messages) {
      const container = this.shadow.getElementById("cw-messages");
      container.innerHTML = "";

      if (!messages.length) {
        this.appendBubble(
          { sender: "bot", text: this.config.welcomeMessage, time: Date.now() },
          container,
          { showAvatar: true },
        );
        return;
      }

      const DIVIDER_GAP_MS = 15 * 60 * 1000;
      messages.forEach((m, i) => {
        const prev = messages[i - 1];
        if (i === 0 || (m.time && prev.time && m.time - prev.time > DIVIDER_GAP_MS)) {
          this.appendTimeDivider(m.time, container);
        }
        const next = messages[i + 1];
        // A cluster ends (and the avatar shows) at a sender change, the end
        // of the list, or right before the next timestamp divider.
        const showAvatar =
          !next ||
          next.sender !== m.sender ||
          (next.time && m.time && next.time - m.time > DIVIDER_GAP_MS);
        this.appendBubble(m, container, { showAvatar });
      });
      container.scrollTop = container.scrollHeight;
    }

    appendTimeDivider(time, container) {
      if (!time) return;
      const div = document.createElement("div");
      div.className = "cw-time-divider";
      div.textContent = formatTimestamp(time);
      container.appendChild(div);
    }

    appendBubble(m, container, options = {}) {
      container = container || this.shadow.getElementById("cw-messages");
      const isBot = m.sender !== "user";
      const showAvatar = options.showAvatar !== false;

      const row = document.createElement("div");
      row.className = "cw-msg-row " + (isBot ? "bot" : "user");

      const slot = document.createElement("div");
      slot.className = "cw-msg-avatar-slot";
      if (showAvatar) {
        const mini = document.createElement("div");
        mini.className = "cw-mini-avatar " + (isBot ? "bot" : "user");
        if (isBot) {
          this.renderBotAvatarInto(mini);
        } else {
          mini.innerHTML = USER_AVATAR_SVG;
        }
        slot.appendChild(mini);
      }
      if (isBot) row.appendChild(slot);

      const hasImages = Array.isArray(m.images) && m.images.length > 0;
      const isMediaOnly = !m.text && hasImages;

      const div = document.createElement("div");
      div.className = "cw-message " + (isBot ? "bot" : "user");
      if (isMediaOnly) div.classList.add("cw-message--media");

      if (m.text) {
        const span = document.createElement("span");
        span.textContent = m.text;
        div.appendChild(span);
      }
      if (hasImages) {
        const grid = document.createElement("div");
        grid.className =
          "cw-image-grid" + (m.images.length === 1 ? " single" : "");
        for (const url of m.images) {
          const img = document.createElement("img");
          img.src = url;
          // A dead URL shouldn't leave a broken-image icon in the chat.
          img.addEventListener("error", () => img.remove());
          img.addEventListener("click", () => this.openLightbox(url));
          grid.appendChild(img);
        }
        div.appendChild(grid);
      }
      row.appendChild(div);
      if (!isBot) row.appendChild(slot);
      container.appendChild(row);
      container.scrollTop = container.scrollHeight;
    }

    showTyping(label = "Thinking...") {
      const container = this.shadow.getElementById("cw-messages");
      const row = document.createElement("div");
      row.id = "cw-typing";
      row.className = "cw-msg-row bot";

      const slot = document.createElement("div");
      slot.className = "cw-msg-avatar-slot";
      const mini = document.createElement("div");
      mini.className = "cw-mini-avatar bot";
      this.renderBotAvatarInto(mini);
      slot.appendChild(mini);
      row.appendChild(slot);

      const typing = document.createElement("div");
      typing.className = "cw-message bot";

      if (label === "Thinking...") {
        typing.classList.add("cw-typing-bubble");
        for (let i = 0; i < 3; i++) {
          const dot = document.createElement("span");
          dot.className = "cw-dot";
          typing.appendChild(dot);
        }
      } else {
        typing.textContent = label;
      }

      row.appendChild(typing);
      container.appendChild(row);
      container.scrollTop = container.scrollHeight;
    }

    hideTyping() {
      const typing = this.shadow.getElementById("cw-typing");
      if (typing) typing.remove();
    }

    isImageUrl(v) {
      if (!v || typeof v !== "string") return false;
      return (
        /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|avif|svg)(\?.*)?$/i.test(v) ||
        v.includes("cloudinary.com")
      );
    }

    extractImages(row) {
      const out = [];
      let atts = row.attachments;
      if (typeof atts === "string") {
        try {
          atts = JSON.parse(atts);
        } catch (e) {
          atts = null;
        }
      }
      if (atts) {
        const arr =
          atts.image_urls ||
          atts.attachments ||
          atts.images ||
          (Array.isArray(atts) ? atts : []);
        if (Array.isArray(arr)) {
          for (const it of arr) {
            const u =
              typeof it === "string"
                ? it
                : it.image_url || it.url || it.payload?.url;
            if (u && this.isImageUrl(u)) out.push(u);
          }
        }
      }
      return out;
    }

    mapRow(row) {
      const st = String(row.sender_type || row.sender || "").toLowerCase();
      const isBot = st === "ai" || st === "bot" || st === "assistant";
      const sender = isBot ? "bot" : "user";

      let text =
        row.text || row.message_text || row.message || row.content || "";
      if (typeof text !== "string") text = String(text || "");
      text = text.trim();

      const images = this.extractImages(row);

      // A bare image URL in `text` is never shown as text. If attachments
      // didn't already supply the image, treat text as that fallback image;
      // otherwise it's just a duplicate of what attachments gave us already.
      if (text && this.isImageUrl(text)) {
        if (images.length === 0) images.push(text);
        text = "";
      }

      if (!text && images.length === 0) return null;

      const time = row.created_at ? new Date(row.created_at).getTime() : Date.now();
      return { sender, text, images, time };
    }

    buildMessages(rows) {
      if (!Array.isArray(rows)) return [];
      return rows
        .slice()
        .sort(
          (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0),
        )
        .map((r) => this.mapRow(r))
        .filter(Boolean);
    }

    extractRows(data) {
      if (!data) return [];
      if (Array.isArray(data)) return data;
      return data.data || data.rows || data.output || data.messages || [];
    }

    countBots(messages) {
      return messages.filter((m) => m.sender === "bot").length;
    }

    buildGetUrl() {
      const url = new URL(API.GET);
      url.searchParams.set("companyId", this.config.companyId);
      url.searchParams.set("sessionId", this.sessionId);
      url.searchParams.set("company_id", this.config.companyId);
      url.searchParams.set("session_id", this.sessionId);
      return url;
    }

    async fetchHistory() {
      const res = await fetch(this.buildGetUrl());
      if (!res.ok) throw new Error("GET failed " + res.status);
      const data = await res.json();
      return this.buildMessages(this.extractRows(data));
    }

    async loadHistory() {
      try {
        const messages = await this.fetchHistory();
        this.renderMessages(messages);
      } catch (e) {
        console.error("[ChatWidget] history load error:", e);
        this.renderMessages([]);
      }
    }

    addPendingFiles(files) {
      const fileList = Array.from(files || []);
      const valid = fileList.filter(
        (f) => f && f.type && f.type.startsWith("image/"),
      );

      if (valid.length !== fileList.length) {
        this.appendBubble({
          sender: "bot",
          text: "Only image files are supported (jpeg, png, webp, gif, avif, heic).",
        });
      }

      for (const file of valid) {
        // Guards against the same file being queued twice if a picker/paste
        // event fires more than once for the same selection.
        const isDuplicate = this.pendingAttachments.some(
          (a) =>
            a.kind === "file" &&
            a.file.name === file.name &&
            a.file.size === file.size &&
            a.file.lastModified === file.lastModified,
        );
        if (isDuplicate) continue;

        this.pendingAttachments.push({
          kind: "file",
          file,
          previewUrl: URL.createObjectURL(file),
        });
      }
      this.renderPendingImages();
    }

    addPendingImageUrl(url) {
      const isDuplicate = this.pendingAttachments.some(
        (a) => a.kind === "url" && a.url === url,
      );
      if (isDuplicate) return;

      this.pendingAttachments.push({ kind: "url", url, previewUrl: url });
      this.renderPendingImages();
    }

    renderPendingImages() {
      const container = this.shadow.getElementById("cw-pending");
      container.innerHTML = "";
      container.style.display = this.pendingAttachments.length
        ? "flex"
        : "none";

      this.pendingAttachments.forEach((att, index) => {
        const thumb = document.createElement("div");
        thumb.className = "cw-pending-thumb";

        const img = document.createElement("img");
        img.src = att.previewUrl;
        // A broken/expired preview URL must not silently ride along into
        // the outgoing message - drop it from the queue as soon as it
        // fails to load instead of leaving a dead slot for the user to send.
        img.addEventListener("error", () => {
          const i = this.pendingAttachments.indexOf(att);
          if (i !== -1) this.removePendingAttachment(i);
        });

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "cw-pending-remove";
        removeBtn.textContent = "×";
        removeBtn.setAttribute("aria-label", "Remove image");
        removeBtn.addEventListener("click", () =>
          this.removePendingAttachment(index),
        );

        thumb.appendChild(img);
        thumb.appendChild(removeBtn);
        container.appendChild(thumb);
      });

      this.updateSendMicVisibility();
    }

    removePendingAttachment(index) {
      const [att] = this.pendingAttachments.splice(index, 1);
      if (att && att.kind === "file") URL.revokeObjectURL(att.previewUrl);
      this.renderPendingImages();
    }

    clearPendingAttachments() {
      this.pendingAttachments = [];
      this.renderPendingImages();
    }

    async sendMessage() {
      if (this.isSending) return;

      const input = this.shadow.getElementById("cw-input");
      const text = input.value.trim();
      const attachments = this.pendingAttachments.slice();
      if (!text && !attachments.length) return;

      input.value = "";
      input.style.height = "auto";
      this.clearPendingAttachments();
      this.isSending = true;

      try {
        if (attachments.length) {
          await this.sendImagesWithCaption(attachments, text);
        } else {
          await this.deliverMessage({ text }, { sender: "user", text });
        }
      } finally {
        this.isSending = false;
      }
    }

    async sendImagesWithCaption(attachments, caption) {
      const previewUrls = attachments.map((a) => a.previewUrl);
      this.appendBubble({ sender: "user", text: caption, images: previewUrls });
      this.showTyping(
        attachments.length > 1
          ? `Uploading ${attachments.length} images...`
          : "Uploading image...",
      );

      try {
        const hostedUrls = await Promise.all(
          attachments.map((a) =>
            a.kind === "file" ? this.uploadImage(a.file) : a.url,
          ),
        );
        this.hideTyping();

        const messageFields = {
          attachments: hostedUrls.map((url) => ({
            type: "image",
            payload: { url },
          })),
        };
        if (caption) messageFields.text = caption;

        await this.deliverMessage(messageFields, null);
      } catch (err) {
        console.error("[ChatWidget] image upload error:", err);
        this.hideTyping();
        this.appendBubble({
          sender: "bot",
          text: "Sorry, the image(s) failed to upload.",
        });
      } finally {
        attachments.forEach((a) => {
          if (a.kind === "file") URL.revokeObjectURL(a.previewUrl);
        });
      }
    }

    async uploadImage(file) {
      const form = new FormData();
      form.append("file", file);
      form.append("company_id", this.config.companyId);

      const res = await fetch(API.UPLOAD_IMAGE, {
        method: "POST",
        body: form,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Upload failed " + res.status);
      }

      if (data.status === "ready" && data.urls) {
        return data.urls.original;
      }
      return this.waitForImageReady(data.imageId);
    }

    async waitForImageReady(imageId, timeoutMs = 20000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1200));

        const url = new URL(API.IMAGE_STATUS);
        url.searchParams.set("imageId", imageId);
        const res = await fetch(url);
        if (!res.ok) continue;

        const data = await res.json();
        if (data.status === "ready") return data.urls.original;
        if (data.status === "failed") {
          throw new Error(data.error || "Image processing failed");
        }
      }
      throw new Error("Image took too long to process");
    }

    async deliverMessage(messageFields, optimisticBubble) {
      if (optimisticBubble) this.appendBubble(optimisticBubble);
      this.showTyping();

      const messageId = this.generateMid();
      const now = Date.now();

      const payload = {
        object: "chatbot",
        channel: "chatbot",
        entry: [
          {
            id: this.config.companyId,
            time: now,
            messaging: [
              {
                sender: { id: this.sessionId },
                recipient: { id: this.config.companyId },
                timestamp: now,
                message: { mid: messageId, ...messageFields },
              },
            ],
          },
        ],
      };

      let botCountBefore = 0;
      try {
        botCountBefore = this.countBots(await this.fetchHistory());
      } catch (e) {}

      try {
        const res = await fetch(API.POST, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("POST failed " + res.status);

        await this.pollForReply(botCountBefore);
      } catch (err) {
        console.error("[ChatWidget] send error:", err);
        this.hideTyping();
        this.appendBubble({
          sender: "bot",
          text: "Sorry, I'm having trouble connecting.",
        });
      }
    }

    async pollForReply(botCountBefore) {
      this.replyReceivedViaRealtime = false;

      const checkOnce = async () => {
        if (this.replyReceivedViaRealtime) return true;
        try {
          const messages = await this.fetchHistory();
          if (this.replyReceivedViaRealtime) return true;
          if (this.countBots(messages) > botCountBefore) {
            this.hideTyping();
            this.renderMessages(messages);
            return true;
          }
        } catch (e) {}
        return false;
      };

      const fastAttempts = 10;
      const fastDelayMs = 1500;
      for (let i = 0; i < fastAttempts; i++) {
        await new Promise((r) => setTimeout(r, fastDelayMs));
        if (await checkOnce()) return;
      }

      const slowAttempts = 30;
      const slowDelayMs = 3000;
      for (let i = 0; i < slowAttempts; i++) {
        await new Promise((r) => setTimeout(r, slowDelayMs));
        if (await checkOnce()) return;
      }

      this.hideTyping();
      try {
        this.renderMessages(await this.fetchHistory());
      } catch (e) {}
    }
  }

  window.ChatWidget = ChatWidget;
  new ChatWidget();
})();
