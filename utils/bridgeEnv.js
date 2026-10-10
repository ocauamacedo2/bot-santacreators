import { config as loadEnv, parse } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(".env");
const arquivoEnvExiste = existsSync(envPath);

const hostedBridge = String(
  process.env.BRIDGE_SECRET || ""
).trim();

const hostedShare = String(
  process.env.SANTA_SHARE_BRIDGE_SECRET || ""
).trim();

const fileEnv = arquivoEnvExiste
  ? parse(readFileSync(envPath, "utf8"))
  : {};

loadEnv({
  path: envPath,
  override: false,
});

const fileBridge = String(
  fileEnv.BRIDGE_SECRET || ""
).trim();

const fileShare = String(
  fileEnv.SANTA_SHARE_BRIDGE_SECRET || ""
).trim();

const useFileSecret = Boolean(
  fileBridge || fileShare
);

if (
  useFileSecret &&
  (!fileBridge || !fileShare)
) {
  throw new Error(
    "[SANTA BOT ENV] Preencha BRIDGE_SECRET e SANTA_SHARE_BRIDGE_SECRET no .env com o mesmo valor."
  );
}

const bridge = useFileSecret
  ? fileBridge
  : hostedBridge;

const share = useFileSecret
  ? fileShare
  : hostedShare;

if (
  bridge &&
  share &&
  bridge !== share
) {
  throw new Error(
    "[SANTA BOT ENV] BRIDGE_SECRET e SANTA_SHARE_BRIDGE_SECRET possuem valores diferentes."
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
  fonte: useFileSecret ? "arquivo .env" : "ambiente",
  arquivoEnvExiste,
  bridgeTamanho: secret.length,
  shareTamanho: secret.length,
  iguais: process.env.BRIDGE_SECRET === process.env.SANTA_SHARE_BRIDGE_SECRET,
  arquivoBridgeIgualAoEfetivo:
    Boolean(fileBridge) &&
    fileBridge === process.env.BRIDGE_SECRET,
  arquivoShareIgualAoEfetivo:
    Boolean(fileShare) &&
    fileShare === process.env.SANTA_SHARE_BRIDGE_SECRET,
});