# PLAYBOOK — Maison Platform

> **Audience : LLM (Claude Code ou agent similaire) exécutant des opérations sur la plateforme.**
> Ce document est conçu pour être lu et appliqué directement, sans contexte humain supplémentaire.

---

## 0. À LIRE EN PREMIER (5 lignes pour avoir le modèle mental)

- Maison = plateforme **white-label** : **1 backend mutualisé** (`maison-core`) + **N frontends clients** (1 repo par client).
- Toute la logique vit dans `maison-core` (ce repo). Les frontends consomment `@maison/sdk` et ne contiennent **QUE de l'UI**.
- Un client = une ligne dans la table `tenants` (slug, nom, persona concierge, feature flags, etc.).
- DB stratégie hybride : **mutualisée par défaut** (RLS + tenant_id), **option dédiée** (Sovereign) pour clients à exigence stricte.
- Discipline non négociable : **jamais de `if (tenant.slug === "...")`** côté plateforme. Une feature spécifique = une **option de config** exposée pour tous via `featureFlags` ou `conciergeConfig`.

---

## 1. Identités de la plateforme (constantes à utiliser tel quel)

| Ressource | Valeur |
|---|---|
| Coolify URL | `http://157.180.43.90:8000` |
| Server UUID (localhost) | `fgc8c88co0c80goc044swgwc` |
| Destination UUID (network "coolify") | `r8cwo0ckgww84wkkgc8g800g` |
| Projet `maison-core` UUID | `r80o0c0s48w0ooc0wcwwkwww` |
| Env production UUID | `f4ko0gw84gwowo8wos8k8sww` |
| Env staging UUID | `k4wsskcwws48ks08w4408kgs` |
| DB `maison-core-db-prod` UUID | `b888ccgow804c8gos4gs4s8s` |
| App `maison-core-backend-prod` UUID | `ro0w4o4c8o0ocg04c40soog0` |
| Backend prod URL | `https://api.maison-core.157.180.43.90.sslip.io` |
| GitHub repo | `https://github.com/NonoM33/maison-core` |

**Credentials** (jamais commit) :
- `COOLIFY_API_KEY` : voir `~/.claude/COOLIFY.md` ou demander à l'utilisateur.
- DB password : voir env var `DATABASE_URL` dans Coolify app, **ou** récupérable via :
  ```bash
  curl -s -H "Authorization: Bearer $COOLIFY_API_KEY" \
    "$COOLIFY_URL/api/v1/applications/ro0w4o4c8o0ocg04c40soog0/envs" \
    | jq -r '.[] | select(.key=="DATABASE_URL") | .value'
  ```

---

## 2. SCÉNARIO PRINCIPAL — Ajouter un nouveau client en ~20 min

C'est **le scénario que tu vas exécuter le plus souvent**. Il est mécanique.

### 2.1 Inputs à demander à l'utilisateur (UNE seule fois)

Pose ces 5 questions à l'utilisateur avant de commencer :

1. **`TENANT_SLUG`** — kebab-case, ex : `villa-medicis`. Sera utilisé partout (subdomain, repo client, etc.).
2. **`TENANT_NAME`** — nom affiché, ex : `Villa Médicis`.
3. **`TENANT_DOMAIN`** — domaine final du client (custom domain), ex : `villamedicis.fr`. Si pas encore, utiliser `<slug>.157.180.43.90.sslip.io` provisoire.
4. **`CONCIERGE_PERSONA`** — prompt système du concierge IA. **Demande à l'utilisateur de te le rédiger ou de te valider une ébauche.** Inspire-toi de [scripts/templates/tenant.example.json](../scripts/templates/tenant.example.json).
5. **`DB_STRATEGY`** — `"shared"` (95% des cas) OU `"dedicated"` si le client a une exigence stricte (santé, légal, finance, gros corporate avec audit RGPD strict).

Optionnel : `GROQ_MODEL` (défaut `openai/gpt-oss-120b`), `THEME_TOKENS` (couleurs, typo, logo URL), `FEATURE_FLAGS`.

