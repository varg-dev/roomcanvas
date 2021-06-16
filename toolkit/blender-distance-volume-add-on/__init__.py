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

import json
import bpy, bmesh, time, sys, functools, numpy, types, copy
from mathutils.bvhtree import BVHTree
from bpy.props import PointerProperty
from bpy.types import Operator
from mathutils import Vector
from mathutils.geometry import barycentric_transform, intersect_point_tri_2d, intersect_point_line

# import subprocess
# import ensurepip
import os
# ensurepip.bootstrap()
# Workaround to fix EnvironmentError during installation (https://developer.blender.org/T71856#899030)
# os.environ.pop("PIP_REQ_TRACKER", None)
# pybin = bpy.app.binary_path_python
# subprocess.check_call([pybin, '-m', 'pip', 'install', '-U', 'pip'])
# subprocess.check_call([pybin, '-m', 'pip', 'uninstall', 'pillow', '-y'])
# subprocess.check_call([pybin, '-m', 'pip', 'uninstall', 'PIL', '-y'])
# subprocess.check_call([pybin, '-m', 'pip', 'install', 'image'])

from PIL import Image

from . panel import DistanceBakePanel
from . propertyGroup import DistanceBakePropertyGroup

bl_info = {
    "name" : "RoomCanvas: 3D sensor distance volume creation plug-in",
    "author" : "Daniel-Amadeus Johannes Glöckner, Bastian König, Daniel Limberger",
    "description" : "",
    "blender" : (2, 80, 0),
    "version" : (0, 1, 0),
    "location" : "",
    "warning" : "",
    "category" : "Generic"
}

def save_image(filepath, filetype, data, width, height):
    # Similar to webgl-operate’s encode_uint32_to_rgba8 function
    low_bits = numpy.bitwise_and(numpy.right_shift(numpy.asarray(data, numpy.uint16()).flatten(), 0), 0xFF)
    high_bits = numpy.bitwise_and(numpy.right_shift(numpy.asarray(data, numpy.uint16()).flatten(), 8), 0xFF)
    low_image = Image.frombytes('L', (width, height), numpy.asarray(low_bits, numpy.uint8(), order = 'C'))
    high_image = Image.frombytes('L', (width, height), numpy.asarray(high_bits, numpy.uint8(), order = 'C'))
    low_image.save("{0}_low.{1}".format(filepath, filetype))
    high_image.save("{0}_high.{1}".format(filepath, filetype))


class exportSensorLabellingPositions(bpy.types.Operator):
    bl_idname = "render.export_sensor_labelling_positions"
    bl_label = "Export sensor labelling positions"

    def execute(self, context):
        self.settings = context.scene.distance_bake
        labelling_positions_collection_name = self.settings.sensor_labelling_positions_collection
        if labelling_positions_collection_name != "":
            labelling_positions_collection = bpy.data.collections[labelling_positions_collection_name]
            for child_collection in labelling_positions_collection.children:
                sensor_name = child_collection.name
                sensor_attributes = {}
                sensor_attributes['name'] = sensor_name
                sensor_attributes['labelling_positions'] = []
                for labelling_position in child_collection.objects:
                    labelling_position_attributes = {}

                    position = labelling_position.location

                    labelling_position_attributes['position'] = list(position)

                    euler_rotation = labelling_position.rotation_euler

                    # normal = labelling_position.data.polygons[0].normal
                    # labelling_position_attributes['front_face_normal'] = list(normal)
                    
                    # Taken from https://blender.stackexchange.com/a/122481
                    mat = labelling_position.matrix_world
                    localX = Vector((mat[0][0],mat[1][0],mat[2][0]))
                    localY = Vector((mat[0][1],mat[1][1],mat[2][1]))
                    localZ = Vector((mat[0][2],mat[1][2],mat[2][2]))

                    labelling_position_attributes['running_direction_local_x'] = list(localX)
                    labelling_position_attributes['up_local_y'] = list(localY)
                    labelling_position_attributes['front_face_local_z'] = list(localZ)

                    # Adapted from https://blender.stackexchange.com/a/77680                    
                    bb = labelling_position.bound_box
                    dx_local = max(bb[i][0] for i in range(8)) - min(bb[i][0] for i in range(8))
                    local_x_length = dx_local*labelling_position.scale[0]

                    labelling_position_attributes['running_length_local_x_length'] = local_x_length

                    sensor_attributes['labelling_positions'].append(labelling_position_attributes)
                    #me = labelling_position.data
                    #for poly in me.polygons:
                    #    print("Polygon index: %d, length: %d" % (poly.index, poly.loop_total))
                print(sensor_attributes)
                self.report({'INFO'}, json.dumps(sensor_attributes, indent=4))
        return {"FINISHED"}


