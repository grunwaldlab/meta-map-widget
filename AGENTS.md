# Architecture

## Design philosophy

* Minimal dependencies
* Light weight, fast, and scalable
* Self contained widget easily embedded in offline documents
* All functionality works the same in mobile devices (e.g., no mouse hover or right click effects)

## Tools used

- `vite`: packaging distributions
- `vitest`: unit testing
- `http-server`: serving test pages using the widget in `./demo`
- `leaflet`: base for map widget
- `https://github.com/akq/Leaflet.DonutCluster/tree/master`
- `https://github.com/Leaflet/Leaflet.markercluster`: collapsing clusters of markers on zoom out
