import { ContinuousColorScale, CategoricalColorScale, ContinuousSizeScale } from './scales.js';
import { parseMetadata, detectNumericColumns } from './utils.js';
import { buildPopupFromList, createCircleDivIcon, createPieSvg, buildControls, updateLegend } from './builders.js';

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
  let data = parseMetadata(tsvData);
  if (!data.rows.length) throw new Error('No rows parsed from TSV');

  // detect numeric columns across the dataset
  let numericCols = detectNumericColumns(data.rows, Object.keys(data.rows[0]));
  numericCols = numericCols.filter(c => !['latitude', 'longitude'].includes(c));

  // pick sizeVar: first numeric in colorByList (per AGENTS)
  const sizeVar = data.factors.find(c => numericCols.includes(c)) || null;
  // pick colorVar: first colorByList entry that isn't sizeVar
  const colorVar = data.factors.find(c => c !== sizeVar) || null;

  // setup map
  const map = L.map(containerId, { preferCanvas: true }).setView([10, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map);

  // build UI controls (two dropdowns) inside the container
  const controlBox = buildControls(container, numericCols, data.factors, sizeVar, colorVar, onSelectionChange);
  container.prepend(controlBox);

  // marker cluster group (requires Leaflet.markercluster included on page)
  const clusterGroup = (L.markerClusterGroup) ? L.markerClusterGroup({ chunkedLoading: true }) : null;
  let markerLayer = L.layerGroup();

  function renderMarkers(selectedSizeVar, selectedColorVar) {
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
        const categoryData = data.rows.map(r => String(r[selectedColorVar]));
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
      const radiusPx = sizeScale && !Number.isNaN(sizeValue)
        ? sizeScale.getValue(sizeValue)
        : (config.minRadius + config.maxRadius) / 2;

      const colorValue = selectedColorVar ? r[selectedColorVar] : null;
      const fill = colorScale
        ? colorScale.getValue(colorIsCont ? Number(colorValue) : colorValue)
        : '#3388ff';

      const icon = createCircleDivIcon(radiusPx, fill);
      const marker = L.marker([lat, lon], { icon });
      marker._ps_size = radiusPx;
      marker._ps_colorValue = colorValue;
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
          console.log(colorScale.categories);
          childMarkers.sort((a, b) => colorScale.categories.indexOf(a._ps_colorValue) - colorScale.categories.indexOf(b._ps_colorValue));
        } else if (selectedColorVar && numericCols.includes(selectedColorVar)) {
          childMarkers.sort((a, b) => Number(a._ps_colorValue) - Number(b._ps_colorValue));
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

    // update legend with scale objects
    updateLegend(container, selectedColorVar, selectedSizeVar, colorScale, sizeScale);
  }
  // initial render
  renderMarkers(sizeVar, colorVar);

  // selection change handler
  function onSelectionChange(selectedSize, selectedColor) {
    renderMarkers(selectedSize || null, selectedColor || null);
  }

  // return an object with a refresh function for external control
  return {
    refresh: () => renderMarkers(controlBox.querySelector('#ps-size-select').value || null, controlBox.querySelector('#ps-color-select').value || null)
  };
}

// export function PSMapWidget(containerId, tsvData, opts = {}) {
//   const config = {
//     minRadius: opts.minRadius ?? 4,
//     maxRadius: opts.maxRadius ?? 22,
//     viridisMaxCategories: opts.viridisMaxCategories ?? 7
//   };

//   const container = document.getElementById(containerId);
//   if (!container) throw new Error(`Container "${containerId}" not found`);

//   const data = parseMetadata(tsvData);
//   if (!data.rows.length) throw new Error('No rows parsed from TSV');

//   let numericCols = detectNumericColumns(data.rows, Object.keys(data.rows[0]));
//   numericCols = numericCols.filter(c => !['latitude', 'longitude'].includes(c));

//   const sizeVar = data.factors.find(c => numericCols.includes(c)) || null;
//   const colorVar = data.factors.find(c => c !== sizeVar) || null;

//   const map = L.map(containerId, { preferCanvas: true }).setView([10, 0], 2);
//   L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
//     attribution: '&copy; OpenStreetMap contributors',
//     maxZoom: 19
//   }).addTo(map);

