# BlackWorld

> *"Where the world ends. The Sovereign sits and waits."*

A **persistent browser-based dark fantasy MMORPG** where players explore zones, fight monsters, enhance equipment, trade on a player-driven marketplace, join covens, and compete in PvP — all through a sleek, minimalist interface that feels more like a luxury dashboard than a traditional game.

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16 · React 19 · TailwindCSS 4 |
| **Backend** | Next.js API Routes (server-authoritative) |
| **Database** | PostgreSQL 18 via Supabase |
| **Auth** | Custom JWT (jose) + Google OAuth |
| **Payments** | Stripe |
| **Deployment** | Vercel (serverless) |

## Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL 18 (local) or a Supabase project

### Setup

```bash
# Install dependencies
npm install

# Copy environment template and fill in your secrets
cp .env.example .env.local

# Set up the database schema
node --env-file=.env.local scripts/rebuild_database.js

# Seed game content (zones, monsters, items, NPCs, quests, skills)
npm run seed

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
src/
├── app/
│   ├── api/           # 37 API domains, 85+ route handlers (server-authoritative)
│   ├── games/         # Secondary game genre pages
│   ├── layout.js      # Root layout
│   └── page.js        # Landing / boot screen
├── components/        # 54 game UI components
├── context/           # PlayerContext (React context)
├── data/              # Static game data
├── hooks/             # usePlayerData, useLocalStorage, useSocial
└── lib/
    ├── db/
    │   ├── pool.js    # Singleton PG connection pool
    │   └── dal/       # Data Access Layer modules (hero, inventory, quests, combat, …)
    ├── dal.js         # Legacy DAL (being migrated to db/dal/)
    ├── auth.js        # JWT session management
    ├── combat.js      # Combat math
    ├── middleware.js   # Auth + rate-limiting middleware
    └── game/          # Server-side combat engine

supabase/
├── migrations/        # Timestamped SQL migrations + archive of applied patches
├── functions/         # Supabase Edge Functions
└── seed/              # Game content seed data (SQL)

scripts/
├── rebuild_database.js    # Full schema rebuild
├── seed_game_content.js   # Content seeding
├── scaling_migration.js   # Partitioning, views, triggers
└── tests/                 # Integration & E2E tests
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run test` | Run tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Run ESLint |
| `npm run seed` | Seed game content |

## Architecture

- **Server-authoritative**: All state mutations happen server-side. The client is a display layer.
- **DAL pattern**: Database access goes through typed query functions (`src/lib/db/dal/`) returning `{ data, error }`.
- **Custom JWT auth**: Sessions stored as HttpOnly cookies, verified on every API request.
- **Connection pooling**: Singleton pool with HMR caching for development, strict limits for serverless.

## Game Design

See [GDD.txt](GDD.txt) for the full Game Design Document covering combat, progression, economy, PvP, crafting, gathering, covens, and monetization systems.

## License

Private — All rights reserved.
