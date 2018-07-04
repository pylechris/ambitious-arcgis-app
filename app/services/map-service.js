import Service from '@ember/service';
import { inject as service } from '@ember/service';
import Route from '@ember/routing/route';

export default Service.extend({
  esriLoader: service('esri-loader'),
  // create a new map object at an element
  newMap(element, mapOptions) {
    const options = {
      // Load a particular version rather than just the latest
      url: 'https://js.arcgis.com/4.7'
    };
    // load the map modules
    return this.get('esriLoader').loadModules(['esri/Map', 'esri/views/MapView', 'esri/Graphic',
      "esri/layers/GraphicsLayer", "esri/widgets/Sketch/SketchViewModel", "esri/views/2d/draw/Draw",
      "esri/geometry/Polyline", "esri/geometry/geometryEngine", "esri/layers/FeatureLayer", "esri/geometry/Circle"], options)
      .then(([Map, MapView, Graphic, GraphicsLayer, SketchViewModel, Draw, Polyline, geometryEngine, FeatureLayer, Circle]) => {
        if (!element || this.get('isDestroyed') || this.get('isDestroying')) {
          // component or app was likely destroyed
          return;
        }
        // create function to return new graphics
        this._newGraphic = (jsonGraphic) => {
          return new Graphic(jsonGraphic);
        };

        // GraphicsLayer to hold graphics created via sketch view model
        var tempGraphicsLayer = new GraphicsLayer();
        var updateGraphic;

        var map = new Map(mapOptions);
        map.add(tempGraphicsLayer);

        // Add a road segment layer
        // "http://gis05s.hdrgateway.com/arcgis/rest/services/Florida/TransPed_A/MapServer/74"
        const routeVertices = [];
        const routeSourceFeatures = [];
        let touchFeatures = [];

        const url = "http://gis05s.hdrgateway.com/arcgis/rest/services/Florida/TransPed_A/MapServer/74";
        const sourceIdFld = "Transport.DBO.aadt.FID";
        const roadFeatureLayer = new FeatureLayer({ url });
        map.add(roadFeatureLayer);

        // show the map at the element and
        // hold on to the view reference for later operations
        this._view = new MapView({
          map,
          container: element,
          center: [-81.385, 28.535],
          zoom: 15
        });

        var polylineSymbol = { // symbol used for polylines
          type: "simple-line", // autocasts as new SimpleLineSymbol()
          color: "#8A2BE2",
          width: "4",
          style: "solid"
        }

        return this._view.when(() => {
          // this._view.on("mouse-wheel", function (evt) {
          //   // prevents zooming with the mouse-wheel event
          //   evt.stopPropagation();
          // });

          // ************************************************************************************
          // Sketch Stuff

          // create a new sketch view model
          var sketchViewModel = new SketchViewModel({
            view: this._view,
            layer: tempGraphicsLayer,
            polylineSymbol: polylineSymbol,
          });


          // ************************************************************************************
          // set up logic to handle geometry update and reflect the update on "tempGraphicsLayer"
          // ************************************************************************************

          this._view.on("click", (evt) => {
            this._view.hitTest(evt).then(function (response) {
              var results = response.results;
              // Found a valid graphic
              if (results.length && results[results.length - 1]
                .graphic) {
                // Check if we're already editing a graphic
                if (!updateGraphic) {
                  // Save a reference to the graphic we intend to update
                  updateGraphic = results[results.length - 1].graphic;
                  // Remove the graphic from the GraphicsLayer
                  // Sketch will handle displaying the graphic while being updated
                  tempGraphicsLayer.remove(updateGraphic);
                  sketchViewModel.update(updateGraphic.geometry);
                }
              }
            });
          });

          // ************************************************************
          // Get the completed graphic from the event and add it to view.
          // This event fires when user presses
          //  * "C" key to finish sketching point, polygon or polyline.
          //  * Double-clicks to finish sketching polyline or polygon.
          //  * Clicks to finish sketching a point geometry.
          // ***********************************************************
          sketchViewModel.on("draw-complete", addGraphic);
          sketchViewModel.on("update-complete", addGraphic);
          sketchViewModel.on("update-cancel", addGraphic);

          function addGraphic(evt) {
            var geometry = evt.geometry;
            var symbol;

            // Choose a valid symbol based on return geometry
            switch (geometry.type) {
              case "polyline":
                symbol = polylineSymbol;
                break;
              default:
                symbol = polylineSymbol;
                break;
            }
            // Create a new graphic; add it to the GraphicsLayer
            var graphic = new Graphic({
              geometry: geometry,
              symbol: symbol
            });
            tempGraphicsLayer.add(graphic);
            // Remove stored reference to the updated graphic
            // Required in 'update-complete' callback specifically
            updateGraphic = null;
          }

          // ****************************************
          // activate the sketch to create a polyline
          // ****************************************
          // var drawLineButton = document.getElementById("polylineButton");
          // drawLineButton.onclick = function () {
          //   // set the sketch to create a polyline geometry
          //   sketchViewModel.create("polyline");
          //   setActiveButton(this);
          // };

          // // **************
          // // reset button
          // // **************
          // document.getElementById("resetBtn").onclick = function () {
          //   sketchViewModel.reset();
          //   tempGraphicsLayer.removeAll();
          //   setActiveButton();
          // };

          const setActiveButton = (selectedButton) => {
            // focus the view to activate keyboard shortcuts for sketching
            this._view.focus();
            var elements = document.getElementsByClassName("active");
            for (var i = 0; i < elements.length; i++) {
              elements[i].classList.remove("active");
            }
            if (selectedButton) {
              selectedButton.classList.add("active");
            }
          }
          // End Sketch Stuff
          // ************************************************************************************

          // ************************************************************************************************
          // Start of Draw Polyline
          // ************************************************************************************************
          const numberWithCommas = x =>
            x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
          // ========================================================================
          //     POLYLINES
          // ========================================================================
          var draw = new Draw({ view: this._view });

          var drawLineButton = document.getElementById("polylineButton");
          drawLineButton.onclick = function () {
            enableCreatePolyline(draw);
            setActiveButton(this);
          };

          // **************
          // reset button
          // **************
          document.getElementById("resetBtn").onclick = function () {
            draw.reset();
            tempGraphicsLayer.removeAll();
            routeVertices.length = 0;
            routeSourceFeatures.length = 0;
            touchFeatures.length = 0;
            setActiveButton();
          };

          // create a polyline using the provided vertices
          const createPolyline = vertices =>
            new Polyline({
              paths: vertices,
              spatialReference: this._view.spatialReference
            });

          // create a new graphic representing the polygon that is being drawn on the view
          const createPolylineGraphic = (geometry, lineStyle = "solid", color = "dodgerblue", width = "1") => {

            const graphic = new Graphic({
              geometry,
              symbol: {
                type: "simple-line", // autocasts as new SimpleMarkerSymbol()
                color,
                width,
                style: lineStyle
              }
            });
            return graphic;
          };

          //Label polyon with its area
          const labelLines = (geom, length) => {
            const graphic = new Graphic({
              geometry: geom.extent.center,
              symbol: {
                type: "text",
                color: "black",
                haloColor: "black",
                haloSize: "2px",
                //text: `${numberWithCommas(length.toFixed(2))} feet`,
                xoffset: 3,
                yoffset: 3,
                font: {
                  // autocast as Font
                  size: 14,
                  family: "sans-serif"
                }
              }
            });
            return graphic;
          };

          const createPoint = (coordinates) => {
            return {
              type: "point", // autocasts as /Point
              x: coordinates[0],
              y: coordinates[1],
              spatialReference: this._view.spatialReference
            };
          }
          // create a new graphic representing the polygon that is being drawn on the view
          const createPointGraphic = coordinates => {
            const geometry = createPoint(coordinates);

            const graphic = new Graphic({
              geometry,
              symbol: {
                type: "simple-marker", // autocasts as new SimpleMarkerSymbol()
                color: "dodgerblue",
                size: "14",
                style: "diamond"
              }
            });
            return graphic;
          };

          // this function is called from the polyline draw action events
          // to provide a visual feedback to users as they are drawing a polyline
          const drawPolyline = (evt, isComplete = false) => {
            //remove existing graphic
            this._view.graphics.removeAll();
            const vertices = evt.vertices;
            // if (evt.type === 'vertex-add' || evt.type === 'cursor-update') {
            if (evt.type === 'vertex-add') {
              //const routeGraphic = tempGraphicsLayer.graphics.length > 0 ? tempGraphicsLayer.graphics.shift() : undefined;

              //const routeVertices = routeGraphic && routeGraphic.geometry.paths.length > 0 ? routeGraphic.geometry.paths[0] : vertices;
              tempGraphicsLayer.graphics.removeAll();
              console.log(evt.type);
              this._view.whenLayerView(roadFeatureLayer).then(lyrView => {
                // lyrView.watch("updating", val => {
                //   if (!val) { // wait for the layer view to finish updating
                const queryParams = roadFeatureLayer.createQuery();
                // const newPoint = createPoint(vertices[vertices.length - 1]);
                // const searchArea = new Circle({ center: newPoint, radius: 500 });
                //queryParams.geometry = searchArea;
                const lastseg = createPolyline([vertices[vertices.length - 1], vertices[vertices.length - 2]]);
                queryParams.geometry = lastseg.extent;
                roadFeatureLayer.queryFeatures(queryParams).then(results => {
                  if (results.features.length > 0) {
                    results.features.forEach(feature => {
                      const intersects = geometryEngine.intersects(feature.geometry, lastseg);
                      // See if this is the closest coord
                      if (intersects) {
                        if (!routeSourceFeatures.includes(feature.attributes[sourceIdFld])) {
                          if (touchFeatures.includes(feature.attributes[sourceIdFld])) {
                            // Add coords between the last vertex index to the current index
                            routeSourceFeatures.push(feature.attributes[sourceIdFld]);
                            touchFeatures.splice(touchFeatures.indexOf(feature.attributes[sourceIdFld]), 1);

                            feature.geometry.paths[0].forEach(v => routeVertices.push(v));
                          } else {
                            // Add feature to touched array
                            touchFeatures.push(feature.attributes[sourceIdFld]);
                          }
                        }
                      }
                    });
                  }
                });
                //   }
                // });
              });
              const routepolyline = createPolyline(routeVertices);
              const routegraphic = createPolylineGraphic(routepolyline, "solid", "red", "3");
              tempGraphicsLayer.graphics.add(routegraphic);
            }


            // create a new polyline
            let polyline = createPolyline(vertices);

            // create a new graphic representing the polyline, add it to the view, copy to tempGraphics when complete
            let graphic = createPolylineGraphic(polyline, "dash");

            if (isComplete) {
              //  tempGraphicsLayer.add(graphic);
            } else {
              this._view.graphics.add(graphic);
            }

            // calculate the area of the polyline
            // let length = geometryEngine.geodesicLength(polyline, "feet");
            // if (length < 0) {
            //   // simplify the polyline if needed and calculate the area again
            //   const simplifiedPolyline = geometryEngine.simplify(polyline);
            //   if (simplifiedPolyline) {
            //     length = geometryEngine.geodesicLength(simplifiedPolyline, "feet");
            //   }
            // }
            // start displaying the area of the polyline, copy to tempGraphics when complete
            // graphic = labelLines(polyline, length);
            // if (isComplete) {
            //   tempGraphicsLayer.add(graphic);
            // } else {
            //   this._view.graphics.add(graphic);
            // }
          };

          const drawPolylineComplete = evt => {
            drawPolyline(evt, true);
            this._view.popupManager.enabled = true;
          };

          const enableCreatePolyline = (draw) => {
            routeVertices.length = 0;
            routeSourceFeatures.length = 0;
            touchFeatures.length = 0;

            // create() will return a reference to an instance of PolygonDrawAction
            const action = draw.create("polyline");

            // focus the view to activate keyboard shortcuts for drawing polygons
            this._view.focus();

            // listen to vertex-add event on the action
            action.on("vertex-add", drawPolyline);

            // listen to cursor-update event on the action
            action.on("cursor-update", drawPolyline);

            // listen to vertex-remove event on the action
            action.on("vertex-remove", drawPolyline);

            // *******************************************
            // listen to draw-complete event on the action
            // *******************************************
            action.on("draw-complete", evt => {
              drawPolylineComplete(evt);
            });
          };
          // ************************************************************************************************
          // End of Draw Polyline
          // ************************************************************************************************

          // let the caller know that the map is available
          return;


        });
      });
  },

  // clear and add graphics to the map
  refreshGraphics(jsonGraphics) {
    const view = this._view;
    if (!view || !view.ready) {
      return;
    }
    // clear any existing graphics
    view.graphics.removeAll();
    // convert json to graphics and add to map's graphic layer
    if (!jsonGraphics || jsonGraphics.length === 0) {
      return;
    }
    jsonGraphics.forEach(jsonGraphic => {
      view.graphics.add(this._newGraphic(jsonGraphic));
    });
  },

  // destroy the map if it was already created
  destroyMap() {
    if (this._view) {
      delete this._view;
    }
  }
});
