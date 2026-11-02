import { ContinuousColorScale } from './scales.js';
import L from "leaflet";

export function buildPopupFromList(propsObj, list) {
  let html = '<div style="max-height:150px;overflow-y:auto;overflow-x:hidden;">';
  html += '<table style="font-size:10px">';
  for (const k of Object.keys(propsObj)) {
    if (k === 'color_by') continue;
    html += `<tr><th style="text-align:left;padding-right:8px">${k}</th><td>${propsObj[k]}</td></tr>`;
  }
  html += '</table>';
  html += '</div>';
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
  box.className = 'ps-controls';

  // size select
  const sizeGroup = document.createElement('div');
  sizeGroup.className = 'ps-control-group';
  const sizeLabel = document.createElement('label');
  sizeLabel.className = 'ps-control-label';
  sizeLabel.textContent = 'Size: ';

  const sizeSelect = document.createElement('select');
  sizeSelect.className = 'ps-select';
  sizeSelect.setAttribute('aria-label', 'Size variable');

  const noneOpt = document.createElement('option');
  noneOpt.value = '';
  noneOpt.text = '— none —';
  sizeSelect.appendChild(noneOpt);

  sizeColumns.forEach(c => {
    const o = document.createElement('option');
    o.value = c;
    o.text = c;
    if (c === initialSize) {
      o.selected = true;
    }
    sizeSelect.appendChild(o);
  });

  // color select
  const colorGroup = document.createElement('div');
  colorGroup.className = 'ps-control-group';
  const colorLabel = document.createElement('label');
  colorLabel.className = 'ps-control-label';
  colorLabel.textContent = 'Color: ';

  const colorSelect = document.createElement('select');
  colorSelect.className = 'ps-select';
  colorSelect.setAttribute('aria-label', 'Color variable');

  const noneOptColor = document.createElement('option');
  noneOptColor.value = '';
  noneOptColor.text = '— none —';
  colorSelect.appendChild(noneOptColor);

  colorColumns.forEach(c => {
    const o = document.createElement('option');
    o.value = c;
    o.text = c;
    if (c === initialColor) {
      o.selected = true;
    }
    colorSelect.appendChild(o);
  });

  sizeSelect.addEventListener('change', () => onChange(sizeSelect.value || null, colorSelect.value || null));
  colorSelect.addEventListener('change', () => onChange(sizeSelect.value || null, colorSelect.value || null));

  sizeGroup.append(sizeLabel, sizeSelect);
  colorGroup.append(colorLabel, colorSelect);
  box.append(sizeGroup, colorGroup);
  return box;
}

export function updateLegend(container, colorVar, sizeVar, colorScale, sizeScale, zoomSizeFactor = 1) {
  // remove existing legend if any
  const existing = container.querySelector('.ps-legend');
  if (existing) existing.remove();
  const div = document.createElement('div');
  div.className = 'ps-legend';
  div.setAttribute('aria-label', 'Map legend');

  if (colorVar && colorScale) {
    const isContinuous = colorScale instanceof ContinuousColorScale;

    const colorSection = document.createElement('section');
    colorSection.className = 'ps-legend-section';
    const colorTitle = document.createElement('h3');
    colorTitle.className = 'ps-legend-title';
    colorTitle.textContent = colorVar;
    colorSection.appendChild(colorTitle);

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

      const ramp = document.createElement('div');
      ramp.className = 'ps-continuous-legend';
      ramp.style.setProperty('--ps-gradient', grad);
      ramp.style.setProperty('--ps-ramp-width', `${width}px`);
      const gradientBar = document.createElement('div');
      gradientBar.className = 'ps-gradient-bar';
      ramp.appendChild(gradientBar);

      const tickRow = document.createElement('div');
      tickRow.className = 'ps-tick-row';
      ticks.forEach(tick => {
        const tickElement = document.createElement('div');
        tickElement.className = 'ps-tick';
        tickElement.style.left = `${tick.position}px`;
        const tickMark = document.createElement('span');
        tickMark.className = 'ps-tick-mark';
        const tickLabel = document.createElement('span');
        tickLabel.className = 'ps-tick-label';
        tickLabel.textContent = tick.value;
        tickElement.append(tickMark, tickLabel);
        tickRow.appendChild(tickElement);
      });
      ramp.appendChild(tickRow);
      colorSection.appendChild(ramp);
    } else {
      // Categorical legend
      for (let category of colorScale.categories) {
        const color = colorScale.getValue(category);
        if (!category) {
          category = "Missing Data";
        }
        const item = document.createElement('div');
        item.className = 'ps-category-item';
        const swatch = document.createElement('span');
        swatch.className = 'ps-category-swatch';
        swatch.style.backgroundColor = color;
        const label = document.createElement('span');
        label.textContent = category;
        item.append(swatch, label);
        colorSection.appendChild(item);
      }
    }
    div.appendChild(colorSection);
  }

  if (sizeVar && sizeScale) {
    const precision = (sizeScale.dataMax - sizeScale.dataMin) < 1 ? 2 :
      (sizeScale.dataMax - sizeScale.dataMin) < 10 ? 1 : 0;
    const formatValue = v => v.toFixed(precision);

    const sizes = [
      { value: sizeScale.dataMin, radius: sizeScale.getValue(sizeScale.dataMin) * zoomSizeFactor },
      { value: (sizeScale.dataMin + sizeScale.dataMax) / 2, radius: sizeScale.getValue((sizeScale.dataMin + sizeScale.dataMax) / 2) * zoomSizeFactor },
      { value: sizeScale.dataMax, radius: sizeScale.getValue(sizeScale.dataMax) * zoomSizeFactor }
    ];

    const sizeSection = document.createElement('section');
    sizeSection.className = 'ps-legend-section ps-size-legend';
    const sizeTitle = document.createElement('h3');
    sizeTitle.className = 'ps-legend-title';
    sizeTitle.textContent = sizeVar;
    sizeSection.appendChild(sizeTitle);

    const sizeItems = document.createElement('div');
    sizeItems.className = 'ps-size-items';
    sizes.forEach(size => {
      const item = document.createElement('div');
      item.className = 'ps-size-item';
      const circle = document.createElement('span');
      circle.className = 'ps-size-circle';
      const diameter = Math.round(size.radius * 2);
      circle.style.width = `${diameter}px`;
      circle.style.height = `${diameter}px`;
      const label = document.createElement('span');
      label.className = 'ps-size-label';
      label.textContent = formatValue(size.value);
      item.append(circle, label);
      sizeItems.appendChild(item);
    });
    sizeSection.appendChild(sizeItems);
    div.appendChild(sizeSection);
  }

  // Always append the legend to the map container
  if (colorVar || sizeVar) container.appendChild(div);
}
