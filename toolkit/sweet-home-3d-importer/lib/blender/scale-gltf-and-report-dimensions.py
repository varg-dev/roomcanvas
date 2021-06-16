import sys, getopt
import bpy, bmesh
import json
import types

def main(argv):
    gltf_input_file = ''
    translation_to_bbox_min = None

    try:
        opts, args = getopt.getopt(argv, "hi:t:", [
            "input=",
            "translation-to-bbox-min=",
        ])
    except getopt.GetoptError as err:
        print('scale-gltf-and-report-dimensions.py -i <input> -t <translation-to-bbox-min>')
        print(err)
        sys.exit(2)
    
    for opt, arg in opts:
        if opt == '-h':
            print('scale-gltf-and-report-dimensions.py -i <input> -t <translation-to-bbox-min>')
            sys.exit()
        elif opt in ("-i", "--input"):
            gltf_input_file = arg
        elif opt in ("-t", "--translation-to-bbox-min"):
            translation_to_bbox_min = arg
    
    if gltf_input_file == '':
        print('scale-gltf-and-report-dimensions.py -i <input> -t <translation-to-bbox-min>')
        sys.exit(2)

    print(gltf_input_file)
    print(translation_to_bbox_min)

    # Delete all default objects in the scene
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)

    # Load the GLTF/GLB file
    bpy.ops.import_scene.gltf(filepath=gltf_input_file)

    # Scale all objcts by the factor 0.01
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.transform.resize(
        value=(0.01, 0.01, 0.01),
    )
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # Find out the AABB of the model
    mesh = bmesh.new()
    for index, obj in enumerate(bpy.context.scene.objects): 
        if index == 0 or obj.type != 'MESH':
            continue
        bm = bmesh.new()
        bm.from_object(obj, bpy.context.evaluated_depsgraph_get())
        bm.transform(obj.matrix_world)
        m = bpy.data.meshes.new("temp")
        bm.to_mesh(m)
        mesh.from_mesh(m)
        bpy.data.meshes.remove(m)

    bounding_box = types.SimpleNamespace()
    bounding_box.min = [float("inf")] * 3
    bounding_box.max = [float("-inf")] * 3
    for vertex in mesh.verts:
        for i in range(0, 3):
            bounding_box.min[i] = min(bounding_box.min[i], vertex.co[i])
            bounding_box.max[i] = max(bounding_box.max[i], vertex.co[i])                
    apartment_bbox_min = [bounding_box.min[0], bounding_box.min[2], -bounding_box.max[1]]
    apartment_bbox_max = [bounding_box.max[0], bounding_box.max[2], -bounding_box.min[1]]
    
    # Fix the offset caused by Sweet Home 3D’s OBJ export including a base plane
    if translation_to_bbox_min:
        bpy.ops.object.select_all(action='SELECT')
        [translation_x, translation_y, translation_z] = translation_to_bbox_min.replace("\"", "").split(',')
        translation_x = float(translation_x) + apartment_bbox_min[0]
        translation_y = float(translation_y) + apartment_bbox_min[1]
        translation_z = float(translation_z) + apartment_bbox_min[2]
        bpy.ops.transform.translate(
            value=(float(translation_x), float(translation_y), float(translation_z)),
            # orient_type='GLOBAL', 
            # orient_matrix=((1, 0, 0), (0, 1, 0), (0, 0, 1)), 
            # orient_matrix_type='GLOBAL', 
            # constraint_axis=(False, False, True), 
            # mirror=True, 
            # use_proportional_edit=False, 
            # proportional_edit_falloff='SMOOTH', 
            # proportional_size=1, 
            # use_proportional_connected=False, 
            # use_proportional_projected=False
        )
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    
    # Re-calculate the updated AABB
    mesh = bmesh.new()
    for index, obj in enumerate(bpy.context.scene.objects): 
        if index == 0 or obj.type != 'MESH':
            continue
        bm = bmesh.new()
        bm.from_object(obj, bpy.context.evaluated_depsgraph_get())
        bm.transform(obj.matrix_world)
        m = bpy.data.meshes.new("temp")
        bm.to_mesh(m)
        mesh.from_mesh(m)
        bpy.data.meshes.remove(m)

    bounding_box = types.SimpleNamespace()
    bounding_box.min = [float("inf")] * 3
    bounding_box.max = [float("-inf")] * 3
    for vertex in mesh.verts:
        for i in range(0, 3):
            bounding_box.min[i] = min(bounding_box.min[i], vertex.co[i])
            bounding_box.max[i] = max(bounding_box.max[i], vertex.co[i])                
    apartment_bbox_min = [bounding_box.min[0], bounding_box.min[2], -bounding_box.max[1]]
    apartment_bbox_max = [bounding_box.max[0], bounding_box.max[2], -bounding_box.min[1]]

    # Export the scaled GLB file
    bpy.ops.export_scene.gltf(filepath=gltf_input_file.replace('.gl', '__scaled.gl'))

    with open(gltf_input_file.replace('.gltf', '.glb').replace('.glb', '__dimensions.json'), 'w') as dimensions_json:
        json.dump({
            'apartmentBboxMin': apartment_bbox_min,
            'apartmentBboxMax': apartment_bbox_max
        }, dimensions_json)



if __name__ == "__main__":
    # Get all args after " -- "
    # @see https://blender.stackexchange.com/a/8405
    main(sys.argv[sys.argv.index("--") + 1:])
