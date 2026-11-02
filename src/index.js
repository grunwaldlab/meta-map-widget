import { ContinuousColorScale, CategoricalColorScale, ContinuousSizeScale } from './scales.js';
import { parseMetadata, parseTSVHeaders, detectNumericColumns, injectCSS } from './utils.js';
import { buildPopupFromList, createCircleDivIcon, createPieSvg, buildControls, updateLegend } from './builders.js';
import L from 'leaflet';
import 'leaflet.markercluster';

// Inject all required CSS
import leafletCSS from 'leaflet/dist/leaflet.css?inline';
import markerClusterCSS from 'leaflet.markercluster/dist/MarkerCluster.css?inline';
import markerClusterDefaultCSS from 'leaflet.markercluster/dist/MarkerCluster.Default.css?inline';
import widgetCSS from './styles.css?inline';
injectCSS(leafletCSS, 'leaflet-css');
injectCSS(markerClusterCSS, 'markercluster-css');
injectCSS(markerClusterDefaultCSS, 'markercluster-default-css');
injectCSS(widgetCSS, 'ps-map-widget-css');

// Exported function: PSMapWidget(containerId, tsvData, opts)
// - containerId: id of DOM element to mount
// - tsvData: string containing TSV (header + rows)
// - opts: { minRadius, maxRadius, viridisMaxCategories, manualZoomEnabled, maxZoom, idColumn, idColumns, defSizeFactor, defColorFactor }
export default function PSMapWidget(containerID, tsvData, opts = {}) {
  const defSizeFactor = opts.defSizeFactor;
  const defColorFactor = opts.defColorFactor;
  const config = {
    minRadius: opts.minRadius ?? 4,
    maxRadius: opts.maxRadius ?? 18,
    viridisMaxCategories: opts.viridisMaxCategories ?? 7,
    manualZoomEnabled: opts.manualZoomEnabled ?? true,
    maxZoom: opts.maxZoom ?? 9
  };

  // parse TSV into array of objects
  let sourceTsv = tsvData;
  const allowedIdColumns = [...new Set((opts.idColumns === undefined
    ? [opts.idColumn ?? 'sample_id']
    : (Array.isArray(opts.idColumns) ? opts.idColumns : String(opts.idColumns).split(';')))
    .map(column => String(column).trim())
    .filter(Boolean))];
  const initialHeaders = parseTSVHeaders(tsvData);
  const availableInitialIdColumns = allowedIdColumns.filter(column => initialHeaders.includes(column));
  let currentIdColumn = allowedIdColumns.includes(opts.idColumn) && initialHeaders.includes(opts.idColumn)
    ? opts.idColumn
    : (initialHeaders.includes('sample_id') && allowedIdColumns.includes('sample_id')
      ? 'sample_id'
      : (availableInitialIdColumns.length === 1 ? availableInitialIdColumns[0] : ''));
  let data = parseMetadata(tsvData, currentIdColumn);
  if (!data.rows.length) throw new Error('No rows parsed from TSV');

  // detect numeric columns across the dataset
  let numericCols = detectNumericColumns(data.rows, Object.keys(data.rows[0]));
  numericCols = numericCols.filter(c => !['latitude', 'longitude'].includes(c));

  // pick sizeVar: first numeric in colorByList
  let sizeVar;
  let colorVar;
  if (defSizeFactor) {
    sizeVar = defSizeFactor;
  } else {
    sizeVar = data.factors.find(c => numericCols.includes(c)) || null;
  }

  if (defColorFactor) {
    colorVar = defColorFactor
  } else {
    colorVar = data.factors.find(c => c !== sizeVar) || null;
  }
  // pick colorVar: first colorByList entry that isn't sizeVar
  const container = document.getElementById(containerID);

  // clear previous content (important for htmlwidgets re-render)
  container.innerHTML = '';

  // Create the widget shell, toolbar, and map canvas.
  const widgetDiv = document.createElement('div');
  widgetDiv.className = 'ps-widget';
  widgetDiv.style.width = '100%';
  widgetDiv.style.height = '100%';
  widgetDiv.style.position = 'relative';
  container.appendChild(widgetDiv);

  const toolbarDiv = document.createElement('div');
  toolbarDiv.className = 'ps-toolbar';
  const toggleContainer = document.createElement('div');
  toggleContainer.className = 'ps-toggle-container';
  const toggleButton = document.createElement('button');
  toggleButton.className = 'ps-control-panel-toggle';
  toggleButton.type = 'button';
  toggleButton.title = 'Toggle control panel';
  toggleButton.setAttribute('aria-label', 'Toggle control panel');
  toggleButton.setAttribute('aria-expanded', 'true');
  toggleButton.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 16 16" class="ps-toggle-arrow" aria-hidden="true">
      <path d="M8 4 L12 8 L8 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" transform="rotate(-90 8 8)"/>
    </svg>
    <svg width="16" height="16" viewBox="0 0 16 16" class="ps-hamburger-icon" aria-hidden="true">
      <line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <line x1="2" y1="12" x2="14" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
  toggleContainer.appendChild(toggleButton);

  const collapsiblePanel = document.createElement('div');
  collapsiblePanel.className = 'ps-collapsible-panel';
  const tabsContainer = document.createElement('div');
  tabsContainer.className = 'ps-tabs';
  const tabButtons = new Map();
  let activeTab = null;
  let controlsExpanded = false;
  for (const [id, label] of [['data', 'Data'], ['controls', 'Controls'], ['map', 'Map'], ['export', 'Export']]) {
    const tab = document.createElement('button');
    tab.className = `ps-tab${id === activeTab ? ' active' : ''}`;
    tab.type = 'button';
    tab.textContent = label;
    tab.setAttribute('aria-expanded', String(id === activeTab && controlsExpanded));
    tab.addEventListener('click', () => {
      setActiveTab(id, id === activeTab ? !controlsExpanded : true);
    });
    tabsContainer.appendChild(tab);
    tabButtons.set(id, tab);
  }
  const controlsContainer = document.createElement('div');
  controlsContainer.className = 'ps-controls-container ps-controls-hidden';
  collapsiblePanel.append(tabsContainer, controlsContainer);
  toolbarDiv.append(toggleContainer, collapsiblePanel);

  // create map div
  const mapDiv = document.createElement('div');
  mapDiv.className = 'ps-map';
  mapDiv.style.width = '100%';
  widgetDiv.append(toolbarDiv, mapDiv);

  // initialize Leaflet on the child div
  const map = L.map(mapDiv, {
    preferCanvas: true,
    zoomControl: false,
    maxBounds: [[-85.05112878, -180], [85.05112878, 180]],
    maxBoundsViscosity: 1,
    maxZoom: config.maxZoom,
    minZoom: 2
  }).setView([10, 0], 2);

  const basemapPane = map.createPane('basemapPane');
  basemapPane.classList.add('ps-basemap-pane');
  basemapPane.style.zIndex = '200';
  const markerPane = map.createPane('sampleMarkerPane');
  markerPane.style.zIndex = '650';

  const tileUrl = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
  const basemapAttribution = 'Map data: © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>, SRTM | Map style: © <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)';
  const tileCrossOrigin = /^https?:/i.test(tileUrl);
  L.tileLayer(tileUrl, {
    attribution: basemapAttribution,
    subdomains: 'abc',
    minZoom: 2,
    maxZoom: config.maxZoom,
    pane: 'basemapPane',
    crossOrigin: tileCrossOrigin ? true : false
  }).addTo(map);
  setManualZoom(opts.manualZoomEnabled ?? true);

  let zoomSlider;
  let zoomValue;
  let manualZoomToggle;
  let idColumnSelect;
  const getValidExportDimension = value => {
    const dimension = Number(value);
    return Number.isInteger(dimension) && dimension > 0 ? dimension : null;
  };
  let exportWidth;
  let exportHeight;

  function setActiveTab(tabId, expanded = controlsExpanded) {
    activeTab = tabId;
    controlsExpanded = expanded;
    for (const [id, button] of tabButtons) {
      button.classList.toggle('active', id === tabId);
      button.setAttribute('aria-expanded', String(id === tabId && controlsExpanded));
    }
    controlsContainer.classList.toggle('ps-controls-hidden', !controlsExpanded);
    controlsContainer.replaceChildren();

    if (tabId === 'map') {
      const mapTabContent = buildControls(controlsContainer, numericCols, data.factors, sizeVar, colorVar, onSelectionChange);
      controlsContainer.appendChild(mapTabContent);
    } else if (tabId === 'data') {
      populateDataTab();
    } else if (tabId === 'controls') {
      populateMapControls();
    } else if (tabId === 'export') {
      populateExportTab();
    }
    window.requestAnimationFrame(() => map.invalidateSize({ pan: false }));
  }

  function populateDataTab() {
    const content = document.createElement('div');
    content.className = 'ps-controls';
    const group = document.createElement('div');
    group.className = 'ps-control-group';
    const label = document.createElement('label');
    label.className = 'ps-control-label';
    label.textContent = 'Data:';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.tsv,.txt,text/tab-separated-values';
    fileInput.className = 'ps-file-input';
    fileInput.style.display = 'none';
    fileInput.setAttribute('aria-label', 'Upload custom TSV data');
    const addDataButton = document.createElement('button');
    addDataButton.type = 'button';
    addDataButton.className = 'ps-button ps-add-data';
    addDataButton.textContent = '+';
    addDataButton.title = 'Upload custom TSV data';
    addDataButton.setAttribute('aria-label', 'Upload custom TSV data');
    addDataButton.addEventListener('click', () => fileInput.click());

    const idGroup = document.createElement('div');
    idGroup.className = 'ps-control-group';
    const idLabel = document.createElement('label');
    idLabel.className = 'ps-control-label';
    idLabel.textContent = 'ID column:';
    idColumnSelect = document.createElement('select');
    idColumnSelect.className = 'ps-select';
    idColumnSelect.setAttribute('aria-label', 'Sample ID column');
    populateIdColumnOptions(sourceTsv, currentIdColumn);
    idColumnSelect.addEventListener('change', () => {
      if (!idColumnSelect.value) return;
      try {
        loadTsvData(sourceTsv, idColumnSelect.value);
      } catch (error) {
        console.error('Unable to load TSV using the selected ID column:', error);
      }
    });

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        sourceTsv = await file.text();
        const selectedIdColumn = populateIdColumnOptions(sourceTsv, currentIdColumn);
        if (selectedIdColumn) {
          loadTsvData(sourceTsv, selectedIdColumn);
        } else {
          console.error('Unable to load custom TSV: none of the configured ID columns are present in the file.', allowedIdColumns);
        }
      } catch (error) {
        console.error(`Unable to load custom TSV "${file.name}":`, error);
      } finally {
        fileInput.value = '';
      }
    });
    group.append(label, addDataButton, fileInput);
    idGroup.append(idLabel, idColumnSelect);
    content.append(group, idGroup);
    controlsContainer.appendChild(content);
  }

  function populateIdColumnOptions(tsv, preferredColumn) {
    const headers = parseTSVHeaders(tsv).filter(header => {
      const normalized = header.toLowerCase().replace(/[^a-z]/g, '');
      return allowedIdColumns.includes(header) && !['lat', 'latitude', 'y', 'decimallatitude', 'lon', 'long', 'longitude', 'x', 'decimallongitude', 'colorby'].includes(normalized);
    });
    idColumnSelect.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select column';
    idColumnSelect.appendChild(placeholder);
    headers.forEach(header => {
      const option = document.createElement('option');
      option.value = header;
      option.textContent = header;
      idColumnSelect.appendChild(option);
    });
    const selected = headers.includes(preferredColumn)
      ? preferredColumn
      : (headers.length === 1 ? headers[0] : '');
    idColumnSelect.value = selected;
    return selected;
  }

  function loadTsvData(tsv, selectedIdColumn) {
    if (!allowedIdColumns.includes(selectedIdColumn)) {
      throw new Error(`ID column is not configured as an allowed identifier: ${selectedIdColumn}`);
    }
    const replacement = parseMetadata(tsv, selectedIdColumn);
    if (!replacement.rows.length || !replacement.rows.some(row => Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude)))) {
      throw new Error('The TSV needs data rows with latitude and longitude columns.');
    }
    const replacementNumeric = detectNumericColumns(replacement.rows, Object.keys(replacement.rows[0]))
      .filter(column => !['latitude', 'longitude'].includes(column));
    sourceTsv = tsv;
    currentIdColumn = selectedIdColumn;
    data = replacement;
    numericCols = replacementNumeric;
    sizeVar = replacement.factors.find(column => numericCols.includes(column)) || null;
    colorVar = replacement.factors.find(column => column !== sizeVar) || null;
    renderMarkers(sizeVar, colorVar);
    setActiveTab('map');
  }

  function populateMapControls() {
    const content = document.createElement('div');
    content.className = 'ps-controls';
    const zoomGroup = document.createElement('div');
    zoomGroup.className = 'ps-control-group ps-zoom-group';
    const zoomLabel = document.createElement('label');
    zoomLabel.className = 'ps-control-label';
    zoomLabel.textContent = 'Zoom:';
    zoomSlider = document.createElement('input');
    zoomSlider.type = 'range';
    zoomSlider.className = 'ps-zoom-slider';
    zoomSlider.min = '2';
    zoomSlider.max = String(config.maxZoom);
    zoomSlider.step = '1';
    zoomSlider.value = String(map.getZoom());
    zoomSlider.setAttribute('aria-label', 'Map zoom level');
    zoomValue = document.createElement('output');
    zoomValue.className = 'ps-zoom-value';
    zoomValue.textContent = zoomSlider.value;
    zoomSlider.addEventListener('input', () => map.setZoom(Number(zoomSlider.value)));
    zoomGroup.append(zoomLabel, zoomSlider, zoomValue);

    const manualGroup = document.createElement('label');
    manualGroup.className = 'ps-control-group ps-manual-zoom';
    manualZoomToggle = document.createElement('input');
    manualZoomToggle.type = 'checkbox';
    manualZoomToggle.checked = opts.manualZoomEnabled ?? true;
    manualZoomToggle.setAttribute('aria-label', 'Enable manual zoom');
    const manualLabel = document.createElement('span');
    manualLabel.className = 'ps-control-label';
    manualLabel.textContent = 'Enable manual zoom';
    manualZoomToggle.addEventListener('change', () => setManualZoom(manualZoomToggle.checked));
    manualGroup.append(manualZoomToggle, manualLabel);

    const fitButton = document.createElement('button');
    fitButton.type = 'button';
    fitButton.className = 'ps-button';
    fitButton.textContent = 'Fit samples';
    fitButton.addEventListener('click', () => fitMarkers());
    content.append(zoomGroup, manualGroup, fitButton);
    controlsContainer.appendChild(content);
    setManualZoom(manualZoomToggle.checked);
  }

  function setManualZoom(enabled) {
    for (const handler of [map.touchZoom, map.doubleClickZoom, map.scrollWheelZoom, map.boxZoom]) {
      if (!handler) continue;
      enabled ? handler.enable() : handler.disable();
    }
  }

  function populateExportTab() {
    const content = document.createElement('div');
    content.className = 'ps-controls';
    const widthGroup = document.createElement('div');
    widthGroup.className = 'ps-control-group';
    const widthLabel = document.createElement('label');
    widthLabel.className = 'ps-control-label';
    widthLabel.textContent = 'Width (px):';
    const widthInput = document.createElement('input');
    widthInput.type = 'number';
    widthInput.className = 'ps-number-input';
    widthInput.min = '1';
    widthInput.step = '1';
    widthInput.required = true;
    widthInput.setAttribute('aria-label', 'Export width in pixels');
    exportWidth ??= mapDiv.clientWidth || 800;
    widthInput.value = String(exportWidth);
    widthInput.addEventListener('input', () => {
      exportWidth = getValidExportDimension(widthInput.value);
    });
    widthGroup.append(widthLabel, widthInput);

    const heightGroup = document.createElement('div');
    heightGroup.className = 'ps-control-group';
    const heightLabel = document.createElement('label');
    heightLabel.className = 'ps-control-label';
    heightLabel.textContent = 'Height (px):';
    const heightInput = document.createElement('input');
    heightInput.type = 'number';
    heightInput.className = 'ps-number-input';
    heightInput.min = '1';
    heightInput.step = '1';
    heightInput.required = true;
    heightInput.setAttribute('aria-label', 'Export height in pixels');
    exportHeight ??= mapDiv.clientHeight || 500;
    heightInput.value = String(exportHeight);
    heightInput.addEventListener('input', () => {
      exportHeight = getValidExportDimension(heightInput.value);
    });
    heightGroup.append(heightLabel, heightInput);

    const formatGroup = document.createElement('div');
    formatGroup.className = 'ps-control-group';
    const formatLabel = document.createElement('label');
    formatLabel.className = 'ps-control-label';
    formatLabel.textContent = 'Format:';
    const format = document.createElement('select');
    format.className = 'ps-select';
    for (const value of ['svg', 'png']) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value.toUpperCase();
      format.appendChild(option);
    }
    formatGroup.append(formatLabel, format);

    const exportButton = document.createElement('button');
    exportButton.type = 'button';
    exportButton.className = 'ps-button ps-button-primary';
    exportButton.textContent = 'Export';
    exportButton.addEventListener('click', () => {
      if (!widthInput.reportValidity() || !heightInput.reportValidity()) return;
      exportMap(format.value, widthInput.value, heightInput.value);
    });
    content.append(exportButton, formatGroup, widthGroup, heightGroup);
    controlsContainer.appendChild(content);
  }

  toggleButton.addEventListener('click', () => {
    const collapsed = collapsiblePanel.classList.toggle('ps-panel-collapsed');
    toggleButton.classList.toggle('collapsed', collapsed);
    toggleButton.setAttribute('aria-expanded', String(!collapsed));
    window.requestAnimationFrame(() => map.invalidateSize({ pan: false }));
  });
  collapsiblePanel.addEventListener('transitionend', (event) => {
    if (event.target === collapsiblePanel && event.propertyName === 'max-height') {
      map.invalidateSize({ pan: false });
    }
  });

  // marker cluster group (requires Leaflet.markercluster included on page)
  const clusterGroup = (L.markerClusterGroup) ? L.markerClusterGroup({
    chunkedLoading: true,
    clusterPane: 'sampleMarkerPane'
  }) : null;
  let markerLayer = L.layerGroup();

  function zoomSizeFactor() {
    return Math.max(0.65, Math.min(2.5, Math.pow(1.08, map.getZoom() - 2)));
  }

  function fitMarkers() {
    const validMarkers = clusterGroup ? clusterGroup.getLayers() : markerLayer.getLayers();
    if (validMarkers.length) {
      map.fitBounds(L.latLngBounds(validMarkers.map(marker => marker.getLatLng())), { padding: [20, 20], maxZoom: 12 });
    }
  }

  function renderMarkers(selectedSizeVar, selectedColorVar, shouldFit = true) {
    // remove existing
    if (clusterGroup) clusterGroup.clearLayers();
    markerLayer.clearLayers();

    // prepare color scale
    const colorIsCont = selectedColorVar && numericCols.includes(selectedColorVar);
    let colorScale = null;
    if (selectedColorVar) {
      if (colorIsCont) {
        const vals = data.rows.map(r => Number(r[selectedColorVar])).filter(v => !Number.isNaN(v));
        const colorMin = Math.min(...vals), colorMax = Math.max(...vals);
        colorScale = new ContinuousColorScale(colorMin, colorMax);
      } else {
        const categoryData = data.rows.map(r => r[selectedColorVar] ?? '');
        colorScale = new CategoricalColorScale(categoryData, 0, 1);
      }
    }

    // prepare size scale 
    let sizeScale = null;
    if (selectedSizeVar) {
      const vals = data.rows.map(r => Number(r[selectedSizeVar])).filter(v => !Number.isNaN(v));
      const sizeMin = Math.min(...vals), sizeMax = Math.max(...vals);
      sizeScale = new ContinuousSizeScale(sizeMin, sizeMax, config.minRadius, config.maxRadius);
    }

    const markers = [];
    for (const r of data.rows) {
      const lat = Number(r['latitude']), lon = Number(r['longitude']);
      if (Number.isNaN(lat) || Number.isNaN(lon)) continue;

      const sizeValue = selectedSizeVar ? Number(r[selectedSizeVar]) : null;
      const radiusPx = (sizeScale && !Number.isNaN(sizeValue)
        ? sizeScale.getValue(sizeValue)
        : (config.minRadius + config.maxRadius) / 2) * zoomSizeFactor();

      const colorValue = selectedColorVar ? r[selectedColorVar] : null;
      const fill = colorScale
        ? colorScale.getValue(colorIsCont ? Number(colorValue) : colorValue)
        : '#3388ff';

      const icon = createCircleDivIcon(radiusPx, fill);
      const marker = L.marker([lat, lon], { icon, pane: 'sampleMarkerPane' });
      marker._ps_size = radiusPx;
      marker._ps_colorValue = colorValue;
      marker._ps_fill = fill;
      marker._ps_props = r;
      marker.bindPopup(buildPopupFromList(r, data.factors));
      markers.push(marker);
    }

    if (clusterGroup) {
      // create custom cluster icon that draws pie-chart + scales by avg size or count
      clusterGroup.options.iconCreateFunction = function (cluster) {
        const childMarkers = cluster.getAllChildMarkers();
        // aggregate counts per category
        const counts = {};
        let sumSize = 0;

        if (selectedColorVar && !numericCols.includes(selectedColorVar)) {
          childMarkers.sort((a, b) => colorScale.categories.indexOf(a._ps_colorValue ?? '') - colorScale.categories.indexOf(b._ps_colorValue ?? ''));
        } else if (selectedColorVar && numericCols.includes(selectedColorVar)) {
          childMarkers.sort((a, b) => Number(a._ps_colorValue) - Number(b._ps_colorValue));
        }

        childMarkers.forEach(m => {
          const cv = m._ps_colorValue ?? '';
          counts[cv] = (counts[cv] || 0) + 1;
          sumSize += (m._ps_size || 0);
        });
        const total = childMarkers.length;
        const avgSize = sumSize / total;
        // create pie data for top categories (categorical) or buckets for continuous
        const pieEntries = [];
        if (selectedColorVar && !numericCols.includes(selectedColorVar)) {
          // categorical: map category to color
          Object.keys(counts).forEach(k => {
            pieEntries.push({ count: counts[k], color: colorScale.getValue(k) });
          });
        } else if (selectedColorVar && numericCols.includes(selectedColorVar)) {
          // continuous: bucket into viridis bins by child marker color value (use their computed color)
          // approximate by grouping by the hex color chosen earlier
          const byColor = {};
          childMarkers.forEach(m => {
            const c = colorScale
              ? colorScale.getValue(Number(m._ps_props[selectedColorVar]))
              : '#3388ff';
            byColor[c] = (byColor[c] || 0) + 1;
          });
          Object.keys(byColor).forEach(k => pieEntries.push({ count: byColor[k], color: k }));
          pieEntries.sort((a, b) => (a.color === '#cccccc') ? 1 : 0);
        } else {
          // no colorVar: single-color pie (all same)
          pieEntries.push({ count: total, color: '#3388ff' });
        }

        // sort to put __OTHER last (if present)
        pieEntries.sort((a, b) => (a.color === '#cccccc') ? 1 : 0);

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

    // zoom to markers
    if (shouldFit && markers.length > 0) {
      const bounds = L.latLngBounds(markers.map(m => m.getLatLng()));
      map.fitBounds(bounds, { padding: [20, 20], maxZoom: 12 });
    }

    // update legend with scale objects
    updateLegend(mapDiv, selectedColorVar, selectedSizeVar, colorScale, sizeScale, zoomSizeFactor());
    if (zoomSlider) {
      zoomSlider.value = String(map.getZoom());
      zoomValue.textContent = zoomSlider.value;
    }
  }
  // initial render
  renderMarkers(sizeVar, colorVar);

  map.on('zoomend', () => {
    if (zoomSlider) {
      zoomSlider.value = String(map.getZoom());
      zoomValue.textContent = zoomSlider.value;
    }
    renderMarkers(sizeVar, colorVar, false);
  });


  // selection change handler
  function onSelectionChange(selectedSize, selectedColor) {
    sizeVar = selectedSize || null;
    colorVar = selectedColor || null;
    renderMarkers(selectedSize || null, selectedColor || null);
  }

  function buildLegendSvg(mapRect, width, height, escapeXml) {
    const legend = mapDiv.querySelector('.ps-legend');
    if (!legend) return '';
    const legendRect = legend.getBoundingClientRect();
    if (!legendRect.width || !legendRect.height) return '';

    const x = legendRect.left - mapRect.left;
    const y = legendRect.top - mapRect.top;
    const legendStyle = getComputedStyle(legend);
    const markup = [
      `<defs><clipPath id="ps-legend-clip"><rect x="${x}" y="${y}" width="${legendRect.width}" height="${legendRect.height}" rx="4"/></clipPath><linearGradient id="ps-legend-gradient" x1="0" y1="0" x2="1" y2="0">`
    ];
    const ramp = legend.querySelector('.ps-continuous-legend');
    const gradientColors = ramp
      ? Array.from(ramp.style.getPropertyValue('--ps-gradient').matchAll(/#[0-9a-f]{3,8}/gi), match => match[0])
      : [];
    gradientColors.forEach((color, index) => {
      const offset = gradientColors.length > 1 ? (index / (gradientColors.length - 1)) * 100 : 0;
      markup.push(`<stop offset="${offset}%" stop-color="${color}"/>`);
    });
    markup.push('</linearGradient></defs>');
    markup.push(`<rect x="${x}" y="${y}" width="${legendRect.width}" height="${legendRect.height}" rx="4" fill="${escapeXml(legendStyle.backgroundColor)}" stroke="${escapeXml(legendStyle.borderTopColor)}"/>`);
    markup.push(`<g clip-path="url(#ps-legend-clip)" font-family="sans-serif">`);

    const appendText = (element, anchor = 'start') => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (!rect.width || !rect.height || !element.textContent.trim()) return;
      const textX = anchor === 'middle'
        ? rect.left - mapRect.left + rect.width / 2
        : rect.left - mapRect.left;
      const textY = rect.top - mapRect.top + Math.min(rect.height * 0.82, parseFloat(style.fontSize) || rect.height);
      markup.push(`<text x="${textX}" y="${textY}" text-anchor="${anchor}" font-family="${escapeXml(style.fontFamily)}" font-size="${escapeXml(style.fontSize)}" font-weight="${escapeXml(style.fontWeight)}" fill="${escapeXml(style.color)}">${escapeXml(element.textContent.trim())}</text>`);
    };

    legend.querySelectorAll('.ps-legend-title').forEach(title => appendText(title));
    legend.querySelectorAll('.ps-category-item').forEach(item => {
      const swatch = item.querySelector('.ps-category-swatch');
      if (swatch) {
        const rect = swatch.getBoundingClientRect();
        const style = getComputedStyle(swatch);
        markup.push(`<rect x="${rect.left - mapRect.left}" y="${rect.top - mapRect.top}" width="${rect.width}" height="${rect.height}" fill="${escapeXml(style.backgroundColor)}" stroke="${escapeXml(style.borderTopColor)}"/>`);
      }
      const label = item.querySelector('span:last-child');
      if (label) appendText(label);
    });

    const gradientBar = legend.querySelector('.ps-gradient-bar');
    if (gradientBar) {
      const rect = gradientBar.getBoundingClientRect();
      markup.push(`<rect x="${rect.left - mapRect.left}" y="${rect.top - mapRect.top}" width="${rect.width}" height="${rect.height}" fill="url(#ps-legend-gradient)" stroke="#999"/>`);
      legend.querySelectorAll('.ps-tick').forEach(tick => {
        const mark = tick.querySelector('.ps-tick-mark');
        const label = tick.querySelector('.ps-tick-label');
        if (mark) {
          const markRect = mark.getBoundingClientRect();
          const markX = markRect.left - mapRect.left + markRect.width / 2;
          markup.push(`<line x1="${markX}" y1="${markRect.top - mapRect.top}" x2="${markX}" y2="${markRect.bottom - mapRect.top}" stroke="#666"/>`);
        }
        if (label) appendText(label, 'middle');
      });
    }

    legend.querySelectorAll('.ps-size-circle').forEach(circle => {
      const rect = circle.getBoundingClientRect();
      const style = getComputedStyle(circle);
      markup.push(`<circle cx="${rect.left - mapRect.left + rect.width / 2}" cy="${rect.top - mapRect.top + rect.height / 2}" r="${Math.min(rect.width, rect.height) / 2}" fill="${escapeXml(style.backgroundColor)}" stroke="${escapeXml(style.borderTopColor)}"/>`);
    });
    legend.querySelectorAll('.ps-size-label').forEach(label => appendText(label, 'middle'));
    markup.push('</g>');
    return markup.join('');
  }

  function exportMap(format, requestedWidth, requestedHeight) {
    const mapWidth = mapDiv.clientWidth;
    const mapHeight = mapDiv.clientHeight;
    const width = getValidExportDimension(requestedWidth);
    const height = getValidExportDimension(requestedHeight);
    if (!mapWidth || !mapHeight || !width || !height) return;
    const escapeXml = text => String(text).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
    const mapRect = mapDiv.getBoundingClientRect();
    const tileImages = [];
    const layers = ['<rect width="100%" height="100%" fill="#e5e3df"/>', '<g>'];
    mapDiv.querySelectorAll('img.leaflet-tile').forEach(tile => {
      if (!tile.naturalWidth) return;
      const rect = tile.getBoundingClientRect();
      const x = rect.left - mapRect.left;
      const y = rect.top - mapRect.top;
      if (x + rect.width < 0 || y + rect.height < 0 || x > mapWidth || y > mapHeight) return;
      const src = tile.currentSrc || tile.src;
      tileImages.push({ src, x, y, width: rect.width, height: rect.height });
      layers.push(`<image x="${x}" y="${y}" width="${rect.width}" height="${rect.height}" href="${escapeXml(src)}"/>`);
    });
    layers.push('</g>');

    const exportMarkers = [];
    mapDiv.querySelectorAll('.leaflet-marker-icon').forEach(markerIcon => {
      const rect = markerIcon.getBoundingClientRect();
      const x = rect.left - mapRect.left;
      const y = rect.top - mapRect.top;
      if (x + rect.width < 0 || y + rect.height < 0 || x > mapWidth || y > mapHeight) return;
      const sourceSvg = markerIcon.querySelector('svg');
      if (sourceSvg) {
        const iconWidth = rect.width;
        const iconHeight = rect.height;
        const viewBox = sourceSvg.getAttribute('viewBox') || `0 0 ${iconWidth} ${iconHeight}`;
        const clusterSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${iconWidth}" height="${iconHeight}" viewBox="${escapeXml(viewBox)}">${sourceSvg.innerHTML}</svg>`;
        exportMarkers.push({ kind: 'cluster', x, y, width: iconWidth, height: iconHeight, svg: clusterSvg });
        layers.push(`<svg x="${x}" y="${y}" width="${iconWidth}" height="${iconHeight}" viewBox="${escapeXml(viewBox)}">${sourceSvg.innerHTML}</svg>`);
      } else {
        const circle = markerIcon.firstElementChild;
        if (!circle) return;
        const radius = Math.min(rect.width, rect.height) / 2;
        const fill = getComputedStyle(circle).backgroundColor || '#3388ff';
        const cx = x + rect.width / 2;
        const cy = y + rect.height / 2;
        exportMarkers.push({ kind: 'circle', x: cx, y: cy, radius, fill });
        layers.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${escapeXml(fill)}" stroke="#000" stroke-width="1"/>`);
      }
    });

    const attribution = String(basemapAttribution)
      .replace(/<[^>]*>/g, '')
      .replace(/&copy;/gi, '©')
      .replace(/&amp;/gi, '&');
    const legendSvg = buildLegendSvg(mapRect, mapWidth, mapHeight, escapeXml);
    if (legendSvg) layers.push(legendSvg);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${mapWidth} ${mapHeight}" preserveAspectRatio="none">${layers.join('')}<text x="${mapWidth - 8}" y="${mapHeight - 8}" text-anchor="end" font-family="sans-serif" font-size="10" fill="#333">${escapeXml(attribution)}</text></svg>`;
    const filename = 'map-export';
    if (format === 'svg') {
      downloadBlob(svg, `${filename}.svg`, 'image/svg+xml;charset=utf-8');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.scale(width / mapWidth, height / mapHeight);
    context.fillStyle = '#e5e3df';
    context.fillRect(0, 0, mapWidth, mapHeight);
    Promise.all(tileImages.map(tile => loadExportImage(tile.src, /^https?:/i.test(tile.src))
      .then(image => ({ ...tile, image }))))
      .then(loadedTiles => {
        loadedTiles.forEach(tile => context.drawImage(tile.image, tile.x, tile.y, tile.width, tile.height));
        context.filter = 'none';
        return Promise.all(exportMarkers.filter(marker => marker.kind === 'cluster')
          .map(marker => loadExportImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(marker.svg)}`)
            .then(image => ({ ...marker, image }))));
      })
      .then(clusters => {
        exportMarkers.filter(marker => marker.kind === 'circle').forEach(marker => {
          context.beginPath();
          context.arc(marker.x, marker.y, marker.radius, 0, Math.PI * 2);
          context.fillStyle = marker.fill;
          context.fill();
          context.strokeStyle = '#000';
          context.lineWidth = 1;
          context.stroke();
        });
        clusters.forEach(marker => context.drawImage(marker.image, marker.x, marker.y, marker.width, marker.height));
        if (legendSvg) {
          const legendImage = loadExportImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${mapWidth}" height="${mapHeight}" viewBox="0 0 ${mapWidth} ${mapHeight}">${legendSvg}</svg>`)}`);
          return legendImage.then(image => {
            context.drawImage(image, 0, 0, mapWidth, mapHeight);
          });
        }
      })
      .then(() => {
        context.fillStyle = '#333';
        context.font = '10px sans-serif';
        context.textAlign = 'right';
        context.fillText(attribution, mapWidth - 8, mapHeight - 8);
        canvas.toBlob(blob => blob && downloadBlob(blob, `${filename}.png`, 'image/png'));
      })
      .catch(error => console.error(`Unable to export the map as ${format.toUpperCase()}.`, error));
  }

  function loadExportImage(source, useCors = false) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      if (useCors) image.crossOrigin = 'anonymous';
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = source;
    });
  }

  function downloadBlob(content, filename, mimeType) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

}
