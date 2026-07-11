// =============================================
// Chat Widget - Production Ready
// File: chat-widget.js
// =============================================

(function () {
  "use strict";

  class ChatWidget {
    constructor(userConfig = {}) {
      this.config = {
        primaryColor: "#10b981",
        companyName: "My Support",
        welcomeMessage: "Hello! How can I help you today?",
        placeholder: "Type your message...",
        ...userConfig,
      };
      this.isOpen = false;
      this.init();
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
                        width: 65px; height: 65px; background: var(--primary);
                        color: white; border-radius: 50%; font-size: 28px;
                        display: flex; align-items: center; justify-content: center;
                        box-shadow: 0 10px 30px -8px var(--primary);
                        cursor: pointer; border: none;
                    }
                    .cw-window {
                        position: fixed; bottom: 95px; right: 20px;
                        width: 380px; height: 560px; background: white;
                        border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.25);
                        display: none; flex-direction: column; overflow: hidden;
                    }
                    .cw-window.open { display: flex; }
                    .cw-header {
                        background: var(--primary); color: white; padding: 16px;
                        display: flex; align-items: center; gap: 12px;
                    }
                    .cw-messages {
                        flex: 1; padding: 20px; overflow-y: auto; background: #f8fafc;
                    }
                    .cw-message {
                        margin: 8px 0; padding: 12px 16px; border-radius: 18px;
                        max-width: 80%;
                    }
                    .cw-message.bot { background: white; align-self: flex-start; }
                    .cw-message.user { background: var(--primary); color: white; align-self: flex-end; }
                    .cw-input-area { padding: 16px; background: white; border-top: 1px solid #eee; }
                </style>

                <button class="cw-btn" id="cw-btn">💬</button>

                <div class="cw-window" id="cw-window">
                    <div class="cw-header">
                        <strong>${this.config.companyName}</strong>
                        <button id="cw-close" style="margin-left:auto; background:none; border:none; color:white; font-size:28px; cursor:pointer;">×</button>
                    </div>
                    <div class="cw-messages" id="cw-messages"></div>
                    <div class="cw-input-area">
                        <textarea id="cw-input" placeholder="${this.config.placeholder}" style="width:100%; height:50px; padding:12px; border-radius:12px; border:1px solid #ddd; resize:none;"></textarea>
                        <button id="cw-send" style="margin-top:8px; padding:10px 20px; background:var(--primary); color:white; border:none; border-radius:8px; cursor:pointer;">Send</button>
                    </div>
                </div>
            `;

      document.body.appendChild(container);
      this.bindEvents();
    }

    bindEvents() {
      const btn = this.shadow.getElementById("cw-btn");
      const windowEl = this.shadow.getElementById("cw-window");
      const closeBtn = this.shadow.getElementById("cw-close");
      const sendBtn = this.shadow.getElementById("cw-send");
      const input = this.shadow.getElementById("cw-input");

      btn.addEventListener("click", () => this.toggle());
      closeBtn.addEventListener("click", () => this.close());

      sendBtn.addEventListener("click", () => this.send());
      input.addEventListener("keypress", (e) => {
        if (e.key === "Enter") this.send();
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

    send() {
      const input = this.shadow.getElementById("cw-input");
      const text = input.value.trim();
      if (!text) return;

      this.addMessage(text, "user");
      input.value = "";

      // Demo reply
      setTimeout(() => {
        this.addMessage(
          "Thank you! This is a demo from your hosted widget.",
          "bot",
        );
      }, 800);
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

  // Make it available globally
  window.ChatWidget = ChatWidget;

  // Auto start
  new ChatWidget();
})();
