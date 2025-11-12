//data parsers and formatters

export function parseMetadata(text) {
    // First parse the TSV
    const rows = parseTSV(text);

    // Collect all unique color-by values
    const colorBySet = new Set();
    const defaultCols = ['longitude', 'latitude', 'sample_id'];
    for (const row of rows) {
        const factors = String(row['color_by']).split(';')
            .map(s => s.trim());
        factors.forEach(col => colorBySet.add(col));
        factors.push(...defaultCols);
        Object.keys(row).forEach(k => {
            if (!factors.includes(k)) {
                row[k] = null;
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

export function parseTSV(text) {
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    const headers = lines.shift().split('\t').map(h => h.trim());
    return lines.map(line => {
        const cols = line.split('\t');
        const obj = {};
        headers.forEach((h, i) => obj[h] = cols[i] === undefined ? '' : cols[i]);
        return obj;
    });
}

export function formatTitle(name) {
    if (!name) return '';
    let out = String(name)
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return out.charAt(0).toUpperCase() + out.slice(1);
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