class bakeDistanceTest(bpy.types.Operator):
    bl_idname = "render.distance_bake_test"
    bl_label = "Distance bake test operator"

    def execute(self, context):
        width = 256
        height = width
        data = [float(i * 65535) / (width * height) for i in range(0, width * height)]
        filepath = bpy.path.abspath("//pillow_test")
        save_image(filepath, 'png', data, width, height)
        print("done")
        return {"FINISHED"}

progressStartTime = 0
timeLeft = 0
progress_goal = 1
def update_progress(job_title, step):
    global progressStartTime
    global timeLeft
    progress = step / progress_goal
    now = time.time()
    if progressStartTime == 0:
        progressStartTime = now
    if progress != 0:
        timeLeft = (1 - progress) * (now - progressStartTime) / progress
    length = 20
    block = int(round(length*progress))
    msg = "\r{0}: [{1}] {2:.1f}% {3}s".format(job_title, "#"*block + "-"*(length-block), round(progress*100, 1), round(timeLeft))
    if progress >= progress_goal:
        msg += " DONE\r\n"
        progressStartTime = 0
        timeLeft = 0
    sys.stdout.write(msg)
    sys.stdout.flush()

def get_bounds(points):
    minimum = points[0].copy()
    maximum = points[0].copy()

    for point in points:
        minimum.x = min(minimum.x, point.x)
        minimum.y = min(minimum.y, point.y)
        maximum.x = max(maximum.x, point.x)
        maximum.y = max(maximum.y, point.y)
    return (minimum, maximum)

def to_pixel_space(point, image):
    point.x *= image.size[0]
    point.y *= image.size[1]

def in_pixel_space(point, image):
    new_point = point.copy()
    new_point.x *= image.size[0]
    new_point.y *= image.size[1]
    return new_point

def to_normalized_space(point, image):
    point.x /= image.size[0]
    point.y /= image.size[1]
    return point

def set_pixel(pixels, width, height, x, y, r, g, b, a = 255):
    pixelNumber = (y * width + x) * 4
    pixels[pixelNumber + 0] = r
    pixels[pixelNumber + 1] = g
    pixels[pixelNumber + 2] = b
    pixels[pixelNumber + 3] = a

def get_pixel(pixels, width, height, x, y):
    pixelNumber = (y * width + x) * 4
    return (
        pixels[pixelNumber + 0],
        pixels[pixelNumber + 1],
        pixels[pixelNumber + 2],
        pixels[pixelNumber + 3]
    )

def pixel_is_empty(pixels, width, height, x, y):
    r, g, b, a = get_pixel(pixels, width, height, x, y)
    return r == 0

def clear_image(pixels, width, height):
    for y in range(0, height):
        for x in range(0, width):
            pixelNumber = (y * width + x) * 4
            pixels[pixelNumber + 0] = 0
            pixels[pixelNumber + 1] = 0
            pixels[pixelNumber + 2] = 0
            pixels[pixelNumber + 3] = 255

def find_coord(loc, face, uv_map, obj):
    u, v, w = [l[uv_map].uv.to_3d() for l in face.loops]
    x, y, z = [v.co for v in face.verts]
    co = barycentric_transform(loc, u, v, w, x, y, z)
    return obj.matrix_world @ co

def find_distance(point_a, point_b):
    connection = point_a - point_b
    distance = connection.length * 0.5
    return distance

