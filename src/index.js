const L = window.L; // assume Leaflet is loaded globally

// Exported function: PSMapWidget(containerId, tsvData, opts)
// - containerId: id of DOM element to mount
// - tsvData: string containing TSV (header + rows)
// - opts: { minRadius, maxRadius, viridisMaxCategories }
export function PSMapWidget(containerId, tsvData, opts = {}) {
  const config = {
    minRadius: opts.minRadius ?? 4,
    maxRadius: opts.maxRadius ?? 22,
    viridisMaxCategories: opts.viridisMaxCategories ?? 7
  };

  const container = document.getElementById(containerId);
    if (!container) throw new Error(`Container "${containerId}" not found`);

    // parse TSV into array of objects
    const rows = parseTSV(tsvData);
    if (!rows.length) throw new Error('No rows parsed from TSV');

    // detect lat/lon headers
    const cols = Object.keys(rows[0]);
    const { lat: latitude, lon: longitude } = findLatlongitudes(cols);
    if (!latitude || !longitude) throw new Error('TSV must include latitude and longitude columns');

    // determine color_by list if available (column named "color_by" holding semicolon-separated list),
    // otherwise use all non-lat/lon/sample_id columns
    let colorByList = [];
    if ('color_by' in rows[0] && String(rows[0]['color_by']).trim() !== '') {
      // take the value from the first row's color_by as the list (common pattern)
      colorByList = String(rows[0]['color_by']).split(';').map(s => s.trim()).filter(Boolean);
    } else {
      colorByList = cols.filter(c => ![latitude, longitude, 'sample_id'].includes(c));
    }
    if (colorByList.length === 0) colorByList = cols.filter(c => ![latitude, longitude].includes(c));

    // detect numeric columns across the dataset
    let numericCols = detectNumericColumns(rows, Object.keys(rows[0]));
    numericCols = numericCols.filter(c => ![latitude, longitude].includes(c));

    // pick sizeVar: first numeric in colorByList (per AGENTS)
    const sizeVar = colorByList.find(c => numericCols.includes(c)) || null;
    // pick colorVar: first colorByList entry that isn't sizeVar
    const colorVar = colorByList.find(c => c !== sizeVar) || null;

    // prepare color mapping
    const isColorContinuous = colorVar && numericCols.includes(colorVar);
    let colorScale = null;
    let categoryMap = {};
    let colorMin = null, colorMax = null;

    if (colorVar) {
      if (isColorContinuous) {
        const vals = rows.map(r => Number(r[colorVar])).filter(v => !Number.isNaN(v));
        colorMin = Math.min(...vals); colorMax = Math.max(...vals);
        colorScale = v => viridisAt((v - colorMin) / ((colorMax - colorMin) || 1));
      } else {
        // categorical mapping with top-N categories colored; rest gray
        const freq = {};
        for (const r of rows) {
          const k = String(r[colorVar]);
          freq[k] = (freq[k] || 0) + 1;
        }
        const cats = Object.keys(freq).sort((a,b) => freq[b] - freq[a]);
        const palette = VIRIDIS_CATEGORICAL;
        const maxCols = config.viridisMaxCategories;
        cats.slice(0, maxCols).forEach((c, i) => categoryMap[c] = palette[i % palette.length]);
        // the rest will map to gray
        categoryMap.__OTHER = '#cccccc';
      }
    }
    
    // prepare size scale
  let sizeMin = null, sizeMax = null;
  if (sizeVar) {
    const vals = rows.map(r => Number(r[sizeVar])).filter(v => !Number.isNaN(v));
    sizeMin = Math.min(...vals); sizeMax = Math.max(...vals);
  }

  // setup map
  const map = L.map(containerId, { preferCanvas: true }).setView([10, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map);

  // build UI controls (two dropdowns) inside the container
  const controlBox = buildControls(container, numericCols, colorByList, sizeVar, colorVar, onSelectionChange);
  container.prepend(controlBox);

  // marker cluster group (requires Leaflet.markercluster included on page)
  const clusterGroup = (L.markerClusterGroup) ? L.markerClusterGroup({ chunkedLoading: true }) : null;
  let markerLayer = L.layerGroup();

  function renderSelected(selectedSizeVar, selectedColorVar) {
    // remove existing
    if (clusterGroup) clusterGroup.clearLayers();
    markerLayer.clearLayers();

    // prepare color and size scales for the chosen variables
    const numericColsLocal = detectNumericColumns(rows, Object.keys(rows[0]));
    const colorIsCont = selectedColorVar && numericColsLocal.includes(selectedColorVar);
    let colorFn = () => '#888';
    let localCategoryMap = {};
    let localColorMin = null, localColorMax = null;
    if (selectedColorVar) {
      if (colorIsCont) {
        const vals = rows.map(r => Number(r[selectedColorVar])).filter(v => !Number.isNaN(v));
        localColorMin = Math.min(...vals); localColorMax = Math.max(...vals);
        colorFn = v => viridisAt((v - localColorMin) / ((localColorMax - localColorMin) || 1));
      } else {
        // First get frequencies
        const freq = {};
        rows.forEach(r => { const k = String(r[selectedColorVar]); freq[k] = (freq[k]||0)+1; });
        // Get top N categories by frequency
        const cats = Object.keys(freq)
          .sort((a,b) => freq[b] - freq[a])
          .slice(0, config.viridisMaxCategories);
        
        // Sort categories by their "natural" ordering if possible
        // Try numeric sort first, then alphabetical if not numeric
        const sortedCats = cats.slice().sort((a, b) => {
          const numA = Number(a), numB = Number(b);
          if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
          return a.localeCompare(b);
        });

        // Assign colors evenly across the viridis range
        sortedCats.forEach((c, i) => {
          const t = sortedCats.length > 1 ? i / (sortedCats.length - 1) : 0.5;
          localCategoryMap[c] = viridisAt(t);
        });
        
        localCategoryMap.__OTHER = '#cccccc';
        colorFn = v => (localCategoryMap[String(v)] || localCategoryMap.__OTHER);
      }
    }

    let localSizeMin = null, localSizeMax = null;
    if (selectedSizeVar) {
      const vals = rows.map(r => Number(r[selectedSizeVar])).filter(v => !Number.isNaN(v));
      localSizeMin = Math.min(...vals); localSizeMax = Math.max(...vals);
    }

    const markers = [];
    for (const r of rows) {
      const lat = Number(r[latitude]), lon = Number(r[longitude]);
      if (Number.isNaN(lat) || Number.isNaN(lon)) continue;

      const sizeValue = selectedSizeVar ? Number(r[selectedSizeVar]) : null;
      const radiusPx = selectedSizeVar && !Number.isNaN(sizeValue)
        ? scaleRange(sizeValue, localSizeMin, localSizeMax, config.minRadius, config.maxRadius)
        : (config.minRadius + config.maxRadius) / 2;

      const colorValue = selectedColorVar ? r[selectedColorVar] : null;
      const fill = selectedColorVar
        ? (colorIsCont ? colorFn(Number(colorValue)) : colorFn(colorValue))
        : '#3388ff';

      // use L.marker with divIcon so clusters work; keep popup data
      const icon = createCircleDivIcon(radiusPx, fill);
      const marker = L.marker([lat, lon], { icon });
      marker._ps_size = radiusPx;
      marker._ps_colorValue = colorValue;
      marker._ps_props = r;
      marker.bindPopup(buildPopupFromList(r, colorByList));
      markers.push(marker);
    }
    
    if (clusterGroup) {
      // create custom cluster icon that draws pie-chart + scales by avg size or count
      clusterGroup.options.iconCreateFunction = function(cluster) {
        const childMarkers = cluster.getAllChildMarkers();
        // aggregate counts per category
        const counts = {};
        let sumSize = 0;

        if (selectedColorVar && !numericColsLocal.includes(selectedColorVar)) {
          childMarkers.sort((a,b) => Object.keys(localCategoryMap).indexOf(a._ps_colorValue) - Object.keys(localCategoryMap).indexOf(b._ps_colorValue));
        } else if (selectedColorVar && numericColsLocal.includes(selectedColorVar)) {
          childMarkers.sort((a,b) => Number(a._ps_colorValue) - Number(b._ps_colorValue));
        }

        childMarkers.forEach(m => {
          const cv = m._ps_colorValue ?? '__NULL';
          counts[cv] = (counts[cv] || 0) + 1;
          sumSize += (m._ps_size || 0);
        });
        const total = childMarkers.length;
        const avgSize = sumSize / total;
        // create pie data for top categories (categorical) or buckets for continuous
        const pieEntries = [];
        if (selectedColorVar && !numericColsLocal.includes(selectedColorVar)) {
          // categorical: map category to color
          Object.keys(counts).forEach(k => {
            const col = localCategoryMap && (localCategoryMap[String(k)] || localCategoryMap.__OTHER) || '#ccc';
            pieEntries.push({ count: counts[k], color: col });
          });
        } else if (selectedColorVar && numericColsLocal.includes(selectedColorVar)) {
          // continuous: bucket into viridis bins by child marker color value (use their computed color)
          // approximate by grouping by the hex color chosen earlier
          const byColor = {};
          childMarkers.forEach(m => {
            const c = colorFn(Number(m._ps_props[selectedColorVar]));
            byColor[c] = (byColor[c] || 0) + 1;
          });
          Object.keys(byColor).forEach(k => pieEntries.push({ count: byColor[k], color: k }));
          pieEntries.sort((a,b) => (a.color === '#cccccc') ? 1 : 0);
        } else {
          // no colorVar: single-color pie (all same)
          pieEntries.push({ count: total, color: '#3388ff' });
        }

        // sort to put __OTHER last (if present)
        pieEntries.sort((a,b) => (a.color === '#cccccc') ? 1 : 0);

        const clusterRadius = selectedSizeVar ? Math.max(16, Math.round(avgSize * 1.4)) : Math.max(12, Math.round(Math.sqrt(total) * 4));
        const svg = createPieSvg(pieEntries, clusterRadius);
        return L.divIcon({
          html: svg,
          className: 'ps-cluster-icon',
          iconSize: [clusterRadius * 2, clusterRadius * 2],
          iconAnchor: [clusterRadius, clusterRadius]
        });
      };
      clusterGroup.addLayers(markers);
      map.addLayer(clusterGroup);
    } else {
      markerLayer = L.layerGroup(markers).addTo(map);
    }

    // fit bounds
    const groupBounds = clusterGroup ? clusterGroup.getBounds() : markerLayer.getBounds();
    if (groupBounds && groupBounds.isValid && groupBounds.isValid()) map.fitBounds(groupBounds, { padding: [20, 20] });

    // update legends
    updateLegend(container, selectedColorVar, selectedSizeVar, {
      colorIsContinuous: numericColsLocal.includes(selectedColorVar),
      colorMin: localColorMin, colorMax: localColorMax,
      categoryMap: localCategoryMap,
      sizeMin: localSizeMin, sizeMax: localSizeMax,
      config: config // Pass the config object
    });
  }
  // initial render
  renderSelected(sizeVar, colorVar);

  // selection change handler
  function onSelectionChange(selectedSize, selectedColor) {
    renderSelected(selectedSize || null, selectedColor || null);
  }

  // return an object with a refresh function for external control
  return {
    refresh: () => renderSelected(controlBox.querySelector('#ps-size-select').value || null, controlBox.querySelector('#ps-color-select').value || null)
  };
}

/* --------------------- helpers --------------------- */

function parseTSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const headers = lines.shift().split('\t').map(h => h.trim());
  return lines.map(line => {
    const cols = line.split('\t');
    const obj = {};
    headers.forEach((h, i) => obj[h] = cols[i] === undefined ? '' : cols[i]);
    return obj;
  });
}

