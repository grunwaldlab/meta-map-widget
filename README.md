# `ps-leaflet-map-widget`: a Leaflet widget for use with the pathogensurveillance pipeline
PSMapWidget is a javascript Leaflet widget used to map and analyze locations of samples and their corresponding information produced by the [pathogensurveillance](https://github.com/grunwaldlab/pathogensurveillance) pipeline. It is designed to work alongside the [PathoSurveilR](https://github.com/grunwaldlab/PathoSurveilR) repository, which produces similar output in R.

## Installation and Setup
This repository can be accessed and downloaded from [Github](https://github.com/grunwaldlab/ps-leaflet-map-widget). To run offline, it will require node.js and NPM. It will also require an input TSV, which will be supplied at the beginning of the pipeline.

## Usage
![alt text](<Screenshot 2025-11-13 212907.png>)

The widget once run with NPM appears as above. This creates an interactive HTML Leaflet widget (map data provided by OpenStreetMap) which displays the location source of each individual sample supplied from the pipeline. You can sort the data by choosing variables for color and size using the dropdowns, and the pie chart markers are representative of the sample data in each respective cluster (charts represent frequencies of the color variable, and the icon size is an average of values of the size variable). 

![alt text](<Screenshot 2025-11-13 214104.png>)

You can also choose to focus in on individual data points. Selecting an individual marker will bring up a popup with the values of all data associated with that sample.

## License
This work is subject to the [MIT license](https://github.com/grunwaldlab/metacoder/blob/master/LICENSE).

## Credits
The following people contributed to ps-leaflet-map-widget: Zachary S.L. Foster, Claire E. Worthy.