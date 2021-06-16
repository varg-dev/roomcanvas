# **RoomCanvas** › [Toolkit](../) › Blender Distance Volume Creation Add-on

This directory contains the source code for a Python add-on for [Blender](https://blender.org), allowing for the creation of 3D distance volumes used by the [RoomCanvas](https://roomcanvas.dev) viewer for run-time spatial interpolation of sensor values.

> Note: These instructions target Blender 2.83.15 LTS.

## Setup Instructions

To install and run the Blender add-on, do the following steps.

0. Make sure to have Blender installed on your system.
1. Compress the blender-distance-volume-add-on folder into a `.zip` file (e.g., `zip -r roomcanvas_blender.zip blender-distance-volume-add-on`).
2. Start Blender and open its Preferences via Edit › Preferences…, switch to *Add-ons*, and click on *Install*.  
3. Browse to, select the created `.zip` file (e.g., `roomcanvas_blender.zip`), and click on *Install Add-on*
4. Install the add-on’s Python dependencies:  
    1. Open the *Scripting* tab in Blender’s main UI
    2. In the Console, enter the following commands:  
        ```python
        import os
        import ensurepip
        import subprocess
        ensurepip.bootstrap()
        os.environ.pop("PIP_REQ_TRACKER", None)
        pybin = bpy.app.binary_path_python
        subprocess.check_call([pybin, '-m', 'pip', 'install', '-U', 'pip'])
        subprocess.check_call([pybin, '-m', 'pip', 'uninstall', 'pillow', '-y'])
        subprocess.check_call([pybin, '-m', 'pip', 'uninstall', 'PIL', '-y'])
        subprocess.check_call([pybin, '-m', 'pip', 'install', 'image'])
        ```
5. Enable the add-on via Edit › Preferences… › *Add-ons* › Filter for “RoomCanvas”, tick the checkbox at the “Generic: RoomCanvas: 3D sensor distance volume creation plug-in” entry

Then, Blender’s Scene panel should contain a *Distance Baking* section in its *Render Properties* tab.
To reproduce the results on the sample 3D floor plan model, you can import the [GLTF file of the sample building model](../../viewer/example/data/building-models/asset-78/3d-floor-plans/asset-78.glb) in Blender.

## Add-on Capabilities

After being installed and activated, the Blender plug-in offers the following functionalities:

- **Baking** of 3D distance volumes for the sensors placed in the scene, taking the 3D boundaries into account.  
To configure this baking, set the following parameters/settings:
    - Choose between Straight, Diagonal (L2, 3×3), and Diagonal (L2, 5×5) flood directions (default: L2, 3×3)
    - Choose between Mesh and Volume-based boundary flagging (default: Mesh)
    - Set the Blender object collection that contains the boundary-inducing *Obstacles*
    - Set the Blender object collection that contains the *Sensors’* positions (potentially imported using the *Import* panel described below)
    - Optionally, set a single *Outside* mesh used for computing the additional outside distance volume (encoding the distances to the closest window/wall opening)
    - Choose between Export (to `.png` files), Preview (in a Blender image texture panel) or Both (default: Export)
    - If *Export* is selected as the output format, two `.png` images encoding the higher and lower 8 bits of the 16-bit distances are saved for each sensor in the *Sensors* object collection. These are expected to be available for the client visualization via the respective [high](../../viewer/example/data/building-models/asset-78/distance-maps/sensor_324_high.png) and [low bit encoded PNG files](../../viewer/example/data/building-models/asset-78/distance-maps/sensor_324_low.png).
- **Import** the locations of sensors via *Import* to auto-create a collection of Blender “empties” encoding the sensors’ positions.
    - To import such position data from a `.json` file, specify the path to the file in the *Path:* field. Therefore, you can use a JSON file auto-converted from the [YAML config file of the building model](../../viewer/example/data/building-models/asset-78/properties/config.yaml).
- Export **Sensor Labeling Positions** (labeling candidates):
    - Configure the export by specificing a corresponding Blender object collection. This collection is expected to contain one sub-collection for each sensor ID (named, e.g.,  `sensor_324`). In these sub-collections, a list of Blender “empties” with corresponding transformations, i.e., location and rotation, is expected.  
    - These exported labeling candidate positions are then logged to Blender’s ”Info Log” (accessible via F3 › Enter “Info Log” › Press Enter), where they can be copied from and pasted to the list of candidate positions in [the building model’s sensorLabelingCandidates.json file](../../viewer/example/data/building-models/asset-78/properties/sensorLabelingCandidates.json).
