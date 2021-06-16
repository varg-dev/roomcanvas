import sys, getopt
import bpy, bmesh
import json
import types

def main(argv):
    gltf_input_file = ''

    try:
        opts, args = getopt.getopt(argv, "hi:", [
            "input=",
        ])
    except getopt.GetoptError as err:
        print('get-gltf-dimensions.py -i <input>')
        print(err)
        sys.exit(2)
    
    for opt, arg in opts:
        if opt == '-h':
            print('get-gltf-dimensions.py -i <input>')
            sys.exit()
        elif opt in ("-i", "--input"):
            gltf_input_file = arg
    
    if gltf_input_file == '':
        print('get-gltf-dimensions.py -i <input>')
        sys.exit(2)

    print(gltf_input_file)

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

    with open(gltf_input_file.replace('.gltf', '.glb').replace('.glb', '__dimensions.json'), 'w') as dimensions_json:
        json.dump({
            'apartmentBboxMin': apartment_bbox_min,
            'apartmentBboxMax': apartment_bbox_max
        }, dimensions_json)


if __name__ == "__main__":
    # Get all args after " -- "
    # @see https://blender.stackexchange.com/a/8405
    main(sys.argv[sys.argv.index("--") + 1:])
