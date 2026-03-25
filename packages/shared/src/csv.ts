import { sha256 } from "js-sha256";
import Papa from "papaparse";

import {
  agentMetricSchema,
  auditMetricSchema,
  datasetTypeSchema,
  DEFAULT_THRESHOLDS,
  questionPerformanceSchema,
  qtMetricSchema,
  type AgentMetric,
  type AuditMetric,
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

type ParsedPreview =
  | CsvImportPreview<AgentMetric>
  | CsvImportPreview<AuditMetric>
  | CsvImportPreview<QuestionPerformance>
  | CsvImportPreview<QtMetric>;

type CsvRow = Record<string, string>;
type CanonicalCsvRow = Record<string, string>;
type ImportErrorCollector = ImportPreviewError[];
type NumericFieldOptions = {
  row: number;
  field: string;
  label: string;
  errors: ImportErrorCollector;
  required?: boolean;
  integer?: boolean;
  nullable?: boolean;
};

const HEADER_ALIASES: Record<DatasetType, Record<string, string[]>> = {
  "agent-metrics": {
    period: ["period"],
    agent_name: ["mt", "temsilci", "agentname"],
    total_call_count: ["toplamcagriadedi", "totalcallcount"],
    total_chat_mail_count: ["toplamchatmailadedi", "toplamchatepostaadedi", "totalchatmailcount"],
    total_ticket_closed_count: ["toplamticketkapatmaadedi", "totalticketclosedcount"],
    totalConversationCount: ["toplamgorusmeadedi", "totalconversationcount"],
    avg_talk_duration_seconds: ["ortalamakonusmasuresi", "avgtalkdurationseconds"],
    local_close_rate: ["lokalkapatmaorani", "localcloserate"],
    missed_calls: ["kacancagrilar", "missedcalls"],
    call_evaluation_average: ["cagridegerlendirmeortalamasi", "callevaluationaverage"],
    evaluation_count: ["degerlendirmeadeti", "evaluationcount"]
  },
  "audit-metrics": {
    period: ["period"],
    agent_name: ["mt", "temsilci", "agentname"],
    audit_score: ["auditskoru", "auditscore", "audit puanı", "audit puani"],
    previous_audit_accuracy: [
      "oncekiauditdogrulukorani",
      "previousauditaccuracy",
      "oncekiaudittenkalansorularibilmeorani",
      "kayipsorularibilmeorani",
      "missingquestionsaccuracy"
    ]
  },
  "question-performance": {
    period: ["period"],
    question_text: ["sorularcskey", "sorumetni", "questiontext"],
    accuracy_rate: ["dogrubilinmeorani", "accuracyrate"],
    correct_count: ["dogru", "correctcount"],
    wrong_count: ["yanlis", "wrongcount"],
    topic: ["konubasliklari", "topic"]
  },
  "qt-metrics": {
    period: ["period"],
    representative_name: ["musteritemsilcisi", "temsilci", "mt", "representativename", "specialistname"],
    duration_seconds: ["suresaniyecinsinde", "suresaniye", "durationseconds", "dinlenencagrisuresi"],
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

const HEADER_LABELS: Record<DatasetType, Record<string, string>> = {
  "agent-metrics": {
    agent_name: "Temsilci",
    total_call_count: "Toplam çağrı adedi",
    total_chat_mail_count: "Toplam chat / e-posta adedi",
    total_ticket_closed_count: "Toplam ticket kapatma adedi",
    totalConversationCount: "Toplam görüşme adedi",
    avg_talk_duration_seconds: "Ortalama konuşma süresi",
    local_close_rate: "Lokal kapatma oranı",
    missed_calls: "Kaçan çağrılar",
    call_evaluation_average: "Çağrı değerlendirme ortalaması",
    evaluation_count: "Değerlendirme adedi"
  },
  "audit-metrics": {
    agent_name: "Temsilci",
    audit_score: "Audit skoru",
    previous_audit_accuracy: "Önceki audit doğruluk oranı"
  },
  "question-performance": {
    question_text: "Soru metni",
    accuracy_rate: "Doğru bilinme oranı",
    correct_count: "Doğru",
    wrong_count: "Yanlış",
    topic: "Konu başlıkları"
  },
  "qt-metrics": {
    representative_name: "Temsilci",
    duration_seconds: "Süre (saniye)",
    listened_call_count: "Dinlenen çağrı adedi",
    listening_hours: "Dinleme süresi (saat)",
    evaluated_call_count_total: "Değerlendirilen çağrı adedi",
    evaluated_chat_mail_count_total: "Değerlendirilen chat / e-posta adedi",
    feedback_count: "Geri bildirim sayısı"
  }
};

const SUMMARY_ROW_MARKERS: Partial<Record<DatasetType, string[]>> = {
  "agent-metrics": ["ortalama", "average", "geneltoplam", "grandtotal"]
};

const REQUIRED_HEADERS: Record<Exclude<DatasetType, "qt-metrics">, string[]> = {
  "agent-metrics": [
    "agent_name",
    "total_call_count",
    "total_chat_mail_count",
    "total_ticket_closed_count"
  ],
  "audit-metrics": ["agent_name"],
  "question-performance": ["question_text", "correct_count", "wrong_count", "topic"]
};

const QT_REQUIRED_HEADERS = ["representative_name", "duration_seconds"];
const QT_LEGACY_REQUIRED_HEADERS = ["representative_name", "listened_call_count", "listening_hours"];

export const CSV_TEMPLATES: Record<DatasetType, string[]> = {
  "agent-metrics": [
    "Temsilci,Toplam çağrı adedi,Toplam chat / e-posta adedi,Toplam ticket kapatma adedi,Toplam görüşme adedi,Ortalama konuşma süresi,Lokal kapatma oranı,Kaçan çağrılar,Çağrı değerlendirme ortalaması,Değerlendirme adedi",
    "Örnek Temsilci,420,130,15,565,318,89,4,4.97,120"
  ],
  "audit-metrics": [
    "Temsilci,Audit skoru,Önceki audit doğruluk oranı",
    "Örnek Temsilci,91,88"
  ],
  "question-performance": [
    "Soru metni,Doğru bilinme oranı,Doğru,Yanlış,Konu başlıkları",
    "Trendyol onay bekliyor problemi nasıl çözülür?,73.53,25,9,Pazaryeri"
  ],
  "qt-metrics": [
    "Temsilci,Süre (saniye),Çağrı tarihi,Aranan numara,Arayan numara",
    "Örnek Temsilci,318,2026-02-12,08501234567,05331234567"
  ]
};

function hashText(text: string): string {
  return sha256(text);
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

function pushImportError(
  errors: ImportErrorCollector,
  row: number,
  field: string | undefined,
  message: string
) {
  errors.push({
    row,
    ...(field ? { field } : {}),
    message
  });
}

function normalizeHeaderKey(value: string): string {
  return toAsciiKey(value.replace(/^\uFEFF/, "")).replace(/[^a-z0-9]+/g, "");
}

function normalizeCellValue(value: string): string {
  return toAsciiKey(value).replace(/[^a-z0-9]+/g, "");
}

function buildAliasLookup(datasetType: DatasetType) {
  return Object.entries(HEADER_ALIASES[datasetType]).reduce<Record<string, string>>((accumulator, [canonical, entries]) => {
    entries.forEach((entry) => {
      accumulator[normalizeHeaderKey(entry)] = canonical;
    });
    return accumulator;
  }, {});
}

function canonicalizeRows(rows: CsvRow[], datasetType: DatasetType): CanonicalCsvRow[] {
  const aliasLookup = buildAliasLookup(datasetType);

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

function isSummaryBoundaryRow(row: CsvRow, datasetType: DatasetType) {
  const markers = SUMMARY_ROW_MARKERS[datasetType];
  if (!markers?.length) {
    return false;
  }

  const leadingValues = Object.values(row)
    .map((value) => value.trim())
    .filter((value) => value !== "")
    .slice(0, 2)
    .map(normalizeCellValue);

  return leadingValues.some((value) => markers.includes(value));
}

function filterImportRows(rows: CsvRow[], datasetType: DatasetType) {
  const filteredRows: CsvRow[] = [];

  for (const row of rows) {
    if (isSummaryBoundaryRow(row, datasetType)) {
      break;
    }

    filteredRows.push(row);
  }

  return filteredRows;
}

function getHeaderLabel(datasetType: DatasetType, field: string) {
  return HEADER_LABELS[datasetType][field] ?? field;
}

function readTextField(
  value: string | undefined,
  row: number,
  field: string,
  label: string,
  errors: ImportErrorCollector,
  required = false
) {
  const nextValue = (value ?? "").trim();

  if (!nextValue && required) {
    pushImportError(errors, row, field, `${label} alanı zorunludur.`);
  }

  return nextValue;
}

function parseNumberValue(value: string | undefined, integer = false) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed === "-") {
    return { kind: "empty" as const };
  }

  const compact = trimmed.replace(/\s+/g, "");
  let normalized = compact;

  if (compact.includes(",") && compact.includes(".")) {
    normalized =
      compact.lastIndexOf(",") > compact.lastIndexOf(".")
        ? compact.replace(/\./g, "").replace(",", ".")
        : compact.replace(/,/g, "");
  } else if (compact.includes(",")) {
    normalized = compact.replace(/\./g, "").replace(",", ".");
  } else if (compact.includes(".")) {
    normalized = integer ? compact.replace(/\./g, "") : compact;
  }

  const numberValue = Number(normalized);

  if (!Number.isFinite(numberValue)) {
    return { kind: "invalid" as const };
  }

  return { kind: "value" as const, value: numberValue };
}

function hasNumericInput(value: string | undefined, integer = false) {
  return parseNumberValue(value, integer).kind === "value";
}

function readNumberField(value: string | undefined, options: NumericFieldOptions) {
  const parsed = parseNumberValue(value, options.integer);

  if (parsed.kind === "empty") {
    if (options.required) {
      pushImportError(options.errors, options.row, options.field, `${options.label} alanı zorunludur.`);
    }
    return options.nullable ? null : 0;
  }

  if (parsed.kind === "invalid") {
    pushImportError(options.errors, options.row, options.field, `${options.label} alanı geçerli bir sayı olmalıdır.`);
    return options.nullable ? null : 0;
  }

  if (options.integer && !Number.isInteger(parsed.value)) {
    pushImportError(options.errors, options.row, options.field, `${options.label} alanı tam sayı olmalıdır.`);
  }

  return options.integer ? Math.trunc(parsed.value) : parsed.value;
}

function validateRequiredHeaders(datasetType: DatasetType, headers: string[] | undefined) {
  const errors: ImportErrorCollector = [];

  if (!headers?.length) {
    pushImportError(errors, 1, undefined, "Başlık satırı okunamadı.");
    return errors;
  }

  const aliasLookup = buildAliasLookup(datasetType);
  const canonicalHeaders = new Set(
    headers
      .map((header) => aliasLookup[normalizeHeaderKey(header)])
      .filter((header): header is string => Boolean(header))
  );

  if (canonicalHeaders.size === 0) {
    pushImportError(errors, 1, undefined, "Sütun başlıkları tanınmadı. Şablondaki başlıkları kullanın.");
    return errors;
  }

  const requiredHeaders =
    datasetType === "qt-metrics"
      ? canonicalHeaders.has("listened_call_count") || canonicalHeaders.has("listening_hours")
        ? QT_LEGACY_REQUIRED_HEADERS
        : QT_REQUIRED_HEADERS
      : REQUIRED_HEADERS[datasetType];

  requiredHeaders.forEach((header) => {
    if (!canonicalHeaders.has(header)) {
      pushImportError(
        errors,
        1,
        header,
        `"${getHeaderLabel(datasetType, header)}" sütunu bulunamadı.`
      );
    }
  });

  return errors;
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
    const rowErrors: ImportPreviewError[] = [];
    ensurePeriod(row.period, expectedPeriod, rowNumber, errors);

    const agentName = readTextField(
      row.agent_name,
      rowNumber,
      "agent_name",
      getHeaderLabel("agent-metrics", "agent_name"),
      rowErrors,
      true
    );
    const totalCallCount = readNumberField(row.total_call_count, {
      row: rowNumber,
      field: "total_call_count",
      label: getHeaderLabel("agent-metrics", "total_call_count"),
      errors: rowErrors,
      integer: true
    }) ?? 0;
    const totalChatMailCount = readNumberField(row.total_chat_mail_count, {
      row: rowNumber,
      field: "total_chat_mail_count",
      label: getHeaderLabel("agent-metrics", "total_chat_mail_count"),
      errors: rowErrors,
      integer: true
    }) ?? 0;
    const totalTicketClosedCount = readNumberField(row.total_ticket_closed_count, {
      row: rowNumber,
      field: "total_ticket_closed_count",
      label: getHeaderLabel("agent-metrics", "total_ticket_closed_count"),
      errors: rowErrors,
      integer: true
    }) ?? 0;
    const hasConversationParts =
      hasNumericInput(row.total_call_count, true) &&
      hasNumericInput(row.total_chat_mail_count, true) &&
      hasNumericInput(row.total_ticket_closed_count, true);
    const computedConversationCount = computeTotalConversationCount(
      totalCallCount,
      totalChatMailCount,
      totalTicketClosedCount
    );
    const providedConversationCount = readNumberField(row.totalConversationCount, {
      row: rowNumber,
      field: "totalConversationCount",
      label: getHeaderLabel("agent-metrics", "totalConversationCount"),
      errors: rowErrors,
      integer: true,
      nullable: true
    });

    if (
      providedConversationCount !== null &&
      hasConversationParts &&
      providedConversationCount !== computedConversationCount
    ) {
      pushImportError(
        rowErrors,
        rowNumber,
        "totalConversationCount",
        `${getHeaderLabel("agent-metrics", "totalConversationCount")} değeri diğer toplamlarla uyuşmuyor. Beklenen: ${computedConversationCount}.`
      );
    }

    const record = {
      id: createDeterministicId(expectedPeriod, "agent", agentName),
      period: expectedPeriod,
      agentKey: normalizeKey(agentName),
      agentName,
      auditScore: null,
      previousAuditAccuracy: null,
      totalCallCount,
      totalChatMailCount,
      totalTicketClosedCount,
      totalConversationCount: providedConversationCount ?? computedConversationCount,
      avgTalkDurationSeconds: readNumberField(row.avg_talk_duration_seconds, {
        row: rowNumber,
        field: "avg_talk_duration_seconds",
        label: getHeaderLabel("agent-metrics", "avg_talk_duration_seconds"),
        errors: rowErrors,
        integer: true,
        nullable: true
      }),
      localCloseRate: readNumberField(row.local_close_rate, {
        row: rowNumber,
        field: "local_close_rate",
        label: getHeaderLabel("agent-metrics", "local_close_rate"),
        errors: rowErrors,
        nullable: true
      }),
      missedCalls: readNumberField(row.missed_calls, {
        row: rowNumber,
        field: "missed_calls",
        label: getHeaderLabel("agent-metrics", "missed_calls"),
        errors: rowErrors,
        integer: true,
        nullable: true
      }),
      callEvaluationAverage: readNumberField(row.call_evaluation_average, {
        row: rowNumber,
        field: "call_evaluation_average",
        label: getHeaderLabel("agent-metrics", "call_evaluation_average"),
        errors: rowErrors,
        nullable: true
      }),
      evaluationCount: readNumberField(row.evaluation_count, {
        row: rowNumber,
        field: "evaluation_count",
        label: getHeaderLabel("agent-metrics", "evaluation_count"),
        errors: rowErrors,
        integer: true,
        nullable: true
      })
    };

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      return;
    }

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

function parseAuditMetrics(rows: CanonicalCsvRow[], expectedPeriod: string, sha256: string): CsvImportPreview<AuditMetric> {
  const validRows: AuditMetric[] = [];
  const errors: ImportPreviewError[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const rowErrors: ImportPreviewError[] = [];
    ensurePeriod(row.period, expectedPeriod, rowNumber, errors);

    const agentName = readTextField(
      row.agent_name,
      rowNumber,
      "agent_name",
      getHeaderLabel("audit-metrics", "agent_name"),
      rowErrors,
      true
    );

    const record = {
      id: createDeterministicId(expectedPeriod, "audit", agentName),
      period: expectedPeriod,
      agentKey: normalizeKey(agentName),
      agentName,
      auditScore: readNumberField(row.audit_score, {
        row: rowNumber,
        field: "audit_score",
        label: getHeaderLabel("audit-metrics", "audit_score"),
        errors: rowErrors,
        nullable: true
      }),
      previousAuditAccuracy: readNumberField(row.previous_audit_accuracy, {
        row: rowNumber,
        field: "previous_audit_accuracy",
        label: getHeaderLabel("audit-metrics", "previous_audit_accuracy"),
        errors: rowErrors,
        nullable: true
      })
    };

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      return;
    }

    const parsed = auditMetricSchema.safeParse(record);
    if (!parsed.success) {
      pushValidationIssues(rowNumber, parsed.error.issues, errors);
      return;
    }

    validRows.push(parsed.data);
  });

  return {
    datasetType: "audit-metrics",
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
    const rowErrors: ImportPreviewError[] = [];
    ensurePeriod(row.period, expectedPeriod, rowNumber, errors);

    const topic = readTextField(
      row.topic,
      rowNumber,
      "topic",
      getHeaderLabel("question-performance", "topic"),
      rowErrors,
      true
    );
    const questionText = readTextField(
      row.question_text,
      rowNumber,
      "question_text",
      getHeaderLabel("question-performance", "question_text"),
      rowErrors,
      true
    );
    const correctCount = readNumberField(row.correct_count, {
      row: rowNumber,
      field: "correct_count",
      label: getHeaderLabel("question-performance", "correct_count"),
      errors: rowErrors,
      integer: true
    }) ?? 0;
    const wrongCount = readNumberField(row.wrong_count, {
      row: rowNumber,
      field: "wrong_count",
      label: getHeaderLabel("question-performance", "wrong_count"),
      errors: rowErrors,
      integer: true
    }) ?? 0;
    const providedAccuracy = readNumberField(row.accuracy_rate, {
      row: rowNumber,
      field: "accuracy_rate",
      label: getHeaderLabel("question-performance", "accuracy_rate"),
      errors: rowErrors,
      nullable: true
    });
    const hasQuestionCounts = hasNumericInput(row.correct_count, true) || hasNumericInput(row.wrong_count, true);
    const computedAccuracy = computeQuestionAccuracy(correctCount, wrongCount);

    if (
      providedAccuracy !== null &&
      hasQuestionCounts &&
      Math.abs(providedAccuracy - computedAccuracy) > 0.01
    ) {
      pushImportError(
        rowErrors,
        rowNumber,
        "accuracy_rate",
        `${getHeaderLabel("question-performance", "accuracy_rate")} değeri doğru/yanlış sayılarıyla uyuşmuyor. Beklenen: ${computedAccuracy}.`
      );
    }

    const record = {
      id: createDeterministicId(expectedPeriod, "question", topic, questionText),
      period: expectedPeriod,
      topic,
      questionText,
      correctCount,
      wrongCount,
      accuracyRate: hasQuestionCounts ? computedAccuracy : (providedAccuracy ?? 0)
    };

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      return;
    }

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
    const rowErrors: ImportPreviewError[] = [];
    ensurePeriod(row.period, expectedPeriod, rowNumber, errors);

    const representativeName = readTextField(
      row.representative_name,
      rowNumber,
      "representative_name",
      getHeaderLabel("qt-metrics", "representative_name"),
      rowErrors,
      true
    );
    const feedbackCountValue = readNumberField(row.feedback_count, {
      row: rowNumber,
      field: "feedback_count",
      label: getHeaderLabel("qt-metrics", "feedback_count"),
      errors: rowErrors,
      integer: true,
      nullable: true
    });
    const listeningHours = readNumberField(row.listening_hours, {
      row: rowNumber,
      field: "listening_hours",
      label: getHeaderLabel("qt-metrics", "listening_hours"),
      errors: rowErrors
    }) ?? 0;
    const listenedDurationSeconds = Math.round(listeningHours * 3600);

    const record = {
      id: createDeterministicId(expectedPeriod, "qt", representativeName),
      period: expectedPeriod,
      representativeKey: normalizeKey(representativeName),
      representativeName,
      listenedCallCount: readNumberField(row.listened_call_count, {
        row: rowNumber,
        field: "listened_call_count",
        label: getHeaderLabel("qt-metrics", "listened_call_count"),
        errors: rowErrors,
        integer: true
      }) ?? 0,
      listenedDurationSeconds,
      totalEvaluatedCallCount: readNumberField(row.evaluated_call_count_total, {
        row: rowNumber,
        field: "evaluated_call_count_total",
        label: getHeaderLabel("qt-metrics", "evaluated_call_count_total"),
        errors: rowErrors,
        integer: true,
        nullable: true
      }),
      totalEvaluatedChatMailCount: readNumberField(row.evaluated_chat_mail_count_total, {
        row: rowNumber,
        field: "evaluated_chat_mail_count_total",
        label: getHeaderLabel("qt-metrics", "evaluated_chat_mail_count_total"),
        errors: rowErrors,
        integer: true,
        nullable: true
      }),
      feedbackCount: feedbackCountValue,
      feedbackCoverage: computeFeedbackCoverage(listenedDurationSeconds / 3600, feedbackCountValue)
    };

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      return;
    }

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
    const rowErrors: ImportPreviewError[] = [];
    ensurePeriod(row.period, expectedPeriod, rowNumber, errors);

    const representativeName = readTextField(
      row.representative_name,
      rowNumber,
      "representative_name",
      getHeaderLabel("qt-metrics", "representative_name"),
      rowErrors,
      true
    );
    const listenedDurationSeconds = readNumberField(row.duration_seconds, {
      row: rowNumber,
      field: "duration_seconds",
      label: getHeaderLabel("qt-metrics", "duration_seconds"),
      errors: rowErrors,
      integer: true
    }) ?? 0;

    if (!representativeName) {
      errors.push(...rowErrors);
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
      evaluatedCallCount = readNumberField(row.evaluated_call_count_total, {
        row: rowNumber,
        field: "evaluated_call_count_total",
        label: getHeaderLabel("qt-metrics", "evaluated_call_count_total"),
        errors: rowErrors,
        integer: true,
        nullable: true
      });
    }
    if (evaluatedChatMailCount === null) {
      evaluatedChatMailCount = readNumberField(row.evaluated_chat_mail_count_total, {
        row: rowNumber,
        field: "evaluated_chat_mail_count_total",
        label: getHeaderLabel("qt-metrics", "evaluated_chat_mail_count_total"),
        errors: rowErrors,
        integer: true,
        nullable: true
      });
    }
    if (feedbackCount === null) {
      feedbackCount = readNumberField(row.feedback_count, {
        row: rowNumber,
        field: "feedback_count",
        label: getHeaderLabel("qt-metrics", "feedback_count"),
        errors: rowErrors,
        integer: true,
        nullable: true
      });
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
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
  datasetType: "audit-metrics";
  text: string;
  expectedPeriod: string;
}): CsvImportPreview<AuditMetric>;
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
  const parserErrors = parsed.errors.map<ImportPreviewError>((error) => ({
    row: (error.row ?? 0) + 2,
    message: error.message
  }));
  const headerErrors = validateRequiredHeaders(input.datasetType, parsed.meta.fields);
  const rawRows = parsed.data.filter((row: CsvRow) =>
    Object.values(row).some((value) => typeof value === "string" && value.trim() !== "")
  );
  const rows = filterImportRows(rawRows, input.datasetType);
  if (rows.length === 0) {
    pushImportError(parserErrors, 2, undefined, "CSV dosyasında en az bir veri satırı bulunmalıdır.");
  }

  if (parserErrors.length > 0 || headerErrors.length > 0) {
    return {
      datasetType: input.datasetType,
      sha256,
      rowCount: rows.length,
      validRows: [],
      previewRows: [],
      errors: [...headerErrors, ...parserErrors]
    } as ParsedPreview;
  }

  const normalizedRows = canonicalizeRows(rows, input.datasetType);

  if (input.datasetType === "agent-metrics") {
    return parseAgentMetrics(normalizedRows, input.expectedPeriod, sha256);
  }

  if (input.datasetType === "audit-metrics") {
    return parseAuditMetrics(normalizedRows, input.expectedPeriod, sha256);
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
