import { createReadStream } from "node:fs";

/**
 * Stream-parse a CSV file and invoke `onRow(record)` for each data row.
 * Handles quoted fields with embedded commas and newlines.
 */
export async function streamCsv(filePath, onRow) {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  let buffer = "";
  let headers = null;
  let pending = Promise.resolve();

  const consumeCompleteRecords = (finalFlush = false) => {
    while (true) {
      const { record, rest, complete } = extractRecord(buffer, finalFlush);
      buffer = rest;
      if (!complete) {
        return;
      }
      if (!headers) {
        headers = record.map((header) => header.replace(/^\uFEFF/, ""));
        continue;
      }
      const row = Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ""]));
      pending = pending.then(() => onRow(row));
    }
  };

  for await (const chunk of stream) {
    buffer += chunk;
    consumeCompleteRecords(false);
  }

  consumeCompleteRecords(true);
  await pending;
  return headers ?? [];
}

function extractRecord(text, finalFlush) {
  const fields = [];
  let field = "";
  let index = 0;
  let inQuotes = false;

  while (index < text.length) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      index += 1;
      continue;
    }

    if (char === ",") {
      fields.push(field);
      field = "";
      index += 1;
      continue;
    }

    if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") {
        index += 2;
      } else {
        index += 1;
      }
      fields.push(field);
      return { record: fields, rest: text.slice(index), complete: true };
    }

    field += char;
    index += 1;
  }

  if (finalFlush && (fields.length > 0 || field.length > 0)) {
    fields.push(field);
    return { record: fields, rest: "", complete: true };
  }

  return { record: null, rest: text, complete: false };
}
