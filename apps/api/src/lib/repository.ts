import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DEFAULT_THRESHOLDS,
  agentMetricSchema,
  auditMetricSchema,
  importJobSchema,
  questionPerformanceSchema,
  qtManualEntrySchema,
  qtMetricSchema,
  reportPeriodSchema,
  type AgentMetric,
  type AuditMetric,
  type DatasetType,
  type ImportJob,
  type KpiMetricKey,
  type QuestionPerformance,
  type QtManualEntry,
  type QtMetric,
  type ReportDatasets,
  type ReportPeriod,
  type ThresholdConfig,
  type UserRoleAssignment
} from "@kalitedb/shared";
import {
  getFirebaseAdminAuth,
  getFirebaseAdminDb,
  getFirebaseAdminStorage,
  isFirebaseAdminAvailable
} from "./firebase-admin";
import { ApiError } from "./responses";

type DatasetRecordMap = {
  "agent-metrics": AgentMetric;
  "audit-metrics": AuditMetric;
  "question-performance": QuestionPerformance;
  "qt-metrics": QtMetric;
};

type PeriodDetailsOptions = {
  datasetTypes?: DatasetType[] | undefined;
  includeImportJobs?: boolean | undefined;
  importJobLimit?: number | undefined;
};

type LocalDb = {
  reportPeriods: ReportPeriod[];
  datasets: Record<string, ReportDatasets>;
  thresholds: Record<KpiMetricKey, ThresholdConfig>;
  importJobs: ImportJob[];
  userRoles: UserRoleAssignment[];
  qtManualEntries: QtManualEntry[];
};

export type ReportPeriodDraftPatch = Partial<
  Pick<
    ReportPeriod,
    "title" | "compareToPeriodId" | "manualTotalCallCount" | "manualTotalChatMailCount" | "manualTotalTicketClosedCount"
  >
>;

export type Repository = {
  listReportPeriods(): Promise<ReportPeriod[]>;
  getReportPeriod(periodId: string): Promise<ReportPeriod | undefined>;
  hasAnyUserRoles(): Promise<boolean>;
  getPeriodDetails(periodId: string, options?: PeriodDetailsOptions): Promise<{
    period: ReportPeriod;
    datasets: ReportDatasets;
    importJobs: ImportJob[];
  } | undefined>;
  getDatasetRecord<T extends DatasetType>(
    periodId: string,
    datasetType: T,
    recordId: string
  ): Promise<DatasetRecordMap[T] | undefined>;
  createReportPeriod(input: {
    month: string;
    title: string;
    compareToPeriodId?: string;
  }): Promise<ReportPeriod>;
  updateReportPeriod(periodId: string, patch: ReportPeriodDraftPatch): Promise<ReportPeriod>;
  replaceDataset<T extends DatasetType>(
    periodId: string,
    datasetType: T,
    rows: DatasetRecordMap[T][]
  ): Promise<void>;
  updateDatasetRecord<T extends DatasetType>(
    periodId: string,
    datasetType: T,
    record: DatasetRecordMap[T]
  ): Promise<DatasetRecordMap[T]>;
  createImportJob(job: ImportJob): Promise<void>;
  publishPeriod(periodId: string): Promise<ReportPeriod>;
  reopenPeriod(periodId: string): Promise<ReportPeriod>;
  getThresholds(): Promise<Record<KpiMetricKey, ThresholdConfig>>;
  updateThresholds(input: Partial<Record<KpiMetricKey, ThresholdConfig>>): Promise<Record<KpiMetricKey, ThresholdConfig>>;
  listUserRoles(): Promise<UserRoleAssignment[]>;
  upsertUserRole(input: UserRoleAssignment): Promise<UserRoleAssignment>;
  findRoleByEmail(email: string): Promise<UserRoleAssignment["role"] | undefined>;
  getQtManualEntry(periodId: string, userKey: string): Promise<QtManualEntry | undefined>;
  listQtManualEntries(periodId: string): Promise<QtManualEntry[]>;
  upsertQtManualEntry(entry: QtManualEntry): Promise<QtManualEntry>;
  storeImportFile(storagePath: string, content: string): Promise<void>;
};

const DATA_FILE_PATH = path.join(process.cwd(), ".data", "local-db.json");
const ALL_DATASET_TYPES: DatasetType[] = ["agent-metrics", "audit-metrics", "question-performance", "qt-metrics"];

