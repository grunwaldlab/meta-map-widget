//data parsers and formatters

export function parseMetadata(text, idColumn = 'sample_id') {
  // First parse the TSV
  let rows = parseTSV(text);

  // Normalize the explicitly selected identifier field for downstream use.
  if (idColumn && idColumn !== 'sample_id') {
    rows = rows.map(row => {
      if (!(idColumn in row)) {
        throw new Error(`ID column not found in TSV: ${idColumn}`);
      }
      row.sample_id = row[idColumn];
      delete row[idColumn];
      return row;
    });
  }

  // Normalize latitude/longitude headers
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      const normalized = key.toLowerCase().replace(/[^a-z]/g, '');

      if (['lat', 'latitude', 'y', 'decimallatitude'].includes(normalized)) {
        row.latitude ??= row[key];
        if (key !== 'latitude') delete row[key];
      }

      if (['lon', 'long', 'longitude', 'x', 'decimallongitude'].includes(normalized)) {
        row.longitude ??= row[key];
        if (key !== 'longitude') delete row[key];
      }
    }
  }
  // Remove rows with any null lat/lon data 
  rows = rows.filter(row => row.longitude && row.latitude);

  // Collect all unique color-by values
  const colorBySet = new Set();
  const defaultCols = ['longitude', 'latitude', 'sample_id', 'color_by'];
  const hasColorBy = rows.some(row => 'color_by' in row && row.color_by != null);

  if (hasColorBy) {
    // Existing behavior
    for (const row of rows) {
      const factors = String(row.color_by)
        .split(';')
        .map(s => s.trim())
        .filter(col => col && col !== idColumn);

      factors.forEach(col => colorBySet.add(col));
      factors.push(...defaultCols);

      Object.keys(row).forEach(k => {
        if (!factors.includes(k)) {
          row[k] = null;
        }
      });
    }
  } else {
    // 🔹 Infer factors from all columns
    Object.keys(rows[0] ?? {}).forEach(col => {
      if (!defaultCols.includes(col)) {
        colorBySet.add(col);
      }
    });
  }
  const colorByList = Array.from(colorBySet);

  // Keep only relevant columns in the data
  const keepColumns = new Set([...defaultCols, ...colorByList]);
  const filteredRows = rows.map(row => {
    const newRow = {};
    for (const col of keepColumns) {
      if (col in row) newRow[col] = row[col];
    }
    return newRow;
  });

  return {
    rows: filteredRows,
    factors: colorByList
  };
}

function parseTSVRecords(text) {
  const records = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const character = text[i];

    // Parse quoted cells and preserve tabs/newlines inside quotes.
    if (character === '"') {
      if (inQuotes && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (inQuotes) {
        inQuotes = false;
      } else if (!field.trim()) {
        inQuotes = true;
      } else {
        field += character;
      }
    } else if (character === '\t' && !inQuotes) {
      row.push(field.trim());
      field = '';
    } else if ((character === '\n' || character === '\r') && !inQuotes) {
      if (character === '\r' && text[i + 1] === '\n') i++;
      row.push(field.trim());
      if (row.some(value => value !== '')) records.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  row.push(field.trim());
  if (row.some(value => value !== '')) records.push(row);
  return records;
}

export function parseTSVHeaders(text) {
  return parseTSVRecords(text)[0] ?? [];
}

export function parseTSV(text) {
  const records = parseTSVRecords(text);
  if (!records.length) return [];
  const headers = records.shift().map(header => header.trim());
  return records.map(columns => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = columns[index] ?? '';
    });
    return record;
  });
}

export function detectNumericColumns(rows, columns, threshold = 0.8) {
  const numeric = [];
  for (const col of columns) {
    let numericCount = 0, total = 0;
    for (const r of rows) {
      const v = r[col];
      if (v === undefined || v === '') { total++; continue; }
      total++;
      if (!Number.isNaN(Number(v))) numericCount++;
    }
    if (total === 0) continue;
    if (numericCount / total >= threshold) numeric.push(col);
  }
  return numeric;
}

export function scaleRange(v, min, max, minR = 4, maxR = 22) {
  if (isNaN(v) || min == null || max == null) return (minR + maxR) / 2;
  if (max === min) return (minR + maxR) / 2;
  const t = (v - min) / (max - min);
  return minR + t * (maxR - minR);
}

export function injectCSS(css, id) {
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}


