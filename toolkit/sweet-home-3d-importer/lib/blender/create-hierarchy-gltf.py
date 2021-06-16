import sys, getopt
import bpy, bmesh
import json

def main(argv):
    home_json_file_path = ''
    output_gltf_file_path = ''

    try:
        opts, args = getopt.getopt(argv, "hi:o:", [
            "input=",
            "output=",
        ])
    except getopt.GetoptError as err:
        print('create-hierarchy-gltf.py -i <input> -o <output>')
        print(err)
        sys.exit(2)
    
    for opt, arg in opts:
        if opt == '-h':
            print('create-hierarchy-gltf.py -i <input> -o <output>')
            sys.exit()
        elif opt in ("-i", "--input"):
            home_json_file_path = arg
        elif opt in ("-o", "--output"):
            output_gltf_file_path = arg
    
    if home_json_file_path == '':
        print('create-hierarchy-gltf.py -i <input> -o <output>')
        sys.exit(2)

    print(home_json_file_path)

    # Parse the input Home.xml file (converted to JSON format)
    with open(home_json_file_path, "r") as home_json_file:
        home_data = json.load(home_json_file)
    
    rooms = home_data['home']['room']

    # Delete all default objects in the scene
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)

    for room_index, room_object in enumerate(rooms):
        print(room_index)
        print(room_object)

        # Note: The y coordinates are inverted to account for the difference in the coordinate systems of SH3D and Blender
        verts = list(map(lambda point: (float(point['@_x']) / 100, -float(point['@_y']) / 100, 0), room_object['point']))

        # @see https://blender.stackexchange.com/a/159185
        mesh = bpy.data.meshes.new('asset_' + str(room_index + 1))  # add the new mesh
        obj = bpy.data.objects.new(mesh.name, mesh)
        col = bpy.data.collections.get("Collection")
        col.objects.link(obj)
        bpy.context.view_layer.objects.active = obj

        faces = [list(range(0, len(verts)))]

        mesh.from_pydata(verts, [], faces)

    # Extrude all rooms by the apartment‘s wall height
    wall_height = float(home_data['home']['@_wallHeight']) / 100
    print(wall_height)

    bpy.ops.object.select_all(action='SELECT')
    # bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.object.editmode_toggle()
    bpy.ops.mesh.extrude_region_move(
        MESH_OT_extrude_region=None,
        # MESH_OT_extrude_region={
        #     "use_normal_flip":False, 
        #     "use_dissolve_ortho_edges":False, 
        #     "mirror":False
        # }, 
        TRANSFORM_OT_translate={
            "value":(0, 0, wall_height), 
            # "orient_type":'NORMAL', 
            # "orient_matrix":((-0.894427, -0.447214, 0), (0.447214, -0.894427, 0), (0, 0, 1)), 
            # "orient_matrix_type":'NORMAL', "constraint_axis":(False, False, True), 
            # "mirror":False, 
            # "use_proportional_edit":False, 
            # "proportional_edit_falloff":'SMOOTH', 
            # "proportional_size":1, 
            # "use_proportional_connected":False, 
            # "use_proportional_projected":False, 
            # "snap":False, 
            # "snap_target":'CLOSEST', 
            # "snap_point":(0, 0, 0), 
            # "snap_align":False, 
            # "snap_normal":(0, 0, 0), 
            # "gpencil_strokes":False, 
            # "cursor_transform":False, 
            # "texture_space":False, 
            # "remove_on_cancel":False, 
            # "release_confirm":False, 
            # "use_accurate":False, 
            # "use_automerge_and_split":False
        }
    )
    
    # Export the hierachy GLTF file
    bpy.ops.export_scene.gltf(filepath=output_gltf_file_path, export_format='GLTF_EMBEDDED')


if __name__ == "__main__":
    # Get all args after " -- "
    # @see https://blender.stackexchange.com/a/8405
    main(sys.argv[sys.argv.index("--") + 1:])