function emptyDatasets(): ReportDatasets {
  return {
    agentMetrics: [],
    auditMetrics: [],
    questionPerformance: [],
    qtMetrics: []
  };
}

async function ensureLocalDb(): Promise<LocalDb> {
  try {
    const raw = await readFile(DATA_FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<LocalDb>;
    return {
      reportPeriods: parsed.reportPeriods ?? [],
      datasets: parsed.datasets ?? {},
      thresholds: parsed.thresholds ?? structuredClone(DEFAULT_THRESHOLDS),
      importJobs: parsed.importJobs ?? [],
      userRoles: parsed.userRoles ?? [],
      qtManualEntries: parsed.qtManualEntries ?? []
    };
  } catch {
    const db: LocalDb = {
      reportPeriods: [],
      datasets: {},
      thresholds: structuredClone(DEFAULT_THRESHOLDS),
      importJobs: [],
      userRoles: [],
      qtManualEntries: []
    };

    await persistLocalDb(db);
    return db;
  }
}

async function persistLocalDb(db: LocalDb) {
  await mkdir(path.dirname(DATA_FILE_PATH), { recursive: true });
  await writeFile(DATA_FILE_PATH, JSON.stringify(db, null, 2), "utf8");
}

function sortPeriods(periods: ReportPeriod[]) {
  return [...periods].sort((left, right) => right.month.localeCompare(left.month));
}

function datasetKeyToProperty(datasetType: DatasetType): keyof ReportDatasets {
  if (datasetType === "agent-metrics") {
    return "agentMetrics";
  }

  if (datasetType === "audit-metrics") {
    return "auditMetrics";
  }

  if (datasetType === "question-performance") {
    return "questionPerformance";
  }

  return "qtMetrics";
}

function parseDatasetRecord<T extends DatasetType>(datasetType: T, record: DatasetRecordMap[T]): DatasetRecordMap[T] {
  if (datasetType === "agent-metrics") {
    return agentMetricSchema.parse(record) as DatasetRecordMap[T];
  }

  if (datasetType === "audit-metrics") {
    return auditMetricSchema.parse(record) as DatasetRecordMap[T];
  }

  if (datasetType === "question-performance") {
    return questionPerformanceSchema.parse(record) as DatasetRecordMap[T];
  }

  return qtMetricSchema.parse(record) as DatasetRecordMap[T];
}

function normalizeRoleEmail(email: string) {
  return email.trim().toLocaleLowerCase("tr-TR");
}

function getSelectedDatasetTypes(datasetTypes?: DatasetType[]) {
  return datasetTypes?.length ? datasetTypes : ALL_DATASET_TYPES;
}

function buildFilteredDatasets(datasets: ReportDatasets, datasetTypes?: DatasetType[]): ReportDatasets {
  const selected = new Set(getSelectedDatasetTypes(datasetTypes));

  return {
    agentMetrics: selected.has("agent-metrics") ? datasets.agentMetrics ?? [] : [],
    auditMetrics: selected.has("audit-metrics") ? datasets.auditMetrics ?? [] : [],
    questionPerformance: selected.has("question-performance") ? datasets.questionPerformance ?? [] : [],
    qtMetrics: selected.has("qt-metrics") ? datasets.qtMetrics ?? [] : []
  };
}

function limitImportJobs(importJobs: ImportJob[], limit?: number) {
  if (!limit || limit < 1) {
    return importJobs;
  }

  return importJobs.slice(0, limit);
}

function chunkItems<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function createFileRepository(): Promise<Repository> {
  return {
    async listReportPeriods() {
      const db = await ensureLocalDb();
      return sortPeriods(db.reportPeriods);
    },
    async getReportPeriod(periodId) {
      const db = await ensureLocalDb();
      return db.reportPeriods.find((period) => period.id === periodId);
    },
    async hasAnyUserRoles() {
      const db = await ensureLocalDb();
      return db.userRoles.length > 0;
    },
    async getPeriodDetails(periodId, options) {
      const db = await ensureLocalDb();
      const period = db.reportPeriods.find((entry) => entry.id === periodId);
      if (!period) {
        return undefined;
      }

      const filteredImportJobs = db.importJobs
        .filter((job) => job.periodId === periodId)
        .sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt));

      return {
        period,
        datasets: buildFilteredDatasets(db.datasets[periodId] ?? emptyDatasets(), options?.datasetTypes),
        importJobs: options?.includeImportJobs === false ? [] : limitImportJobs(filteredImportJobs, options?.importJobLimit)
      };
    },
    async getDatasetRecord(periodId, datasetType, recordId) {
      const db = await ensureLocalDb();
      const property = datasetKeyToProperty(datasetType);
      const rows = db.datasets[periodId]?.[property] as DatasetRecordMap[typeof datasetType][] | undefined;
      return rows?.find((record) => record.id === recordId);
    },
    async createReportPeriod(input) {
      const db = await ensureLocalDb();
      const now = new Date().toISOString();
      const period = reportPeriodSchema.parse({
        id: crypto.randomUUID(),
        month: input.month,
        title: input.title,
        status: "draft",
        compareToPeriodId: input.compareToPeriodId,
        createdAt: now,
        updatedAt: now
      });

      db.reportPeriods.push(period);
      db.datasets[period.id] = emptyDatasets();
      await persistLocalDb(db);
      return period;
    },
    async updateReportPeriod(periodId, patch) {
      const db = await ensureLocalDb();
      const index = db.reportPeriods.findIndex((period) => period.id === periodId);
      if (index < 0) {
        throw new ApiError(404, "Dönem bulunamadı.");
      }

      const updated = reportPeriodSchema.parse({
        ...db.reportPeriods[index],
        ...patch,
        updatedAt: new Date().toISOString()
      });

      db.reportPeriods[index] = updated;
      await persistLocalDb(db);
      return updated;
    },
    async replaceDataset(periodId, datasetType, rows) {
      const db = await ensureLocalDb();
      db.datasets[periodId] ??= emptyDatasets();

      if (datasetType === "agent-metrics") {
        db.datasets[periodId].agentMetrics = (rows as AgentMetric[]).map((row) => agentMetricSchema.parse(row));
      } else if (datasetType === "audit-metrics") {
        db.datasets[periodId].auditMetrics = (rows as AuditMetric[]).map((row) => auditMetricSchema.parse(row));
      } else if (datasetType === "question-performance") {
        db.datasets[periodId].questionPerformance = (rows as QuestionPerformance[]).map((row) =>
          questionPerformanceSchema.parse(row)
        );
      } else {
        db.datasets[periodId].qtMetrics = (rows as QtMetric[]).map((row) => qtMetricSchema.parse(row));
      }

      await persistLocalDb(db);
    },
    async updateDatasetRecord(periodId, datasetType, record) {
      const db = await ensureLocalDb();
      db.datasets[periodId] ??= emptyDatasets();
      const property = datasetKeyToProperty(datasetType);
      const rows = db.datasets[periodId][property] as DatasetRecordMap[typeof datasetType][];
      const index = rows.findIndex((entry) => entry.id === record.id);

      if (index < 0) {
        throw new ApiError(404, "Kayıt bulunamadı.");
      }

      const parsed = parseDatasetRecord(datasetType, record);
      rows[index] = parsed;

      if (datasetType === "agent-metrics") {
        db.datasets[periodId].agentMetrics = rows as AgentMetric[];
      } else if (datasetType === "audit-metrics") {
        db.datasets[periodId].auditMetrics = rows as AuditMetric[];
      } else if (datasetType === "question-performance") {
        db.datasets[periodId].questionPerformance = rows as QuestionPerformance[];
      } else {
        db.datasets[periodId].qtMetrics = rows as QtMetric[];
      }

      await persistLocalDb(db);
      return parsed;
    },
    async createImportJob(job) {
      const db = await ensureLocalDb();
      db.importJobs.push(importJobSchema.parse(job));
      await persistLocalDb(db);
    },
    async publishPeriod(periodId) {
      const db = await ensureLocalDb();
      const index = db.reportPeriods.findIndex((entry) => entry.id === periodId);
      if (index < 0) {
        throw new ApiError(404, "Dönem bulunamadı.");
      }

      const published = reportPeriodSchema.parse({
        ...db.reportPeriods[index],
        status: "published",
        publishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      db.reportPeriods[index] = published;
      await persistLocalDb(db);
      return published;
    },
    async reopenPeriod(periodId) {
      const db = await ensureLocalDb();
      const index = db.reportPeriods.findIndex((period) => period.id === periodId);
      if (index < 0) {
        throw new ApiError(404, "Dönem bulunamadı.");
      }

      const reopened = reportPeriodSchema.parse({
        ...db.reportPeriods[index],
        status: "draft",
        updatedAt: new Date().toISOString()
      });

      db.reportPeriods[index] = reopened;
      await persistLocalDb(db);
      return reopened;
    },
    async getThresholds() {
      const db = await ensureLocalDb();
      return db.thresholds;
    },
    async updateThresholds(input) {
      const db = await ensureLocalDb();
      db.thresholds = {
        ...db.thresholds,
        ...input
      };
      await persistLocalDb(db);
      return db.thresholds;
    },
    async listUserRoles() {
      const db = await ensureLocalDb();
      return db.userRoles.sort((left, right) => left.email.localeCompare(right.email));
    },
    async upsertUserRole(input) {
      const db = await ensureLocalDb();
      const normalizedEmail = normalizeRoleEmail(input.email);
      const index = db.userRoles.findIndex((assignment) => normalizeRoleEmail(assignment.email) === normalizedEmail);
      if (index >= 0) {
        db.userRoles[index] = input;
      } else {
        db.userRoles.push(input);
      }

      await persistLocalDb(db);
      return input;
    },
    async findRoleByEmail(email) {
      const db = await ensureLocalDb();
      return db.userRoles.find((assignment) => normalizeRoleEmail(assignment.email) === normalizeRoleEmail(email))?.role;
    },
    async getQtManualEntry(periodId, userKey) {
      const db = await ensureLocalDb();
      return db.qtManualEntries.find((entry) => entry.periodId === periodId && entry.userKey === userKey);
    },
    async listQtManualEntries(periodId) {
      const db = await ensureLocalDb();
      return db.qtManualEntries
        .filter((entry) => entry.periodId === periodId)
        .sort((left, right) => left.userName.localeCompare(right.userName, "tr"));
    },
    async upsertQtManualEntry(entry) {
      const db = await ensureLocalDb();
      const parsed = qtManualEntrySchema.parse(entry);
      const index = db.qtManualEntries.findIndex(
        (current) => current.periodId === parsed.periodId && current.userKey === parsed.userKey
      );

      if (index >= 0) {
        db.qtManualEntries[index] = parsed;
      } else {
        db.qtManualEntries.push(parsed);
      }

      await persistLocalDb(db);
      return parsed;
    },
    async storeImportFile(storagePath, content) {
      const filePath = path.join(process.cwd(), ".data", storagePath);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, content, "utf8");
    }
  };
}

