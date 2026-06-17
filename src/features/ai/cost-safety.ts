import "server-only";

import type { AiEvaluationInput } from "@/features/ai/evaluation-provider";

type TruncatedField = {
  field: string;
  originalCharacters: number;
  keptCharacters: number;
};

export type AiEvaluationSafetySnapshot = {
  inputCharacterCount: number;
  approximateInputTokens: number;
  warningLevel: "normal" | "warning" | "high";
  truncatedFields: TruncatedField[];
  limits: AiCostSafetyConfig;
};

export type AiBatchSafetySummary = {
  totalInputCharacters: number;
  totalApproximateInputTokens: number;
  largestSingleEvaluationTokens: number;
  truncatedEvaluationCount: number;
  warningEvaluationCount: number;
  highWarningEvaluationCount: number;
};

type AiCostSafetyConfig = {
  approxCharsPerToken: number;
  maxStudentAnswerChars: number;
  maxModelAnswerChars: number;
  maxQuestionChars: number;
  maxRubricChars: number;
  maxSingleEvaluationInputChars: number;
  costWarningInputTokens: number;
  requireCostConfirmation: boolean;
};

export function prepareAiEvaluationInputForSafety(input: AiEvaluationInput) {
  const config = getAiCostSafetyConfig();
  const truncatedFields: TruncatedField[] = [];

  const questionText = truncateTracked({
    field: "questionText",
    value: input.questionText,
    maxCharacters: config.maxQuestionChars,
    truncatedFields,
  });

  const modelAnswer = truncateTracked({
    field: "modelAnswer",
    value: input.modelAnswer,
    maxCharacters: config.maxModelAnswerChars,
    truncatedFields,
  });

  const studentAnswer = truncateTracked({
    field: "studentAnswer",
    value: input.studentAnswer,
    maxCharacters: config.maxStudentAnswerChars,
    truncatedFields,
  });

  let remainingRubricChars = config.maxRubricChars;

  const rubrics = input.rubrics.map((rubric, index) => {
    const criterionDescription = rubric.criterionDescription || "";
    const allowedForThisRubric = Math.max(0, remainingRubricChars);

    const truncatedDescription = truncateTracked({
      field: `rubric.${index + 1}.criterionDescription`,
      value: criterionDescription,
      maxCharacters: allowedForThisRubric,
      truncatedFields,
    });

    remainingRubricChars -= truncatedDescription.length;

    return {
      ...rubric,
      criterionDescription: truncatedDescription || null,
    };
  });

  const preparedInput: AiEvaluationInput = {
    ...input,
    questionText,
    modelAnswer,
    studentAnswer,
    rubrics,
  };

  const inputCharacterCount = estimateInputCharacters(preparedInput);
  const approximateInputTokens = Math.ceil(
    inputCharacterCount / config.approxCharsPerToken,
  );

  if (inputCharacterCount > config.maxSingleEvaluationInputChars) {
    throw new Error(
      `AI input is too large after truncation. Prepared characters: ${inputCharacterCount}, allowed: ${config.maxSingleEvaluationInputChars}. Reduce answer/model/rubric size or increase safety limit carefully.`,
    );
  }

  const warningLevel = getWarningLevel(
    approximateInputTokens,
    config.costWarningInputTokens,
  );

  const safetySnapshot: AiEvaluationSafetySnapshot = {
    inputCharacterCount,
    approximateInputTokens,
    warningLevel,
    truncatedFields,
    limits: config,
  };

  return {
    preparedInput,
    safetySnapshot,
  };
}

export function createAiBatchSafetySummary(): AiBatchSafetySummary {
  return {
    totalInputCharacters: 0,
    totalApproximateInputTokens: 0,
    largestSingleEvaluationTokens: 0,
    truncatedEvaluationCount: 0,
    warningEvaluationCount: 0,
    highWarningEvaluationCount: 0,
  };
}

export function addAiEvaluationSafetyToBatchSummary(
  summary: AiBatchSafetySummary,
  snapshot: AiEvaluationSafetySnapshot,
) {
  summary.totalInputCharacters += snapshot.inputCharacterCount;
  summary.totalApproximateInputTokens += snapshot.approximateInputTokens;
  summary.largestSingleEvaluationTokens = Math.max(
    summary.largestSingleEvaluationTokens,
    snapshot.approximateInputTokens,
  );

  if (snapshot.truncatedFields.length > 0) {
    summary.truncatedEvaluationCount += 1;
  }

  if (snapshot.warningLevel === "warning") {
    summary.warningEvaluationCount += 1;
  }

  if (snapshot.warningLevel === "high") {
    summary.highWarningEvaluationCount += 1;
  }

  return summary;
}

export function assertAiCostConfirmationForRun({
  confirmed,
}: {
  confirmed: boolean;
}) {
  const config = getAiCostSafetyConfig();
  const provider = String(process.env.AI_EVALUATION_PROVIDER || "mock").trim();

  if (provider === "mock") {
    return;
  }

  if (!config.requireCostConfirmation) {
    return;
  }

  if (!confirmed) {
    throw new Error(
      "Please confirm the AI cost/credit warning before running real AI evaluation.",
    );
  }
}

function getAiCostSafetyConfig(): AiCostSafetyConfig {
  return {
    approxCharsPerToken: readPositiveIntegerEnv("AI_APPROX_CHARS_PER_TOKEN", 4),
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
    maxSingleEvaluationInputChars: readPositiveIntegerEnv(
      "AI_MAX_SINGLE_EVALUATION_INPUT_CHARS",
      30000,
    ),
    costWarningInputTokens: readPositiveIntegerEnv(
      "AI_COST_WARNING_INPUT_TOKENS",
      8000,
    ),
    requireCostConfirmation: readBooleanEnv("AI_REQUIRE_COST_CONFIRMATION", true),
  };
}

function truncateTracked({
  field,
  value,
  maxCharacters,
  truncatedFields,
}: {
  field: string;
  value: string;
  maxCharacters: number;
  truncatedFields: TruncatedField[];
}) {
  if (value.length <= maxCharacters) {
    return value;
  }

  const kept = value.slice(0, maxCharacters);

  truncatedFields.push({
    field,
    originalCharacters: value.length,
    keptCharacters: kept.length,
  });

  return `${kept}\n\n[Truncated for AI safety. Original length: ${value.length} characters.]`;
}

function estimateInputCharacters(input: AiEvaluationInput) {
  const rubricCharacters = input.rubrics.reduce((total, rubric) => {
    return (
      total +
      rubric.criterionName.length +
      String(rubric.criterionDescription || "").length +
      String(rubric.maxMarks).length
    );
  }, 0);

  return (
    String(input.examTitle || "").length +
    String(input.subject || "").length +
    input.questionNo.length +
    input.questionText.length +
    input.questionType.length +
    String(input.maxMarks).length +
    input.modelAnswer.length +
    input.studentAnswer.length +
    rubricCharacters
  );
}

function getWarningLevel(
  approximateInputTokens: number,
  warningTokenLimit: number,
): AiEvaluationSafetySnapshot["warningLevel"] {
  if (approximateInputTokens >= warningTokenLimit * 2) {
    return "high";
  }

  if (approximateInputTokens >= warningTokenLimit) {
    return "warning";
  }

  return "normal";
}

function readPositiveIntegerEnv(name: string, fallback: number) {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function readBooleanEnv(name: string, fallback: boolean) {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  return ["true", "1", "yes", "on"].includes(rawValue.trim().toLowerCase());
}