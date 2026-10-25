import { describe, it, expect } from "vitest";
import {
  buildUserContent,
  getFileExtension,
  MAX_ATTACHMENT_BYTES,
  parseJsonResponse,
  toUserMessage,
  validateAttachment,
} from "../../src/services/Llm.jsx";
import { isMeaningful } from "../../src/popup/utils/validation.js";

// A File whose reported size can be faked without allocating the bytes.
function fakeSizedFile(name, size, type = "") {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("getFileExtension", () => {
  it("returns the lowercase extension", () => {
    expect(getFileExtension("Report.FINAL.PDF")).toBe("pdf");
  });
  it("returns '' when there is no extension", () => {
    expect(getFileExtension("README")).toBe("");
    expect(getFileExtension(undefined)).toBe("");
  });
});

describe("validateAttachment", () => {
  it("accepts supported document types", () => {
    for (const name of ["a.pdf", "b.doc", "c.docx", "d.txt"]) {
      expect(validateAttachment(new File(["hello"], name))).toBe("");
    }
  });
  it("rejects unsupported types", () => {
    expect(validateAttachment(new File(["hello"], "data.csv"))).toMatch(/only pdf/i);
  });
  it("rejects empty files", () => {
    expect(validateAttachment(new File([], "empty.pdf"))).toMatch(/empty/i);
  });
  it("rejects files over the size limit", () => {
    const big = fakeSizedFile("big.pdf", MAX_ATTACHMENT_BYTES + 1);
    expect(validateAttachment(big)).toMatch(/too large/i);
  });
  it("rejects something that is not a real file (e.g. {} restored from storage)", () => {
    expect(validateAttachment({})).not.toBe("");
  });
});

describe("buildUserContent", () => {
  it("sends only the prompt when there is no file", async () => {
    expect(await buildUserContent("hi", null)).toEqual([
      { type: "input_text", text: "hi" },
    ]);
  });

  it("inlines .txt files as text", async () => {
    const content = await buildUserContent("hi", new File(["notes here"], "notes.txt"));
    expect(content[0]).toEqual({
      type: "input_text",
      text: 'Attached file "notes.txt":\nnotes here',
    });
    expect(content[1]).toEqual({ type: "input_text", text: "hi" });
  });

  it("sends Word files as input_file with the correct MIME type even when file.type is empty", async () => {
    const content = await buildUserContent("hi", new File(["PK"], "resume.docx", { type: "" }));
    expect(content[0].type).toBe("input_file");
    expect(content[0].filename).toBe("resume.docx");
    expect(content[0].file_data).toMatch(
      /^data:application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document;base64,/
    );
  });

  it("throws a readable error for an invalid file", async () => {
    await expect(buildUserContent("hi", new File(["x"], "image.png"))).rejects.toThrow(/only pdf/i);
  });
});

describe("parseJsonResponse", () => {
  it("parses plain JSON", () => {
    expect(parseJsonResponse('{"valid":true}')).toEqual({ valid: true });
  });
  it("parses JSON wrapped in a markdown fence", () => {
    expect(parseJsonResponse('```json\n{"valid":false}\n```')).toEqual({ valid: false });
  });
  it("throws on non-JSON", () => {
    expect(() => parseJsonResponse("not-json")).toThrow();
  });
});

describe("toUserMessage", () => {
  it("explains a bad API key", () => {
    expect(toUserMessage({ status: 401 })).toMatch(/api key/i);
  });
  it("explains rate limits", () => {
    expect(toUserMessage({ status: 429 })).toMatch(/rate limit/i);
  });
  it("falls back to the error message", () => {
    expect(toUserMessage(new Error("boom"))).toBe("boom");
  });
});

describe("isMeaningful", () => {
  it("accepts a normal sentence", () => {
    expect(isMeaningful("Write an email asking my manager for Friday off")).toBe(true);
  });
  it("rejects short, empty, or keyboard-mash input", () => {
    expect(isMeaningful("")).toBe(false);
    expect(isMeaningful("asdfasdf")).toBe(false);
    expect(isMeaningful("aaaaaaaaaaaaaaaa")).toBe(false);
    expect(isMeaningful("1234567890 !!!")).toBe(false);
  });
});
