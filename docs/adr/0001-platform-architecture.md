# ADR 0001 — Architecture de la plateforme white-label Maison

**Date** : 2026-05-18
**Statut** : Accepté
**Décideur** : Renaud

## Contexte

Le projet `fwurtz` (Maison Fwurtz, site Astro + Bun avec concierge IA) doit évoluer en première brique d'une **plateforme white-label** capable de servir N maisons (luxe / premium) :

- Frontend public et back-office **100 % custom** par client (L1 + L2 + L3 : tokens, composition, composants propres).
- Backend, features, concierge IA **mutualisés**.
- Nouveau client = uniquement du dev frontend.
- Toute nouveauté backend bénéficie automatiquement à tous les clients.

## Décisions

### 1. Modèle global : plateforme + skin

Inspiré de Shopify / Stripe :

- **`maison-core`** (ce repo) : backend mutualisé multi-tenant. 1 deploy → tous les clients.
- **`maison-sdk`** : lib NPM privée (`@maison/sdk`) consommée par les frontends clients. Contient toute la logique d'accès aux données et aux features.
- **`maison-blocks`** : composants UI optionnels (`@maison/blocks`) que les clients peuvent réutiliser ou ignorer.
- **`maison-admin`** : back-office mutualisé, 1 deploy, routing par subdomain (`admin.<client>.fr`).
- **`maison-cli`** : `maison init <client>` pour scaffolder un nouveau repo client.
- **N repos `client-*`** : frontends Astro custom par client, consomment `@maison/sdk`.

Propagation : `Renovate` ouvre une PR automatique sur chaque repo client à chaque bump de `@maison/sdk`.

### 2. Multi-tenancy DB : hybride

- **Par défaut** : 1 DB Postgres mutualisée + colonne `tenant_id` sur chaque table + RLS (Row Level Security).
- **Option premium** : DB dédiée pour les clients à exigence forte (compliance, audit). Configurable via `tenants.db_strategy = 'dedicated'` et `tenants.dedicated_db_url`.

Le SDK et le code métier ne savent pas si le tenant est mutualisé ou dédié — c'est résolu côté infra.

### 3. Stack technique

| | |
|---|---|
| Runtime | Bun |
| HTTP | Hono |
| ORM | Drizzle |
| DB | Postgres (+ pgvector pour le RAG) |
| Auth | Better-Auth + plugin organizations |
| Validation | Zod |
| Lint / format | Biome (strict) |
| Tests | `bun test` |
| Hosting | Coolify (instance Perso `157.180.43.90`) |

### 4. Concierge IA multi-tenant

- Code mutualisé dans `src/features/concierge/`.
- Config par tenant en DB : `persona`, `provider`, `model`, `enabled_tools`, `forbidden_topics`.
- Knowledge base par tenant : `pgvector`, chunks scopés par `tenant_id`.
- 1 amélioration du concierge → instantanée chez tous les clients.

### 5. Migration : strangler fig depuis fwurtz

1. **Phase 0 — Fondation** (en cours) : scaffold `maison-core`, schema initial, tenant resolver, `/health`.
2. **Phase 1 — Concierge multi-tenant** : extraire le concierge de fwurtz dans `maison-core`, ingestion KB fwurtz, refactor fwurtz pour consommer `@maison/sdk`.
3. **Phase 2 — Auth + back-office** : Better-Auth, `maison-admin` avec subdomain routing.
4. **Phase 3 — Métier fwurtz** : catalogue, commandes, contenus migrés module par module.
5. **Phase 4 — 2e client** : `maison init <client>`, onboarding en quelques jours.

Fwurtz reste **live en permanence** pendant la migration.

## Conséquences

### Positives

- 1 deploy backend → propagation instantanée des features et fixes.
- Nouveau client = uniquement dev frontend (objectif principal).
- Concierge IA évolue pour tous en même temps.
- Isolation DB premium possible sans complexifier le code métier.

### Négatives

- Discipline stricte requise : tout code spécifique à un tenant côté plateforme = dette immédiate.
- Frontend client tenté de mettre de la logique business côté front — règle non-négociable : tout passe par le SDK.
- 5 repos plateforme à maintenir avant le 1er client.

### Risques nommés

- **Fork accidentel d'une feature** : un client demande X, on le code "juste pour lui" → 6 mois plus tard, 12 branches. Mitigation : tout besoin spécifique devient une option exposée pour tous via feature flag.
- **Fuite cross-tenant en mode mutualisé** : un dev oublie `WHERE tenant_id = ...` → leak. Mitigation : RLS Postgres comme filet, tests d'isolation systématiques.
- **Renovate qui casse les clients** : un bump de SDK breaking → tous les clients down. Mitigation : versioning semver strict, deprecation warnings une version avant le break, tests E2E sur le SDK.
