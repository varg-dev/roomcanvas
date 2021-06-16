# **RoomCanvas** › [Toolkit](../) › Sweet Home 3D Importer

This directory contains the source code for a command-line interface (CLI) program that converts building models created in the [Sweet Home 3D](http://www.sweethome3d.com) software to the formats used by [RoomCanvas](https://roomcanvas.dev) for the visualization of spatiotemporal sensor data in 3D building models.

> Note: These instructions target Sweet Home 3D Version 6.5 and Blender 2.83.15 LTS.

## Setup Instructions

The CLI program is written in TypeScript and runs in *ts-node* (Node.js).
Thus, make sure to have Node.js installed on your system and install the project’s dependencies using the following command:

```bash
npm install
```

## How-To: Importing Building Models from Sweet Home 3D

To import a 3D building model from Sweet Home 3D into RoomCanvas, follow these steps:

0. Make sure to have Blender installed on your system and take note of its executable path, e.g., `/Applications/Blender 2.83.15 LTS.app/Contents/MacOS/Blender`.
1. In Sweet Home 3D, export a zipped OBJ file of the building **without furniture** using *Tools* › *Export to XML/OBJ format*, naming the file, e.g., `asset_sh3d.zip`.
2. Additionally, export an OBJ file of the building **including furniture** using *3D view* › *Export to OBJ format…*, naming the file, e.g., `asset_sh3d_obj_furniture.obj`.
3. Execute the CLI program for the conversion to RoomCanvas assets as follows:  
    ```bash
    ./bin/run \
      --obj-no-furniture-file="asset_sh3d.zip" \
      --obj-furniture-file="asset_sh3d_obj_furniture.obj" \
      --blender-executable="blender"
    ```
5. Copy the resulting assets from the specified output folder (e.g., `asset_sh3d`) to the `example/data/building-models/` directory of the RoomCanvas web viewer and serve/deploy the viewer instance as specified in the viewer’s `README.md` file.  
Then, you should be able to select the asset named “asset_sh3d” from within the web UI, leading to a real-time, web-based 3D rendering of the building model.

Note that the sunlight position estimation in RoomCanvas pays respect to the building model’s configured *compass*, i.e., to the latitude, longitude, and north direction of the building. You can control these settings before importing Sweet Home 3D via *Plan* › *Modify compass…*, or after importing by manually modifying the `config.yaml` file.

## How-To: Create 3D Sensor Distance Maps

To create the 3D sensor distance maps used by the RoomCanvas viewer for the spatial interpolation of sensor values, you can import the binary GLTF (GLB) file created by the steps described above in Blender.
There, you can make use of the provided [Blender add-on for creating 3D distance maps (“distance volumes”)](../blender-distance-volume-add-on/).

## Limitations

- The imported 3D floor plans currently do not contain any furniture placed in Sweet Home 3D. While this follows an explicit design decision, one could use the exported OBJ file with furniture to show furniture in the building within RoomCanvas.
- Currently, only single-story apartments or building models are supported – using multi-floor buildings could lead to unexpected behavior.
- Configuring the positions of sensors in the building model is not yet possible from within Sweet Home 3D, although by making use of custom furniture libraries and appropriate naming schemes, such a graphical method of placing sensors could be added easily.
