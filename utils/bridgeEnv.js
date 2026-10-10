import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(".env");

const hostedBridge = String(
  process.env.BRIDGE_SECRET || ""
).trim();

const hostedShare = String(
  process.env.SANTA_SHARE_BRIDGE_SECRET || ""
).trim();

const hasHostedSecret = Boolean(
  hostedBridge || hostedShare
);

loadEnv({
  path: envPath,
  override: false,
});

const bridge = hasHostedSecret
  ? hostedBridge
  : String(process.env.BRIDGE_SECRET || "").trim();

const share = hasHostedSecret
  ? hostedShare
  : String(process.env.SANTA_SHARE_BRIDGE_SECRET || "").trim();

if (bridge && share && bridge !== share) {
  throw new Error(
    "[SANTA BOT ENV] Os segredos efetivos da ponte são diferentes."
  );
}

const secret = share || bridge;

if (secret.length < 64) {
  throw new Error(
    "[SANTA BOT ENV] Configure um segredo de ponte com pelo menos 64 caracteres."
  );
}

process.env.BRIDGE_SECRET = secret;
process.env.SANTA_SHARE_BRIDGE_SECRET = secret;

console.log("[SANTA BOT ENV] Ponte configurada:", {
  fonte: hasHostedSecret
    ? "ambiente"
    : "arquivo .env",
  arquivoEnvExiste: existsSync(envPath),
  bridgeTamanho: secret.length,
  shareTamanho: secret.length,
  iguais: true,
});