### 2.2 Étape A — Créer la config tenant (JSON)

Crée le fichier `tenants/<slug>.json` (hors du repo Git, ou dans un répertoire de configuration privé) en partant du template :

```bash
cp scripts/templates/tenant.example.json /tmp/tenant-<slug>.json
# Édite /tmp/tenant-<slug>.json en remplaçant les valeurs
```

**Schema attendu** (validé par `scripts/seed-tenant.ts`) :

```json
{
  "slug": "kebab-case-string",
  "name": "Display Name",
  "status": "active",
  "dbStrategy": "shared",
  "dedicatedDbUrl": null,
  "featureFlags": { "concierge": true },
  "themeTokens": { "colors": {}, "typography": {}, "logoUrl": "..." },
  "conciergeConfig": {
    "persona": "Long prompt with TON, CE QUE TU FAIS, CE QUE TU NE FAIS PAS, CONVERSION...",
    "provider": "groq",
    "model": "openai/gpt-oss-120b",
    "temperature": 0.7,
    "enabledTools": [],
    "forbiddenTopics": []
  }
}
```

### 2.3 Étape B — (Seulement si `dbStrategy = "dedicated"`) Provisionner une DB dédiée

**Skip cette étape si shared.** Si dédiée :

```bash
export COOLIFY_URL=http://157.180.43.90:8000
export COOLIFY_API_KEY="..."  # demander à l'user
DB_PASSWORD=$(openssl rand -hex 24)
echo "DB_PASSWORD=$DB_PASSWORD  (à archiver dans un coffre)"

DB_RESPONSE=$(curl -s -X POST -H "Authorization: Bearer $COOLIFY_API_KEY" -H "Content-Type: application/json" \
  -d "{
    \"name\":\"client-<SLUG>-db-prod\",
    \"description\":\"Dedicated Postgres for tenant <SLUG> (Sovereign tier).\",
    \"image\":\"pgvector/pgvector:pg16\",
    \"postgres_user\":\"maison\",
    \"postgres_password\":\"$DB_PASSWORD\",
    \"postgres_db\":\"<slug>_data\",
    \"project_uuid\":\"r80o0c0s48w0ooc0wcwwkwww\",
    \"environment_name\":\"production\",
    \"server_uuid\":\"fgc8c88co0c80goc044swgwc\",
    \"destination_uuid\":\"r8cwo0ckgww84wkkgc8g800g\",
    \"instant_deploy\":true
  }" \
  "$COOLIFY_URL/api/v1/databases/postgresql")

DEDICATED_DB_URL=$(echo "$DB_RESPONSE" | jq -r '.internal_db_url')
echo "Dedicated DB URL : $DEDICATED_DB_URL"
```

Mets cette URL dans `tenants/<slug>.json` sous `dedicatedDbUrl`. Puis **applique les migrations sur cette DB** :

```bash
DATABASE_URL="$DEDICATED_DB_URL" bun run db:migrate
```

**Vérification** : `psql "$DEDICATED_DB_URL" -c "\\dt"` doit lister `tenants`, `concierge_sessions`, `concierge_messages`.

### 2.4 Étape C — Insérer le tenant en DB (mutualisée OU dédiée)

Le script `scripts/seed-tenant.ts` est idempotent : si le slug existe déjà, il met à jour.

**Si shared** : pointe sur la DB mutualisée :

```bash
DATABASE_URL=$(curl -s -H "Authorization: Bearer $COOLIFY_API_KEY" \
  "$COOLIFY_URL/api/v1/applications/ro0w4o4c8o0ocg04c40soog0/envs" \
  | jq -r '.[] | select(.key=="DATABASE_URL") | .value')

# /!\ L'URL interne (b888ccgow804c8gos4gs4s8s) n'est joignable que depuis le réseau Docker "coolify".
# Pour exécuter localement, expose temporairement la DB (cf. section 7.3) OU exécute le script dans le container :
```

**Recommandé : exécuter dans le container Coolify** (réseau interne) :

