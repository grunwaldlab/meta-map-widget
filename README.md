# `meta-map-widget`: a self-contained map widget showing user-selectable metadata
PSMapWidget is a javascript Leaflet widget used to map and analyze locations associated with user-defined metadata.

## Installation and Setup
This repository can be accessed and downloaded from [Github](https://github.com/grunwaldlab/meta-map-widget). There is currently no distribution on NPM, but you can clone this repository and run `npm install`.

## Usage
![alt text](images/pie-chart-example.png)

The widget once run with NPM appears as above. This creates an interactive HTML Leaflet widget (map data provided by OpenStreetMap) which displays the location source of each individual datapoint. The color and size of map markers are determined by user-selected variables from the dropdown. Clusters of nearby points are automatically grouped and represented as pie charts, depending on zoom level. The pie chart markers are representative of the sample data in each respective cluster. Pie charts represent frequencies of the color variable, and the icon size is an average of values of the size variable. 

![alt text](images/popup-example.png)

You can also choose to focus in on individual data points. Selecting an individual marker will bring up a popup with the values of all data associated with that location.

## License
This work is released under the [MIT license](https://github.com/grunwaldlab/metacoder/blob/master/LICENSE).

## Credits
The following people contributed to meta-map-widget: Claire E. Worthy and Zachary S.L. Foster. 

## Funding
This work was supported by USDA funding under the guidance of Dr. Niklaus Grunwald.