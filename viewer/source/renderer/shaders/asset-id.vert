
// This is a variant of mesh.vert (a kind of pass-through flat vertex shader) with
// its variable names adjusted to conform to the glTF rendering asset-baked.vert shader.
precision lowp float;

@import ./facade.vert;


#if __VERSION__ == 100
	attribute vec3 a_position;
	attribute vec3 a_normal;
    attribute vec2 a_uv;
#else
	layout (location = 0) in vec3 a_position;
	layout (location = 1) in vec3 a_normal;
	layout (location = 3) in vec2 a_uv;
#endif


uniform mat4 u_viewProjection;
uniform mat4 u_model;


varying vec4 v_vertex;
varying vec2 v_uv;
varying vec3 v_normal;

void main()
{
    v_vertex = u_model * vec4(a_position, 1.0);
    v_uv = a_uv;
    v_normal = normalize(a_position);

    gl_Position = u_viewProjection *  v_vertex;
}
