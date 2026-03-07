import { sha256 } from "js-sha256";
import Papa from "papaparse";

import {
  agentMetricSchema,
  datasetTypeSchema,
  DEFAULT_THRESHOLDS,
  questionPerformanceSchema,
  qtMetricSchema,
  type AgentMetric,
  type CsvImportPreview,
  type DatasetType,
  type ImportPreviewError,
  type QuestionPerformance,
  type QtMetric
} from "./domain";
import {
  computeFeedbackCoverage,
  computeQuestionAccuracy,
  computeTotalConversationCount,
  createDeterministicId,
  normalizeKey,
  toAsciiKey
} from "./metrics";

type ParsedPreview = CsvImportPreview<AgentMetric> | CsvImportPreview<QuestionPerformance> | CsvImportPreview<QtMetric>;

type CsvRow = Record<string, string>;
type CanonicalCsvRow = Record<string, string>;

const HEADER_ALIASES: Record<DatasetType, Record<string, string[]>> = {
  "agent-metrics": {
    period: ["period"],
    agent_name: ["mt", "agentname"],
    audit_score: ["auditskoru", "auditscore"],
    previous_audit_accuracy: ["oncekiauditdogrulukorani", "previousauditaccuracy"],
    missing_questions_accuracy: [
      "oncekiaudittenkalansorularibilmeorani",
      "kayipsorularibilmeorani",
      "missingquestionsaccuracy"
    ],
    total_call_count: ["toplamcagriadedi", "totalcallcount"],
    total_chat_mail_count: ["toplamchatmailadedi", "totalchatmailcount"],
    total_ticket_closed_count: ["toplamticketkapatmaadedi", "totalticketclosedcount"],
    totalConversationCount: ["toplamgorusmeadedi", "totalconversationcount"],
    avg_talk_duration_seconds: ["ortalamakonusmasuresi", "avgtalkdurationseconds"],
    local_close_rate: ["lokalkapatmaorani", "localcloserate"],
    missed_calls: ["kacancagrilar", "missedcalls"],
    call_evaluation_average: ["cagridegerlendirmeortalamasi", "callevaluationaverage"],
    evaluation_count: ["degerlendirmeadeti", "evaluationcount"]
  },
  "question-performance": {
    period: ["period"],
    question_text: ["sorularcskey", "questiontext"],
    accuracy_rate: ["dogrubilinmeorani", "accuracyrate"],
    correct_count: ["dogru", "correctcount"],
    wrong_count: ["yanlis", "wrongcount"],
    topic: ["konubasliklari", "topic"]
  },
  "qt-metrics": {
    period: ["period"],
    representative_name: ["musteritemsilcisi", "mt", "representativename", "specialistname"],
    duration_seconds: ["suresaniyecinsinde", "durationseconds", "dinlenencagrisuresi"],
    call_date: ["cagritarihi", "calldate"],
    dialed_number: ["aranannumara", "dialednumber"],
    caller_number: ["arayannumara", "callernumber"],
    listened_call_count: ["evaluatedcallcount"],
    listening_hours: ["listeninghours"],
    evaluated_call_count_total: ["degerlendirilencagriadedi", "evaluatedcallcounttotal"],
    evaluated_chat_mail_count_total: [
      "degerlendirilenchatmailadedi",
      "evaluatedchatmailcounttotal"
    ],
    feedback_count: ["geribildirimsayisi", "feedbackcount"]
  }
};

export const CSV_TEMPLATES: Record<DatasetType, string[]> = {
  "agent-metrics": [
    "M.T,Audit Skoru,Önceki Audit Doğruluk Oranı,Toplam Çağrı Adedi,Toplam Chat / Mail Adedi,Toplam Ticket Kapatma Adedi,Toplam Görüşme Adedi,Ortalama Konuşma Süresi,Lokal Kapatma Oranı,Kaçan Çağrılar,Çağrı Değerlendirme Ortalaması,Değerlendirme Adeti",
    "Örnek Temsilci,91,88,420,130,15,565,318,89,4,4.97,120"
  ],
  "question-performance": [
    "Sorular (CS-KEY),Doğru Bilinme Oranı,Doğru,Yanlış,Konu Başlıkları",
    "Trendyol onay bekliyor problemi nasıl çözülür?,73.53,25,9,Pazaryeri"
  ],
  "qt-metrics": [
    "Müşteri Temsilcisi,Süre ( saniye cinsinde ),Çağrı Tarihi,Aranan Numara,Arayan Numara",
    "Örnek Temsilci,318,2026-02-12,08501234567,05331234567"
  ]
};

