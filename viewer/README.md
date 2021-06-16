# **RoomCanvas** › Viewer

This directory contains the TypeScript and GLSL source code files for the web-based sensor data visualization and configuration system [RoomCanvas](https://roomcanvas.dev).

## Setup Instructions

The web-based viewer is written in TypeScript and bundled using Webpack to allow for static serving of the resulting assets, i.e., the HTML, JS, image, and building model files. 

Thus, make sure to have Node.js installed on your system and install the project’s dependencies using the following command:

```bash
npm install
```

## How-To: Add Building Models

You can create 3D floor plan models, e.g. using the provided [Importer for Sweet Home 3D files](../toolkit/sweet-home-3d-importer/).
For usage in the visualization client, place the corresponding files (adhering to the following structure) into the `/example/data/building-models` directory.
Then re-run or re-build the project, using `npm run start:dev` or `npm run build` respectively.

```yaml
└── building-models
    └── asset-78
        ├── 3d-floor-plans
        │   ├── asset-78.glb # A GLTF file of the building model, optionally containing a pre-baked lightmap
        │   └── asset-78__hierarchy.gltf # optional: A GLTF file encoding room volumes/areas
        ├── distance-maps # optional
        │   ├── outside.png # optional: A distance volume encoding distances to windows/wall openings
        ¦   ¦   …
        │   ├── sensor_324_high.png # The 8 high … 
        │   └── sensor_324_low.png # … and 8 low bits of a sensor’s distance volume
        └── properties
            ├── config.yaml # A set of configuration parameters for the building model
            └── sensorLabelingCandidates.json # optional: Precomputed labeling position candidates
```

## NPM Configuration and Project Setup

`package.json` specifies the following scripts that can be run by `npm run <command>`.

| command         | description                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------- |
| `start:dev`     | starts a local development server serving the example on port 8080                                  |
| `build`         | build the example for deployment, creating a bundle with all facilities                             |
| `build:dev`     | (same as above, but with the development profile instead of production)                             |
| `build-lib`     | transpile sources to `./build/` for distribution via npm                                            |
| `build-lib:dev` | (same as above, but with the development profile instead of production)                             |
| `cleanup`       | removes all build directories, i.e., `./build`                                                      |
| `lint`          | code quality lint [TypeScript ESLint Rules](https://github.com/typescript-eslint/typescript-eslint) |