function formatTitle(name) {
  if (!name) return '';
  let out = String(name)
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return out.charAt(0).toUpperCase() + out.slice(1);
}

function findLatlongitudes(columns) {
  const l = c => c.toLowerCase();
  const latCandidates = ['lat', 'latitude', 'y'];
  const lonCandidates = ['lon', 'lng', 'longitude', 'x'];
  return {
    lat: columns.find(c => latCandidates.includes(l(c))),
    lon: columns.find(c => lonCandidates.includes(l(c)))
  };
}

function detectNumericColumns(rows, columns, threshold = 0.8) {
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

function scaleRange(v, min, max, minR = 4, maxR = 22) {
  if (isNaN(v) || min == null || max == null) return (minR + maxR) / 2;
  if (max === min) return (minR + maxR) / 2;
  const t = (v - min) / (max - min);
  return minR + t * (maxR - minR);
}

const VIRIDIS_CATEGORICAL = ['#440154', '#31688e', '#35b779', '#6ece58', '#b5de2b', '#fde725', '#26828e'];
// small categorical fallback palette
const VIRIDIS_FALLBACK = ['#440154', '#482777', '#3f4a8a', '#31688e', '#26828e', '#1f9e89', '#35b779'];

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const bigint = parseInt(h, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}
function interpRgb(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t)
  ];
}

