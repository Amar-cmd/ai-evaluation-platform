import "server-only";

export type AiEvaluationProvider =
  | "mock"
  | "openrouter"
  | "openai"
  | "gemini"
  | "ollama"
  | "hybrid";

export type AiMappingProvider =
  | "heuristic"
  | "mock"
  | "openrouter"
  | "openai"
  | "gemini"
  | "ollama"
  | "hybrid";

export type AiOnlineProvider = "openrouter" | "openai" | "gemini";

export type AiLocalProvider = "ollama";

export type AiProviderConfig = {
  evaluationProvider: AiEvaluationProvider;
  mappingProvider: AiMappingProvider;
  onlineProvider: AiOnlineProvider;
  localProvider: AiLocalProvider;

  safety: {
    timeoutMs: number;
    evaluationBatchSize: number;
    maxStudentAnswerChars: number;
    maxModelAnswerChars: number;
    maxQuestionChars: number;
    maxRubricChars: number;
  };

  openrouter: {
    apiKey: string;
    baseUrl: string;
    evaluationModel: string;
    mappingModel: string;
    siteUrl: string;
    appName: string;
  };

  openai: {
    apiKey: string;
    evaluationModel: string;
    mappingModel: string;
  };

  gemini: {
    apiKey: string;
    evaluationModel: string;
    mappingModel: string;
  };

  ollama: {
    baseUrl: string;
    evaluationModel: string;
    mappingModel: string;
  };
};

const EVALUATION_PROVIDERS: AiEvaluationProvider[] = [
  "mock",
  "openrouter",
  "openai",
  "gemini",
  "ollama",
  "hybrid",
];

const MAPPING_PROVIDERS: AiMappingProvider[] = [
  "heuristic",
  "mock",
  "openrouter",
  "openai",
  "gemini",
  "ollama",
  "hybrid",
];

const ONLINE_PROVIDERS: AiOnlineProvider[] = [
  "openrouter",
  "openai",
  "gemini",
];

const LOCAL_PROVIDERS: AiLocalProvider[] = ["ollama"];

export function getAiProviderConfig(): AiProviderConfig {
  return {
    evaluationProvider: readEnumEnv(
      "AI_EVALUATION_PROVIDER",
      EVALUATION_PROVIDERS,
      "mock",
    ),
    mappingProvider: readEnumEnv(
      "AI_MAPPING_PROVIDER",
      MAPPING_PROVIDERS,
      "heuristic",
    ),
    onlineProvider: readEnumEnv(
      "AI_ONLINE_PROVIDER",
      ONLINE_PROVIDERS,
      "openrouter",
    ),
    localProvider: readEnumEnv("AI_LOCAL_PROVIDER", LOCAL_PROVIDERS, "ollama"),

    safety: {
      timeoutMs: readPositiveIntegerEnv("AI_PROVIDER_TIMEOUT_MS", 60000),
      evaluationBatchSize: readPositiveIntegerEnv("AI_EVALUATION_BATCH_SIZE", 5),
      maxStudentAnswerChars: readPositiveIntegerEnv(
        "AI_MAX_STUDENT_ANSWER_CHARS",
        12000,
      ),
      maxModelAnswerChars: readPositiveIntegerEnv(
        "AI_MAX_MODEL_ANSWER_CHARS",
        6000,
      ),
      maxQuestionChars: readPositiveIntegerEnv("AI_MAX_QUESTION_CHARS", 4000),
      maxRubricChars: readPositiveIntegerEnv("AI_MAX_RUBRIC_CHARS", 4000),
    },

    openrouter: {
      apiKey: readStringEnv("OPENROUTER_API_KEY"),
      baseUrl: readStringEnv("OPENROUTER_BASE_URL"),
      evaluationModel: readStringEnv("OPENROUTER_EVALUATION_MODEL"),
      mappingModel: readStringEnv("OPENROUTER_MAPPING_MODEL"),
      siteUrl: readStringEnv("OPENROUTER_SITE_URL"),
      appName: readStringEnv("OPENROUTER_APP_NAME", "AI Evaluation Platform"),
    },

    openai: {
      apiKey: readStringEnv("OPENAI_API_KEY"),
      evaluationModel: readStringEnv("OPENAI_EVALUATION_MODEL"),
      mappingModel: readStringEnv("OPENAI_MAPPING_MODEL"),
    },

    gemini: {
      apiKey: readStringEnv("GEMINI_API_KEY"),
      evaluationModel: readStringEnv("GEMINI_EVALUATION_MODEL"),
      mappingModel: readStringEnv("GEMINI_MAPPING_MODEL"),
    },

    ollama: {
      baseUrl: readStringEnv("OLLAMA_BASE_URL", "http://localhost:11434"),
      evaluationModel: readStringEnv("OLLAMA_EVALUATION_MODEL"),
      mappingModel: readStringEnv("OLLAMA_MAPPING_MODEL"),
    },
  };
}

export function getAiProviderRuntimeSummary() {
  const config = getAiProviderConfig();

  return {
    evaluationProvider: config.evaluationProvider,
    mappingProvider: config.mappingProvider,
    onlineProvider: config.onlineProvider,
    localProvider: config.localProvider,

    evaluationModel: getEvaluationModelName(config),
    mappingModel: getMappingModelName(config),

    hasOpenRouterKey: Boolean(config.openrouter.apiKey),
    hasOpenAiKey: Boolean(config.openai.apiKey),
    hasGeminiKey: Boolean(config.gemini.apiKey),

    safety: config.safety,
  };
}

