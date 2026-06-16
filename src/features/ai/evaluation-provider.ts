import "server-only";

import {
  assertEvaluationProviderConfigured,
  getAiProviderConfig,
  getEvaluationModelName,
  type AiProviderConfig,
} from "@/features/ai/provider-config";

export type AiRubricInput = {
  id: string;
  criterionName: string;
  criterionDescription: string | null;
  maxMarks: number | string;
};

export type AiEvaluationInput = {
  examId: string;
  studentAnswerId: string;

  subject?: string | null;
  examTitle?: string | null;

  questionNo: string;
  questionText: string;
  questionType: string;
  maxMarks: number | string;

  modelAnswer: string;
  studentAnswer: string;

  rubrics: AiRubricInput[];
};

export type AiRubricBreakdownOutput = {
  rubricId: string | null;
  criterionName: string;
  maxMarks: number;
  awardedMarks: number;
  reason: string;
};

export type AiEvaluationOutput = {
  suggestedScore: number;
  maxMarks: number;
  qualityLabel: "Weak" | "Average" | "Good" | "Excellent";
  confidence: "Low" | "Medium" | "High";

  teacherReviewSummary: string;
  studentFacingJustification: string;

  whatStudentDidWell: string[];
  whatIsMissing: string[];

  rubricBreakdown: AiRubricBreakdownOutput[];

  provider: string;
  model: string;
  rawOutput: unknown;
};

type RawAiEvaluationOutput = {
  suggested_score?: unknown;
  max_marks?: unknown;
  quality_label?: unknown;
  confidence?: unknown;
  rubric_breakdown?: unknown;
  what_student_did_well?: unknown;
  what_is_missing?: unknown;
  teacher_review_summary?: unknown;
  student_facing_justification?: unknown;
};

type RawRubricBreakdown = {
  rubric_id?: unknown;
  criterion?: unknown;
  criterion_name?: unknown;
  max_marks?: unknown;
  awarded_marks?: unknown;
  reason?: unknown;
};

const QUALITY_LABELS = ["Weak", "Average", "Good", "Excellent"] as const;
const CONFIDENCE_LABELS = ["Low", "Medium", "High"] as const;

export async function evaluateAnswerWithAi(
  input: AiEvaluationInput,
): Promise<AiEvaluationOutput> {
  const config = getAiProviderConfig();

  assertEvaluationProviderConfigured(config);

  if (config.evaluationProvider === "mock") {
    return evaluateAnswerWithMockProvider(input, config);
  }

  if (config.evaluationProvider === "openrouter") {
    return evaluateAnswerWithOpenRouter(input, config);
  }

  throw new Error(
    `AI evaluation provider "${config.evaluationProvider}" is configured but not implemented in this adapter yet.`,
  );
}

