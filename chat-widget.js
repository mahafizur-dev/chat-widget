(function () {
  "use strict";

  const API = {
    GET: "https://server.presswayy.com/webhook/api/v1/get-data-chatbot",
    POST: "https://server.presswayy.com/webhook/api/v1/post-data-chatbot",

    UPLOAD_IMAGE:
      "https://server.presswayy.com/webhook/api/v1/upload-image-chatbot",
    IMAGE_STATUS:
      "https://server.presswayy.com/webhook/api/v1/get-image-status-chatbot",
  };

  const SESSION_KEY = "presswayy_chat_session_id";
  const COMPANY_ID = "f1767d60-ac8c-485a-b89a-ab739cf48f5f";

  const ABLY_KEY = "R8yA4A.KjqdlQ:LcH7Opp_iBEyDAYrgr4A6itRezKMVH_K8KuDHBDIUJU";

  const IMG_ACCEPT =
    "image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif";

  // Keep in sync with the @media breakpoint in the widget's <style> block.
  const MOBILE_QUERY = "(max-width: 640px)";

  function randToken(len = 9) {
    return Math.random().toString(36).substr(2, len);
  }

  class ChatWidget {
    constructor(userConfig = {}) {
      this.config = {
        primaryColor: "#378ADD",
        companyName: "Presswayy",
        welcomeMessage: "Hello! How can I help you today?",
        placeholder: "Type your message...",
        companyId: COMPANY_ID,

        ablyKey: ABLY_KEY,
        ...userConfig,
      };

      this.sessionId = this.loadSessionId();
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
        id = "sess_" + Date.now().toString(36) + randToken(5);
        try {
          localStorage.setItem(SESSION_KEY, id);
        } catch (e) {}
      }
      return id;
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

      this.shadow = container.attachShadow({ mode: "open" });

      this.shadow.innerHTML = `
        <style>
          :host { --primary: ${this.config.primaryColor}; }
          
          .cw-btn {
            width: 65px; 
            height: 65px; 
            background: #000; 
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
          
          /* Outer bezel — makes the popup look like an iPhone device frame. */
          .cw-window {
            position:fixed; bottom:95px; right:80px; width:340px; height:min(680px, 80vh);
            background:#000; border-radius:42px; padding:8px; box-sizing:border-box;
            box-shadow:0 20px 60px rgba(0,0,0,0.35);
            display:flex; align-items:stretch; justify-content:stretch;
            pointer-events:none;
            
            opacity:0; 
            transform: translateY(80px) scale(0.95);
            transform-origin: bottom right;
            transition: opacity 0.6s ease, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
          }
          .cw-window.open {
            opacity:1; 
            transform: translateY(0) scale(1); 
            pointer-events:auto;
          }
          
          .cw-notch {
            position:absolute; top:14px; left:50%; transform:translateX(-50%);
            width:90px; height:24px; background:#000; border-radius:14px; z-index:2;
          }
          /* Inner screen — the actual chat UI, clipped to the phone's rounded display. */
          .cw-screen {
            flex:1; width:100%; background:white; border-radius:38px; overflow:hidden;
            display:flex; flex-direction:column; position:relative;
          }
          .cw-header { background:transparent; color:#1a1a1a; padding:16px; padding-top:34px; display:flex; align-items:center; gap:12px; border-bottom:1px solid #eee; }
          .cw-close-btn { margin-left:auto; background:none; border:none; color:#000; font-size:28px; cursor:pointer; }
          .cw-messages { flex:1; padding:20px; overflow-y:auto; background:#f8fafc; display:flex; flex-direction:column; }
          .cw-message { margin:4px 0; padding:8px 12px; max-width:80%; word-break:break-word; font-size:14px; line-height:1.35; }
          .cw-message.bot { background:white; border:1px solid #e5e9ed; align-self:flex-start; border-radius:16px 16px 16px 4px; }
          .cw-message.user { background:transparent; border:1px solid var(--primary); color:#0c447c; align-self:flex-end; border-radius:16px 16px 4px 16px; }
          
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
            width:6px; height:6px; border-radius:50%; background:#9aa0a6;
            animation: cw-bounce 1.2s infinite ease-in-out;
          }
          .cw-dot:nth-child(2) { animation-delay: 0.15s; }
          .cw-dot:nth-child(3) { animation-delay: 0.3s; }
          @keyframes cw-bounce {
            0%, 60%, 100% { transform:translateY(0); opacity:0.4; }
            30% { transform:translateY(-4px); opacity:1; }
          }
          
          .cw-input-area { 
            padding: 12px 16px; 
            background: white; 
            border-top: 1px solid #f1f5f9; 
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
            gap: 10px; 
            align-items: flex-end;
          }
          .cw-input-field { 
            flex: 1; 
            min-height: 40px; 
            max-height: 120px; 
            height: 40px;
            padding: 10px 14px; 
            border-radius: 20px; 
            border: 1px solid #cbd5e1; 
            background: #f8fafc;
            resize: none; 
            font-family: inherit; 
            font-size: 14px;
            line-height: 1.4;
            outline: none;
            box-sizing: border-box;
            transition: border-color 0.2s, background-color 0.2s;
            overflow-y: auto;
            scrollbar-width: none;
            -ms-overflow-style: none;
          }
          .cw-input-field::-webkit-scrollbar { display: none; }
          
          .cw-input-field:focus {
            border-color: var(--primary);
            background: #ffffff;
          }
          .cw-attach-btn {
            width: 40px; height: 40px; flex: 0 0 auto; background: transparent; color: #64748b;
            border: none; border-radius: 50%; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            transition: background-color 0.2s, color 0.2s;
          }
          .cw-attach-btn:hover { background-color: #f1f5f9; color: #1e293b; }
          
          .cw-send-btn { 
            width: 40px; height: 40px; flex: 0 0 auto; background: var(--primary); color: white; 
            border: none; border-radius: 50%; cursor: pointer; 
            display: flex; align-items: center; justify-content: center;
            transition: opacity 0.2s, transform 0.1s;
          }
          .cw-send-btn:hover { opacity: 0.95; transform: scale(1.05); }
          .cw-send-btn:active { transform: scale(0.95); }
          
          .cw-home-indicator {
            display:block; width:120px; height:5px; border-radius:3px;
            background:rgba(0,0,0,0.25); margin:6px auto 4px;
          }

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
              padding:0; background:white; border-radius:0; box-shadow:none;
              opacity:1; 
              transform: translateY(100%);
              transition: transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
            }
            .cw-window.open {
              opacity:1; 
              transform: translateY(0);
            }
            .cw-notch { display:none; }
            .cw-screen { border-radius:0; }
            .cw-window.open .cw-header { padding-top: calc(16px + env(safe-area-inset-top)); }
            .cw-window.open .cw-close-btn { font-size:0; }
            .cw-window.open .cw-close-btn::before { content:"‹"; font-size:32px; color:#000; }
            .cw-window.open .cw-input-area {
              padding-bottom: calc(12px + env(safe-area-inset-bottom)); 
              border-top: 1px solid #f1f5f9;
            }
            .cw-window.open .cw-home-indicator {
              display:block; width:134px; height:5px; border-radius:3px;
              background:rgba(0,0,0,0.25); margin:6px auto calc(4px + env(safe-area-inset-bottom));
            }
            .cw-lightbox-img { max-width: 95%; max-height: 70vh; }
          }
        </style>

        <button class="cw-btn" id="cw-btn">
          <svg width="38" height="38" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="54" cy="54" r="32" fill="var(--primary, #378ADD)"/>
            <path d="M 47,16 C 29.88,16 16,29.88 16,47 C 16,54.12 18.42,60.67 22.5,65.88 L 18,78 L 30.63,74.12 C 35.34,76.6 40.75,78 47,78 C 64.12,78 78,64.12 78,47 C 78,29.88 64.12,16 47,16 Z" fill="#ffffff"/>
            <path d="M 55,34 L 38,51 H 44 L 37,64 L 58,43 H 50 Z" fill="var(--primary, #378ADD)"/>
          </svg>
        </button>

        <div class="cw-window" id="cw-window">
          <div class="cw-notch"></div>
          <div class="cw-screen">
            <div class="cw-header">
              <strong>${this.config.companyName}</strong>
              <button class="cw-close-btn" id="cw-close" aria-label="Close">×</button>
            </div>
            <div class="cw-messages" id="cw-messages"></div>
            <div class="cw-input-area">
              <div class="cw-pending-images" id="cw-pending"></div>
              <div class="cw-input-row">
                <button class="cw-attach-btn" id="cw-attach" type="button" title="Send an image">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                  </svg>
                </button>
                <textarea id="cw-input" class="cw-input-field" placeholder="${this.config.placeholder}" rows="1"></textarea>
                <button class="cw-send-btn" id="cw-send" aria-label="Send message">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                </button>
              </div>
              <input type="file" id="cw-file" accept="${IMG_ACCEPT}" multiple style="display:none;">
            </div>
            <div class="cw-home-indicator"></div>
          </div>
        </div>

        <!-- Pop-up Lightbox Structure -->
        <div class="cw-lightbox" id="cw-lightbox">
          <span class="cw-lightbox-close" id="cw-lightbox-close">&times;</span>
          <img class="cw-lightbox-img" id="cw-lightbox-img" src="" alt="Enlarged view">
        </div>
      `;

      document.body.appendChild(container);
      this.bindEvents();
    }

    bindEvents() {
      const btn = this.shadow.getElementById("cw-btn");
      const close = this.shadow.getElementById("cw-close");
      const sendBtn = this.shadow.getElementById("cw-send");
      const input = this.shadow.getElementById("cw-input");
      const attachBtn = this.shadow.getElementById("cw-attach");
      const fileInput = this.shadow.getElementById("cw-file");
      const lightbox = this.shadow.getElementById("cw-lightbox");
      const lightboxClose = this.shadow.getElementById("cw-lightbox-close");

      btn.addEventListener("click", () => this.toggle());
      close.addEventListener("click", () => this.close());
      sendBtn.addEventListener("click", () => this.sendMessage());

      // Close lightbox on clicking close button or background backdrop
      lightboxClose.addEventListener("click", () => this.closeLightbox());
      lightbox.addEventListener("click", (e) => {
        if (e.target === lightbox) this.closeLightbox();
      });

      input.addEventListener("input", () => {
        input.style.height = "auto";
        input.style.height = input.scrollHeight + "px";
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

    async setupRealtime() {
      if (!this.config.ablyKey) return;
      try {
        await this.loadAblyScript();
        const client = new window.Ably.Realtime({ key: this.config.ablyKey });
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

    loadAblyScript() {
      if (window.Ably) return Promise.resolve();
      if (this._ablyScriptPromise) return this._ablyScriptPromise;
      this._ablyScriptPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.ably.io/lib/ably.min-2.js";
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
          { sender: "bot", text: this.config.welcomeMessage },
          container,
        );
        return;
      }

      for (const m of messages) {
        this.appendBubble(m, container);
      }
      container.scrollTop = container.scrollHeight;
    }

    appendBubble(m, container) {
      container = container || this.shadow.getElementById("cw-messages");
      const div = document.createElement("div");
      div.className = "cw-message " + (m.sender === "user" ? "user" : "bot");

      if (m.text) {
        const span = document.createElement("span");
        span.textContent = m.text;
        div.appendChild(span);
      }
      if (Array.isArray(m.images) && m.images.length) {
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
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    }

    showTyping(label = "Thinking...") {
      const container = this.shadow.getElementById("cw-messages");
      const typing = document.createElement("div");
      typing.id = "cw-typing";
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

      container.appendChild(typing);
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
      return { sender, text, images };
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