def bake_distances(context, obj, mesh, uv_map, texture, point):
    margin = context.scene.distance_bake.margin
    pixels = list(texture.pixels)
    width = texture.size[0]
    height = texture.size[1]
    clear_image(pixels, width, height)
    update_progress("bake distance for " + obj.name, 0)
    for face_index, face in enumerate(mesh.faces):
        update_progress("bake distance for " + obj.name, face_index / len(mesh.faces))
        points = [l[uv_map].uv.to_3d() for l in face.loops]
        u, v, w = points
        minimum, maximum = get_bounds(points)
        to_pixel_space(minimum, texture)
        to_pixel_space(maximum, texture)
        for y in range(round(minimum.y - margin), round(maximum.y + margin)):
            for x in range(round(minimum.x - margin), round(maximum.x + margin)):
                point_on_triange = to_normalized_space(Vector((x, y, 0)), texture)
                if intersect_point_tri_2d(point_on_triange, u, v, w):
                    point_in_world = find_coord(point_on_triange, face, uv_map, obj)
                    distance = find_distance(point_in_world, point)
                    set_pixel(pixels, width, height, x, y, distance, distance, distance)
                else:
                    if not pixel_is_empty(pixels, width, height, x, y):
                        continue
                    distance_to_triangle = margin + 1
                    closest_point = ()
                    for index in range(0, len(points)):
                        p0 = points[index]
                        p1 = points[(index+1) % len(points)]
                        closest_point_local, _ = intersect_point_line(point_on_triange, p0, p1)
                        distance_to_triangle_local = find_distance(
                            in_pixel_space(closest_point_local, texture), 
                            in_pixel_space(point_on_triange, texture)
                        )
                        if distance_to_triangle_local < distance_to_triangle:
                            distance_to_triangle = distance_to_triangle_local
                            closest_point = closest_point_local
                    
                    if distance_to_triangle <= margin:
                        point_in_world = find_coord(closest_point, face, uv_map, obj)
                        distance = find_distance(point_in_world, point)
                        set_pixel(pixels, width, height, x, y, distance, distance, distance)
                    
    update_progress("bake distance for " + obj.name, 1)
    texture.pixels = pixels
        
filled_cells = 0
def set_cell(cell, value, distances, cells_to_check):
    if (cell[0] < 0 or cell[0] >= len(distances[0][0])
        or cell[1] < 0 or cell[1] >= len(distances[0])
        or cell[2] < 0 or cell[2] >= len(distances)):
        return
    x = cell[0]
    y = cell[1]
    z = cell[2]
    current_value = distances[z][y][x]
    if current_value == None:
        distances[z][y][x] = value
        cells_to_check.append(cell)
        global filled_cells
        filled_cells += 1
        if filled_cells % 1024 == 0: update_progress("calculate distances", filled_cells)
        return
    if current_value == True or current_value < 0.0:
        if current_value == True:
            distances[z][y][x] = -1.0 * abs(value)
            # cells_to_check.append(cell)
        elif -1.0 * abs(value) > current_value:
            distances[z][y][x] = -1.0 * abs(value)
            # cells_to_check.append(cell)
            # cells_to_check.append(cell)
        # Explicitly don't do the following:
        # cells_to_check.append(cell)
        return
    # if current_value == True:
    #     distances[z][y][x] = value
    #     # Explicitly don't do the following:
    #     # cells_to_check.append(cell)
    #     return
    if value < current_value:
        distances[z][y][x] = value
        cells_to_check.append(cell)


