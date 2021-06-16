precision lowp float;

@import ./facade.vert;

#if __VERSION__ == 100
    attribute vec3 a_vertex;
    attribute vec3 a_color;
    attribute float a_data;
#else
    layout(location = 0) in vec3 a_vertex;
    layout(location = 1) in vec3 a_color;
    layout(location = 2) in float a_data;
#endif

uniform mat4 u_viewProjection;
uniform vec2 u_ndcOffset;

varying vec4 v_color;

void main()
{
    v_color = vec4(a_color, 1.0);

    vec4 vertex = u_viewProjection * vec4(a_vertex, 1.0);
    vertex.xy = u_ndcOffset * vec2(vertex.w) + vertex.xy;

    gl_Position = vertex;
    gl_PointSize = a_data;
}
