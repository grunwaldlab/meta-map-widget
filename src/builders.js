
import { ContinuousColorScale } from './scales.js';
import { formatTitle } from './utils.js';

export function buildPopupFromList(propsObj, list) {
    // show all properties + the entries in color_by list (if present)
    let html = '<table style="font-size:13px">';
    for (const k of Object.keys(propsObj)) {
        if (k === 'color_by') continue;
        html += `<tr><th style="text-align:left;padding-right:8px">${formatTitle(k)}</th><td>${propsObj[k]}</td></tr>`;
    }
    html += '</table>';
    return html;
}

export function createCircleDivIcon(radiusPx, fillColor) {
    const size = Math.round(radiusPx * 2);
    const html = `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${fillColor};border:1px solid #000;box-sizing:border-box"></div>`;
    return L.divIcon({
        html,
        className: '',
        iconSize: [size, size],
        iconAnchor: [Math.round(size / 2), Math.round(size / 2)],
        popupAnchor: [0, -Math.round(size / 2) - 2]
    });
}

export function createPieSvg(entries, radius) {
    // entries: [{count, color}, ...] - count used to compute angle
    const total = entries.reduce((s, e) => s + e.count, 0) || 1;
    let angle = 0;
    const cx = radius, cy = radius;
    const slices = entries.map(e => {
        const start = angle;
        const portion = e.count / total;
        angle += portion * 2 * Math.PI;
        const x1 = cx + radius * Math.cos(start);
        const y1 = cy + radius * Math.sin(start);
        const x2 = cx + radius * Math.cos(angle);
        const y2 = cy + radius * Math.sin(angle);
        const large = portion > 0.5 ? 1 : 0;
        const path = `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2 - 0.01} Z" fill="${e.color}" stroke="#222" stroke-width="0.6"></path>`;
        return path;
    }).join('');
    // center count text
    const count = total;
    const svg = `<svg width="${radius * 2}" height="${radius * 2}" viewBox="0 0 ${radius * 2} ${radius * 2}" xmlns="http://www.w3.org/2000/svg">${slices}<circle cx="${cx}" cy="${cy}" r="${radius * 0.3}" fill="rgba(255,255,255,0.9)" stroke="#222" stroke-width="0.6"></circle><text x="${cx}" y="${cy + 4}" font-size="${Math.max(10, radius * 0.4)}" font-weight="600" text-anchor="middle" fill="#111">${count}</text></svg>`;
    return svg;
}

export function buildControls(container, sizeColumns, colorColumns, initialSize, initialColor, onChange) {
    const box = document.createElement('div');
    box.style.position = 'absolute';
    box.style.top = '10px';
    box.style.left = '10px';
    box.style.zIndex = 1000;
    box.style.background = 'white';
    box.style.padding = '8px';
    box.style.borderRadius = '6px';
    box.style.boxShadow = '0 1px 4px rgba(0,0,0,0.2)';
    box.style.fontSize = '13px';

    // size select
    const sizeLabel = document.createElement('label');
    sizeLabel.textContent = 'Size: ';
    sizeLabel.style.marginRight = '6px';

    const sizeSelect = document.createElement('select');
    sizeSelect.id = 'ps-size-select';

    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.text = '— none —';
    sizeSelect.appendChild(noneOpt);

    sizeColumns.forEach(c => {
        const o = document.createElement('option');
        o.value = c;
        o.text = formatTitle(c);
        if (c === initialSize) {
            o.selected = true;
        }
        sizeSelect.appendChild(o);
    });

    // color select
    const colorLabel = document.createElement('label');
    colorLabel.textContent = 'Color: ';
    colorLabel.style.marginLeft = '8px';
    colorLabel.style.marginRight = '6px';

    const colorSelect = document.createElement('select');
    colorSelect.id = 'ps-color-select';

    const noneOptColor = document.createElement('option');
    noneOptColor.value = '';
    noneOptColor.text = '— none —';
    colorSelect.appendChild(noneOptColor);

    colorColumns.forEach(c => {
        const o = document.createElement('option');
        o.value = c;
        o.text = formatTitle(c);
        if (c === initialColor) {
            o.selected = true;
        }
        colorSelect.appendChild(o);
    });

    sizeSelect.addEventListener('change', () => onChange(sizeSelect.value || null, colorSelect.value || null));
    colorSelect.addEventListener('change', () => onChange(sizeSelect.value || null, colorSelect.value || null));

    box.appendChild(sizeLabel); box.appendChild(sizeSelect);
    box.appendChild(colorLabel); box.appendChild(colorSelect);
    return box;
}