class bakeDistanceVolume(bpy.types.Operator):
    bl_idname = "render.volume_distance_bake"
    bl_label = "Bake Distance Volume"

    settings = {}
    resolution = []
    bounding_box = types.SimpleNamespace()
    occluded_cells = 0

    def calculate_occlusion(self, mesh):
        global progress_goal
        resolution = self.resolution
        bounding_box = self.bounding_box

        # TODO: Calculate this threshold from the _max_ (or _min_/_mean_?) of [Δx, Δy, Δz] of the bbox instead of Δx alone here?
        dist_treshold = ((bounding_box.max[0] - bounding_box.min[0]) / resolution[0])
        # The distance threshold is half of the grid’s step size (half of the distance between two cell mid-points)
        dist_treshold = dist_treshold / 2.0

        bvh = BVHTree.FromBMesh(mesh, epsilon=0.0)
        distances = [None] * resolution[2]
        self.occluded_cells = 0
        progress_goal = resolution[2] - 1
        update_progress("calculate occlusion", 0)
        for z in range(0, resolution[2]):
            update_progress("calculate occlusion", z)
            grid = [None] * resolution[1]
            for y in range(0, resolution[1]):
                row = [None] * resolution[0]
                for x in range(0, resolution[0]):
                    world_point = Vector([((float(val) + 0.5) / (resolution[i])) * (bounding_box.max[i]-bounding_box.min[i]) + bounding_box.min[i] for i, val in enumerate((x, y, z))])

                    point, normal, _, dist = bvh.find_nearest(world_point)
                    if self.settings.occlusion_methode == "MESH":
                        if dist <= dist_treshold:
                            self.occluded_cells += 1
                            row[x] = True
                    else:
                        p2 = point - world_point
                        v = p2.dot(normal)
                        # TODO: Pay attention to special cases if the normal is not a face normal, but a vertex/edge normal
                        # (see https://github.com/JacquesLucke/animation_nodes/issues/420)
                        if v >= 0.0:
                            self.occluded_cells += 1
                            row[x] = True
                grid[y] = row
            distances[z] = grid
        update_progress("calculate occlusion", progress_goal)
        print()
        return distances

    def get_mesh(self, context):
        mesh = bmesh.new()
        obstacles_collection_name = self.settings.obstacles_collection
        if obstacles_collection_name != "":
            obstacles_collection = bpy.data.collections[obstacles_collection_name]
            for obj in obstacles_collection.objects:
                bm = bmesh.new()
                bm.from_object(obj, context.evaluated_depsgraph_get())
                bm.transform(obj.matrix_world)
                m = bpy.data.meshes.new("temp")
                bm.to_mesh(m)
                mesh.from_mesh(m)
                bpy.data.meshes.remove(m)
        else:
            active_object = context.active_object
            if active_object is None or active_object.type != "MESH":
                return None

            mesh.from_object(active_object, context.evaluated_depsgraph_get())
            mesh.transform(active_object.matrix_world)
        return mesh

    def create_texture(self):
        resolution = self.resolution
        image = bpy.data.images.new("VolumeTexture", resolution[0] * resolution[2], resolution[1], float_buffer=True, is_data=True)
        self.settings.preview_texture = image.name
        return image

    def calculate_distances(self, sensor_position, distances):
        resolution = self.resolution
        bounding_box = self.bounding_box
        step_widths = [((bounding_box.max[i] - bounding_box.min[i]) / resolution[i]) for i in range(0, 3)]
        mean_step_width = sum(step_widths) / len(step_widths)
        # Note the behaviour of int() in Python, i. e., that numbers get rounded down towards null (negative values: rounded up, positives values: rounded down)
        # int(0.0 * 8) # right _at_ the bounding_box.min corner
        # 0
        # int(0.124 * 8) # right before the step from cell 0 to cell 1
        # 0
        # int(0.126 * 8) # right after the step from cell 0 to cell 1
        # 1
        # int(0.249 * 8) # right before the step from cell 1 to cell 2
        # 1
        # int(0.250 * 8) # right _at_ the step from cell 1 to cell 2
        # 2
        # int(0.251 * 8) # right after the step from cell 1 to cell 2
        # 2
        # int(0.874 * 8) # right before the step from cell 6 to cell 7 (last cell)
        # 6
        # int(0.876 * 8) # right after the step from cell 6 to cell 7 (last cell)
        # 7
        # int(0.999 * 8) # right before the bounding_box.max corner
        # 7
        # int(1.0 * 8) # right _at_ the bounding_box.max corner (Attention! This overflows the cells indices; thus, a min(resolution[i] - 1, …) is necessary!)
        # 8
        cell_of_sensor = [min(int((sensor_position[i] - bounding_box.min[i]) / (bounding_box.max[i]-bounding_box.min[i]) * (resolution[i])), resolution[i] - 1) for i in range(0, 3)]
        cells_to_check = []
        set_cell(cell_of_sensor, 0, distances, cells_to_check)        
        self.calculate_distances_for_cells(cells_to_check, distances, mean_step_width)
    

    def calculate_distances_for_cells(self, cells_to_check, distances, mean_step_width):
        resolution = self.resolution
        empty_cells = resolution[0] * resolution[1] * resolution[2] - self.occluded_cells
        if empty_cells > 0:
            global progress_goal
            progress_goal = resolution[0] * resolution[1] * resolution[2]
            update_progress("calculate distances", 0)
            global filled_cells
            filled_cells = 0
            while len(cells_to_check) > 0:
                cell = cells_to_check.pop(0)
                x = cell[0]
                y = cell[1]
                z = cell[2]
                current_value = distances[z][y][x]
                
                direct_neighbours = [
                    [x + 1, y, z], [x - 1, y, z],
                    [x, y + 1, z], [x, y - 1, z],
                    [x, y, z + 1], [x, y, z - 1]
                ]
                for cell in direct_neighbours:
                    # set_cell(cell, current_value + 1 * mean_step_width, distances, cells_to_check)
                    factor = 1.0
                    if self.settings.flooding_directions == "DIAGONAL":
                        # Factor taken from https://kyamagu.github.io/mexopencv/matlab/distanceTransform.html
                        factor = 0.955
                    if current_value >= 0.0:
                        set_cell(cell, current_value + factor * mean_step_width, distances, cells_to_check)
                    else:
                        # Only propagate negative values (lying within walls) through walls! 
                        if (cell[0] < 0 or cell[0] >= len(distances[0][0])
                            or cell[1] < 0 or cell[1] >= len(distances[0])
                            or cell[2] < 0 or cell[2] >= len(distances)):
                            # Do nothing
                            foo = 1
                        else: 
                            cell_value = distances[cell[2]][cell[1]][cell[0]]
                            if cell_value == True or (cell_value != None and cell_value < 0.0):
                                set_cell(cell, current_value - factor * mean_step_width, distances, cells_to_check)
                
                if self.settings.flooding_directions == "DIAGONAL" or self.settings.flooding_directions == "DIAGONAL_5":
                    # Factors taken from https://kyamagu.github.io/mexopencv/matlab/distanceTransform.html
                    # (Also see: Gunilla Borgefors. "Distance transformations in digital images". Computer vision, graphics, and image processing, 34(3):344-371, 1986.)
                    l2_b_factor = 1.3693
                    if self.settings.flooding_directions == "DIAGONAL_5":
                        l2_b_factor = 1.4
                    diagonal_neighbours = [
                        [x + 1, y + 1, z], [x + 1, y - 1, z],
                        [x + 1, y, z + 1], [x + 1, y, z - 1],
                        [x - 1, y + 1, z], [x - 1, y - 1, z],
                        [x - 1, y, z + 1], [x - 1, y, z - 1],
                        [x, y + 1, z + 1], [x, y + 1, z - 1], # light blue in the MagicaVoxel sketch
                        [x, y - 1, z + 1], [x, y - 1, z - 1], # light blue in the MagicaVoxel sketch
                    ]
                    for cell in diagonal_neighbours:
                        # set_cell(cell, current_value + 1.414 * mean_step_width, distances, cells_to_check)
                        # set_cell(cell, current_value + 1.3693 * mean_step_width, distances, cells_to_check)
                        if current_value >= 1.0:
                            set_cell(cell, current_value + l2_b_factor * mean_step_width, distances, cells_to_check)
                        else:
                            # Only propagate negative values (lying within walls) through walls! 
                            if (cell[0] < 0 or cell[0] >= len(distances[0][0])
                                or cell[1] < 0 or cell[1] >= len(distances[0])
                                or cell[2] < 0 or cell[2] >= len(distances)):
                                # Do nothing
                                foo = 1
                            else: 
                                cell_value = distances[cell[2]][cell[1]][cell[0]]
                                if cell_value == True or (cell_value != None and cell_value < 0.0):
                                    set_cell(cell, current_value - l2_b_factor * mean_step_width, distances, cells_to_check)
                
                if self.settings.flooding_directions == "DIAGONAL_5":
                    l2_c_factor = 2.1969
                    next_neighbors = [
                        [x + 2, y + 1, z], [x + 2, y - 1, z], # yellow
                        [x + 1, y + 2, z], [x + 1, y - 2, z], # yellow
                        [x - 1, y + 2, z], [x - 1, y - 2, z], # yellow
                        [x - 2, y + 1, z], [x - 2, y - 1, z], # yellow
                        [x - 2, y, z + 1], [x + 2, y, z + 1], # light yellow
                        [x, y - 2, z + 1], [x, y + 2, z + 1], # light yellow
                        [x - 1, y, z + 2], [x + 1, y, z + 2], # light yellow
                        [x, y - 1, z + 2], [x, y + 1, z + 2], # light yellow
                        [x - 2, y, z - 1], [x + 2, y, z - 1], # dark yellow
                        [x, y - 2, z - 1], [x, y + 2, z - 1], # dark yellow
                        [x - 1, y, z - 2], [x + 1, y, z - 2], # dark yellow
                        [x, y - 1, z - 2], [x, y + 1, z - 2], # dark yellow
                    ]
                    for cell in next_neighbors:
                        if current_value >= 1.0:
                            set_cell(cell, current_value + l2_c_factor * mean_step_width, distances, cells_to_check)
                        else:
                            # Only propagate negative values (lying within walls) through walls! 
                            if (cell[0] < 0 or cell[0] >= len(distances[0][0])
                                or cell[1] < 0 or cell[1] >= len(distances[0])
                                or cell[2] < 0 or cell[2] >= len(distances)):
                                # Do nothing
                                foo = 1
                            else: 
                                cell_value = distances[cell[2]][cell[1]][cell[0]]
                                if cell_value == True or (cell_value != None and cell_value < 0.0):
                                    set_cell(cell, current_value - l2_c_factor * mean_step_width, distances, cells_to_check)

            update_progress("calculate distances", progress_goal)
            print()


    def generate_preview_texture(self, distances):
        global progress_goal
        resolution = self.resolution

        progress_goal = resolution[2] - 1
        update_progress("gen preview  texture", 0)

        image_name = self.settings.preview_texture
        if (image_name == ""):
            image = self.create_texture()
        else:
            image = bpy.data.images[image_name]
            if (image.size[0] != resolution[0] * resolution[2] or image.size[1] != resolution[1]):
                image = self.create_texture()

        pixels = list(image.pixels)
        for z in range(0, resolution[2]):
            update_progress("gen preview  texture", z)
            for y in range(0, resolution[1]):
                for x in range(0, resolution[0]):
                    pixel_pos = (x + y * resolution[0] * resolution[2] + z * resolution[0]) * 4

                    value = distances[z][y][x]
                    if value == None or value == True:
                        value = 150.0

                    value /= 150.0
                    
                    pixels[pixel_pos + 0] = value
                    pixels[pixel_pos + 1] = value
                    pixels[pixel_pos + 2] = value
                    pixels[pixel_pos + 3] = 1
        image.pixels = pixels
        update_progress("gen preview texture", progress_goal)
        print()

    def generate_texture(self, name, distances, visualize_occlusion = False):
        global progress_goal
        bounding_box = self.bounding_box
        resolution = self.resolution

        image_width = resolution[0] * resolution[2]
        image_height = resolution[1]        
        
        progress_goal = resolution[2] - 1
        update_progress("accumulate  texture", 0)
        image_width = resolution[0] * resolution[2]
        image_height = resolution[1]
        data = [None] * resolution[0] * resolution[1] * resolution[2]

        step_widths = [((bounding_box.max[i] - bounding_box.min[i]) / resolution[i]) for i in range(0, 3)]
        mean_step_width = sum(step_widths) / len(step_widths)
        bounding_box_dimensions = [(bounding_box.max[i] - bounding_box.min[i]) for i in range(0, 3)]
        max_distance = max(bounding_box_dimensions)

        for z in range(0, resolution[2]):
            update_progress("accumulate  texture", z)
            for y in range(0, resolution[1]):
                for x in range(0, resolution[0]):
                    data_pos = (x + (image_height - y - 1) * image_width + z * resolution[0])

                    value = distances[z][y][x]
                    if value == None or value == True:
                        if visualize_occlusion:
                            if value == None:
                                value = max_distance
                            else: 
                                value = 0.0
                        else:
                            value = max_distance
                    
                    if value < 0.0:
                        # Values within the occluded areas
                        # value = abs(value) - 1.207
                        value = abs(value)
                    
                    if value > max_distance:
                        value = max_distance

                    value /= max_distance
                    data[data_pos] = value * 65535
        filepath = bpy.path.abspath("//" + name)
        save_image(filepath, 'png', data, resolution[0] * resolution[2], resolution[1])

        update_progress("accumulate  texture", progress_goal)
        print()

    def calculate_dimensions(self, mesh):
        self.bounding_box.min = [float("inf")] * 3
        self.bounding_box.max = [float("-inf")] * 3
        bounding_box = self.bounding_box
        for vertex in mesh.verts:
            for i in range(0, 3):
                bounding_box.min[i] = min(bounding_box.min[i], vertex.co[i])
                bounding_box.max[i] = max(bounding_box.max[i], vertex.co[i])                
        dimensions = [bounding_box.max[i] - bounding_box.min[i] for i in range(0, 3)]

        print(dimensions)

        max_dim = functools.reduce(max, dimensions)
        max_resolution = self.settings.volume_resolution
        self.resolution = list(map(lambda x: int(x / max_dim * max_resolution), dimensions))

    def should_output(self, methode):
        output_methode = self.settings.output_methode
        return output_methode == "BOTH" or output_methode == methode

    def pad_sensors(self, sensors, mesh):
        # FIXME: When a sensor is too close to not only one but multiple walls/obstacles,
        # FIXME: it is currently padded only away orthogonally from one of the obstacles 
        # FIXME: (i. e., the closest one). Make sure that it is padded away from _all_
        # FIXME: obstacles which are too close to it.
        resolution = self.resolution
        bounding_box = self.bounding_box

        dist_treshold = ((bounding_box.max[0] - bounding_box.min[0]) / resolution[0])
        bvh = BVHTree.FromBMesh(mesh, epsilon=0.0)

        for index, sensor in enumerate(sensors):
            world_point = sensor.location
            point, normal, _, dist = bvh.find_nearest(world_point)

            if dist <= dist_treshold:
                p2 = point - world_point
                v = p2.dot(normal)
                offset_direction = Vector(normal)
                offset_direction.normalize()
                offset_length = (dist_treshold - dist) + 0.01
                if v >= 0.0:
                    # sensor lies within obstacle
                    offset_direction = -offset_direction 
                # else: 
                    # sensor is outside of obstacle, but within dist_threshold
                sensors[index].location = sensor.location + offset_direction * offset_length

        return sensors

    def execute(self, context):
        print("bake volume")
        self.settings = context.scene.distance_bake

        mesh = self.get_mesh(context)
        if mesh is None:
            print("No obstacle collection selected and no mesh object active to use as obstacle.")
            return {"CANCELLED"}
        self.calculate_dimensions(mesh)

        sensors_name = self.settings.sensor_collection
        if sensors_name == "":
            sensors = [context.scene.cursor]
        else:
            sensors = bpy.data.collections[sensors_name].objects

        # TODO: Prevent this operation from changing the actual objects, i. e., work on duplicates!
        sensors = self.pad_sensors(sensors, mesh)

        distances = self.calculate_occlusion(mesh)
        self.generate_texture("debug__distances", distances, True)

        for index, sensor in enumerate(sensors):
            sensor_distances = copy.deepcopy(distances)
            self.calculate_distances(sensor.location, sensor_distances)
            if index == 0 and self.should_output("PREVIEW"):
                self.generate_preview_texture(sensor_distances)

            if hasattr(sensor, "name"): name = sensor.name
            else: name = "sensor_" + str(index)

            if self.should_output("EXPORT"):
                self.generate_texture(name, sensor_distances)

        return {"FINISHED"}