```bash
# 1. Pousse le fichier de config dans le container via Coolify execute API
APP_UUID=ro0w4o4c8o0ocg04c40soog0

# Encode le JSON en base64 pour le passer dans une command shell sans souci de quoting
CONFIG_B64=$(base64 -i /tmp/tenant-<SLUG>.json)

curl -s -X POST -H "Authorization: Bearer $COOLIFY_API_KEY" -H "Content-Type: application/json" \
  -d "{\"command\":\"echo $CONFIG_B64 | base64 -d > /tmp/tenant.json && bun scripts/seed-tenant.ts /tmp/tenant.json\"}" \
  "$COOLIFY_URL/api/v1/applications/$APP_UUID/execute"
```

**Si dedicated** : exporte `DATABASE_URL` vers la dédiée puis run :

```bash
DATABASE_URL="$DEDICATED_DB_URL" bun scripts/seed-tenant.ts /tmp/tenant-<slug>.json
```

**Vérification** :

```bash
curl -s https://api.maison-core.157.180.43.90.sslip.io/health
# attendu : {"status":"ok"}
```

Puis check que le concierge répond pour ce tenant (cf. 2.7 ci-dessous).

### 2.5 Étape D — Créer le repo frontend client

Convention : `client-<slug>` sous le compte GitHub (ex: `NonoM33/client-villa-medicis`).

**Pour l'instant**, fork ou copie le repo `fwurtz` qui sert de template de référence :

```bash
gh repo create NonoM33/client-<slug> --private --description "Frontend custom pour <name> — consume maison-core."
# Cloner le template fwurtz, retirer .git, init nouveau repo
git clone https://github.com/NonoM33/fwurtz /tmp/client-<slug>
cd /tmp/client-<slug>
rm -rf .git
git init -b main
git remote add origin https://github.com/NonoM33/client-<slug>.git
```

Puis dans ce nouveau repo :
- Remplacer le contenu (textes, images, branding) par celui du client
- Mettre à jour `package.json` : nom = `@client/<slug>`
- Configurer le SDK pour pointer vers `https://api.maison-core.157.180.43.90.sslip.io` avec le `TENANT_SLUG`

> **Note** : à terme, `maison-cli init <slug>` automatisera ce scaffold (Phase 4). En attendant, fork manuel.

### 2.6 Étape E — Déployer le frontend client sur Coolify

```bash
export COOLIFY_URL=http://157.180.43.90:8000
export COOLIFY_API_KEY="..."

# 1. Crée le projet client-<slug>
PROJECT_RESPONSE=$(curl -s -X POST -H "Authorization: Bearer $COOLIFY_API_KEY" -H "Content-Type: application/json" \
  -d "{\"name\":\"client-<SLUG>\",\"description\":\"Frontend <NAME>.\"}" \
  "$COOLIFY_URL/api/v1/projects")
CLIENT_PROJECT_UUID=$(echo "$PROJECT_RESPONSE" | jq -r '.uuid')

# 2. Crée l'env staging
curl -s -X POST -H "Authorization: Bearer $COOLIFY_API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"staging"}' \
  "$COOLIFY_URL/api/v1/projects/$CLIENT_PROJECT_UUID/environments"

# 3. Crée l'app frontend prod (Dockerfile, branche main)
APP_RESPONSE=$(curl -s -X POST -H "Authorization: Bearer $COOLIFY_API_KEY" -H "Content-Type: application/json" \
  -d "{
    \"name\":\"client-<SLUG>-web-prod\",
    \"project_uuid\":\"$CLIENT_PROJECT_UUID\",
    \"environment_name\":\"production\",
    \"server_uuid\":\"fgc8c88co0c80goc044swgwc\",
    \"destination_uuid\":\"r8cwo0ckgww84wkkgc8g800g\",
    \"git_repository\":\"https://github.com/NonoM33/client-<SLUG>\",
    \"git_branch\":\"main\",
    \"build_pack\":\"dockerfile\",
    \"ports_exposes\":\"3000\",
    \"domains\":\"https://app.<SLUG>.157.180.43.90.sslip.io\",
    \"instant_deploy\":false
  }" \
  "$COOLIFY_URL/api/v1/applications/public")
CLIENT_APP_UUID=$(echo "$APP_RESPONSE" | jq -r '.uuid')

# 4. Set env vars
set_env() {
  curl -s -X POST -H "Authorization: Bearer $COOLIFY_API_KEY" -H "Content-Type: application/json" \
    -d "{\"key\":\"$1\",\"value\":$(printf '%s' "$2" | jq -Rsa .),\"is_preview\":false,\"is_literal\":true}" \
    "$COOLIFY_URL/api/v1/applications/$CLIENT_APP_UUID/envs" > /dev/null
}
set_env "NODE_ENV" "production"
set_env "PUBLIC_MAISON_API_URL" "https://api.maison-core.157.180.43.90.sslip.io"
set_env "PUBLIC_TENANT_SLUG" "<SLUG>"

# 5. Trigger deploy
curl -s -X POST -H "Authorization: Bearer $COOLIFY_API_KEY" "$COOLIFY_URL/api/v1/deploy?uuid=$CLIENT_APP_UUID&force=true"
```

