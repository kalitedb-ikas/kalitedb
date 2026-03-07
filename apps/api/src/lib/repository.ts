import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DEFAULT_THRESHOLDS,
  agentMetricSchema,
  importJobSchema,
  questionPerformanceSchema,
  qtManualEntrySchema,
  qtMetricSchema,
  reportPeriodSchema,
  type AgentMetric,
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
import { getFirebaseAdminAuth, getFirebaseAdminDb, getFirebaseAdminStorage } from "./firebase-admin";
import { ApiError } from "./responses";

type DatasetRecordMap = {
  "agent-metrics": AgentMetric;
  "question-performance": QuestionPerformance;
  "qt-metrics": QtMetric;
};

type LocalDb = {
  reportPeriods: ReportPeriod[];
  datasets: Record<string, ReportDatasets>;
  thresholds: Record<KpiMetricKey, ThresholdConfig>;
  importJobs: ImportJob[];
  userRoles: UserRoleAssignment[];
  qtManualEntries: QtManualEntry[];
};

export type ReportPeriodDraftPatch = Partial<Pick<ReportPeriod, "title" | "compareToPeriodId">>;

export type Repository = {
  listReportPeriods(): Promise<ReportPeriod[]>;
  getReportPeriod(periodId: string): Promise<ReportPeriod | undefined>;
  getPeriodDetails(periodId: string): Promise<{
    period: ReportPeriod;
    datasets: ReportDatasets;
    importJobs: ImportJob[];
  } | undefined>;
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
  upsertQtManualEntry(entry: QtManualEntry): Promise<QtManualEntry>;
  storeImportFile(storagePath: string, content: string): Promise<void>;
};

const DATA_FILE_PATH = path.join(process.cwd(), ".data", "local-db.json");

function emptyDatasets(): ReportDatasets {
  return {
    agentMetrics: [],
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

  if (datasetType === "question-performance") {
    return "questionPerformance";
  }

  return "qtMetrics";
}

function parseDatasetRecord<T extends DatasetType>(datasetType: T, record: DatasetRecordMap[T]): DatasetRecordMap[T] {
  if (datasetType === "agent-metrics") {
    return agentMetricSchema.parse(record) as DatasetRecordMap[T];
  }

  if (datasetType === "question-performance") {
    return questionPerformanceSchema.parse(record) as DatasetRecordMap[T];
  }

  return qtMetricSchema.parse(record) as DatasetRecordMap[T];
}

function normalizeRoleEmail(email: string) {
  return email.trim().toLocaleLowerCase("tr-TR");
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
    async getPeriodDetails(periodId) {
      const db = await ensureLocalDb();
      const period = db.reportPeriods.find((entry) => entry.id === periodId);
      if (!period) {
        return undefined;
      }

      return {
        period,
        datasets: db.datasets[periodId] ?? emptyDatasets(),
        importJobs: db.importJobs.filter((job) => job.periodId === periodId).sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt))
      };
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
  const snapshot = await db.collection(collectionPath).get();

  if (snapshot.empty) {
    return;
  }

  const batch = db.batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
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

  return {
    async listReportPeriods() {
      const snapshot = await db.collection("reportPeriods").get();
      const periods = snapshot.docs.map((doc) => reportPeriodSchema.parse({ id: doc.id, ...doc.data() }));
      return sortPeriods(periods);
    },
    async getReportPeriod(periodId) {
      return fetchReportPeriod(periodId);
    },
    async getPeriodDetails(periodId) {
      const period = await fetchReportPeriod(periodId);
      if (!period) {
        return undefined;
      }

      const [agentSnapshot, questionSnapshot, qtSnapshot, importSnapshot] = await Promise.all([
        db.collection("reportPeriods").doc(periodId).collection("agentMetrics").get(),
        db.collection("reportPeriods").doc(periodId).collection("questionPerformance").get(),
        db.collection("reportPeriods").doc(periodId).collection("qtMetrics").get(),
        db.collection("importJobs").where("periodId", "==", periodId).get()
      ]);

      return {
        period,
        datasets: {
          agentMetrics: agentSnapshot.docs.map((doc) => agentMetricSchema.parse({ id: doc.id, ...doc.data() })),
          questionPerformance: questionSnapshot.docs.map((doc) =>
            questionPerformanceSchema.parse({ id: doc.id, ...doc.data() })
          ),
          qtMetrics: qtSnapshot.docs.map((doc) => qtMetricSchema.parse({ id: doc.id, ...doc.data() }))
        },
        importJobs: importSnapshot.docs.map((doc) => importJobSchema.parse({ id: doc.id, ...doc.data() }))
      };
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

      const batch = db.batch();
      rows.forEach((row) => {
        const ref = db.collection("reportPeriods").doc(periodId).collection(collectionName).doc(row.id);
        batch.set(ref, row);
      });
      await batch.commit();
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
      const snapshot = await db.collection("userRoles").get();
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

export async function getRepository(): Promise<Repository> {
  if (!repositoryPromise) {
    repositoryPromise =
      process.env.APP_DATA_DRIVER === "firebase" ? createFirebaseRepository() : createFileRepository();
  }

  return repositoryPromise;
}