function hashText(text: string): string {
  return sha256(text);
}

function coerceNumber(value: string | undefined, fallback = 0): number {
  if (!value || value.trim() === "") {
    return fallback;
  }

  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  const numberValue = Number(normalized);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function coerceNullableNumber(value: string | undefined): number | null {
  if (!value || value.trim() === "" || value.trim() === "-") {
    return null;
  }

  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  const numberValue = Number(normalized);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function pushValidationIssues(
  rowNumber: number,
  issues: Array<{ path: PropertyKey[]; message: string }>,
  errors: ImportPreviewError[]
) {
  for (const issue of issues) {
    const nextError: ImportPreviewError = {
      row: rowNumber,
      message: issue.message
    };

    const field = issue.path[0]?.toString();
    if (field) {
      nextError.field = field;
    }

    errors.push(nextError);
  }
}

function normalizeHeaderKey(value: string): string {
  return toAsciiKey(value.replace(/^\uFEFF/, "")).replace(/[^a-z0-9]+/g, "");
}

function canonicalizeRows(rows: CsvRow[], datasetType: DatasetType): CanonicalCsvRow[] {
  const aliases = HEADER_ALIASES[datasetType];
  const aliasLookup = Object.entries(aliases).reduce<Record<string, string>>((accumulator, [canonical, entries]) => {
    entries.forEach((entry) => {
      accumulator[normalizeHeaderKey(entry)] = canonical;
    });
    return accumulator;
  }, {});

  return rows.map((row) =>
    Object.entries(row).reduce<CanonicalCsvRow>((accumulator, [key, value]) => {
      const canonicalKey = aliasLookup[normalizeHeaderKey(key)];
      if (canonicalKey) {
        accumulator[canonicalKey] = value;
      }
      return accumulator;
    }, {})
  );
}

function ensurePeriod(rowPeriod: string | undefined, expectedPeriod: string, row: number, errors: ImportPreviewError[]) {
  if (!rowPeriod || rowPeriod.trim() === "") {
    return;
  }

  if (rowPeriod !== expectedPeriod) {
    errors.push({
      row,
      field: "period",
      message: `Dönem ${expectedPeriod} olmalıdır.`
    });
  }
}

function parseAgentMetrics(rows: CanonicalCsvRow[], expectedPeriod: string, sha256: string): CsvImportPreview<AgentMetric> {
  const validRows: AgentMetric[] = [];
  const errors: ImportPreviewError[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    ensurePeriod(row.period, expectedPeriod, rowNumber, errors);

    const agentName = (row.agent_name ?? "").trim();
    const record = {
      id: createDeterministicId(expectedPeriod, "agent", agentName),
      period: expectedPeriod,
      agentKey: normalizeKey(agentName),
      agentName,
      auditScore: coerceNullableNumber(row.audit_score),
      previousAuditAccuracy: coerceNullableNumber(row.previous_audit_accuracy),
      missingQuestionsAccuracy: coerceNullableNumber(row.missing_questions_accuracy),
      totalCallCount: Math.trunc(coerceNumber(row.total_call_count)),
      totalChatMailCount: Math.trunc(coerceNumber(row.total_chat_mail_count)),
      totalTicketClosedCount: Math.trunc(coerceNumber(row.total_ticket_closed_count)),
      totalConversationCount: computeTotalConversationCount(
        Math.trunc(coerceNumber(row.total_call_count)),
        Math.trunc(coerceNumber(row.total_chat_mail_count)),
        Math.trunc(coerceNumber(row.total_ticket_closed_count))
      ),
      avgTalkDurationSeconds: coerceNullableNumber(row.avg_talk_duration_seconds)?.valueOf() ?? null,
      localCloseRate: coerceNullableNumber(row.local_close_rate),
      missedCalls: coerceNullableNumber(row.missed_calls)?.valueOf() ?? null,
      callEvaluationAverage: coerceNullableNumber(row.call_evaluation_average),
      evaluationCount: coerceNullableNumber(row.evaluation_count)?.valueOf() ?? null
    };

    const parsed = agentMetricSchema.safeParse(record);
    if (!parsed.success) {
      pushValidationIssues(rowNumber, parsed.error.issues, errors);
      return;
    }

    validRows.push(parsed.data);
  });

  return {
    datasetType: "agent-metrics",
    sha256,
    rowCount: rows.length,
    validRows,
    previewRows: validRows.slice(0, 10),
    errors
  };
}

function parseQuestionPerformance(
  rows: CanonicalCsvRow[],
  expectedPeriod: string,
  sha256: string
): CsvImportPreview<QuestionPerformance> {
  const validRows: QuestionPerformance[] = [];
  const errors: ImportPreviewError[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    ensurePeriod(row.period, expectedPeriod, rowNumber, errors);

    const correctCount = Math.trunc(coerceNumber(row.correct_count));
    const wrongCount = Math.trunc(coerceNumber(row.wrong_count));
    const record = {
      id: createDeterministicId(expectedPeriod, "question", row.topic ?? "", row.question_text ?? ""),
      period: expectedPeriod,
      topic: (row.topic ?? "").trim(),
      questionText: (row.question_text ?? "").trim(),
      correctCount,
      wrongCount,
      accuracyRate:
        correctCount || wrongCount
          ? computeQuestionAccuracy(correctCount, wrongCount)
          : coerceNumber(row.accuracy_rate)
    };

    const parsed = questionPerformanceSchema.safeParse(record);
    if (!parsed.success) {
      pushValidationIssues(rowNumber, parsed.error.issues, errors);
      return;
    }

    validRows.push(parsed.data);
  });

  return {
    datasetType: "question-performance",
    sha256,
    rowCount: rows.length,
    validRows,
    previewRows: validRows.slice(0, 10),
    errors
  };
}

