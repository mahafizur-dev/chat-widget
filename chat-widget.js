// =============================================
// Chat Widget - Company ID Hardcoded
// =============================================

(function () {
  "use strict";

  const API = {
    GET: "https://server.presswayy.com/webhook/api/v1/get-data-chatbot",
    POST: "https://server.presswayy.com/webhook/api/v1/post-data-chatbot",
  };

  const SESSION_KEY = "presswayy_chat_session_id";
  const COMPANY_ID = "f1767d60-ac8c-485a-b89a-ab739cf48f5f";

  class ChatWidget {
    constructor(userConfig = {}) {
      this.config = {
        primaryColor: "#10b981",
        companyName: "Presswayy Support",
        welcomeMessage: "Hello! How can I help you today?",
        placeholder: "Type your message...",
        companyId: COMPANY_ID,
        ...userConfig,
      };

      this.sessionId = this.loadSessionId();
      this.isOpen = false;
      this.init();
    }

    loadSessionId() {
      let id = localStorage.getItem(SESSION_KEY);
      if (!id) {
        id =
          "sess_" +
          Date.now().toString(36) +
          Math.random().toString(36).substr(2, 5);
        localStorage.setItem(SESSION_KEY, id);
      }
      return id;
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
                    .cw-messages { flex:1; padding:20px; overflow-y:auto; background:#f8fafc; }
                    .cw-message { margin:8px 0; padding:12px 16px; border-radius:18px; max-width:80%; word-break:break-word; }
                    .cw-message.bot { background:white; align-self:flex-start; }
                    .cw-message.user { background:var(--primary); color:white; align-self:flex-end; }
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
      this.addBotMessage(this.config.welcomeMessage);
    }

    bindEvents() {
      const btn = this.shadow.getElementById("cw-btn");
      const win = this.shadow.getElementById("cw-window");
      const close = this.shadow.getElementById("cw-close");
      const sendBtn = this.shadow.getElementById("cw-send");
      const input = this.shadow.getElementById("cw-input");

      btn.addEventListener("click", () => this.toggle());
      close.addEventListener("click", () => this.close());
      sendBtn.addEventListener("click", () => this.sendMessage());
      input.addEventListener("keypress", (e) => {
        if (e.key === "Enter") this.sendMessage();
      });
    }

    toggle() {
      const win = this.shadow.getElementById("cw-window");
      this.isOpen = !this.isOpen;
      win.classList.toggle("open", this.isOpen);
    }

    close() {
      this.isOpen = false;
      this.shadow.getElementById("cw-window").classList.remove("open");
    }

    addMessage(text, type) {
      const container = this.shadow.getElementById("cw-messages");
      const div = document.createElement("div");
      div.className = `cw-message ${type}`;
      div.textContent = text;
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    }

    addBotMessage(text) {
      this.addMessage(text, "bot");
    }

    async sendMessage() {
      const input = this.shadow.getElementById("cw-input");
      const text = input.value.trim();
      if (!text) return;

      this.addMessage(text, "user");
      input.value = "";

      const typing = document.createElement("div");
      typing.id = "typing";
      typing.innerHTML = `<div class="cw-message bot">Thinking...</div>`;
      this.shadow.getElementById("cw-messages").appendChild(typing);

      try {
        const payload = {
          object: "chatbot",
          entry: [
            {
              id: this.config.companyId,
              time: Date.now(),
              messaging: [
                {
                  sender: { id: this.sessionId },
                  recipient: { id: this.config.companyId },
                  timestamp: Date.now(),
                  message: { text: text },
                },
              ],
            },
          ],
        };

        await fetch(API.POST, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        await this.pollForReply();
      } catch (err) {
        console.error(err);
        this.addBotMessage("Sorry, I'm having trouble connecting.");
      } finally {
        document.getElementById("typing")?.remove();
      }
    }

    async pollForReply() {
      const maxAttempts = 12;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((r) => setTimeout(r, 1500));

        try {
          const url = new URL(API.GET);
          url.searchParams.set("companyId", this.config.companyId);
          url.searchParams.set("sessionId", this.sessionId);
          url.searchParams.set("company_id", this.config.companyId);
          url.searchParams.set("session_id", this.sessionId);

          const res = await fetch(url);
          const data = await res.json();

          const reply = this.extractLastBotReply(data);
          if (reply) {
            this.addBotMessage(reply);
            return;
          }
        } catch (e) {}
      }
      this.addBotMessage("I'm here but having some delay.");
    }

    extractLastBotReply(data) {
      if (!data) return null;
      const rows = Array.isArray(data)
        ? data
        : data.data || data.rows || data.output || [];
      for (let i = rows.length - 1; i >= 0; i--) {
        const text =
          rows[i].message_text ||
          rows[i].text ||
          rows[i].message ||
          rows[i].content ||
          "";
        if (text.trim()) return text.trim();
      }
      return null;
    }
  }

  window.ChatWidget = ChatWidget;
  new ChatWidget();
})();
