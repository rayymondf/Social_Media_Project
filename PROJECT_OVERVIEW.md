# Project Overview

## Purpose

Instigator is a small posting dashboard built to practice full-stack JavaScript concepts:

- Client-side state and components with React.
- REST API communication with `fetch`.
- Express routes and middleware.
- Session-based authentication.
- PostgreSQL-backed session storage.
- PostgreSQL persistence.
- Environment-based configuration with dotenv.

## Main User Flow

1. Visitor opens the public page.
2. Visitor signs up, signs in, or continues as Guest.
3. Authenticated user lands on Home.
4. User creates posts and likes/unlikes posts.
5. User browses Profiles.
6. User opens another profile or My Profile to see profile-specific posts.

Guest is a real database user, so Guest can post and like just like a registered account.

## Architecture

```txt
Browser
  React app served by Vite in development
  calls /api with fetch

Express server
  handles auth, sessions, API routes, and validation
  talks to PostgreSQL with pg

PostgreSQL
  stores users, posts, likes, and the unused comments table
```

## Development Ports

```txt
VITE_PORT  React frontend  default 5173
PORT       Express API     default 3000
DB port    PostgreSQL      usually 5432
```

The database port is part of `DATABASE_URL`. It is not the same as `PORT` or `VITE_PORT`.

## Data Flow

1. On load, React calls `GET /api/auth/me`.
2. If logged in, React loads posts and profiles.
3. Creating a post sends `POST /api/posts`.
4. Liking a post sends `POST /api/posts/:id/like`.
5. Opening a profile sends `GET /api/users/:id`.
6. React stores the response in component state and re-renders the UI.

## Database Tables

- `users`: account records, including the reusable Guest account.
- `posts`: post content and author relationship.
- `likes`: one like per user per post.
- `comments`: currently created by the server but not used in the UI.

## UI Shape

- Public page: Instigator title, auth actions, and guest access.
- Desktop app: left navigation, center timeline, small right account panel.
- Mobile app: simplified layout with bottom navigation.
- Home: composer plus timeline.
- Profiles: searchable directory.
- Profile pages: profile header plus that user's posts.

## Browser Routes

```txt
/               Public landing page
/signin         Sign-in screen
/signup         Create-account screen
/home           Authenticated home timeline
/profiles       Profiles directory
/profiles/:id   Individual profile page
/me             Current user's profile
```

## API Summary

```txt
POST /api/auth/register
POST /api/auth/login
POST /api/auth/guest-login
POST /api/auth/logout
GET  /api/auth/me
GET  /api/posts
POST /api/posts
POST /api/posts/:id/like
GET  /api/users
GET  /api/users/:id
```
