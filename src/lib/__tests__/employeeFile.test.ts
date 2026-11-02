import { describe, expect, it } from "vitest";
import type { Employee } from "../../types";
import { employeesToFile, mergeEmployees, parseEmployeesFile } from "../employeeFile";

const a: Employee = { id: "a", name: "Anna", employmentType: "VOLLZEIT", targetMinutes: 168 * 60 };
const b: Employee = { id: "b", name: "Binh", employmentType: "TEILZEIT", targetMinutes: 20 * 60, shiftHours: { min: 2, max: 3 } };

describe("Nhân viên: Xuất / Nhập file", () => {
  it("liest die eigene Datei verlustfrei zurück (inkl. Luật riêng)", () => {
    expect(parseEmployeesFile(employeesToFile([a, b]))).toEqual([a, b]);
  });

  it("akzeptiert auch eine reine Liste und einen kompletten App-Stand", () => {
    expect(parseEmployeesFile(JSON.stringify([a]))).toEqual([a]);
    expect(parseEmployeesFile(JSON.stringify({ schedule: { employees: [b] } }))).toEqual([b]);
  });

  it("nennt den konkreten Fehler", () => {
    expect(() => parseEmployeesFile("kein json")).toThrow(/JSON/);
    expect(() => parseEmployeesFile("{}")).toThrow(/không có danh sách/);
    expect(() => parseEmployeesFile("[]")).toThrow(/trống/);
    expect(() => parseEmployeesFile(JSON.stringify([{ ...a, employmentType: "MINIJOB" }]))).toThrow(/Dòng 1 \(Anna\).*MINIJOB/);
    expect(() => parseEmployeesFile(JSON.stringify([{ ...a, id: undefined }]))).toThrow(/id/);
  });

  it("add behält vorhandene und ergänzt fehlende; replace ersetzt alles", () => {
    const changedA = { ...a, targetMinutes: 100 * 60 };
    expect(mergeEmployees([changedA], [a, b], "add")).toEqual([changedA, b]);
    expect(mergeEmployees([changedA], [a, b], "replace")).toEqual([a, b]);
  });
});
