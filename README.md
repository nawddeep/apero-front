# APÉRO — Premium Underground Music & Nightlife Experience

An award-winning, cinematic event landing page and ticketing experience engineered with **HTML5, modern CSS3, and Vanilla JavaScript**, powered by **GSAP 3, ScrollTrigger, and Lenis**.

---

## ✦ Aesthetic Identity & Design System

- **Primary Atmosphere**: Dark Void Noir (`#050505`) with Deep Crimson & Blood Red accents (`#e50914`, `#8b0000`) and pure/muted white typography (`#f5f5f5`, `#8a8a8a`).
- **Texture**: Subtle SVG film grain noise overlay and atmospheric radial vignettes.
- **Typography**: `Syne` (display titles), `Inter` (body and micro-copy), and `Space Grotesk` (technical metadata).
- **Motion Philosophy**: Heavy, cinematic easing (`cubic-bezier(0.16, 1, 0.3, 1)`) with zero layout thrashing. Respects `prefers-reduced-motion`.

---

## ✦ Directory Structure

```text
apero/
├── index.html              # Semantic HTML5 markup and accessible modals
├── css/
│   └── style.css           # Design tokens, responsive typography, pass cards
├── js/
│   ├── main.js             # Countdown timer, navigation, modals
│   ├── animations.js       # GSAP timelines, Lenis integration, ScrollTrigger
│   └── booking.js          # Live ticket calculations, validation, API hooks
├── assets/
│   └── videos/
│       └── 1.mp4           # 1080p hero background video
└── README.md
```

---

## ✦ Key Features

1. **Cinematic Hero**:
   - High-contrast video loop (`assets/videos/1.mp4`) with dual gradient masks and subtle scale transition on load (`1.14` → `1.0`).
   - Massive headline typography with character and word reveals.

2. **GSAP + Lenis Scroll Experience**:
   - Lenis smooth inertial scrolling synchronized with ScrollTrigger via `gsap.ticker`.
   - Scrub-driven word highlights in the statement section.
   - Parallax transitions and smooth entrance animations.

3. **Curated Lineup & Architectural Venue**:
   - Typographic roster with origin and genre telemetry.
   - Architectural coordinate frame and modal directions terminal.

4. **Live Telemetry & Countdown**:
   - Accurate JavaScript countdown to September 26, 2026, 6:00 PM IST.

5. **Luxury Holographic Passes & Booking Modal**:
   - Perforated ticket styling with tear-off notches and barcode telemetry.
   - Accessible `<dialog>` modal with live subtotal, GST (18%), and grand total calculations.
   - Interactive quantity stepper (1–10 passes).
   - Instant booking confirmation voucher screen.

6. **Payment Gateway Integration Hook**:
   - To connect Stripe, Razorpay, or a backend API, subscribe to:
     ```javascript
     window.AperoBooking.onBookingSubmit = function(payload) {
       console.log('Dispatch to Payment Gateway:', payload);
       // Example: Initiate Razorpay / Stripe Checkout session
     };
     ```

---

## ✦ Running Locally

Backend API + static site (recommended):

```bash
npm install
cp .env.example .env
npm start
```

Open [http://localhost:5000](http://localhost:5000) in your browser.

Static-only preview (no booking API):

```bash
python3 -m http.server 3000
```

---

## ✦ Booking API

- `POST /api/bookings` — create a booking
- `GET /api/bookings/:id` — get one booking by `APERO-2026-XXXX`
- `POST /api/admin/login` — admin login, returns JWT
- `GET /api/admin/bookings` — list bookings (JWT)
- `POST /api/admin/checkin` — check in a guest (JWT)
- `GET /api/admin/stats` — dashboard stats (JWT)
- `GET /api/admin/export` — CSV export (JWT)

Admin portal: `/admin/login.html`

> Data persistence note: the default store in `lib/db.js` is in-memory and
> will NOT persist across Vercel serverless invocations or restarts. This
> setup is for local development and API testing only, not production. Swap
> in MongoDB/PostgreSQL behind the same `lib/db.js` functions for production.