class bakeDistanceVolumeOutside(bakeDistanceVolume):
    bl_idname = "render.volume_distance_outside_bake"
    bl_label = "Bake Outside Distance Volume"

    def calculate_distances(self, outside_object, distances, context):
        global progress_goal
        resolution = self.resolution
        bounding_box = self.bounding_box

        # TODO: Replace this with an appropriate, either volume or mesh based, dynamic lookup 
        dist_treshold = ((bounding_box.max[0] - bounding_box.min[0]) / resolution[0])
        dist_treshold *= 3.0

        resolution = self.resolution
        bounding_box = self.bounding_box
        step_widths = [((bounding_box.max[i] - bounding_box.min[i]) / resolution[i]) for i in range(0, 3)]
        mean_step_width = sum(step_widths) / len(step_widths)

        outside_object_mesh = bmesh.new()
        bm = bmesh.new()
        bm.from_object(outside_object, context.evaluated_depsgraph_get())
        bm.transform(outside_object.matrix_world)
        m = bpy.data.meshes.new("temp")
        bm.to_mesh(m)
        outside_object_mesh.from_mesh(m)
        bpy.data.meshes.remove(m)
        outside_bvh = BVHTree.FromBMesh(outside_object_mesh, epsilon=0.0)

        cells_to_check = []

        for z in range(0, resolution[2]):
            grid = [None] * resolution[1]
            for y in range(0, resolution[1]):
                row = [None] * resolution[0]
                for x in range(0, resolution[0]):
                    world_point = Vector([(float(val) / (resolution[i] - 1)) * (bounding_box.max[i]-bounding_box.min[i]) + bounding_box.min[i] for i, val in enumerate((x, y, z))])

                    _, _, _, dist = outside_bvh.find_nearest(world_point)
                    
                    if dist <= dist_treshold:
                        set_cell([x, y, z], 0, distances, cells_to_check)
        self.calculate_distances_for_cells(cells_to_check, distances, mean_step_width)


    def execute(self, context):
        print("bake volume")
        self.settings = context.scene.distance_bake

        mesh = self.get_mesh(context)
        if mesh is None:
            print("No obstacle collection selected and no mesh object active to use as obstacle.")
            return {"CANCELLED"}
        self.calculate_dimensions(mesh)

        outside_object_name = self.settings.outside_volume_mesh
        if outside_object_name == "":
            print("No outside volume selected.")
            return {"CANCELLED"}
        else:
            outside_object = bpy.context.scene.objects[outside_object_name]

        distances = self.calculate_occlusion(mesh)

        outside_distances = copy.deepcopy(distances)
        self.calculate_distances(outside_object, outside_distances, context)
        
        name = "outside"

        if self.should_output("EXPORT"):
            self.generate_texture(name, outside_distances)

        return {"FINISHED"}


