import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Local secret storage. Never logged, never committed (`data/` is gitignored),
 * file permissions 0600. The token is only read by the server process.
 */
const DATA_DIR = process.env.TT_DATA_DIR ?? path.join(process.cwd(), 'data');
const SECRETS_FILE = path.join(DATA_DIR, 'secrets.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

interface SecretsFile {
  tinkoffToken?: string;
  aiApiKey?: string;
}

interface ConfigFile {
  aiProvider?: 'openai' | 'anthropic';
  aiModel?: string;
}

async function readJson<T>(file: string): Promise<Partial<T>> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as Partial<T>;
  } catch {
    return {};
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  await fs.chmod(temp, 0o600).catch(() => undefined);
  await fs.rename(temp, file);
}

export async function getToken(): Promise<string | null> {
  const data = await readJson<SecretsFile>(SECRETS_FILE);
  return data.tinkoffToken?.trim() || null;
}

export async function setToken(token: string): Promise<void> {
  const trimmed = token.trim();
  if (!trimmed) throw new Error('Токен пуст');
  if (trimmed.length > 512) throw new Error('Слишком длинный токен');
  const data = await readJson<SecretsFile>(SECRETS_FILE);
  await writeJson(SECRETS_FILE, { ...data, tinkoffToken: trimmed });
}

export async function clearToken(): Promise<void> {
  const data = await readJson<SecretsFile>(SECRETS_FILE);
  delete data.tinkoffToken;
  await writeJson(SECRETS_FILE, data);
}

export function maskToken(token: string | null): string | undefined {
  if (!token) return undefined;
  if (token.length <= 8) return '••••';
  return `${token.slice(0, 2)}••••${token.slice(-4)}`;
}

export interface AiConfig {
  provider: 'openai' | 'anthropic';
  model: string;
  hasKey: boolean;
}

export async function getAiConfig(): Promise<AiConfig> {
  const [config, secrets] = await Promise.all([readJson<ConfigFile>(CONFIG_FILE), readJson<SecretsFile>(SECRETS_FILE)]);
  return {
    provider: config.aiProvider ?? 'openai',
    model: config.aiModel ?? (config.aiProvider === 'anthropic' ? 'claude-3-5-haiku-latest' : 'gpt-4o-mini'),
    hasKey: Boolean(secrets.aiApiKey),
  };
}

export async function setAiConfig(input: {
  provider: 'openai' | 'anthropic';
  model: string;
  apiKey?: string;
}): Promise<AiConfig> {
  const config = await readJson<ConfigFile>(CONFIG_FILE);
  await writeJson(CONFIG_FILE, {
    ...config,
    aiProvider: input.provider,
    aiModel: input.model.trim() || 'gpt-4o-mini',
  });
  if (input.apiKey !== undefined) {
    const secrets = await readJson<SecretsFile>(SECRETS_FILE);
    if (input.apiKey.trim()) {
      await writeJson(SECRETS_FILE, { ...secrets, aiApiKey: input.apiKey.trim() });
    } else {
      delete secrets.aiApiKey;
      await writeJson(SECRETS_FILE, secrets);
    }
  }
  return getAiConfig();
}

export async function getAiApiKey(): Promise<string | null> {
  const secrets = await readJson<SecretsFile>(SECRETS_FILE);
  return secrets.aiApiKey?.trim() || null;
}