### 2.7 Étape F — Vérification E2E

```bash
# 1. Backend healthy ?
curl -fsS https://api.maison-core.157.180.43.90.sslip.io/health
# attendu : {"status":"ok"}

# 2. Le tenant est résolu via subdomain ?
curl -fsS -X POST \
  -H "host: <SLUG>.maison-core.157.180.43.90.sslip.io" \
  -H "content-type: application/json" \
  -d '{"visitorId":"test-1","content":"Bonjour"}' \
  https://api.maison-core.157.180.43.90.sslip.io/api/concierge/chat
# attendu : { "sessionId": "...", "reply": "...", "metadata": { "fallback": false, ... } }
# si metadata.fallback=true → la clé GROQ_API_KEY est manquante ou invalide (cf. section 4.3)

# 3. Le frontend tourne ?
curl -fsS https://app.<SLUG>.157.180.43.90.sslip.io
```

**Si tout est vert → le client est en prod. Communique au user :**
- URL frontend : `https://app.<SLUG>.157.180.43.90.sslip.io`
- Tenant en DB : OK
- Concierge fonctionnel : OK

### 2.8 Custom domain (optionnel)

Quand le client fournit son domaine (`villamedicis.fr`) :

```bash
# 1. Update domain sur l'app frontend
curl -s -X PATCH -H "Authorization: Bearer $COOLIFY_API_KEY" -H "Content-Type: application/json" \
  -d "{\"domains\":\"https://villamedicis.fr\"}" \
  "$COOLIFY_URL/api/v1/applications/$CLIENT_APP_UUID"

# 2. Le client doit pointer son DNS A vers 157.180.43.90
# 3. Si le concierge doit aussi être accessible via le domaine client (pas obligatoire — il peut rester sur api.maison-core.*),
#    ajouter une route Traefik supplémentaire OU laisser le SDK appeler directement api.maison-core.* (recommandé).
```

---

## 3. Ajouter / améliorer une feature globale (utilisée par tous les clients)

Le coeur de la promesse Maison : **1 deploy → tout le monde en bénéficie**.

### Workflow

1. **Brancher sur `stg`** localement :
   ```bash
   cd maison-core
   git checkout stg && git pull
   git checkout -b feat/<nom-feature>
   ```

2. **TDD** : test d'abord, puis impl. Respecter [docs/adr/0001-platform-architecture.md](./adr/0001-platform-architecture.md).
   ```bash
   bun test --watch
   ```

3. **Vérifier** : `bun run check` doit passer (typecheck strict + Biome + tests).

4. **Push & merge** sur `stg` → auto-deploy sur staging (cf. section 6 pour setup `stg` env Coolify).

5. **Tester sur staging** : `https://stg-api.maison-core.157.180.43.90.sslip.io/health` + l'endpoint touché.