async function deleteCollectionDocs(collectionPath: string) {
  const db = getFirebaseAdminDb();
  const refs = await db.collection(collectionPath).listDocuments();

  if (!refs.length) {
    return;
  }

  for (const chunk of chunkItems(refs, 500)) {
    const batch = db.batch();
    chunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

async function createFirebaseRepository(): Promise<Repository> {
  const db = getFirebaseAdminDb();
  const auth = getFirebaseAdminAuth();
  const storage = getFirebaseAdminStorage();
  const fetchReportPeriod = async (periodId: string) => {
    const doc = await db.collection("reportPeriods").doc(periodId).get();
    if (!doc.exists) {
      return undefined;
    }

    return reportPeriodSchema.parse({ id: doc.id, ...doc.data() });
  };
  const fetchThresholds = async () => {
    const snapshot = await db.collection("thresholdConfigs").get();
    if (snapshot.empty) {
      return structuredClone(DEFAULT_THRESHOLDS);
    }

    return snapshot.docs.reduce((accumulator, doc) => {
      const record = doc.data() as ThresholdConfig;
      accumulator[doc.id as KpiMetricKey] = record;
      return accumulator;
    }, {} as Record<KpiMetricKey, ThresholdConfig>);
  };
  const fetchDataset = async <T extends DatasetType>(periodId: string, datasetType: T) => {
    const property = datasetKeyToProperty(datasetType);
    const snapshot = await db.collection("reportPeriods").doc(periodId).collection(property).get();

    return snapshot.docs.map((doc) =>
      parseDatasetRecord(datasetType, { id: doc.id, ...doc.data() } as DatasetRecordMap[T])
    );
  };
  const fetchImportJobs = async (periodId: string, limit?: number) => {
    let query = db.collection("importJobs").where("periodId", "==", periodId).orderBy("uploadedAt", "desc");
    if (limit && limit > 0) {
      query = query.limit(limit);
    }
    const snapshot = await query.get();
    return snapshot.docs.map((doc) => importJobSchema.parse({ id: doc.id, ...doc.data() }));
  };

  return {
    async listReportPeriods() {
      const snapshot = await db.collection("reportPeriods").orderBy("month", "desc").get();
      const periods = snapshot.docs.map((doc) => reportPeriodSchema.parse({ id: doc.id, ...doc.data() }));
      return periods;
    },
    async getReportPeriod(periodId) {
      return fetchReportPeriod(periodId);
    },
    async hasAnyUserRoles() {
      const snapshot = await db.collection("userRoles").limit(1).get();
      return !snapshot.empty;
    },
    async getPeriodDetails(periodId, options) {
      const period = await fetchReportPeriod(periodId);
      if (!period) {
        return undefined;
      }

      const selectedDatasetTypes = getSelectedDatasetTypes(options?.datasetTypes);
      const [agentMetrics, auditMetrics, questionPerformance, qtMetrics, importJobs] = await Promise.all([
        selectedDatasetTypes.includes("agent-metrics")
          ? fetchDataset(periodId, "agent-metrics")
          : Promise.resolve([]),
        selectedDatasetTypes.includes("audit-metrics")
          ? fetchDataset(periodId, "audit-metrics")
          : Promise.resolve([]),
        selectedDatasetTypes.includes("question-performance")
          ? fetchDataset(periodId, "question-performance")
          : Promise.resolve([]),
        selectedDatasetTypes.includes("qt-metrics")
          ? fetchDataset(periodId, "qt-metrics")
          : Promise.resolve([]),
        options?.includeImportJobs === false
          ? Promise.resolve([])
          : fetchImportJobs(periodId, options?.importJobLimit)
      ]);

      return {
        period,
        datasets: {
          agentMetrics,
          auditMetrics,
          questionPerformance,
          qtMetrics
        },
        importJobs
      };
    },
    async getDatasetRecord(periodId, datasetType, recordId) {
      const property = datasetKeyToProperty(datasetType);
      const doc = await db.collection("reportPeriods").doc(periodId).collection(property).doc(recordId).get();
      return doc.exists
        ? parseDatasetRecord(datasetType, { id: doc.id, ...doc.data() } as DatasetRecordMap[typeof datasetType])
        : undefined;
    },
    async createReportPeriod(input) {
      const now = new Date().toISOString();
      const payload = reportPeriodSchema.parse({
        id: crypto.randomUUID(),
        month: input.month,
        title: input.title,
        status: "draft",
        compareToPeriodId: input.compareToPeriodId,
        createdAt: now,
        updatedAt: now
      });

      await db.collection("reportPeriods").doc(payload.id).set({
        month: payload.month,
        title: payload.title,
        status: payload.status,
        compareToPeriodId: payload.compareToPeriodId,
        createdAt: payload.createdAt,
        updatedAt: payload.updatedAt
      });

      return payload;
    },
    async updateReportPeriod(periodId, patch) {
      const current = await fetchReportPeriod(periodId);
      if (!current) {
        throw new ApiError(404, "Dönem bulunamadı.");
      }

      const updated = reportPeriodSchema.parse({
        ...current,
        ...patch,
        updatedAt: new Date().toISOString()
      });

      await db.collection("reportPeriods").doc(periodId).set(
        {
          month: updated.month,
          title: updated.title,
          status: updated.status,
          compareToPeriodId: updated.compareToPeriodId,
          ...(updated.manualTotalCallCount !== undefined
            ? { manualTotalCallCount: updated.manualTotalCallCount }
            : {}),
          ...(updated.manualTotalChatMailCount !== undefined
            ? { manualTotalChatMailCount: updated.manualTotalChatMailCount }
            : {}),
          ...(updated.manualTotalTicketClosedCount !== undefined
            ? { manualTotalTicketClosedCount: updated.manualTotalTicketClosedCount }
            : {}),
          publishedAt: updated.publishedAt,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt
        },
        { merge: true }
      );

      return updated;
    },
    async replaceDataset(periodId, datasetType, rows) {
      const property = datasetKeyToProperty(datasetType);
      const collectionName = property;
      await deleteCollectionDocs(`reportPeriods/${periodId}/${collectionName}`);

      for (const chunk of chunkItems(rows, 500)) {
        const batch = db.batch();
        chunk.forEach((row) => {
          const ref = db.collection("reportPeriods").doc(periodId).collection(collectionName).doc(row.id);
          batch.set(ref, row);
        });
        await batch.commit();
      }
    },
    async updateDatasetRecord(periodId, datasetType, record) {
      const property = datasetKeyToProperty(datasetType);
      const parsed = parseDatasetRecord(datasetType, record);
      await db.collection("reportPeriods").doc(periodId).collection(property).doc(record.id).set(parsed);
      return parsed;
    },
    async createImportJob(job) {
      await db.collection("importJobs").doc(job.id).set(importJobSchema.parse(job));
    },
    async publishPeriod(periodId) {
      const current = await fetchReportPeriod(periodId);
      if (!current) {
        throw new ApiError(404, "Dönem bulunamadı.");
      }

      const published = reportPeriodSchema.parse({
        ...current,
        status: "published",
        publishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      await db.collection("reportPeriods").doc(periodId).set(published, { merge: true });
      return published;
    },
    async reopenPeriod(periodId) {
      const current = await fetchReportPeriod(periodId);
      if (!current) {
        throw new ApiError(404, "Dönem bulunamadı.");
      }

      const reopened = reportPeriodSchema.parse({
        ...current,
        status: "draft",
        updatedAt: new Date().toISOString()
      });

      await db.collection("reportPeriods").doc(periodId).set(reopened, { merge: true });
      return reopened;
    },
    async getThresholds() {
      return fetchThresholds();
    },
    async updateThresholds(input) {
      const batch = db.batch();
      Object.entries(input).forEach(([metric, config]) => {
        if (!config) {
          return;
        }
        batch.set(db.collection("thresholdConfigs").doc(metric), config);
      });
      await batch.commit();
      return fetchThresholds();
    },
    async listUserRoles() {
      const snapshot = await db.collection("userRoles").orderBy("email", "asc").get();
      return snapshot.docs.map((doc) => doc.data() as UserRoleAssignment).sort((left, right) => left.email.localeCompare(right.email));
    },
    async upsertUserRole(input) {
      await db.collection("userRoles").doc(normalizeRoleEmail(input.email)).set(input);
      if (input.uid) {
        await auth.setCustomUserClaims(input.uid, { role: input.role });
      }
      return input;
    },
    async findRoleByEmail(email) {
      const doc = await db.collection("userRoles").doc(normalizeRoleEmail(email)).get();
      return doc.exists ? (doc.data() as UserRoleAssignment).role : undefined;
    },
    async getQtManualEntry(periodId, userKey) {
      const doc = await db
        .collection("reportPeriods")
        .doc(periodId)
        .collection("qtManualEntries")
        .doc(userKey)
        .get();

      return doc.exists ? qtManualEntrySchema.parse(doc.data()) : undefined;
    },
    async listQtManualEntries(periodId) {
      const snapshot = await db
        .collection("reportPeriods")
        .doc(periodId)
        .collection("qtManualEntries")
        .orderBy("userName", "asc")
        .get();

      return snapshot.docs.map((doc) => qtManualEntrySchema.parse(doc.data()));
    },
    async upsertQtManualEntry(entry) {
      const parsed = qtManualEntrySchema.parse(entry);
      await db
        .collection("reportPeriods")
        .doc(parsed.periodId)
        .collection("qtManualEntries")
        .doc(parsed.userKey)
        .set(parsed);
      return parsed;
    },
    async storeImportFile(storagePath, content) {
      const bucket = storage.bucket();
      await bucket.file(storagePath).save(content, {
        contentType: "text/csv; charset=utf-8"
      });
    }
  };
}

let repositoryPromise: Promise<Repository> | undefined;

function resolveDataDriver() {
  const driver = process.env.APP_DATA_DRIVER?.toLowerCase();
  if (driver === "firebase") {
    return { driver: "firebase" as const, source: "explicit" as const };
  }

  if (driver === "file") {
    return { driver: "file" as const, source: "explicit" as const };
  }

  return isFirebaseAdminAvailable()
    ? { driver: "firebase" as const, source: "auto" as const }
    : { driver: "file" as const, source: "auto-fallback" as const };
}

export async function getRepository(): Promise<Repository> {
  if (!repositoryPromise) {
    const resolvedDriver = resolveDataDriver();

    if (resolvedDriver.source === "auto-fallback") {
      console.warn(
        "APP_DATA_DRIVER=auto etkin ama Firebase Admin kimlik bilgileri bulunamadı; veri .data/local-db.json dosyasına yazılacak."
      );
    } else {
      console.info(`Repository veri sürücüsü: ${resolvedDriver.driver}`);
    }

    repositoryPromise = resolvedDriver.driver === "firebase" ? createFirebaseRepository() : createFileRepository();
  }

  return repositoryPromise;
}
