import fs from "fs";
import path from "path";
import { AIProvider, StudioSettings } from "@/types/studio";

const SETTINGS_FILE = path.join(process.cwd(), "studio-settings.json");
const ENV_LOCAL_FILE = path.join(process.cwd(), ".env.local");

function getSettingsLocations(): string[] {
  const locs = [SETTINGS_FILE];
  try {
    const parent = path.join(process.cwd(), "..", "studio-settings.json");
    if (fs.existsSync(parent)) locs.push(path.resolve(parent));
    const grandparent = path.join(process.cwd(), "..", "..", "studio-settings.json");
    if (fs.existsSync(grandparent)) locs.push(path.resolve(grandparent));
  } catch { }
  return Array.from(new Set(locs));
}

function getEnvLocations(): string[] {
  const locs = [ENV_LOCAL_FILE];
  try {
    const parent = path.join(process.cwd(), "..", ".env.local");
    if (fs.existsSync(parent)) locs.push(path.resolve(parent));
    const grandparent = path.join(process.cwd(), "..", "..", ".env.local");
    if (fs.existsSync(grandparent)) locs.push(path.resolve(grandparent));
  } catch { }
  return Array.from(new Set(locs));
}

const VALID_PROVIDERS: AIProvider[] = ["sangtao", "gemini", "openai"];

function normalizeProvider(value: unknown): AIProvider {
  return VALID_PROVIDERS.includes(value as AIProvider) ? (value as AIProvider) : "sangtao";
}

export function getDefaultSettings(): StudioSettings {
  return {
    defaultProvider: normalizeProvider(process.env.DEFAULT_AI_PROVIDER),
    sangtaoApiKey: process.env.SANGTAO_API_KEY || "",
    geminiApiKey: process.env.GEMINI_API_KEY || "",
    geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash-image",
    openaiApiKey: process.env.OPENAI_API_KEY || "",
    openaiModel: process.env.OPENAI_MODEL || "gpt-image-1",
    enableMockMode: false,
    outputDirectory: "output_collections",
  };
}

/** Only keep fields that belong to StudioSettings (drops legacy Cloudflare / Stability / JTHT keys). */
function sanitize(input: Record<string, any>, defaults: StudioSettings): StudioSettings {
  return {
    defaultProvider: normalizeProvider(input.defaultProvider),
    sangtaoApiKey: typeof input.sangtaoApiKey === "string" ? input.sangtaoApiKey.trim() : (defaults.sangtaoApiKey || ""),
    geminiApiKey: typeof input.geminiApiKey === "string" ? input.geminiApiKey.trim() : (defaults.geminiApiKey || ""),
    geminiModel: input.geminiModel || defaults.geminiModel,
    openaiApiKey: typeof input.openaiApiKey === "string" ? input.openaiApiKey.trim() : (defaults.openaiApiKey || ""),
    openaiModel: input.openaiModel || defaults.openaiModel,
    enableMockMode: Boolean(input.enableMockMode),
    outputDirectory: input.outputDirectory || defaults.outputDirectory,
  };
}

export function loadSettings(): StudioSettings {
  const defaults = getDefaultSettings();
  if (!fs.existsSync(SETTINGS_FILE)) {
    return defaults;
  }
  try {
    // Strip UTF-8 BOM (\uFEFF) if file was created by Windows PowerShell Set-Content -Encoding UTF8
    const raw = fs.readFileSync(SETTINGS_FILE, "utf-8").replace(/^\uFEFF/, "").trim();
    if (!raw) return defaults;
    return sanitize(JSON.parse(raw), defaults);
  } catch (err) {
    console.warn("Auto-healing studio-settings.json (removing BOM / invalid format)...");
    try {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(defaults, null, 2), "utf-8");
    } catch { }
    return defaults;
  }
}

export function saveSettings(newSettings: Partial<StudioSettings>): StudioSettings {
  const current = loadSettings();
  const merged = sanitize({ ...current, ...newSettings }, getDefaultSettings());

  // 1. Save to all relevant studio-settings.json locations
  const settingPaths = getSettingsLocations();
  for (const sPath of settingPaths) {
    try {
      fs.writeFileSync(sPath, JSON.stringify(merged, null, 2), "utf-8");
    } catch { }
  }

  // 2. Also persist to .env.local for standard Node.js persistence
  try {
    const envPaths = getEnvLocations();
    for (const ePath of envPaths) {
      let envContent = "";
      if (fs.existsSync(ePath)) {
        envContent = fs.readFileSync(ePath, "utf-8");
      }

      const envMap: Record<string, string> = {};
      envContent.split("\n").forEach((line) => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
          envMap[match[1].trim()] = match[2].trim();
        }
      });

      // Drop legacy keys of removed providers
      delete envMap["CF_ACCOUNT_ID"];
      delete envMap["CF_API_TOKEN"];
      delete envMap["SANGTAO_MODEL"];
      delete envMap["STABILITY_API_KEY"];
      delete envMap["JTHT_API_KEY"];
      delete envMap["JTHT_MODEL"];
      delete envMap["JTHT_BASE_URL"];
      delete process.env.JTHT_API_KEY;
      delete process.env.JTHT_MODEL;
      delete process.env.JTHT_BASE_URL;

      // Update or clear each API Key explicitly
      if (merged.sangtaoApiKey !== undefined) {
        if (merged.sangtaoApiKey) {
          envMap["SANGTAO_API_KEY"] = merged.sangtaoApiKey;
          process.env.SANGTAO_API_KEY = merged.sangtaoApiKey;
        } else {
          delete envMap["SANGTAO_API_KEY"];
          delete process.env.SANGTAO_API_KEY;
        }
      }
      if (merged.geminiApiKey !== undefined) {
        if (merged.geminiApiKey) {
          envMap["GEMINI_API_KEY"] = merged.geminiApiKey;
          process.env.GEMINI_API_KEY = merged.geminiApiKey;
        } else {
          delete envMap["GEMINI_API_KEY"];
          delete process.env.GEMINI_API_KEY;
        }
      }
      if (merged.openaiApiKey !== undefined) {
        if (merged.openaiApiKey) {
          envMap["OPENAI_API_KEY"] = merged.openaiApiKey;
          process.env.OPENAI_API_KEY = merged.openaiApiKey;
        } else {
          delete envMap["OPENAI_API_KEY"];
          delete process.env.OPENAI_API_KEY;
        }
      }
      if (merged.defaultProvider) {
        envMap["DEFAULT_AI_PROVIDER"] = merged.defaultProvider;
        process.env.DEFAULT_AI_PROVIDER = merged.defaultProvider;
      }

      const updatedEnv = Object.entries(envMap)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n");
      fs.writeFileSync(ePath, updatedEnv, "utf-8");
    }
  } catch (err) {
    console.warn("Could not sync to .env.local:", err);
  }

  return merged;
}

export function clearAllApiKeys(): StudioSettings {
  return saveSettings({
    sangtaoApiKey: "",
    geminiApiKey: "",
    openaiApiKey: "",
  });
}