class bakeDistances(bpy.types.Operator):
    bl_idname = "render.distances_bake"
    bl_label = "Bake Distances"

    def execute(self, context):
        print("BakeDistances")

        active_object = context.active_object
        if active_object is None:
            print("No object active to bake to.")
            return {"CANCELLED"}

        if active_object.type != "MESH":
            print("Active object is not a mesh object.")
            return {"CANCELLED"}
        mesh = active_object.data

        uv_map = active_object.data.uv_layers.active
        if uv_map is None:
            print("No UV Map active to bake to.")
            return {"CANCELLED"}

        if active_object.active_material is None:
            print("No material active to get the texture for baking from.")
            return {"CANCELLED"}
        
        active_node = active_object.active_material.node_tree.nodes.active
        if active_node.type != "TEX_IMAGE":
            print("Active material node is not a texture node.")
            return {"CANCELLED"}

        texture = active_node.image
        if texture is None:
            print("Active texture node has no texture selected.")
            return {"CANCELLED"}

        sensor_collection_name = context.scene.distance_bake.sensor_collection
        print("sensor_collection_name:", sensor_collection_name)
        point = context.scene.cursor.location
        if sensor_collection_name != "":
            sensor_collection = bpy.data.collections[sensor_collection_name]
            if len(sensor_collection.objects) > 0:
                point = sensor_collection.objects[0].location

        b_mesh = bmesh.new()
        b_mesh.from_mesh(mesh)
        bmesh.ops.triangulate(b_mesh, faces=b_mesh.faces, quad_method="FIXED", ngon_method="EAR_CLIP")
        b_uv_map = b_mesh.loops.layers.uv.active

        bake_distances(context, active_object, b_mesh, b_uv_map, texture, point)
        
        return {"FINISHED"}

