# Architecture

## Purpose
This interactive map widget will be used to represent the locations of samples and will include information associated with each sample. Users will be able to customize which information they want displayed on the map widget through size and color using one or more dropdown menus.

## Design philosophy
* Minimal dependencies
* Light weight, fast, and scalable
* Self contained and embeddable widget
* All functionality works the same in mobile devices (e.g., no mouse hover or right click effects)

## Input format: 
* Input from a TSV file - will need to be parsed
* Will consist of continuous and categorical information columns
* Required columns: latitude, logitude, sample_id, color_by
* Column names aside from required columns can be included in a color_by column formatted as a semicolon-separated list. Values of columns defined in color_by can correspond to the colors or sizes of the map markers

## Logic:
* Only continuous variables can be used for size
* Categorical or continuous variables can be used for color
* The first numeric variable in the color_by list will be designated as the sizing variable, and the color variable will be thereafter chosen according to the first variable in the list that isn’t already the size variable.
* Color markers will use the viridis color palette with a configurable maximum (7 by default) number of colors displayed.
* If categories > maximum, the least frequent ones will be gray, but will still appear in the legend.

## Map construction:
* Create the basic map tiles using OpenStreetMap
* Circular map markers should be colored and sized according to their corresponding variables 
* The user should be able to select which variables are used for color/size using two dropdown menus
* Numeric data should be rescaled to a minimum/maximum pixel radius (both configurable)
* Rescale selected color variables according to the viridis palette
* Create a popup for each marker that includes every variable from the color_by list
* Include the leaflet cluster function for the color markers and size the cluster markers according to the average size of color markers in the cluster. If no size variable is selected, the cluster marker size will be proportional to the number of samples in that cluster 
* The cluster markers will be represented as pie charts according to the proportion of the selected color variable values in that cluster
* For continuous variables, colors on the pie chart markers should be ordered together (NOT binned) based on already mapped color values
* Create legends for the selected color and size variables

## Tools used
- `vite`: packaging distributions
- `vitest`: unit testing 
- `http-server`: serving test pages using the widget in `./demo`
- `leaflet`: base for map widget
- `https://github.com/akq/Leaflet.DonutCluster/tree/master`
- `https://github.com/Leaflet/Leaflet.markercluster`: collapsing clusters of markers on zoom out
- `https://github.com/rte-antares-rpackage/leaflet.minicharts`: an R package that includes pie chart functionality for reference