//   const clusterGroup = (L.markerClusterGroup)
//     ? L.markerClusterGroup({ chunkedLoading: true })
//     : null;
//   let markerLayer = L.layerGroup();

//   const controlBox = buildControls(
//     container,
//     numericCols,
//     data.factors,
//     sizeVar,
//     colorVar,
//     onSelectionChange
//   );
//   container.prepend(controlBox);

//   // initial render
//   renderSelected({
//     map,
//     container,
//     data,
//     config,
//     clusterGroup,
//     markerLayer,
//     selectedSizeVar: sizeVar,
//     selectedColorVar: colorVar
//   });

//   function onSelectionChange(selectedSize, selectedColor) {
//     renderSelected({
//       map,
//       container,
//       data,
//       config,
//       clusterGroup,
//       markerLayer,
//       selectedSizeVar: selectedSize || null,
//       selectedColorVar: selectedColor || null
//     });
//   }

//   return {
//     refresh: () =>
//       renderSelected({
//         map,
//         container,
//         data,
//         config,
//         clusterGroup,
//         markerLayer,
//         selectedSizeVar:
//           controlBox.querySelector('#ps-size-select').value || null,
//         selectedColorVar:
//           controlBox.querySelector('#ps-color-select').value || null
//       })
//   };
// }

// export function renderSelected({
//   map,
//   container,
//   data,
//   config,
//   clusterGroup,
//   markerLayer,
//   selectedSizeVar,
//   selectedColorVar
// }) {
//   if (clusterGroup) clusterGroup.clearLayers();
//   markerLayer.clearLayers();

//   const numericColsLocal = detectNumericColumns(data.rows, Object.keys(data.rows[0]));
//   const colorIsCont = selectedColorVar && numericColsLocal.includes(selectedColorVar);

//   // --- Build color and size scales ---
//   let colorScale = null;
//   if (selectedColorVar) {
//     if (colorIsCont) {
//       const vals = data.rows.map(r => Number(r[selectedColorVar])).filter(v => !Number.isNaN(v));
//       colorScale = new ContinuousColorScale(Math.min(...vals), Math.max(...vals));
//     } else {
//       const categories = data.rows.map(r => String(r[selectedColorVar]));
//       colorScale = new CategoricalColorScale(categories, 0, 1, VIRIDIS_CATEGORICAL);
//     }
//   }

//   let sizeScale = null;
//   if (selectedSizeVar) {
//     const vals = data.rows.map(r => Number(r[selectedSizeVar])).filter(v => !Number.isNaN(v));
//     sizeScale = new ContinuousSizeScale(
//       Math.min(...vals),
//       Math.max(...vals),
//       config.minRadius,
//       config.maxRadius
//     );
//   }

//   // --- Build markers ---
//   const markers = [];
//   for (const r of data.rows) {
//     const lat = Number(r.latitude), lon = Number(r.longitude);
//     if (Number.isNaN(lat) || Number.isNaN(lon)) continue;

//     const sizeValue = selectedSizeVar ? Number(r[selectedSizeVar]) : null;
//     const radiusPx = sizeScale && !Number.isNaN(sizeValue)
//       ? sizeScale.getValue(sizeValue)
//       : (config.minRadius + config.maxRadius) / 2;

//     const colorValue = selectedColorVar ? r[selectedColorVar] : null;
//     const fill = colorScale
//       ? colorScale.getValue(colorIsCont ? Number(colorValue) : colorValue)
//       : '#3388ff';

//     const icon = createCircleDivIcon(radiusPx, fill);
//     const marker = L.marker([lat, lon], { icon });
//     marker._ps_size = radiusPx;
//     marker._ps_colorValue = colorValue;
//     marker._ps_props = r;
//     marker.bindPopup(buildPopupFromList(r, data.factors));
//     markers.push(marker);
//   }

//   // --- Add to map ---
//   if (clusterGroup) {
//     // clusterGroup logic (same as before)
//     clusterGroup.addLayers(markers);
//     map.addLayer(clusterGroup);
//   } else {
//     markerLayer = L.layerGroup(markers).addTo(map);
//   }

//   // --- Update legend ---
//   updateLegend(container, selectedColorVar, selectedSizeVar, {
//     colorScale,
//     sizeScale,
//     config
//   });

//   return { clusterGroup, markerLayer };
// }



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