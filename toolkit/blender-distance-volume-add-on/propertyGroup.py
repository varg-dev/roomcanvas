# This program is free software; you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation; either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful, but
# WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTIBILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
# General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program. If not, see <http://www.gnu.org/licenses/>.

import bpy
from bpy.props import PointerProperty, BoolProperty, IntProperty, FloatProperty, EnumProperty, StringProperty

class DistanceBakePropertyGroup(bpy.types.PropertyGroup):
    """Implements the properties for distance baking"""
    bl_idname = "RENDER_PT_distance_bake"

    show_bake_panel: BoolProperty(
        name="Show Bake"
    )
    show_import_panel: BoolProperty(
        name="Show Bake"
    )
    show_sensor_labelling_positions_panel: BoolProperty(
        name="Show Sensor Labelling Positions Export"
    )
    show_test_panel: BoolProperty(
        name="Show Bake"
    )

    margin: IntProperty(
        name="Margin",
        description="Extends the baked result",
        default=5,
        min=0,
        soft_max=15
    )
    sensor_collection: StringProperty(
        name="Sensors",
        description="The positions of the objects in this collection will be used"
    )
    sensor_labelling_positions_collection: StringProperty(
        name="Sensor Labelling Positions Collection",
        description="A collection containing the potential sensor labelling positions, grouped into one collection named 'sensor_ID' each, where ID is the numerical ID of the sensor"
    )
    preview_texture: StringProperty(
        name="Preview Texture",
        description="Texture used for the preview"
    )
    obstacles_collection: StringProperty(
        name="Obstacles"
    )
    outside_volume_mesh: StringProperty(
        name="Outside"
    )
    flooding_directions: EnumProperty(
        name="Flood Directions",
        items=(
            ("STRAIGHT", "Straight", "Use only the direct neighbors of an voxel for flooding.", 0),
            ("DIAGONAL", "Diagonal (L2, 3×3)", "Use the direct and diagonal neighbors of a voxel for flooding.", 1),
            ("DIAGONAL_5", "Diagonal (L2, 5×5)", "Use the direct, diagonal and next-direct/next-diagonal neighbors of a voxel for flooding.", 2)
        )
    )
    occlusion_methode: EnumProperty(
        name="Occlusion method",
        items=(
            ("MESH", "Mesh", "", 0),
            ("VOLUME", "Volume", "", 1)
        )
    )
    output_methode: EnumProperty(
        name="Output",
        items=(
            ("EXPORT", "Export", "", 0),
            ("PREVIEW", "Preview", "", 1),
            ("BOTH", "Both", "", 2)
        )
    )
    volume_resolution: IntProperty(
        name="Volume Resolution",
        default=64,
        min=1,
        soft_min=8,
        soft_max=512
    )
    import_path: StringProperty(
        name="Import sensor positions from JSON file",
        description=""
    )