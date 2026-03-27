# ScriptMate — Static (GitHub Pages)

A fully static version of ScriptMate for hosting on **GitHub Pages** (or any static host).

## Files
```
index.html          ← Main ordering page
admin.html          ← Admin dashboard
404.html            ← Custom 404 page
static/
  css/main.css      ← Main styles
  css/admin.css     ← Admin styles
  js/main.js        ← Order form logic
  js/admin.js       ← Admin dashboard logic
```

## How it works (Static Mode)
- **Orders** are stored in browser `localStorage` — no server needed.
- **Pricing** is calculated client-side using the same formula as the original backend.
- **WhatsApp** button sends the full order summary to the business number.
- **Admin dashboard** reads from the same localStorage, with charts and full order management.
- **File uploads** — the filename is noted in the order, but the file is not uploaded anywhere.

## Deploy to GitHub Pages
1. Create a new GitHub repository.
2. Push **all files** in this folder to the `main` branch.
3. Go to **Settings → Pages → Source → Deploy from branch → main / (root)**.
4. Your site will be live at `https://<username>.github.io/<repo>/`.

## Change Admin Password
Open `static/js/admin.js` and update line 6:
```js
const ADMIN_PASSWORD = 'YourNewPassword';
```

## Customise WhatsApp Number
Open `static/js/main.js` and search for `wa.me/91...` to update the phone number.

## Limitations vs Flask version
| Feature | Flask | Static |
|---|---|---|
| Order storage | SQLite DB (server) | localStorage (browser) |
| File uploads | Saved to server disk | Filename noted only |
| Admin auth | Bcrypt + time-bound token | Password in JS (change it!) |
| Cross-device data | ✅ Shared | ❌ Per-browser only |
| WhatsApp notify | Manual | Auto-populated message |
