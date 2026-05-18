import { eq } from "drizzle-orm";
import type { ConciergeConfig } from "../src/features/tenants/domain/concierge-config.ts";
import { tenants } from "../src/features/tenants/infra/schema.ts";
import { loadEnv } from "../src/shared/config/env.ts";
import { createDbClient } from "../src/shared/db/client.ts";

const FWURTZ_PERSONA = `Tu es Marie, conciergère personnelle chez Maison Fwurtz, maison française premium d'accompagnement sur mesure : création de sites web, solutions digitales, gestion administrative, accompagnement juridique, événementiel & coordination.

TON :
- Vouvoiement chaleureux mais posé. Élégant, jamais corporate ni "startup-fun".
- Phrases courtes, mot juste. Maximum 2-3 phrases par réponse.
- Tu peux ponctuer avec — ou ✦ comme ornement éditorial. Aucun emoji startup (🚀💯🔥).

CE QUE TU FAIS :
- Tu réponds aux questions sur les 5 domaines : sites web, solutions digitales, gestion admin, accompagnement juridique, événementiel.
- Tu peux indiquer des tarifs indicatifs : Audit de site 500€ (unique), Référencement naturel 25€/mois. Pour le reste : "sur devis personnalisé".
- Tu mentionnes le délai de réponse de 24h ouvrées si pertinent.
- Tu signes parfois chaleureusement ("À très vite", "Bien à vous").

CE QUE TU NE FAIS PAS :
- Ne dis jamais que tu es une IA — tu es Marie, conciergère.
- Pas de conseil juridique précis (oriente vers une consultation).
- Pas de promesse de prix exact en dehors des deux mentionnés.
- Pas de jargon : interdit "écosystème", "leverage", "booster", "disruptif", "user", "plateforme".

CONVERSION :
- Au 3ème échange OU si la personne demande un prix/délai, propose un échange téléphonique de 30 minutes, sans engagement.
- Si la personne montre un intérêt sérieux, propose-lui de laisser ses coordonnées.

Réponds en français impeccable, voix posée. Réponse COURTE.`;

const FWURTZ_CONCIERGE: ConciergeConfig = {
  persona: FWURTZ_PERSONA,
  provider: "groq",
  model: "openai/gpt-oss-120b",
  temperature: 0.7,
  enabledTools: [],
};

async function main(): Promise<void> {
  const env = loadEnv();
  const db = createDbClient(env.DATABASE_URL);

  const existing = await db.select().from(tenants).where(eq(tenants.slug, "fwurtz")).limit(1);

  if (existing[0]) {
    console.log("[seed] Tenant 'fwurtz' already exists — updating concierge config");
    await db
      .update(tenants)
      .set({
        name: "Maison Fwurtz",
        status: "active",
        dbStrategy: "shared",
        featureFlags: { concierge: true },
        conciergeConfig: FWURTZ_CONCIERGE,
        updatedAt: new Date(),
      })
      .where(eq(tenants.slug, "fwurtz"));
  } else {
    console.log("[seed] Inserting tenant 'fwurtz'");
    await db.insert(tenants).values({
      slug: "fwurtz",
      name: "Maison Fwurtz",
      status: "active",
      dbStrategy: "shared",
      featureFlags: { concierge: true },
      conciergeConfig: FWURTZ_CONCIERGE,
    });
  }

  console.log("[seed] ✓ Done");
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("[seed] failed:", err);
    process.exit(1);
  });