async function evaluateAnswerWithOpenRouter(
  input: AiEvaluationInput,
  config: AiProviderConfig,
): Promise<AiEvaluationOutput> {
  const model = config.openrouter.evaluationModel;

  if (!model) {
    throw new Error("OPENROUTER_EVALUATION_MODEL is required.");
  }

  const baseUrl =
    config.openrouter.baseUrl ||
    "https://openrouter.ai/api/v1/chat/completions";

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, config.safety.timeoutMs);

  try {
    const prompt = buildEvaluationPrompt(input, config);

    const response = await fetch(baseUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.openrouter.apiKey}`,
        "Content-Type": "application/json",
        ...(config.openrouter.siteUrl
          ? { "HTTP-Referer": config.openrouter.siteUrl }
          : {}),
        ...(config.openrouter.appName
          ? { "X-Title": config.openrouter.appName }
          : {}),
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are an academic evaluation assistant. You must return only valid JSON in the requested schema.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();

      throw new Error(
        `OpenRouter evaluation failed with status ${response.status}: ${errorText}`,
      );
    }

    const responseJson = await response.json();

    const content = responseJson?.choices?.[0]?.message?.content;

    if (!content || typeof content !== "string") {
      throw new Error("OpenRouter response did not contain message content.");
    }

    return parseValidateAndRepairAiEvaluationOutput({
      rawText: content,
      input,
      config,
      provider: "openrouter",
      model,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function evaluateAnswerWithMockProvider(
  input: AiEvaluationInput,
  config: AiProviderConfig,
): AiEvaluationOutput {
  const maxMarks = Number(input.maxMarks);
  const rubricTotal = input.rubrics.reduce((total, rubric) => {
    return total + Number(rubric.maxMarks);
  }, 0);

  const effectiveMaxMarks = Number.isFinite(maxMarks) ? maxMarks : rubricTotal;

  const studentWordCount = countWords(input.studentAnswer);
  const modelWordCount = countWords(input.modelAnswer);

  let scoreRatio = 0.5;

  if (studentWordCount > 0 && modelWordCount > 0) {
    scoreRatio = Math.min(
      0.85,
      Math.max(0.25, studentWordCount / modelWordCount),
    );
  }

  const suggestedScore = roundToTwoDecimals(effectiveMaxMarks * scoreRatio);

  const rubricBreakdown = input.rubrics.map((rubric) => {
    const rubricMaxMarks = Number(rubric.maxMarks);
    const awardedMarks = roundToTwoDecimals(rubricMaxMarks * scoreRatio);

    return {
      rubricId: rubric.id,
      criterionName: rubric.criterionName,
      maxMarks: rubricMaxMarks,
      awardedMarks,
      reason:
        "Mock evaluation estimated marks based on answer length and rubric weight. This is not a real AI judgment.",
    };
  });

  const output: AiEvaluationOutput = {
    suggestedScore,
    maxMarks: effectiveMaxMarks,
    qualityLabel: getQualityLabelFromRatio(scoreRatio),
    confidence: "Medium",
    teacherReviewSummary:
      "Mock evaluation generated a provisional score. Professor review is required.",
    studentFacingJustification:
      "Your answer was evaluated against the rubric and model answer. This is a provisional system-generated justification.",
    whatStudentDidWell:
      studentWordCount > 0
        ? ["The student attempted the answer."]
        : ["No clear attempt was found."],
    whatIsMissing:
      studentWordCount < modelWordCount * 0.5
        ? [
            "The answer appears shorter than expected and may miss important points.",
          ]
        : ["Professor should verify conceptual coverage."],
    rubricBreakdown,
    provider: "mock",
    model: getEvaluationModelName(config),
    rawOutput: {
      mock: true,
      studentWordCount,
      modelWordCount,
      scoreRatio,
    },
  };

  return validateAiEvaluationOutput(outputToRawSchema(output), input, {
    provider: "mock",
    model: getEvaluationModelName(config),
  });
}

function buildEvaluationPrompt(
  input: AiEvaluationInput,
  config: AiProviderConfig,
) {
  const maxMarks = Number(input.maxMarks);

  const rubricText = input.rubrics
    .map((rubric, index) => {
      return [
        `Rubric ${index + 1}:`,
        `rubric_id: ${rubric.id}`,
        `criterion_name: ${rubric.criterionName}`,
        `criterion_description: ${rubric.criterionDescription || "Not provided"}`,
        `max_marks: ${String(rubric.maxMarks)}`,
      ].join("\n");
    })
    .join("\n\n");

  return [
    "Evaluate the student's subjective answer using the provided question, model answer, and professor-approved rubric.",
    "",
    "Critical rules:",
    "1. Do not exceed max marks.",
    "2. Award marks rubric-wise.",
    "3. Be fair and academic.",
    "4. Do not invent facts not present in the answer.",
    "5. Student-facing justification must be polite and concise.",
    "6. Return only valid JSON. No markdown. No extra text.",
    "",
    input.examTitle
      ? `Exam title: ${input.examTitle}`
      : "Exam title: not provided",
    input.subject ? `Subject: ${input.subject}` : "Subject: not provided",
    "",
    "Question:",
    `Question no: ${input.questionNo}`,
    `Question type: ${input.questionType}`,
    `Max marks: ${Number.isFinite(maxMarks) ? maxMarks : String(input.maxMarks)}`,
    `Question text: ${truncateText(input.questionText, config.safety.maxQuestionChars)}`,
    "",
    "Model answer:",
    truncateText(input.modelAnswer, config.safety.maxModelAnswerChars),
    "",
    "Professor-approved rubric:",
    truncateText(
      rubricText || "No rubric provided.",
      config.safety.maxRubricChars,
    ),
    "",
    "Student answer:",
    truncateText(input.studentAnswer, config.safety.maxStudentAnswerChars),
    "",
    "Required JSON schema:",
    JSON.stringify(
      {
        suggested_score: 0,
        max_marks: Number(input.maxMarks),
        quality_label: "Weak | Average | Good | Excellent",
        confidence: "Low | Medium | High",
        rubric_breakdown: [
          {
            rubric_id: "rubric uuid if available",
            criterion: "Criterion name",
            max_marks: 0,
            awarded_marks: 0,
            reason: "Reason for marks",
          },
        ],
        what_student_did_well: ["point 1"],
        what_is_missing: ["point 1"],
        teacher_review_summary: "Short summary for professor",
        student_facing_justification: "Polite explanation for student",
      },
      null,
      2,
    ),
  ]
    .filter(Boolean)
    .join("\n");
}

export function validateAiEvaluationOutput(
  rawOutput: unknown,
  input: AiEvaluationInput,
  meta: {
    provider: string;
    model: string;
  },
): AiEvaluationOutput {
  if (!rawOutput || typeof rawOutput !== "object" || Array.isArray(rawOutput)) {
    throw new Error("AI evaluation output must be a JSON object.");
  }

  const raw = rawOutput as RawAiEvaluationOutput;

  const maxMarks = normalizeNumber(raw.max_marks, "max_marks");
  const expectedMaxMarks = Number(input.maxMarks);

  if (
    Number.isFinite(expectedMaxMarks) &&
    Math.abs(maxMarks - expectedMaxMarks) > 0.01
  ) {
    throw new Error(
      `AI output max_marks ${maxMarks} does not match expected max marks ${expectedMaxMarks}.`,
    );
  }

  const suggestedScore = normalizeNumber(
    raw.suggested_score,
    "suggested_score",
  );

  if (suggestedScore < 0 || suggestedScore > maxMarks) {
    throw new Error("AI suggested_score must be between 0 and max_marks.");
  }

  const qualityLabel = normalizeQualityLabel(raw.quality_label);
  const confidence = normalizeConfidence(raw.confidence);

  const rubricBreakdown = normalizeRubricBreakdown(raw.rubric_breakdown, input);

  const teacherReviewSummary = normalizeRequiredString(
    raw.teacher_review_summary,
    "teacher_review_summary",
  );

  const studentFacingJustification = normalizeRequiredString(
    raw.student_facing_justification,
    "student_facing_justification",
  );

  return {
    suggestedScore: roundToTwoDecimals(suggestedScore),
    maxMarks: roundToTwoDecimals(maxMarks),
    qualityLabel,
    confidence,
    teacherReviewSummary,
    studentFacingJustification,
    whatStudentDidWell: normalizeStringArray(raw.what_student_did_well),
    whatIsMissing: normalizeStringArray(raw.what_is_missing),
    rubricBreakdown,
    provider: meta.provider,
    model: meta.model,
    rawOutput,
  };
}

function normalizeRubricBreakdown(
  value: unknown,
  input: AiEvaluationInput,
): AiRubricBreakdownOutput[] {
  if (!Array.isArray(value)) {
    throw new Error("AI rubric_breakdown must be an array.");
  }

  const knownRubricIds = new Set(input.rubrics.map((rubric) => rubric.id));

  const breakdown = value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`Rubric breakdown item ${index + 1} must be an object.`);
    }

    const rawItem = item as RawRubricBreakdown;

    const rubricId = normalizeNullableString(rawItem.rubric_id);

    if (rubricId && !knownRubricIds.has(rubricId)) {
      throw new Error(
        `Rubric breakdown item ${index + 1} contains unknown rubric_id.`,
      );
    }

    const criterionName =
      normalizeNullableString(rawItem.criterion_name) ||
      normalizeNullableString(rawItem.criterion) ||
      "";

    if (!criterionName) {
      throw new Error(`Rubric breakdown item ${index + 1} needs a criterion.`);
    }

    const maxMarks = normalizeNumber(rawItem.max_marks, "rubric max_marks");
    const awardedMarks = normalizeNumber(
      rawItem.awarded_marks,
      "rubric awarded_marks",
    );

    if (awardedMarks < 0 || awardedMarks > maxMarks) {
      throw new Error(
        `Rubric breakdown item ${index + 1} awarded_marks must be between 0 and max_marks.`,
      );
    }

    return {
      rubricId,
      criterionName,
      maxMarks: roundToTwoDecimals(maxMarks),
      awardedMarks: roundToTwoDecimals(awardedMarks),
      reason: normalizeRequiredString(
        rawItem.reason,
        `rubric breakdown item ${index + 1} reason`,
      ),
    };
  });

  if (breakdown.length === 0 && input.rubrics.length > 0) {
    throw new Error("AI rubric_breakdown cannot be empty when rubrics exist.");
  }

  return breakdown;
}

function parseJsonObjectFromText(text: string) {
  const jsonText = extractJsonObjectText(text);

  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new Error(
      `Failed to parse AI evaluation JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function extractJsonObjectText(text: string) {
  const cleaned = stripMarkdownJsonFences(text);

  const firstBrace = cleaned.indexOf("{");

  if (firstBrace === -1) {
    throw new Error("No JSON object found in AI evaluation output.");
  }

  const balancedJson = extractBalancedJsonObject(cleaned.slice(firstBrace));

  if (!balancedJson) {
    throw new Error("Could not extract a balanced JSON object from AI output.");
  }

  return balancedJson;
}

function stripMarkdownJsonFences(text: string) {
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractBalancedJsonObject(text: string) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (inString && char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return text.slice(0, index + 1);
      }
    }
  }

  return "";
}

