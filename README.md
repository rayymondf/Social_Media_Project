# Social Media App

---
A full-stack social posting app. Users can sign up, sign in, continue as Guest, publish posts, like posts, browse profiles, and view individual profile timelines.

**Live demo:** [https://posting-dashboard-project.onrender.com/](https://social-media-project-1-d15l.onrender.com/)

---

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React 19, Vite, JavaScript, CSS |
| Backend | Node.js, Express |
| Auth | Passport.js (local strategy), express-session, bcryptjs |
| Database | PostgreSQL (`pg`, `connect-pg-simple`) |
| Hosting | Render (server), Neon (database) |

---

## Features

- JWT-free session authentication with PostgreSQL-backed session storage
- Guest account — shared, persistent, no registration required
- Home timeline showing all posts in reverse-chronological order
- Like / unlike toggle with live count updates
- Searchable profiles directory
- Per-user profile pages with post history
- Direct messaging — create threads, send and delete messages
- Responsive layout: sidebar nav on desktop, bottom nav on mobile
- SPA routing with the Browser History API (no React Router)
- Input validation and error handling on both client and server

---

## Project Structure

```
server.js               Express app — auth, API routes, DB init
vite.config.mjs         Vite config — dev proxy, build output
client/
  index.html
  src/
    main.jsx            React entry point
    App.jsx             Top-level state and actions
    api/client.js       All fetch calls to the API
    routes/paths.js     URL parsing and history management
    components/         UI components
    styles/main.css     All styles
scripts/
  check-dev-ports.js    Pre-dev port availability check
```

---

## Quick Start

**Prerequisites:** Node.js, npm, PostgreSQL

```bash
npm install
cp .env.example .env   # Windows: Copy-Item .env.example .env
```

Edit `.env`:

```env
DATABASE_URL=postgresql://localhost:5432/instigator
SESSION_SECRET=replace_with_a_long_random_string
NODE_ENV=development
PORT=3000
VITE_PORT=5173
```

Create the database, then run:

```bash
createdb instigator
npm run dev
```

Open `http://localhost:5173`. The server creates all tables automatically on first run.

---

## Scripts

```bash
npm run dev         # Start Express + Vite concurrently
npm run build       # Build React into dist/
npm start           # Serve the built app with Express
npm test            # Build + syntax-check server.js
npm run check:ports # Check if dev ports are available
```

---

## Browser Routes

```
/               Landing page (sign in / sign up / guest)
/signin         Sign-in form
/signup         Registration form
/home           Home timeline
/profiles       Profiles directory
/profiles/:id   Individual profile
/me             Current user's profile
/messages       Direct messages
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Secret used to sign session cookies |
| `NODE_ENV` | No | Set to `production` on Render |
| `PORT` | No | Express port (default `3000`) |
| `VITE_PORT` | No | Vite dev server port (default `5173`) |

`.env` is gitignored. `.env.example` is the committed template.

---

## Documentation

- [QUICKSTART.md](QUICKSTART.md) — setup, configuration, and troubleshooting
- [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) — architecture, data flow, and API reference
- [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md) — code structure and implementation details
