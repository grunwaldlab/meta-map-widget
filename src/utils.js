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

//color parsers and formatters

export const VIRIDIS_FALLBACK = ['#440154', '#482777', '#3f4a8a', '#31688e', '#26828e', '#1f9e89', '#35b779'];
export const VIRIDIS = ['#440154', '#482777', '#3f4a8a', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'];
export const VIRIDIS_CATEGORICAL = ['#440154', '#31688e', '#26828e', '#35b779', '#6ece58', '#b5de2b', '#fde725'];

// export function hexToRgb(hex) {
//     const h = hex.replace('#', '');
//     const bigint = parseInt(h, 16);
//     return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
// }

// export function rgbToHex(r, g, b) {
//     return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
// }

// export function interpRgb(a, b, t) {
//     return [
//         Math.round(a[0] + (b[0] - a[0]) * t),
//         Math.round(a[1] + (b[1] - a[1]) * t),
//         Math.round(a[2] + (b[2] - a[2]) * t)
//     ];
// }

// export function viridisAt(t) {
//     t = Math.max(0, Math.min(1, t));
//     const n = VIRIDIS.length;
//     const idx = t * (n - 1);
//     const lo = Math.floor(idx), hi = Math.min(n - 1, Math.ceil(idx));
//     const localT = idx - lo;
//     const rgbLo = hexToRgb(VIRIDIS[lo]), rgbHi = hexToRgb(VIRIDIS[hi]);
//     const rgb = interpRgb(rgbLo, rgbHi, localT);
//     return rgbToHex(rgb[0], rgb[1], rgb[2]);
// }