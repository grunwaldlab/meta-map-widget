import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export function PSMapWidget(containerId, tsvData) {
  // Parse TSV data
  const lines = tsvData.trim().split('\n');
  const headers = lines[0].split('\t');

  // Find column indices
  const latIndex = headers.indexOf('latitude');
  const lonIndex = headers.indexOf('longitude');
  const typeIndex = headers.indexOf('type');
  const proportionIndex = headers.indexOf('proportion_infected');

  if (latIndex === -1 || lonIndex === -1) {
    throw new Error('TSV data must contain "latitude" and "longitude" columns');
  }

  // Parse data rows
  const markers = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split('\t');
    const lat = parseFloat(values[latIndex]);
    const lon = parseFloat(values[lonIndex]);

    if (!isNaN(lat) && !isNaN(lon)) {
      markers.push({
        lat: lat,
        lon: lon,
        type: typeIndex !== -1 ? values[typeIndex] : '',
        proportion_infected: proportionIndex !== -1 ? parseFloat(values[proportionIndex]) : null
      });
    }
  }

  if (markers.length === 0) {
    throw new Error('No valid markers found in TSV data');
  }

  // Create map
  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error(`Container with id "${containerId}" not found`);
  }

  const map = L.map(containerId);

  // Add tile layer
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map);

  // Add markers
  const bounds = L.latLngBounds();
  markers.forEach(markerData => {
    const marker = L.marker([markerData.lat, markerData.lon]).addTo(map);
    bounds.extend([markerData.lat, markerData.lon]);

    // Create popup content
    let popupContent = `<b>Location</b><br>`;
    popupContent += `Lat: ${markerData.lat}, Lon: ${markerData.lon}<br>`;
    if (markerData.type) {
      popupContent += `Type: ${markerData.type}<br>`;
    }
    if (markerData.proportion_infected !== null && !isNaN(markerData.proportion_infected)) {
      popupContent += `Proportion Infected: ${markerData.proportion_infected.toFixed(3)}`;
    }

    marker.bindPopup(popupContent);
  });

  // Fit map to show all markers
  map.fitBounds(bounds, { padding: [50, 50] });

  return map;
}
