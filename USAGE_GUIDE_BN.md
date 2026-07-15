# Chat Widget — ব্যবহার নির্দেশিকা

## এক লাইনেই কাজ শেষ

আপনার client-এর ওয়েবসাইট Node.js, Laravel, Django, WordPress, plain HTML — যা-ই হোক না কেন, তাকে শুধু এই একটা লাইন দিলেই widget কাজ করবে:

```html
<script src="https://yourdomain.com/chat-widget.js"></script>
```

এটা তাদের ওয়েবসাইটের `</body>` ট্যাগের ঠিক আগে বসাতে হবে। ব্যাস, আর কিছু লাগবে না — কোনো extra কোড, কোনো `init()` কল, কিছুই না। Script load হওয়া মাত্র widget নিজে থেকে ডান-নিচে চলে আসবে।

**কেন backend framework কোনো ব্যাপার না:**
এই script tag টা browser-এ গিয়ে run হয়, server-এ না। তাই website-টা কোন ভাষা/framework দিয়ে বানানো (Node.js, Laravel, PHP, Python) সেটা widget-এর জন্য অপ্রাসঙ্গিক — browser শুধু URL থেকে file-টা fetch করে চালায়।

---

## `chat-widget.js` ফাইলটা client-কে কখনোই দেবেন না

- আসল `.js` ফাইলটা **শুধু আপনার নিজের সার্ভারে** থাকবে (e.g. `https://yourdomain.com/chat-widget.js`)।
- Client শুধু উপরের script tag-টা পাবে, ফাইলের content না। ঠিক যেমন Google Analytics বা Facebook Pixel-এর script tag দেওয়া হয়।
- এতে ফাইলের ownership এবং control পুরোপুরি আপনার হাতেই থাকে — client চাইলেও ভেতরের কোড দেখতে বা বদলাতে পারবে না।

---

## Framework অনুযায়ী script tag কোথায় বসাবে (client-কে বলার জন্য)

| Website type | Script tag কোথায় বসবে |
|---|---|
| **Plain HTML** | সরাসরি HTML ফাইলে, `</body>`-এর আগে |
| **Node.js (Express/Next.js)** | shared layout / template ফাইলে (`.ejs`, `.hbs`, `layout.tsx` ইত্যাদি), যেটা সব page-এ common |
| **Laravel** | Blade layout ফাইলে (যেমন `layouts/app.blade.php`), যেটা সব view extend করে |
| **Django** | `base.html`-এ, যেটা সব template extend করে |
| **WordPress / Shopify / Wix** | Theme-এর footer অংশে, অথবা "Custom Code" / "Header-Footer Scripts" অপশনে (plugin বা built-in feature) |

একবার **shared layout**-এ বসালেই পুরো ওয়েবসাইটের সব page-এ widget দেখা যাবে — প্রতি page-এ আলাদা করে বসাতে হবে না।

---

## জরুরি বিষয় — companyId

`chat-widget.js`-এর ভেতরে একটা `COMPANY_ID` fix করা আছে ([chat-widget.js:18](chat-widget.js:18)), যেটা ঠিক করে chat message গুলো কার account-এ জমা হবে।

- **একটাই client/business** হলে — সমস্যা নেই, এখনকার সেটাপ ঠিকই কাজ করবে।
- **একাধিক আলাদা client** থাকলে — সবাইকে একই ফাইল দিলে সবার chat একই companyId-তে mix হয়ে যাবে। এক্ষেত্রে প্রতি client-এর জন্য আলাদা `COMPANY_ID` বসানো আলাদা `chat-widget.js` ফাইল host করতে হবে (আলাদা URL-এ)।

---

## Deploy করার আগে চেক-লিস্ট

- [ ] `chat-widget.js` HTTPS URL-এ publicly accessible কিনা যাচাই করুন।
- [ ] Client-কে ফাইল না দিয়ে শুধু script tag URL দিয়েছেন।
- [ ] Script tag shared layout-এ বসানো হয়েছে (প্রতি page-এ আলাদা করে না)।
- [ ] Client-এর সাইটে strict CSP থাকলে `server.presswayy.com` ও `cdn.ably.com` allow করতে বলুন।
- [ ] Desktop ও mobile দুই জায়গাতেই widget test করে দেখুন।
