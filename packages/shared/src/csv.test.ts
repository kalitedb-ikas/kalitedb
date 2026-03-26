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

  it("audit csv dosyasini ayri veri kumesi olarak parse eder", () => {
    const preview = parseDatasetCsv({
      datasetType: "audit-metrics",
      expectedPeriod: "2026-02",
      text: [
        "Temsilci,Audit skoru,Önceki audit doğruluk oranı",
        "Ali Veli,91,88"
      ].join("\n")
    });

    if (preview.datasetType !== "audit-metrics") {
      throw new Error("audit metrics preview bekleniyordu");
    }

    expect(preview.errors).toHaveLength(0);
    expect(preview.validRows[0]?.auditScore).toBe(91);
    expect(preview.validRows[0]?.previousAuditAccuracy).toBe(88);
  });

  it("audit puani basligini audit skoru olarak esler", () => {
    const preview = parseDatasetCsv({
      datasetType: "audit-metrics",
      expectedPeriod: "2026-02",
      text: [
        "Temsilci,Audit Puanı,Önceki audit doğruluk oranı",
        "Ali Veli,91,88"
      ].join("\n")
    });

    if (preview.datasetType !== "audit-metrics") {
      throw new Error("audit metrics preview bekleniyordu");
    }

    expect(preview.errors).toHaveLength(0);
    expect(preview.validRows[0]?.auditScore).toBe(91);
    expect(preview.validRows[0]?.previousAuditAccuracy).toBe(88);
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

  it("bozuk sayi alanlarini hata olarak doner", () => {
    const preview = parseDatasetCsv({
      datasetType: "agent-metrics",
      expectedPeriod: "2026-02",
      text: [
        "Temsilci,Toplam çağrı adedi,Toplam chat / e-posta adedi,Toplam ticket kapatma adedi",
        "Ali Veli,abc,40,3"
      ].join("\n")
    });

    expect(preview.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row: 2,
          field: "total_call_count"
        })
      ])
    );
    expect(preview.validRows).toHaveLength(0);
  });

  it("eksik zorunlu basliklari hata olarak doner", () => {
    const preview = parseDatasetCsv({
      datasetType: "question-performance",
      expectedPeriod: "2026-02",
      text: [
        "Soru metni,Doğru,Yanlış",
        "Soru,25,9"
      ].join("\n")
    });

    expect(preview.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row: 1,
          field: "topic"
        })
      ])
    );
    expect(preview.validRows).toHaveLength(0);
  });

  it("bos ve tire sayisal degerleri hata saymaz", () => {
    const preview = parseDatasetCsv({
      datasetType: "agent-metrics",
      expectedPeriod: "2026-02",
      text: [
        "Temsilci,Audit skoru,Önceki audit doğruluk oranı,Toplam çağrı adedi,Toplam chat / e-posta adedi,Toplam ticket kapatma adedi,Toplam görüşme adedi",
        "Ali Veli,-,,100,-,,100"
      ].join("\n")
    });

    if (preview.datasetType !== "agent-metrics") {
      throw new Error("agent metrics preview bekleniyordu");
    }

    expect(preview.errors).toHaveLength(0);
    expect(preview.validRows[0]?.auditScore).toBeNull();
    expect(preview.validRows[0]?.previousAuditAccuracy).toBeNull();
    expect(preview.validRows[0]?.totalCallCount).toBe(100);
    expect(preview.validRows[0]?.totalChatMailCount).toBe(0);
    expect(preview.validRows[0]?.totalTicketClosedCount).toBe(0);
    expect(preview.validRows[0]?.totalConversationCount).toBe(100);
  });

  it("csat raporundaki ortalama ve alt tablo satirlarini yok sayar", () => {
    const preview = parseDatasetCsv({
      datasetType: "agent-metrics",
      expectedPeriod: "2026-02",
      text: [
        "E-Posta,M.T,Toplam Çağrı Adedi,Toplam Chat / Mail Adedi,Toplam Ticket Kapatma Adedi,Toplam Görüşme Adedi",
        "ali@example.com,Ali Veli,100,40,3,143",
        "ayse@example.com,Ayşe Kaya,-,20,1,21",
        "Ortalama,,50,30,2,82",
        ",Çağrı Adet,,Live Chat Adet,,",
        ",Gelen,5561,10538,,",
        ",Toplam,11009,,,"
      ].join("\n")
    });

    if (preview.datasetType !== "agent-metrics") {
      throw new Error("agent metrics preview bekleniyordu");
    }

    expect(preview.errors).toHaveLength(0);
    expect(preview.rowCount).toBe(2);
    expect(preview.validRows).toHaveLength(2);
    expect(preview.validRows.map((row) => row.agentName)).toEqual(["Ali Veli", "Ayşe Kaya"]);
  });

  it("dogru yanlis bosken dogruluk oranini kabul eder", () => {
    const preview = parseDatasetCsv({
      datasetType: "question-performance",
      expectedPeriod: "2026-02",
      text: [
        "Soru metni,Doğru bilinme oranı,Doğru,Yanlış,Konu başlıkları",
        "Soru,73.53,-,,Pazaryeri"
      ].join("\n")
    });

    if (preview.datasetType !== "question-performance") {
      throw new Error("question performance preview bekleniyordu");
    }

    expect(preview.errors).toHaveLength(0);
    expect(preview.validRows[0]?.accuracyRate).toBe(73.53);
    expect(preview.validRows[0]?.correctCount).toBe(0);
    expect(preview.validRows[0]?.wrongCount).toBe(0);
  });

  it("audit bilinme orani csv basliklarini ve bos konu alanini kabul eder", () => {
    const preview = parseDatasetCsv({
      datasetType: "question-performance",
      expectedPeriod: "2026-02",
      text: [
        "Soru,Yanlış Bilinme Oranı,Doğru Adet,Yanlış Adet,KONU",
        'Ornek soru,"38,24%",13,21,'
      ].join("\n")
    });

    if (preview.datasetType !== "question-performance") {
      throw new Error("question performance preview bekleniyordu");
    }

    expect(preview.errors).toHaveLength(0);
    expect(preview.validRows[0]?.questionText).toBe("Ornek soru");
    expect(preview.validRows[0]?.correctCount).toBe(13);
    expect(preview.validRows[0]?.wrongCount).toBe(21);
    expect(preview.validRows[0]?.accuracyRate).toBe(38.24);
    expect(preview.validRows[0]?.topic).toBe("Genel");
  });
});
