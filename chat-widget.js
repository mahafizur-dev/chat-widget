// =============================================
// Production Ready Chat Widget
// File: chat-widget.js
// =============================================

(function () {
  "use strict";

  class ChatWidget {
    constructor(userConfig = {}) {
      this.config = {
        primaryColor: "#10b981",
        companyName: "My Support",
        welcomeMessage: "Hello! How can I help you today? 👋",
        placeholder: "Type your message...",
        ...userConfig,
      };
      this.isOpen = false;
      this.init();
    }

    init() {
      const container = document.createElement("div");
      container.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 2147483647;
            `;

      this.shadow = container.attachShadow({ mode: "open" });

      this.shadow.innerHTML = `
                <style>
                    :host {
                        --primary: ${this.config.primaryColor};
                    }
                    .cw-btn {
                        width: 65px;
                        height: 65px;
                        background: #000;
                        color: white;
                        border-radius: 50%;
                        font-size: 34px;
                        font-weight: 700;
                        font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
                        line-height: 1;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        box-shadow: 0 10px 30px -8px rgba(0,0,0,0.6);
                        cursor: pointer;
                        border: none;
                    }
                    .cw-btn-label {
                        display: block;
                        transform: translateY(-0.12em);
                    }
                    .cw-window {
                        position: fixed;
                        bottom: 95px;
                        right: 20px;
                        width: 380px;
                        height: 560px;
                        background: white;
                        border-radius: 20px;
                        box-shadow: 0 20px 60px rgba(0,0,0,0.25);
                        display: none;
                        flex-direction: column;
                        overflow: hidden;
                    }
                    .cw-window.open {
                        display: flex;
                    }
                    .cw-header {
                        background: var(--primary);
                        color: white;
                        padding: 16px;
                        display: flex;
                        align-items: center;
                        gap: 12px;
                    }
                    .cw-messages {
                        flex: 1;
                        padding: 20px;
                        overflow-y: auto;
                        background: #f8fafc;
                    }
                    .cw-message {
                        margin: 8px 0;
                        padding: 12px 16px;
                        border-radius: 18px;
                        max-width: 80%;
                    }
                    .cw-message.bot {
                        background: white;
                        align-self: flex-start;
                    }
                    .cw-message.user {
                        background: var(--primary);
                        color: white;
                        align-self: flex-end;
                    }
                    .cw-input-area {
                        padding: 16px;
                        background: white;
                        border-top: 1px solid #eee;
                    }
                </style>

                <button class="cw-btn" id="cw-btn" aria-label="Open presswayy chat"><span class="cw-btn-label">p</span></button>

                <div class="cw-window" id="cw-window">
                    <div class="cw-header">
                        <strong>${this.config.companyName}</strong>
                        <button id="cw-close" style="margin-left:auto; background:none; border:none; color:white; font-size:28px; cursor:pointer;">×</button>
                    </div>
                    <div class="cw-messages" id="cw-messages"></div>
                    <div class="cw-input-area">
                        <textarea id="cw-input" placeholder="${this.config.placeholder}"
                            style="width:100%; height:52px; padding:12px; border-radius:12px; border:1px solid #ddd; resize:none;"></textarea>
                        <button id="cw-send"
                            style="margin-top:8px; padding:10px 24px; background:var(--primary); color:white; border:none; border-radius:8px; cursor:pointer;">
                            Send
                        </button>
                    </div>
                </div>
            `;

      document.body.appendChild(container);
      this.bindEvents();
    }

    bindEvents() {
      const btn = this.shadow.getElementById("cw-btn");
      const win = this.shadow.getElementById("cw-window");
      const close = this.shadow.getElementById("cw-close");
      const send = this.shadow.getElementById("cw-send");
      const input = this.shadow.getElementById("cw-input");

      btn.addEventListener("click", () => this.toggle());
      close.addEventListener("click", () => this.close());

      send.addEventListener("click", () => this.sendMessage());
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

    sendMessage() {
      const input = this.shadow.getElementById("cw-input");
      const text = input.value.trim();
      if (!text) return;

      this.addMessage(text, "user");
      input.value = "";

      // Demo Auto Reply
      setTimeout(() => {
        this.addMessage("Thank you! This widget is hosted online.", "bot");
      }, 700);
    }

    addMessage(text, type) {
      const container = this.shadow.getElementById("cw-messages");
      const div = document.createElement("div");
      div.className = `cw-message ${type}`;
      div.textContent = text;
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    }
  }

  // Expose to window
  window.ChatWidget = ChatWidget;

  // Auto initialize
  new ChatWidget();
})();
