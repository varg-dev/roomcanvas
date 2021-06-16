# **RoomCanvas** › [Toolkit](../) › MagicaVoxel Distance Map Visualization

This directory contains a set of Python-based Jupyter Notebook files for the conversion of 3D distance volumes, as created with the [Blender Distance Volume Creation Add-on](../toolkit/blend-distance-volume-add-on) and used by [RoomCanvas](https://roomcanvas.dev), to VOX files that can be viewed, inspected, edited, and rendered in [MagicaVoxel](https://ephtracy.github.io).

> Note: These instructions target MagicaVoxel 0.9.66.2.

## Setup Instructions

The conversion script is written in Python and can be run and interactively edited using Jupyter Notebook files.
Thus, make sure to have Python 3 installed on your system and install the script’s dependencies from the `Pipfile` using [Pipenv](https://pipenv.pypa.io/en/stable/):

```bash
pipenv install
```

## How-To: Convert 3D Distance Maps to VOX files

To convert a PNG file containing the slices of a 3D distance map to MagicaVoxel’s VOX format, follow these steps:

1. Run the local Jupyter Notebook server to be able to access, run, and edit the provided Notebook files:  
    ```bash
    pipenv run jupyter notebook
    ```
2. (If the Jupyter Notebook does not open automatically in your default web browser, access it by clicking or copying the link reported from the above call’s CLI output)
3. Adjust the Notebook file’s variables accordingly, i.e., set:
    - `file_name`: The path to the to-be-converted PNG texture file (e.g., `'example/sensor_348_high.png'`)
    - `num_slices`: The amount of slices in the PNG texture file (e.g., `28`)
    - `slice_width`: The width in pixels of one slice of the PNG texture file (e.g., `160`)
    - `slice_height`: The height in pixels of one slice of the PNG texture file (e.g., `126`)
    - `export_color_palette`: Whether or not to include a color palette in the VOX file, allowing for visualization of the actual distances (i.e., pixel values)
    - `invert_output`: Whether or not to invert the output (useful for, e.g., visualizing the interpolation boundaries `'example/debug__distances.png'`)
    - *optional*: `output_file_name`: The name of the to-be-exported VOX file (by default, a file in the same path as the input PNG file is created, with `.vox` instead of `.png` as its file ending)
4. Run the Jupyter Notebook file via *Cell* › *Run All*.
5. Then, a VOX file should be created at the respective path, which you can open in MagicaVoxel via *Open Project* (<kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>O</kbd>).

## Limitations

- Currently, only 8-bit PNG files are supported for the conversion to MagicaVoxel VOX files.