function parseLegacyQtMetrics(rows: CanonicalCsvRow[], expectedPeriod: string, sha256: string): CsvImportPreview<QtMetric> {
  const validRows: QtMetric[] = [];
  const errors: ImportPreviewError[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    ensurePeriod(row.period, expectedPeriod, rowNumber, errors);

    const representativeName = (row.representative_name ?? "").trim();
    const feedbackCountValue = coerceNullableNumber(row.feedback_count);
    const listenedDurationSeconds = Math.round(coerceNumber(row.listening_hours) * 3600);

    const record = {
      id: createDeterministicId(expectedPeriod, "qt", representativeName),
      period: expectedPeriod,
      representativeKey: normalizeKey(representativeName),
      representativeName,
      listenedCallCount: Math.trunc(coerceNumber(row.listened_call_count)),
      listenedDurationSeconds,
      totalEvaluatedCallCount: coerceNullableNumber(row.evaluated_call_count_total)?.valueOf() ?? null,
      totalEvaluatedChatMailCount:
        coerceNullableNumber(row.evaluated_chat_mail_count_total)?.valueOf() ?? null,
      feedbackCount: feedbackCountValue?.valueOf() ?? null,
      feedbackCoverage: computeFeedbackCoverage(listenedDurationSeconds / 3600, feedbackCountValue)
    };

    const parsed = qtMetricSchema.safeParse(record);
    if (!parsed.success) {
      pushValidationIssues(rowNumber, parsed.error.issues, errors);
      return;
    }

    validRows.push(parsed.data);
  });

  return {
    datasetType: "qt-metrics",
    sha256,
    rowCount: rows.length,
    validRows,
    previewRows: validRows.slice(0, 10),
    errors
  };
}

