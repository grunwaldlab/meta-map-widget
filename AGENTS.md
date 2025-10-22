# Architecture

# Purpose
This widget will be used to represent data of samples from a plant pathogen pipeline and may include information such as the sample ID, sample date, proportion of the sample infected, and location type. Users will be able to customize which information they want displayed on the widget.

## Design philosophy
* Minimal dependencies
* Light weight, fast, and scalable
* Self contained widget easily embedded in offline documents
* All functionality works the same in mobile devices (e.g., no mouse hover or right click effects)

# Metadata: 
* Input from a CSV or TSV file - will need to be parsed into a metadata table
* Will consist of continuous and categorical information columns
* Column names aside from latitude/longitude and sample ID will be included in a “sort by” list that can * * * correspond to the colors or sizes of the color markers
* Randomly generate this information for now as a list of 20 points

# Logic:
* Only continuous variables can be used for size
* Categorical or continuous variables can be used for color
* The first numeric variable in the “sort by” list will be designated as the sizing variable, and the color variable will be thereafter chosen according to the first variable in the list that isn’t already the size variable.
* Color markers will use the viridis color palette with 7 colors

# Map construction:
* Create the basic map tiles using OpenStreetMap
* Circular color markers will be colored and sized according to their corresponding variables on a scale from 0 to 25 pixels
* Create a popup for each marker that includes every variable from the “sort by” list
* Include the leaflet cluster function for the color markers and size the cluster markers according to the average size of color markers in the region
* The cluster markers will be represented as pie charts according to the proportion of the color variable values in that region

## Tools used
- `vite`: packaging distributions
- `vitest`: unit testing 
- `http-server`: serving test pages using the widget in `./demo`
- `leaflet`: base for map widget
- `https://github.com/akq/Leaflet.DonutCluster/tree/master`
- `https://github.com/Leaflet/Leaflet.markercluster`: collapsing clusters of markers on zoom out