function outputToRawSchema(output: AiEvaluationOutput): RawAiEvaluationOutput {
  return {
    suggested_score: output.suggestedScore,
    max_marks: output.maxMarks,
    quality_label: output.qualityLabel,
    confidence: output.confidence,
    rubric_breakdown: output.rubricBreakdown.map((item) => ({
      rubric_id: item.rubricId,
      criterion: item.criterionName,
      max_marks: item.maxMarks,
      awarded_marks: item.awardedMarks,
      reason: item.reason,
    })),
    what_student_did_well: output.whatStudentDidWell,
    what_is_missing: output.whatIsMissing,
    teacher_review_summary: output.teacherReviewSummary,
    student_facing_justification: output.studentFacingJustification,
  };
}

function normalizeNumber(value: unknown, fieldName: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`AI output field ${fieldName} must be a number.`);
  }

  return parsed;
}

function normalizeQualityLabel(
  value: unknown,
): AiEvaluationOutput["qualityLabel"] {
  const normalized = normalizeTitleCase(value);

  if (
    QUALITY_LABELS.includes(normalized as AiEvaluationOutput["qualityLabel"])
  ) {
    return normalized as AiEvaluationOutput["qualityLabel"];
  }

  throw new Error(
    "AI quality_label must be Weak, Average, Good, or Excellent.",
  );
}