function parseQtMetrics(rows: CanonicalCsvRow[], expectedPeriod: string, sha256: string): CsvImportPreview<QtMetric> {
  if (rows.some((row) => row.listened_call_count || row.listening_hours)) {
    return parseLegacyQtMetrics(rows, expectedPeriod, sha256);
  }

  const grouped = new Map<string, { representativeName: string; listenedCallCount: number; listenedDurationSeconds: number }>();
  const errors: ImportPreviewError[] = [];
  let evaluatedCallCount: number | null = null;
  let evaluatedChatMailCount: number | null = null;
  let feedbackCount: number | null = null;

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    ensurePeriod(row.period, expectedPeriod, rowNumber, errors);

    const representativeName = (row.representative_name ?? "").trim();
    const listenedDurationSeconds = Math.trunc(coerceNumber(row.duration_seconds));

    if (!representativeName) {
      errors.push({
        row: rowNumber,
        field: "representative_name",
        message: "Müşteri temsilcisi alanı zorunludur."
      });
      return;
    }

    const current = grouped.get(representativeName) ?? {
      representativeName,
      listenedCallCount: 0,
      listenedDurationSeconds: 0
    };
    current.listenedCallCount += 1;
    current.listenedDurationSeconds += listenedDurationSeconds;
    grouped.set(representativeName, current);

    if (evaluatedCallCount === null) {
      evaluatedCallCount = coerceNullableNumber(row.evaluated_call_count_total)?.valueOf() ?? null;
    }
    if (evaluatedChatMailCount === null) {
      evaluatedChatMailCount = coerceNullableNumber(row.evaluated_chat_mail_count_total)?.valueOf() ?? null;
    }
    if (feedbackCount === null) {
      feedbackCount = coerceNullableNumber(row.feedback_count)?.valueOf() ?? null;
    }
  });

  const totalListeningSeconds = Array.from(grouped.values()).reduce(
    (total, row) => total + row.listenedDurationSeconds,
    0
  );

  const validRows = Array.from(grouped.values())
    .map((row) =>
      qtMetricSchema.parse({
        id: createDeterministicId(expectedPeriod, "qt", row.representativeName),
        period: expectedPeriod,
        representativeKey: normalizeKey(row.representativeName),
        representativeName: row.representativeName,
        listenedCallCount: row.listenedCallCount,
        listenedDurationSeconds: row.listenedDurationSeconds,
        totalEvaluatedCallCount: evaluatedCallCount,
        totalEvaluatedChatMailCount: evaluatedChatMailCount,
        feedbackCount,
        feedbackCoverage: computeFeedbackCoverage(totalListeningSeconds / 3600, feedbackCount)
      })
    )
    .sort((left, right) => right.listenedCallCount - left.listenedCallCount);

  return {
    datasetType: "qt-metrics",
    sha256,
    rowCount: rows.length,
    validRows,
    previewRows: validRows.slice(0, 10),
    errors
  };
}

export function parseDatasetCsv(input: {
  datasetType: "agent-metrics";
  text: string;
  expectedPeriod: string;
}): CsvImportPreview<AgentMetric>;
export function parseDatasetCsv(input: {
  datasetType: "question-performance";
  text: string;
  expectedPeriod: string;
}): CsvImportPreview<QuestionPerformance>;
export function parseDatasetCsv(input: {
  datasetType: "qt-metrics";
  text: string;
  expectedPeriod: string;
}): CsvImportPreview<QtMetric>;
export function parseDatasetCsv(input: {
  datasetType: DatasetType;
  text: string;
  expectedPeriod: string;
}): ParsedPreview {
  datasetTypeSchema.parse(input.datasetType);

  const parsed = Papa.parse<CsvRow>(input.text, {
    header: true,
    skipEmptyLines: "greedy"
  });

  const sha256 = hashText(input.text);
  const rows = parsed.data.filter((row: CsvRow) =>
    Object.values(row).some((value) => typeof value === "string" && value.trim() !== "")
  );
  const normalizedRows = canonicalizeRows(rows, input.datasetType);

  if (input.datasetType === "agent-metrics") {
    return parseAgentMetrics(normalizedRows, input.expectedPeriod, sha256);
  }

  if (input.datasetType === "question-performance") {
    return parseQuestionPerformance(normalizedRows, input.expectedPeriod, sha256);
  }

  return parseQtMetrics(normalizedRows, input.expectedPeriod, sha256);
}

export function getTemplateContent(datasetType: DatasetType): string {
  return CSV_TEMPLATES[datasetType].join("\n");
}

export function getDefaultThresholds() {
  return structuredClone(DEFAULT_THRESHOLDS);
}
