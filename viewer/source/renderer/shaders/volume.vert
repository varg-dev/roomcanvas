
precision highp float;
/**
 * Based on https://www.willusher.io/webgl/2019/01/13/volume-rendering-with-webgl
 */

@import ./facade.vert;
@import ./ndcoffset;

#if __VERSION__ == 100
    attribute vec3 a_vertex;    // local [-1..+1]
#else
    layout(location = 0) in vec3 a_vertex;
#endif

uniform mat4 u_viewProjection;  // world --> camera
uniform mat4 u_model;           // local --> world
uniform mat4 u_invModel;        // world --> local
uniform mat4 u_cube;		    // local --> cube
uniform vec3 u_eyePosition;     // world
uniform vec3 u_volumeScale;     // local

uniform vec2 u_ndcOffset;       // screen

out vec3 v_viewRayDir;          // cube [0..+1]
flat out vec3 v_transformedEye; // cube [0..+1]

out vec3 v_vertexCube;          // cube [0..+1]

void main()
{
	vec4 position = u_viewProjection * u_model * vec4(a_vertex, 1.0); // camera
	position.z -= 0.001;
	ndcOffset(position, u_ndcOffset);

	gl_Position = position;

	// Compute eye position and ray directions in the unit cube space
	vec4 transformedEye = u_cube * (u_invModel * vec4(u_eyePosition, 1.0));
	v_transformedEye = transformedEye.xyz;

	vec4 viewRayDir = u_cube * (vec4(a_vertex, 1.0) - (u_invModel * vec4(u_eyePosition, 1.0)));
	v_viewRayDir = viewRayDir.xyz;

	vec4 vertexCube = u_cube * vec4(a_vertex, 1.0);
	v_vertexCube = vertexCube.xyz;
}