function normalizeConfidence(value: unknown): AiEvaluationOutput["confidence"] {
  const normalized = normalizeTitleCase(value);

  if (
    CONFIDENCE_LABELS.includes(normalized as AiEvaluationOutput["confidence"])
  ) {
    return normalized as AiEvaluationOutput["confidence"];
  }

  throw new Error("AI confidence must be Low, Medium, or High.");
}

function normalizeTitleCase(value: unknown) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();

  if (!raw) {
    return "";
  }

  return `${raw[0].toUpperCase()}${raw.slice(1)}`;
}

function normalizeRequiredString(value: unknown, fieldName: string) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new Error(`AI output field ${fieldName} is required.`);
  }

  return normalized;
}

function normalizeNullableString(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();

  if (!normalized || normalized.toLowerCase() === "null") {
    return null;
  }

  return normalized;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 10);
}

function getQualityLabelFromRatio(
  ratio: number,
): AiEvaluationOutput["qualityLabel"] {
  if (ratio >= 0.8) {
    return "Excellent";
  }

  if (ratio >= 0.6) {
    return "Good";
  }

  if (ratio >= 0.4) {
    return "Average";
  }

  return "Weak";
}

function countWords(value: string) {
  if (!value.trim()) {
    return 0;
  }

  return value.trim().split(/\s+/).length;
}

