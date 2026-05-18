# maison-core

Backend mutualisé multi-tenant de la plateforme white-label **Maison**.
Sert tous les frontends clients (`client-fwurtz`, `client-X`, ...) et le back-office mutualisé `maison-admin`.

## Stack

- **Runtime** : Bun
- **HTTP** : Hono
- **DB** : Postgres + Drizzle ORM (avec pgvector pour le RAG du concierge)
- **Auth** : Better-Auth + plugin organizations (à venir)
- **Lint/format** : Biome (strict)
- **Tests** : `bun test`

## Setup

```bash
bun install
cp .env.example .env
# édite .env (DATABASE_URL, ...)
```

## Scripts

```bash
bun run dev         # serveur en watch mode
bun run test        # tests unitaires
bun run typecheck   # tsc --noEmit
bun run lint        # biome check
bun run check       # typecheck + lint + tests (CI gate)
bun run db:generate # générer une migration Drizzle
bun run db:migrate  # appliquer les migrations
```

Avant tout commit : `bun run check` doit passer (zéro warning, zéro échec).

## Structure

```
src/
  features/            ← clean architecture par feature
    tenants/
      domain/          ← entités, value objects (zéro dép infra)
      application/     ← use cases
      infra/           ← repositories, schema Drizzle
      presentation/    ← routes Hono, DTOs
  shared/              ← code partagé entre 3+ features
    config/            ← chargement env validé (zod)
    db/                ← client Drizzle/Postgres
    http/              ← middlewares Hono génériques
  app.ts               ← création de l'app Hono (testable)
  index.ts             ← entry point (serveur Bun)
```

Voir [docs/adr/0001-platform-architecture.md](./docs/adr/0001-platform-architecture.md) pour les décisions d'architecture.

## Règles de discipline

- **Zéro logique business côté frontend client** : tout passe par `@maison/sdk` qui tape ici.
- **Zéro code spécifique à un tenant dans le core** : pas de `if (tenant.slug === "fwurtz")`. Une feature est soit dans le core (avec config par tenant), soit elle n'existe pas.
- **TDD non-négociable** : tout nouveau code arrive avec son test (cf. CLAUDE.md règle 4 et 11).