6. **Merge `stg` → `main`** → auto-deploy en prod. Tous les clients en bénéficient instantanément (côté backend). Côté SDK frontend : bump de version → Renovate ouvre les PRs sur les repos `client-*`.

### Règle absolue

Si tu te retrouves à écrire `if (tenant.slug === "...")` ou `if (tenant.id === "...")` dans `maison-core`, **STOP**. La bonne réponse est :
- Ajouter un champ dans `featureFlags` (booléen) ou `conciergeConfig` (config) côté `tenants`.
- Lire ce champ pour brancher le comportement.
- Le client active/désactive la feature via son JSON de tenant.

---

## 4. Troubleshooting

### 4.1 `running:unhealthy` au déploiement

**Cause probable** : le healthcheck Docker échoue.

```bash
# Récupère les logs du dernier deployment
curl -s -H "Authorization: Bearer $COOLIFY_API_KEY" \
  "$COOLIFY_URL/api/v1/applications/<APP_UUID>/deployments" \
  | jq '.[0] | {status, deployment_uuid}'

curl -s -H "Authorization: Bearer $COOLIFY_API_KEY" \
  "$COOLIFY_URL/api/v1/deployments/<DEPLOYMENT_UUID>" \
  | jq -r '.logs | fromjson | .[] | .output' | tail -30
```

**Fixes courants** :
- Healthcheck utilise `wget` mais l'image n'en a pas → utiliser `bun -e "fetch(...)"` (cf. notre `Dockerfile`).
- Port mal exposé : `EXPOSE 3000` dans le Dockerfile **et** `ports_exposes: "3000"` côté Coolify doivent matcher.
- Migration échoue au boot : check `DATABASE_URL` (réseau, password, nom de DB).

### 4.2 Migration échoue avec `relation "tenants" does not exist`

```bash
# Reset migrations sur la DB (DESTRUCTIF — confirme avec l'user)
curl -s -X POST -H "Authorization: Bearer $COOLIFY_API_KEY" -H "Content-Type: application/json" \
  -d '{"command":"bun run db:migrate"}' \
  "$COOLIFY_URL/api/v1/applications/<APP_UUID>/execute"
```

### 4.3 Concierge retourne `metadata.fallback: true`

**Cause** : le LLM provider (Groq) est down ou la clé est invalide.

```bash
# Vérifie que GROQ_API_KEY est définie et valide
curl -s -H "Authorization: Bearer $COOLIFY_API_KEY" \
  "$COOLIFY_URL/api/v1/applications/ro0w4o4c8o0ocg04c40soog0/envs" \
  | jq '.[] | select(.key=="GROQ_API_KEY")'

# Update si placeholder
ENV_UUID=<uuid-de-GROQ_API_KEY>
curl -s -X PATCH -H "Authorization: Bearer $COOLIFY_API_KEY" -H "Content-Type: application/json" \
  -d "{\"value\":\"<VRAIE_CLE_GROQ>\"}" \
  "$COOLIFY_URL/api/v1/applications/ro0w4o4c8o0ocg04c40soog0/envs/$ENV_UUID"

# Redémarre l'app pour prendre en compte
curl -s -X POST -H "Authorization: Bearer $COOLIFY_API_KEY" \
  "$COOLIFY_URL/api/v1/applications/ro0w4o4c8o0ocg04c40soog0/restart"
```

### 4.4 `tenant_not_resolved` (HTTP 400) sur /api/concierge/chat

Le header `Host` ne contient pas de subdomain extractible. Le SDK frontend doit envoyer un Host de la forme `<slug>.<base>`. Quand on test depuis curl, il faut forcer le header :

```bash
curl -H "host: <slug>.maison-core.157.180.43.90.sslip.io" ...
```

---

## 5. Rollback

### Rollback d'un déploiement (revenir au précédent)

```bash
# Liste les deployments récents
curl -s -H "Authorization: Bearer $COOLIFY_API_KEY" \
  "$COOLIFY_URL/api/v1/applications/<APP_UUID>/deployments" \
  | jq '.[0:5] | .[] | {uuid, commit, status, created_at}'

# Redéploie sur un commit précédent (Coolify utilise la branche → faut force-push la branche)
git push -f origin <PREVIOUS_SHA>:main
# OU : revert via PR
git revert HEAD && git push
```