function roundToTwoDecimals(value: number) {
  return Math.round(value * 100) / 100;
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}... [truncated]`;
}

// ==========
// FUNCTION
// ==========
async function parseValidateAndRepairAiEvaluationOutput({
  rawText,
  input,
  config,
  provider,
  model,
}: {
  rawText: string;
  input: AiEvaluationInput;
  config: AiProviderConfig;
  provider: string;
  model: string;
}): Promise<AiEvaluationOutput> {
  try {
    const parsedOutput = parseJsonObjectFromText(rawText);

    return validateAiEvaluationOutput(parsedOutput, input, {
      provider,
      model,
    });
  } catch (firstError) {
    if (provider !== "openrouter") {
      throw firstError;
    }

    const repairPrompt = buildJsonRepairPrompt({
      invalidOutput: rawText,
      validationError:
        firstError instanceof Error
          ? firstError.message
          : "Unknown validation error.",
      input,
    });

    const repairedText = await repairAiEvaluationJsonWithOpenRouter({
      repairPrompt,
      config,
      model,
    });

    try {
      const repairedOutput = parseJsonObjectFromText(repairedText);

      const validated = validateAiEvaluationOutput(repairedOutput, input, {
        provider,
        model,
      });

      return {
        ...validated,
        rawOutput: {
          repaired: true,
          originalOutput: rawText,
          repairedOutput,
          firstValidationError:
            firstError instanceof Error
              ? firstError.message
              : "Unknown validation error.",
        },
      };
    } catch (repairError) {
      throw new Error(
        [
          "AI evaluation output validation failed even after one repair attempt.",
          `First error: ${
            firstError instanceof Error
              ? firstError.message
              : String(firstError)
          }`,
          `Repair error: ${
            repairError instanceof Error
              ? repairError.message
              : String(repairError)
          }`,
        ].join("\n"),
      );
    }
  }
}

async function repairAiEvaluationJsonWithOpenRouter({
  repairPrompt,
  config,
  model,
}: {
  repairPrompt: string;
  config: AiProviderConfig;
  model: string;
}) {
  const baseUrl =
    config.openrouter.baseUrl ||
    "https://openrouter.ai/api/v1/chat/completions";

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, config.safety.timeoutMs);

  try {
    const response = await fetch(baseUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.openrouter.apiKey}`,
        "Content-Type": "application/json",
        ...(config.openrouter.siteUrl
          ? { "HTTP-Referer": config.openrouter.siteUrl }
          : {}),
        ...(config.openrouter.appName
          ? { "X-Title": config.openrouter.appName }
          : {}),
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You repair invalid AI JSON. Return only valid JSON. Do not add markdown or explanation.",
          },
          {
            role: "user",
            content: repairPrompt,
          },
        ],
        temperature: 0,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();

      throw new Error(
        `OpenRouter JSON repair failed with status ${response.status}: ${errorText}`,
      );
    }

    const responseJson = await response.json();

    const content = responseJson?.choices?.[0]?.message?.content;

    if (!content || typeof content !== "string") {
      throw new Error(
        "OpenRouter JSON repair response had no message content.",
      );
    }

    return content;
  } finally {
    clearTimeout(timeout);
  }
}

function buildJsonRepairPrompt({
  invalidOutput,
  validationError,
  input,
}: {
  invalidOutput: string;
  validationError: string;
  input: AiEvaluationInput;
}) {
  return [
    "The following AI evaluation output is invalid or failed validation.",
    "Repair it into valid JSON using the required schema.",
    "",
    "Rules:",
    "1. Return only JSON.",
    "2. Do not add markdown fences.",
    "3. Do not add explanation outside JSON.",
    "4. Keep scores within allowed max marks.",
    "5. The output max_marks must match the expected max marks.",
    "6. If a rubric_id is unknown or missing, use null.",
    "7. rubric_breakdown must be an array.",
    "8. quality_label must be Weak, Average, Good, or Excellent.",
    "9. confidence must be Low, Medium, or High.",
    "",
    `Expected max_marks: ${String(input.maxMarks)}`,
    `Validation error: ${validationError}`,
    "",
    "Required JSON schema:",
    JSON.stringify(
      {
        suggested_score: 0,
        max_marks: Number(input.maxMarks),
        quality_label: "Weak | Average | Good | Excellent",
        confidence: "Low | Medium | High",
        rubric_breakdown: [
          {
            rubric_id: "rubric uuid or null",
            criterion: "Criterion name",
            max_marks: 0,
            awarded_marks: 0,
            reason: "Reason for marks",
          },
        ],
        what_student_did_well: ["point 1"],
        what_is_missing: ["point 1"],
        teacher_review_summary: "Short summary for professor",
        student_facing_justification: "Polite explanation for student",
      },
      null,
      2,
    ),
    "",
    "Invalid output to repair:",
    invalidOutput,
  ].join("\n");
}