const VIRIDIS = ['#440154', '#482777', '#3f4a8a', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'];
function viridisAt(t) {
  t = Math.max(0, Math.min(1, t));
  const n = VIRIDIS.length;
  const idx = t * (n - 1);
  const lo = Math.floor(idx), hi = Math.min(n - 1, Math.ceil(idx));
  const localT = idx - lo;
  const rgbLo = hexToRgb(VIRIDIS[lo]), rgbHi = hexToRgb(VIRIDIS[hi]);
  const rgb = interpRgb(rgbLo, rgbHi, localT);
  return rgbToHex(rgb[0], rgb[1], rgb[2]);
}

function buildPopupFromList(propsObj, list) {
  // show all properties + the entries in color_by list (if present)
  let html = '<table style="font-size:13px">';
  for (const k of Object.keys(propsObj)) {
    if (k === 'color_by') continue;
    html += `<tr><th style="text-align:left;padding-right:8px">${formatTitle(k)}</th><td>${propsObj[k]}</td></tr>`;
  }
  html += '</table>';
  return html;
}

function createCircleDivIcon(radiusPx, fillColor) {
  const size = Math.round(radiusPx * 2);
  const html = `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${fillColor};border:1px solid #000;box-sizing:border-box"></div>`;
  return L.divIcon({
    html,
    className: '',
    iconSize: [size, size],
    iconAnchor: [Math.round(size/2), Math.round(size/2)],
    popupAnchor: [0, -Math.round(size/2) - 2]
  });
}

function createPieSvg(entries, radius) {
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
    const path = `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z" fill="${e.color}" stroke="#222" stroke-width="0.6"></path>`;
    return path;
  }).join('');
  // center count text
  const count = total;
  const svg = `<svg width="${radius * 2}" height="${radius * 2}" viewBox="0 0 ${radius * 2} ${radius * 2}" xmlns="http://www.w3.org/2000/svg">${slices}<circle cx="${cx}" cy="${cy}" r="${radius*0.3}" fill="rgba(255,255,255,0.9)" stroke="#222" stroke-width="0.6"></circle><text x="${cx}" y="${cy+4}" font-size="${Math.max(10, radius*0.4)}" font-weight="600" text-anchor="middle" fill="#111">${count}</text></svg>`;
  return svg;
}

