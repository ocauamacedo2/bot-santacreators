import "dotenv/config";
import { parse } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(".env");
const fileEnv = existsSync(envPath)
  ? parse(readFileSync(envPath, "utf8"))
  : {};

const fileBridge = String(fileEnv.BRIDGE_SECRET || "").trim();
const fileShare = String(fileEnv.SANTA_SHARE_BRIDGE_SECRET || "").trim();
let source = "ambiente";

if (fileBridge && fileShare) {
  if (fileBridge !== fileShare) {
    throw new Error("[SANTA BOT ENV] Os segredos do arquivo .env são diferentes.");
  }

  if (fileBridge.length < 64) {
    throw new Error("[SANTA BOT ENV] O segredo da ponte precisa ter pelo menos 64 caracteres.");
  }

  process.env.BRIDGE_SECRET = fileBridge;
  process.env.SANTA_SHARE_BRIDGE_SECRET = fileShare;
  source = "arquivo .env";
}

const bridge = String(process.env.BRIDGE_SECRET || "").trim();
const share = String(process.env.SANTA_SHARE_BRIDGE_SECRET || "").trim();

if (bridge && share && bridge !== share) {
  throw new Error("[SANTA BOT ENV] Os segredos efetivos da ponte são diferentes.");
}

const secret = share || bridge;

if (secret.length < 64) {
  throw new Error("[SANTA BOT ENV] Configure um segredo de ponte com pelo menos 64 caracteres.");
}

process.env.BRIDGE_SECRET = secret;
process.env.SANTA_SHARE_BRIDGE_SECRET = secret;

console.log("[SANTA BOT ENV] Ponte configurada:", {
  fonte: source,
  arquivoEnvExiste: existsSync(envPath),
  bridgeTamanho: secret.length,
  shareTamanho: secret.length,
  iguais: true,
});