// =============================================
// Presswayy Chat Widget - Company ID Hardcoded
// Refactored v3: DB-authoritative rendering.
// Fixes user/bot message ordering + duplication on populate.
// =============================================

(function () {
  "use strict";

  const API = {
    GET: "https://server.presswayy.com/webhook/api/v1/get-data-chatbot",
    POST: "https://server.presswayy.com/webhook/api/v1/post-data-chatbot",
  };

  const SESSION_KEY = "presswayy_chat_session_id";
  const COMPANY_ID = "f1767d60-ac8c-485a-b89a-ab739cf48f5f";

  function randToken(len = 9) {
    return Math.random().toString(36).substr(2, len);
  }

  class ChatWidget {
    constructor(userConfig = {}) {
      this.config = {
        primaryColor: "#0b0b0b",
        companyName: "Presswayy Support",
        welcomeMessage: "Hello! How can I help you today?",
        placeholder: "Type your message...",
        companyId: COMPANY_ID,
        ...userConfig,
      };

      this.sessionId = this.loadSessionId();
      this.isOpen = false;
      this.isSending = false;
      this.hasLoadedHistory = false;
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
            width:65px; height:65px; background:var(--primary); color:white;
            border-radius:50%; font-size:28px; display:flex; align-items:center;
            justify-content:center; box-shadow:0 10px 30px -8px var(--primary);
            cursor:pointer; border:none;
          }
          .cw-window {
            position:fixed; bottom:95px; right:20px; width:380px; height:560px;
            background:white; border-radius:20px; box-shadow:0 20px 60px rgba(0,0,0,0.25);
            display:none; flex-direction:column; overflow:hidden;
          }
          .cw-window.open { display:flex; }
          .cw-header { background:var(--primary); color:white; padding:16px; display:flex; align-items:center; gap:12px; }
          .cw-messages { flex:1; padding:20px; overflow-y:auto; background:#f8fafc; display:flex; flex-direction:column; }
          .cw-message { margin:8px 0; padding:12px 16px; border-radius:18px; max-width:80%; word-break:break-word; }
          .cw-message.bot { background:white; align-self:flex-start; }
          .cw-message.user { background:var(--primary); color:white; align-self:flex-end; }
          .cw-message img { max-width:100%; border-radius:12px; margin-top:6px; display:block; }
          .cw-input-area { padding:16px; background:white; border-top:1px solid #eee; }
        </style>

        <button class="cw-btn" id="cw-btn">P</button>

        <div class="cw-window" id="cw-window">
          <div class="cw-header">
            <strong>${this.config.companyName}</strong>
            <button id="cw-close" style="margin-left:auto;background:none;border:none;color:white;font-size:28px;cursor:pointer;">×</button>
          </div>
          <div class="cw-messages" id="cw-messages"></div>
          <div class="cw-input-area">
            <textarea id="cw-input" placeholder="${this.config.placeholder}" style="width:100%;height:52px;padding:12px;border-radius:12px;border:1px solid #ddd;resize:none;"></textarea>
            <button id="cw-send" style="margin-top:8px;padding:10px 24px;background:var(--primary);color:white;border:none;border-radius:8px;cursor:pointer;">Send</button>
          </div>
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

      btn.addEventListener("click", () => this.toggle());
      close.addEventListener("click", () => this.close());
      sendBtn.addEventListener("click", () => this.sendMessage());

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });
    }

    async toggle() {
      const win = this.shadow.getElementById("cw-window");
      this.isOpen = !this.isOpen;
      win.classList.toggle("open", this.isOpen);
      if (this.isOpen) {
        this.shadow.getElementById("cw-input").focus();
        if (!this.hasLoadedHistory) {
          this.hasLoadedHistory = true;
          await this.loadHistory();
        }
      }
    }

    close() {
      this.isOpen = false;
      this.shadow.getElementById("cw-window").classList.remove("open");
    }

    /* --------------------- rendering --------------------- */

    // Clears and rebuilds the whole message list from an array of
    // normalized messages: { sender:'user'|'bot', text, images:[] }
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
      if (Array.isArray(m.images)) {
        for (const url of m.images) {
          const img = document.createElement("img");
          img.src = url;
          div.appendChild(img);
        }
      }
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    }

    showTyping() {
      const container = this.shadow.getElementById("cw-messages");
      const typing = document.createElement("div");
      typing.id = "cw-typing";
      typing.className = "cw-message bot";
      typing.textContent = "Thinking...";
      container.appendChild(typing);
      container.scrollTop = container.scrollHeight;
    }

    hideTyping() {
      const typing = this.shadow.getElementById("cw-typing");
      if (typing) typing.remove();
    }

    /* --------------------- data mapping --------------------- */

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

    // Converts one DB row to { sender, text, images } or null if empty.
    mapRow(row) {
      const st = String(row.sender_type || row.sender || "").toLowerCase();
      const isBot = st === "ai" || st === "bot" || st === "assistant";
      const sender = isBot ? "bot" : "user";

      let text =
        row.text || row.message_text || row.message || row.content || "";
      if (typeof text !== "string") text = String(text || "");
      text = text.trim();

      const images = this.extractImages(row);

      // If the "text" is actually an image URL, move it to images.
      if (text && this.isImageUrl(text)) {
        images.push(text);
        text = "";
      }

      if (!text && images.length === 0) return null;
      return { sender, text, images };
    }

    // Map + sort by created_at ASC (DB order authoritative).
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

    /* --------------------- network --------------------- */

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

    async sendMessage() {
      if (this.isSending) return;

      const input = this.shadow.getElementById("cw-input");
      const text = input.value.trim();
      if (!text) return;

      this.isSending = true;
      input.value = "";

      // Optimistic user bubble (will be reconciled by DB render).
      this.appendBubble({ sender: "user", text });
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
                message: { mid: messageId, text: text },
              },
            ],
          },
        ],
      };

      // Bot count before send — used to detect the new reply.
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
      } finally {
        this.isSending = false;
      }
    }

    // Polls until a NEW bot message appears, then re-renders the whole
    // thread from DB so user/bot order is always correct.
    async pollForReply(botCountBefore) {
      const maxAttempts = 13;
      const delayMs = 1500;

      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((r) => setTimeout(r, delayMs));
        try {
          const messages = await this.fetchHistory();
          if (this.countBots(messages) > botCountBefore) {
            this.hideTyping();
            this.renderMessages(messages);
            return;
          }
        } catch (e) {}
      }

      // Timeout: still re-render whatever DB has, so nothing is lost.
      this.hideTyping();
      try {
        this.renderMessages(await this.fetchHistory());
      } catch (e) {}
    }
  }

  window.ChatWidget = ChatWidget;
  new ChatWidget();
})();