### Rollback d'une migration DB

Drizzle ne génère pas de migrations "down". Pour rollback une migration :
1. Restaurer un dump (cf. 7.4 backups)
2. Ou écrire manuellement le rollback SQL et l'exécuter via `psql`

**Donc avant toute migration potentiellement destructive** : prendre un snapshot.

---

## 6. Workflow Git

Convention stricte :
- Branche `main` → **production** (auto-deploy sur `maison-core-backend-prod`)
- Branche `stg` → **staging** (auto-deploy sur `maison-core-backend-stg`)
- Feature branches → PR vers `stg` d'abord, puis merge `stg → main` après validation

**Pour activer le staging Coolify** (à faire une fois) :

```bash
# Crée l'app staging
curl -s -X POST -H "Authorization: Bearer $COOLIFY_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "name":"maison-core-backend-stg",
    "project_uuid":"r80o0c0s48w0ooc0wcwwkwww",
    "environment_name":"staging",
    "server_uuid":"fgc8c88co0c80goc044swgwc",
    "destination_uuid":"r8cwo0ckgww84wkkgc8g800g",
    "git_repository":"https://github.com/NonoM33/maison-core",
    "git_branch":"stg",
    "build_pack":"dockerfile",
    "ports_exposes":"3000",
    "domains":"https://stg-api.maison-core.157.180.43.90.sslip.io",
    "instant_deploy":false
  }' \
  "$COOLIFY_URL/api/v1/applications/public"
# Set env vars : DATABASE_URL pointant vers une 2e DB staging (à provisionner), GROQ_API_KEY (même clé OK), etc.
```

---

## 7. Annexes

### 7.1 Env vars requises sur l'app `maison-core-backend-prod`

| Key | Exemple | Notes |
|---|---|---|
| `NODE_ENV` | `production` | |
| `PORT` | `3000` | Match `EXPOSE` Dockerfile et `ports_exposes` Coolify |
| `DATABASE_URL` | `postgres://maison:***@<db-uuid>:5432/maison_core` | URL interne Coolify |
| `GROQ_API_KEY` | `gsk_***` | À obtenir sur https://console.groq.com |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | Reasoning model, prouvé sur fwurtz |

### 7.2 Schema Drizzle actuel

3 tables :
- `tenants` (id, slug, name, status, db_strategy, dedicated_db_url, theme_tokens, feature_flags, concierge_config, timestamps)
- `concierge_sessions` (id, tenant_id, visitor_id, page, started_at, last_activity_at)
- `concierge_messages` (id, tenant_id, session_id, role, content, metadata, created_at)

Avec FKs en cascade : delete tenant → delete sessions → delete messages.

### 7.3 Exposer temporairement la DB pour debug

```bash
# DANS COOLIFY UI → Database → "Make it public" (ouvre un port public éphémère)
# OU via API si exposé
```

**À refermer immédiatement** après usage.

### 7.4 Backup DB

```bash
# Manuel
curl -s -X POST -H "Authorization: Bearer $COOLIFY_API_KEY" \
  "$COOLIFY_URL/api/v1/databases/b888ccgow804c8gos4gs4s8s/backups"
```

Coolify a aussi un mécanisme de backups récurrents — à configurer dans l'UI Database → Backups.

### 7.5 Conventions de naming (rappel)

- Projet Coolify : `maison-core`, `client-<slug>`
- Application : `<projet>-<service>-<env>` ex `maison-core-backend-prod`, `client-fwurtz-web-prod`
- Domain prod : `<service>.<projet>.157.180.43.90.sslip.io`
- Domain stg : `stg-<service>.<projet>.157.180.43.90.sslip.io`
- Repo : `maison-core`, `client-<slug>`
- Branche Git : `main` (prod), `stg` (staging)
- Tenant slug : kebab-case, ASCII, 2-64 chars
