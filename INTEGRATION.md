# Chat Widget — Integration Guide

This widget is a **framework-agnostic**, vanilla-JS embed. It doesn't care whether your backend is Node.js, Django, Laravel, PHP, Rails, static HTML, or a CMS — if the server can output an HTML page (or you can add a `<script>` tag to an existing one), the widget will work.

It renders itself inside a Shadow DOM, positioned `fixed` at the bottom-right of the viewport, so it won't collide with your site's CSS.

## 1. How it works

- `chat-widget.js` is a single, self-contained IIFE. As soon as it loads, it auto-instantiates itself (`new ChatWidget()`) and injects a floating chat bubble into `document.body`.
- All chat traffic goes to a fixed backend (`server.presswayy.com` webhooks), scoped to your account by a `companyId`. You don't need to run any server-side code of your own for the widget to function — you only need to serve the script.
- Realtime replies are delivered via [Ably](https://ably.com/) (loaded from Ably's CDN with a pinned version + SRI hash) and fall back to polling automatically if Ably fails to load.
- Session and theme preference are stored in the visitor's `localStorage`, keyed per-browser, not per-account.

Because of this, **integrating the widget is the same everywhere**: drop the script tag on every page you want the bubble to appear on. The steps below only differ in *how* each framework serves static files / injects the tag into its templates.

## 2. Get your files

You need two things from this repo:

- `chat-widget.js`
- `favicon.svg` (optional — only used by the demo `index.html`, not required by the widget itself)

Host `chat-widget.js` as a static asset on your own domain (recommended) or load it from wherever you're distributing it.

## 3. Basic embed (any HTML page)

Add this right before the closing `</body>` tag of every page that should show the widget:

```html
<script src="/path/to/chat-widget.js"></script>
```

That's it — no initialization call is required, the script does it for you on load.

### Configuring the widget

By default the widget:
- Uses the company ID baked into the script (`COMPANY_ID` constant at the top of `chat-widget.js`).
- Detects your site's name (from `<meta property="og:site_name">`, else `<title>`, else hostname) and favicon automatically for branding.
- Uses a default blue primary color (`#378ADD`) and a default welcome message.

If you need to change branding per install, edit the constants near the top of `chat-widget.js` before deploying it, or expose your own config by calling the class directly instead of relying on the auto-instantiation:

```js
// Prevent chat-widget.js from auto-creating a default instance by removing/
// commenting out its final `new ChatWidget();` line, then do it yourself:
window.ChatWidget && new window.ChatWidget({
  companyId: "your-company-id",
  companyName: "Acme Inc.",
  primaryColor: "#ff5722",
  faviconUrl: "https://acme.com/favicon.ico",
  welcomeMessage: "Hi! Ask us anything.",
  placeholder: "Type a message…",
});
```

> `window.ChatWidget` is exported as a class, so this pattern works in any framework's template — the only requirement is that the script tag loads before you call `new window.ChatWidget(...)`.

---

## 4. Node.js (Express / Fastify / etc.)

Serve the file as a static asset and reference it in your template/layout.

```js
// Express example
const express = require("express");
const app = express();

app.use(express.static("public")); // put chat-widget.js in /public
```

```html
<!-- views/layout.ejs / .pug / .hbs — anywhere in the shared layout -->
<body>
  ...
  <script src="/chat-widget.js"></script>
</body>
```

For Next.js, put `chat-widget.js` in the `public/` folder and add it once in `app/layout.tsx` (App Router) or `pages/_app.tsx` (Pages Router):

```tsx
// app/layout.tsx
import Script from "next/script";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Script src="/chat-widget.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
```

## 5. Django

Place `chat-widget.js` in a static directory (e.g. `myapp/static/chatbot/chat-widget.js`), then reference it in your base template using the `{% static %}` tag.

```
myapp/
  static/
    chatbot/
      chat-widget.js
```

```django
{% load static %}
<!DOCTYPE html>
<html lang="en">
<head>...</head>
<body>
  {% block content %}{% endblock %}

  <script src="{% static 'chatbot/chat-widget.js' %}"></script>
</body>
</html>
```

Make sure `STATICFILES_DIRS` / `STATIC_URL` is configured in `settings.py` and run `python manage.py collectstatic` for production deployments.

## 6. Laravel

Place `chat-widget.js` in `public/js/` (or any public-accessible path), then reference it with the `asset()` helper in your Blade layout.

```
public/
  js/
    chat-widget.js
```

```blade
{{-- resources/views/layouts/app.blade.php --}}
<!DOCTYPE html>
<html lang="en">
<head>...</head>
<body>
    @yield('content')

    <script src="{{ asset('js/chat-widget.js') }}"></script>
</body>
</html>
```

If you use Laravel Mix/Vite for asset bundling, you can instead copy the file via a Vite static copy plugin, or simply keep it unbundled in `public/` since it's meant to be loaded as a plain `<script>` tag, not imported as a module.

## 7. WordPress / other PHP or CMS sites

- **Theme-based:** upload `chat-widget.js` to your theme (e.g. `wp-content/themes/your-theme/js/chat-widget.js`) and enqueue it in `functions.php`:

  ```php
  function enqueue_chat_widget() {
      wp_enqueue_script(
          'chat-widget',
          get_template_directory_uri() . '/js/chat-widget.js',
          [],
          null,
          true // load in footer
      );
  }
  add_action('wp_enqueue_scripts', 'enqueue_chat_widget');
  ```

- **No theme access / page builder:** paste the `<script src="...">` tag into your site's "custom scripts" / "footer code" setting (most CMS and page builders — WordPress plugins like Insert Headers and Footers, Shopify's `theme.liquid`, Webflow's custom code, Squarespace's Code Injection, etc. — offer one).

## 8. Static sites / plain HTML

Just copy `chat-widget.js` next to your HTML files and reference it directly, exactly as shown in [index.html](index.html):

```html
<script src="chat-widget.js"></script>
```

## 9. Checklist for every integration

- [ ] `chat-widget.js` is reachable over HTTPS at the URL you put in `src`.
- [ ] The script tag is present on every page/template where the bubble should appear (usually your shared layout/base template, once).
- [ ] Your site allows loading `https://cdn.ably.com/lib/ably.min-2.24.0.js` (the widget loads it dynamically) — don't block it via CSP without adding an exception, or realtime replies will silently fall back to polling.
- [ ] If you self-host under a strict Content-Security-Policy, allow `connect-src`/`script-src` for `server.presswayy.com` and `cdn.ably.com`.
- [ ] Test on both desktop and mobile widths — the widget has a dedicated full-screen layout under 640px.

## 10. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Bubble doesn't appear | Script didn't load (check Network tab / CSP), or another script threw before it ran |
| Bubble appears but messages never send | `server.presswayy.com` webhook is unreachable or blocked by CSP/CORS |
| Replies are delayed several seconds | Ably script failed to load (CSP or ad-blocker) — widget fell back to slower polling, which is expected behavior in that case |
| Widget style clashes with site | Shouldn't happen — the widget renders in a Shadow DOM, so page CSS can't leak in and vice versa |
