
precision highp float;

@import ./facade.vert;
@import ./ndcoffset;


#if __VERSION__ == 100
    attribute vec3 a_vertex;
    attribute vec3 a_normal;
    attribute vec2 a_texCoord;
#else
    layout(location = 0) in vec3 a_vertex;
    layout(location = 1) in vec3 a_normal;
    layout(location = 3) in vec2 a_texCoord;
#endif


uniform mat4 u_viewProjection;
uniform mat4 u_model;

uniform vec2 u_ndcOffset;

varying vec4 v_vertex;
varying vec2 v_uv;
varying vec3 v_normal;

void main()
{
    vec4 vertex = u_viewProjection * u_model * vec4(a_vertex, 1.0);
    v_uv = a_texCoord;
    v_normal = normalize(vec3(a_normal.xyz));
    v_vertex = u_model * vec4(a_vertex, 1.0);
    ndcOffset(vertex, u_ndcOffset);

    gl_Position = vertex;
}
