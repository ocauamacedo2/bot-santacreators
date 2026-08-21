import fs from "node:fs";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import { dashEmit } from "./dashHub.js";

const TZ = "America/Sao_Paulo";

const DATA_DIR = path.resolve(process.cwd(), "data");

const TICKET_OPERATIONAL_FILE = path.join(
  DATA_DIR,
  "sc_ticket_operational.json"
);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const GEMINI_MODEL =
  String(process.env.GEMINI_MODEL || "").trim() ||
  "gemini-3.6-flash";