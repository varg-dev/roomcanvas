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

class DistanceBakePanel(bpy.types.Panel):
    """Creates a Panel in the render context of the properties editor"""
    bl_idname = "RENDER_PT_DistanceBakePanel"
    bl_space_type = 'PROPERTIES'
    bl_label = "Distance Baking"
    bl_region_type = 'WINDOW'
    bl_context = "render"

    def draw(self, context):
        layout = self.layout

        scene = context.scene
        properties = scene.distance_bake


        # Bake Panel
        box = layout.box()
        col = box.column()
        row = col.row()
        if properties.show_bake_panel:
            row.prop(properties, "show_bake_panel", icon="DISCLOSURE_TRI_DOWN", text="Baking", emboss=False)
        else:
            row.prop(properties, "show_bake_panel", icon="DISCLOSURE_TRI_RIGHT", text="Baking", emboss=False)

        if properties.show_bake_panel:
            row = col.row()
            col = row.column()
            col.operator("render.volume_distance_bake", text="Bake Distance Volume")
            row = col.row()
            col = row.column()
            col.operator("render.distances_bake", text="Bake Distances")
            row = col.row()
            col = row.column()
            col.operator("render.volume_distance_outside_bake", text="Bake Outside Distance Volume")
            row = col.row()
            row.prop(properties, "flooding_directions", expand=True)
            row = col.row()
            row.prop(properties, "occlusion_methode", expand=True)
            col.prop(properties, "volume_resolution")

            col.prop_search(properties, "obstacles_collection", bpy.data, "collections")
            col.prop_search(properties, "sensor_collection", bpy.data, "collections")
            col.prop_search(properties, "outside_volume_mesh", bpy.data, "objects")

            row = col.row()
            row.prop(properties, "output_methode", expand=True)
            row = col.row()
            row.enabled = properties.output_methode == "PREVIEW" or properties.output_methode == "BOTH"
            row.prop_search(properties, "preview_texture", bpy.data, "images")

        # Import Panel
        box = layout.box()
        col = box.column()
        row = col.row()
        if properties.show_import_panel:
            row.prop(properties, "show_import_panel", icon="DISCLOSURE_TRI_DOWN", text="Import", emboss=False)
        else:
            row.prop(properties, "show_import_panel", icon="DISCLOSURE_TRI_RIGHT", text="Import", emboss=False)

        if properties.show_import_panel:
            row = col.row()
            col = row.column()
            col.prop(properties, "import_path", text="Path")
            col.operator("render.distances_bake_sensor_import", text="Import")
        
        # Sensor Labelling Positions Panel
        box = layout.box()
        col = box.column()
        row = col.row()
        if properties.show_sensor_labelling_positions_panel:
            row.prop(properties, "show_sensor_labelling_positions_panel", icon="DISCLOSURE_TRI_DOWN", text="Sensor Labelling Positions", emboss=False)
        else:
            row.prop(properties, "show_sensor_labelling_positions_panel", icon="DISCLOSURE_TRI_RIGHT", text="Sensor Labelling Positions", emboss=False)

        if properties.show_sensor_labelling_positions_panel:
            row = col.row()
            col = row.column()
            col.prop_search(properties, "sensor_labelling_positions_collection", bpy.data, "collections")
            col.operator("render.export_sensor_labelling_positions", text="Export positions")

        # Test Panel
        box = layout.box()
        col = box.column()
        row = col.row()
        if properties.show_test_panel:
            row.prop(properties, "show_test_panel", icon="DISCLOSURE_TRI_DOWN", text="Test", emboss=False)
        else:
            row.prop(properties, "show_test_panel", icon="DISCLOSURE_TRI_RIGHT", text="Test", emboss=False)

        if properties.show_test_panel:
            row = col.row()
            row.operator("render.distance_bake_test", text="Test")


        # layout.operator("render.distances_bake", text="Bake Distances")

        # row = layout.row()
        # row.prop(properties, "margin")