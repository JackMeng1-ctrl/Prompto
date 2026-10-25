function parseDelimitedRecords(text, delimiter) {
  const rows = [];
  let currentValue = "";
  let currentRow = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        currentValue += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && text[i + 1] === '\n') {
        i += 1;
      }
      currentRow.push(currentValue);
      rows.push(currentRow);
      currentRow = [];
      currentValue = "";
    } else {
      currentValue += char;
    }
  }

  currentRow.push(currentValue);
  rows.push(currentRow);

  return rows;
}

function normalizeHeaders(rawHeaders) {
  const seen = new Map();
  return rawHeaders.map((header, index) => {
    const base = header && header.trim() ? header.trim() : `column_${index + 1}`;
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

export function parseDatasetContent(text, delimiter) {
  if (!text || !text.trim()) {
    return {};
  }

  const rawRows = parseDelimitedRecords(text, delimiter)
    .map((row) => row.map((cell) => (typeof cell === "string" ? cell.trim() : cell ?? "")))
    .filter((row, index) => index === 0 || row.some((cell) => cell !== ""));

  if (rawRows.length === 0) {
    return {};
  }

  const headerRow = rawRows[0];
  const headers = normalizeHeaders(headerRow);
  const dataRows = rawRows.slice(1);

  if (headers.length === 0) {
    return {};
  }

  const columns = {};
  headers.forEach((header) => {
    columns[header] = [];
  });

  dataRows.forEach((cells) => {
    headers.forEach((header, index) => {
      const value = cells[index] ?? "";
      columns[header].push(value);
    });
  });

  return columns;
}

export function hasDatasetContent(datasetContent) {
  return Boolean(
    datasetContent &&
    typeof datasetContent === "object" &&
    Object.keys(datasetContent).length > 0
  );
}

export function deriveDefaultSelection(datasetContent) {
  const headers = Object.keys(datasetContent || {});
  const outputColumn = headers[0] || "";
  const inputColumns = headers.filter((header) => header !== outputColumn);
  return {
    outputColumn,
    inputColumns
  };
}

function buildRowsFromColumns(headers, columnValues) {
  const totalRows = columnValues.reduce((max, values) => Math.max(max, values.length), 0);
  const rows = Array.from({ length: totalRows }, (_, rowIndex) => {
    const row = {};
    headers.forEach((header, headerIndex) => {
      const values = columnValues[headerIndex];
      row[header] = values[rowIndex] ?? "";
    });
    return row;
  });
  return { rows, totalRows };
}

export function buildDatasetPayload(datasetContent, datasetName) {
  if (!datasetContent || typeof datasetContent !== "object") {
    return undefined;
  }

  const headers = Object.keys(datasetContent);
  if (headers.length === 0) {
    return datasetName ? { name: datasetName } : undefined;
  }

  const columnValues = headers.map((header) => {
    const values = datasetContent?.[header];
    return Array.isArray(values) ? values : [];
  });

  const { rows, totalRows } = buildRowsFromColumns(headers, columnValues);

  return {
    name: datasetName,
    headers,
    rows,
    totalRows,
    hasHeaderRow: true
  };
}

export function buildSelectedDatasetPayload(datasetContent, datasetName, outputColumn, inputColumns) {
  if (!datasetContent || typeof datasetContent !== "object") {
    return null;
  }

  const headers = [];
  if (outputColumn) headers.push(outputColumn);

  (inputColumns || []).forEach((header) => {
    if (header && !headers.includes(header)) {
      headers.push(header);
    }
  });

  if (headers.length === 0) {
    return null;
  }

  const columnValues = headers.map((header) => {
    const values = datasetContent?.[header];
    return Array.isArray(values) ? values : [];
  });

  const { rows, totalRows } = buildRowsFromColumns(headers, columnValues);

  return {
    name: datasetName,
    headers,
    rows,
    totalRows,
    hasHeaderRow: true,
    outputColumn,
    inputColumns
  };
}

export function sampleColumnValues(datasetContent, columnName, sampleSize = 5) {
  if (
    !datasetContent ||
    typeof datasetContent !== "object" ||
    !columnName ||
    typeof columnName !== "string"
  ) {
    return [];
  }

  const columnValues = datasetContent[columnName];
  if (!Array.isArray(columnValues)) {
    return [];
  }

  return columnValues
    .map((value) => {
      if (value === null || value === undefined) return "";
      return typeof value === "string" ? value.trim() : String(value);
    })
    .filter((value) => value.length > 0)
    .slice(0, sampleSize);
}

export function summarizeDatasetPayload(datasetPayload, sampleSize = 3) {
  if (!datasetPayload) {
    return "No dataset summary available.";
  }

  const headers = Array.isArray(datasetPayload.headers) ? datasetPayload.headers : [];
  const rows = Array.isArray(datasetPayload.rows) ? datasetPayload.rows.slice(0, sampleSize) : [];
  const summary = {
    name: datasetPayload.name || "Uploaded dataset",
    headers,
    sampleRows: rows,
    totalRows: typeof datasetPayload.totalRows === "number" ? datasetPayload.totalRows : rows.length
  };

  return JSON.stringify(summary, null, 2);
}