export function updateLegend(container, colorVar, sizeVar, colorScale, sizeScale) {
    // remove existing legend if any
    const existing = container.querySelector('.ps-legend');
    if (existing) existing.remove();
    const div = document.createElement('div');
    div.className = 'ps-legend';
    div.style.position = 'absolute';
    div.style.right = '10px';
    div.style.bottom = '10px';
    div.style.zIndex = 1000;
    div.style.background = 'white';
    div.style.padding = '8px';
    div.style.borderRadius = '6px';
    div.style.boxShadow = '0 1px 4px rgba(0,0,0,0.15)';
    div.style.fontSize = '12px';

    if (colorVar && colorScale) {
        const isContinuous = colorScale instanceof ContinuousColorScale;

        div.innerHTML += `<div style="font-weight:600;margin-bottom:6px">${formatTitle(colorVar)}</div>`;

        if (isContinuous) {
            const grad = `linear-gradient(90deg, ${colorScale.colorsHex.join(',')})`;
            const width = 160;
            const tickCount = 5;

            // Format number to appropriate precision based on range
            const range = colorScale.dataMax - colorScale.dataMin;
            const precision = range < 1 ? 2 : range < 10 ? 1 : 0;
            const formatValue = v => v.toFixed(precision);

            // Generate tick values
            const ticks = [];
            for (let i = 0; i < tickCount; i++) {
                const t = i / (tickCount - 1);
                const value = colorScale.dataMin + (colorScale.dataMax - colorScale.dataMin) * t;
                ticks.push({
                    position: t * width,
                    value: formatValue(value)
                });
            }

            div.innerHTML += `
        <div style="width:${width}px;position:relative;margin:4px 0 16px">
          <div style="width:100%;height:12px;background:${grad};border:1px solid #999"></div>
          <div style="position:relative;width:100%;height:14px">
            ${ticks.map(tick => `
              <div style="position:absolute;left:${tick.position}px;transform:translateX(-50%)">
                <div style="width:1px;height:4px;background:#666;margin:0 auto"></div>
                <div style="font-size:10px;text-align:center;margin-top:1px">${tick.value}</div>
              </div>
            `).join('')}
          </div>
        </div>`;
        } else {
            // Categorical legend
            for (const category of colorScale.categories) {
                const color = colorScale.getValue(category);
                div.innerHTML += `<div style="display:flex;align-items:center;margin:4px 0"><i style="background:${color};width:12px;height:12px;display:inline-block;margin-right:6px"></i>${category}</div>`;
            }
        }
    }

    if (sizeVar && sizeScale) {
        const precision = (sizeScale.dataMax - sizeScale.dataMin) < 1 ? 2 :
            (sizeScale.dataMax - sizeScale.dataMin) < 10 ? 1 : 0;
        const formatValue = v => v.toFixed(precision);

        const sizes = [
            { value: sizeScale.dataMin, radius: sizeScale.sizeMin / 2 },
            { value: (sizeScale.dataMin + sizeScale.dataMax) / 2, radius: (sizeScale.sizeMin + sizeScale.sizeMax) / 4 },
            { value: sizeScale.dataMax, radius: sizeScale.sizeMax / 2 }
        ];

        div.innerHTML += `
      <hr style="margin:6px 0">
      <div style="font-weight:600;margin-bottom:6px">Size: ${formatTitle(sizeVar)}</div>
      <div style="display:flex;align-items:flex-end;height:${sizeScale.sizeMax * 2 + 4}px;margin:4px 0">
        ${sizes.map(size => `
          <div style="display:flex;flex-direction:column;align-items:center;margin-right:12px">
            <div style="width:${size.radius * 2}px;height:${size.radius * 2}px;border-radius:50%;border:1px solid #000;margin-bottom:4px"></div>
            <div style="font-size:10px;text-align:center">${formatValue(size.value)}</div>
          </div>
        `).join('')}
      </div>
    `;
    }

    // Always append the legend to the map container
    container.appendChild(div);
}