export function assertEvaluationProviderConfigured(config = getAiProviderConfig()) {
  if (config.evaluationProvider === "mock") {
    return;
  }

  if (config.evaluationProvider === "hybrid") {
    assertOnlineProviderConfigured(config.onlineProvider, config);
    assertLocalProviderConfigured(config.localProvider, config);
    return;
  }

  if (config.evaluationProvider === "ollama") {
    assertLocalProviderConfigured("ollama", config);
    return;
  }

  assertOnlineProviderConfigured(config.evaluationProvider, config);
}

export function assertMappingProviderConfigured(config = getAiProviderConfig()) {
  if (config.mappingProvider === "heuristic" || config.mappingProvider === "mock") {
    return;
  }

  if (config.mappingProvider === "hybrid") {
    assertOnlineProviderConfigured(config.onlineProvider, config);
    assertLocalProviderConfigured(config.localProvider, config);
    return;
  }

  if (config.mappingProvider === "ollama") {
    assertLocalProviderConfigured("ollama", config);
    return;
  }

  assertOnlineProviderConfigured(config.mappingProvider, config);
}

export function getEvaluationModelName(config = getAiProviderConfig()) {
  switch (config.evaluationProvider) {
    case "mock":
      return "mock";
    case "openrouter":
      return config.openrouter.evaluationModel;
    case "openai":
      return config.openai.evaluationModel;
    case "gemini":
      return config.gemini.evaluationModel;
    case "ollama":
      return config.ollama.evaluationModel;
    case "hybrid":
      return getHybridEvaluationModelName(config);
    default:
      return "unknown";
  }
}

export function getMappingModelName(config = getAiProviderConfig()) {
  switch (config.mappingProvider) {
    case "heuristic":
      return "heuristic";
    case "mock":
      return "mock";
    case "openrouter":
      return config.openrouter.mappingModel;
    case "openai":
      return config.openai.mappingModel;
    case "gemini":
      return config.gemini.mappingModel;
    case "ollama":
      return config.ollama.mappingModel;
    case "hybrid":
      return getHybridMappingModelName(config);
    default:
      return "unknown";
  }
}

function getHybridEvaluationModelName(config: AiProviderConfig) {
  const onlineModel = getOnlineEvaluationModelName(config.onlineProvider, config);
  const localModel = config.ollama.evaluationModel;

  return `${config.onlineProvider}:${onlineModel || "not-set"} + ${config.localProvider}:${
    localModel || "not-set"
  }`;
}

function getHybridMappingModelName(config: AiProviderConfig) {
  const onlineModel = getOnlineMappingModelName(config.onlineProvider, config);
  const localModel = config.ollama.mappingModel;

  return `${config.onlineProvider}:${onlineModel || "not-set"} + ${config.localProvider}:${
    localModel || "not-set"
  }`;
}

function assertOnlineProviderConfigured(
  provider: AiOnlineProvider,
  config: AiProviderConfig,
) {
  if (provider === "openrouter") {
    assertRequiredEnv(config.openrouter.apiKey, "OPENROUTER_API_KEY");
    assertRequiredEnv(
      config.openrouter.evaluationModel,
      "OPENROUTER_EVALUATION_MODEL",
    );
    return;
  }

  if (provider === "openai") {
    assertRequiredEnv(config.openai.apiKey, "OPENAI_API_KEY");
    assertRequiredEnv(config.openai.evaluationModel, "OPENAI_EVALUATION_MODEL");
    return;
  }

  if (provider === "gemini") {
    assertRequiredEnv(config.gemini.apiKey, "GEMINI_API_KEY");
    assertRequiredEnv(config.gemini.evaluationModel, "GEMINI_EVALUATION_MODEL");
    return;
  }
}

function assertLocalProviderConfigured(
  provider: AiLocalProvider,
  config: AiProviderConfig,
) {
  if (provider === "ollama") {
    assertRequiredEnv(config.ollama.baseUrl, "OLLAMA_BASE_URL");
    assertRequiredEnv(config.ollama.evaluationModel, "OLLAMA_EVALUATION_MODEL");
  }
}

function getOnlineEvaluationModelName(
  provider: AiOnlineProvider,
  config: AiProviderConfig,
) {
  if (provider === "openrouter") {
    return config.openrouter.evaluationModel;
  }

  if (provider === "openai") {
    return config.openai.evaluationModel;
  }

  return config.gemini.evaluationModel;
}

function getOnlineMappingModelName(
  provider: AiOnlineProvider,
  config: AiProviderConfig,
) {
  if (provider === "openrouter") {
    return config.openrouter.mappingModel;
  }

  if (provider === "openai") {
    return config.openai.mappingModel;
  }

  return config.gemini.mappingModel;
}

function readStringEnv(name: string, fallback = "") {
  return (process.env[name] || fallback).trim();
}

function readPositiveIntegerEnv(name: string, fallback: number) {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function readEnumEnv<T extends string>(
  name: string,
  allowedValues: T[],
  fallback: T,
): T {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const normalized = rawValue.trim().toLowerCase() as T;

  if (!allowedValues.includes(normalized)) {
    throw new Error(
      `${name} must be one of: ${allowedValues.join(", ")}. Received: ${rawValue}`,
    );
  }

  return normalized;
}

function assertRequiredEnv(value: string, name: string) {
  if (!value) {
    throw new Error(`${name} is required for the selected AI provider.`);
  }
}