function buildControls(container, sizeColumns, colorColumns, initialSize, initialColor, onChange) {
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

function updateLegend(container, colorVar, sizeVar, meta) {
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

  if (colorVar) {
    if (meta.colorIsContinuous) {
      const grad = `linear-gradient(90deg, ${VIRIDIS.join(',')})`;
      const width = 160;
      const tickCount = 5; // Number of ticks (including start and end)
      
      // Format number to appropriate precision based on range
      const range = meta.colorMax - meta.colorMin;
      const precision = range < 1 ? 2 : range < 10 ? 1 : 0;
      const formatValue = v => v.toFixed(precision);
      
      // Generate tick values
      const ticks = [];
      for (let i = 0; i < tickCount; i++) {
        const t = i / (tickCount - 1);
        const value = meta.colorMin + (meta.colorMax - meta.colorMin) * t;
        ticks.push({
          position: t * width,
          value: formatValue(value)
        });
      }
      
      div.innerHTML += `
        <div style="font-weight:600;margin-bottom:6px">${formatTitle(colorVar)}</div>
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
      div.innerHTML += `<div style="font-weight:600;margin-bottom:6px">${formatTitle(colorVar)} </div>`;
      for (const k of Object.keys(meta.categoryMap || {})) {
        if (k === '__OTHER') continue;
        div.innerHTML += `<div style="display:flex;align-items:center;margin:4px 0"><i style="background:${meta.categoryMap[k]};width:12px;height:12px;display:inline-block;margin-right:6px"></i>${k}</div>`;
      }
      if (meta.categoryMap && meta.categoryMap.__OTHER) {
        div.innerHTML += `<div style="display:flex;align-items:center;margin:4px 0"><i style="background:${meta.categoryMap.__OTHER};width:12px;height:12px;display:inline-block;margin-right:6px"></i>Other (least frequent)</div>`;
      }
    }
  } else {
    div.innerHTML += `<div style="font-weight:600;margin-bottom:6px">No color variable</div>`;
  }

  if (sizeVar) {
    // Format numbers with appropriate precision
    const range = meta.sizeMax - meta.sizeMin;
    const precision = range < 1 ? 2 : range < 10 ? 1 : 0;
    const formatValue = v => v.toFixed(precision);

    // Create three reference sizes (small, medium, large)
    const sizes = [
      { value: meta.sizeMin, radius: (meta.config.minRadius)/2 },
      { value: (meta.sizeMin + meta.sizeMax) / 2, radius: (meta.config.minRadius + meta.config.maxRadius) / 4 },
      { value: meta.sizeMax, radius: (meta.config.maxRadius)/2 }
    ];

    div.innerHTML += `
      <hr style="margin:6px 0">
      <div style="font-weight:600;margin-bottom:6px">Size: ${formatTitle(sizeVar)}</div>
      <div style="display:flex;align-items:flex-end;height:${meta.config.maxRadius * 2 + 4}px;margin:4px 0">
        ${sizes.map(size => `
          <div style="display:flex;flex-direction:column;align-items:center;margin-right:12px">
            <div style="width:${size.radius * 2}px;height:${size.radius * 2}px;border-radius:50%;border:1px solid #000;margin-bottom:4px"></div>
            <div style="font-size:10px;text-align:center">${formatValue(size.value)}</div>
          </div>
        `).join('')}
      </div>
    `;
  } else {
    div.innerHTML += `<hr style="margin:6px 0"><div style="font-weight:600">No size variable</div>`;
  }

  container.appendChild(div);
}

// TODO
// fixed for now: correct dropdown options - remove categorical variables from size dropdown
// fixed for now: gradient pie chart for continuous variables
// fixed for now: none option for color
// fixed for now: remove colorby from popup
// improve size legend
// scalable color legend w/ tick marks
// fixed for now: color markers have similar colors grouped together
// postpone: maximum popup size or scrollable popup if too many entries
// fixed for now: formatting of visible titles derived from column names

