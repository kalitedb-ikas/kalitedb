import { describe, expect, it } from "vitest";

import { parseDatasetCsv } from "./csv";

describe("csv parser", () => {
  it("agent metrics csv dosyasini parse eder", () => {
    const preview = parseDatasetCsv({
      datasetType: "agent-metrics",
      expectedPeriod: "2026-02",
      text: [
        "M.T,Audit Skoru,Önceki Audit Doğruluk Oranı,Toplam Çağrı Adedi,Toplam Chat / Mail Adedi,Toplam Ticket Kapatma Adedi,Ortalama Konuşma Süresi,Lokal Kapatma Oranı,Kaçan Çağrılar,Çağrı Değerlendirme Ortalaması,Değerlendirme Adeti",
        "Ali Veli,90,95,100,40,3,300,88,2,4.95,80"
      ].join("\n")
    });

    if (preview.datasetType !== "agent-metrics") {
      throw new Error("agent metrics preview bekleniyordu");
    }

    expect(preview.errors).toHaveLength(0);
    expect(preview.validRows[0]?.totalConversationCount).toBe(143);
  });

  it("donem uyumsuzlugunu hata olarak doner", () => {
    const preview = parseDatasetCsv({
      datasetType: "question-performance",
      expectedPeriod: "2026-02",
      text: [
        "period,Sorular (CS-KEY),Doğru Bilinme Oranı,Doğru,Yanlış,Konu Başlıkları",
        "2026-01,Soru,73.53,25,9,Pazaryeri"
      ].join("\n")
    });

    expect(preview.errors[0]?.field).toBe("period");
  });

  it("qt csv dosyasini temsilci bazinda toplulastirir", () => {
    const preview = parseDatasetCsv({
      datasetType: "qt-metrics",
      expectedPeriod: "2026-02",
      text: [
        "Müşteri Temsilcisi,Süre ( saniye cinsinde ),Çağrı Tarihi,Aranan Numara,Arayan Numara",
        "Ali Veli,300,2026-02-01,0850,0533",
        "Ali Veli,120,2026-02-02,0850,0533",
        "Ayşe Kaya,180,2026-02-03,0850,0533"
      ].join("\n")
    });

    if (preview.datasetType !== "qt-metrics") {
      throw new Error("qt preview bekleniyordu");
    }

    expect(preview.validRows).toHaveLength(2);
    expect(preview.validRows[0]?.listenedCallCount).toBe(2);
    expect(preview.validRows[0]?.listenedDurationSeconds).toBe(420);
  });
});
