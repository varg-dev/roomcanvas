
precision lowp float;
precision lowp int;

@import ./facade.vert;
@import ./ndcoffset;


#if __VERSION__ == 100
	attribute vec3 a_position;
	attribute vec3 a_normal;
    attribute vec2 a_uv;
#else
	layout (location = 0) in vec3 a_position;
	layout (location = 1) in vec3 a_normal;
	layout (location = 3) in vec2 a_uv;
#endif


uniform mat4 u_model;
uniform mat4 u_viewProjection;

uniform vec2 u_ndcOffset;

varying vec2 v_uv;
varying vec3 v_normal;

varying vec4 v_vertex;


void main()
{
    vec4 vertex = u_viewProjection * u_model * vec4(a_position, 1.0);
	v_uv = a_uv;
	v_normal = normalize(vec3(u_model * vec4(a_normal.xyz, 0.0)));

	v_vertex = u_model * vec4(a_position, 1.0);

    ndcOffset(vertex, u_ndcOffset);

	gl_Position = vertex;
}