class distanceBakeSensorImport(bpy.types.Operator):
    bl_idname = "render.distances_bake_sensor_import"
    bl_label = "Sensor Import"

    def execute(self, context):
        settings = context.scene.distance_bake

        import json

        with open(settings.import_path) as json_file:
            data = json.load(json_file)

            sensor_positions_without_duplicates = {}
            for sensor_id, sensor_position in data['sensorPositions'].items():
                if sensor_position not in sensor_positions_without_duplicates.values():
                    sensor_positions_without_duplicates[sensor_id] = sensor_position

            sensors_name = settings.sensor_collection
            if sensors_name == "":
                print("No sensors collection has been configured.")
                return {"CANCELLED"}
            
            sensors = bpy.data.collections[sensors_name].objects

            for existing_sensor in sensors:
                bpy.data.objects.remove(existing_sensor)
            
            for sensor_id, sensor_position in sensor_positions_without_duplicates.items():
                x = sensor_position[0]
                y = -sensor_position[2]
                z = sensor_position[1]
                bpy.ops.object.empty_add(type='PLAIN_AXES', align='WORLD', location=(x, y, z), scale=(1, 1, 1))
                added_sensor_empty = context.active_object
                added_sensor_empty.name = 'sensor_{}'.format(sensor_id)

                # FIXME: Somehow, the index retrieved by the following call is not correct
                sensor_collection_id =  bpy.data.collections.find(sensors_name)
                bpy.ops.object.move_to_collection(collection_index=sensor_collection_id)

            return {"FINISHED"}
        

classes = {
    exportSensorLabellingPositions,
    bakeDistanceTest,
    bakeDistances,
    bakeDistanceVolume,
    bakeDistanceVolumeOutside,
    distanceBakeSensorImport,
    DistanceBakePropertyGroup,
    DistanceBakePanel
}

def register():
    for cls in classes:
        bpy.utils.register_class(cls)

    bpy.types.Scene.distance_bake = PointerProperty(type=DistanceBakePropertyGroup)

def unregister():
    for cls in classes:
        bpy.utils.unregister_class(cls)
        
    del bpy.types.Scene.distance_bake
