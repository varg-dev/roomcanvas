precision highp float;

@import ./facade.frag;

#if __VERSION__ == 100
    #define fragColor gl_FragColor
#else
    layout(location = 0) out vec4 fragColor;
#endif


uniform bool u_enableOutlineRendering;

uniform sampler2D u_source;
uniform highp sampler2D u_depth;
uniform sampler2D u_normal;

uniform mat4 u_view;

uniform float u_near;
uniform float u_far;

// x: width in pixels
// y: height in pixels
// z: 1 / width in pixels = fraction of the screen space width that one pixel takes
// w: 1 / height in pixels = fraction of the screen space height that one pixel takes
uniform vec4 u_screenSize;

uniform vec2 u_resolution;

const vec3 premultUint8x3 = vec3(255.0 / 256.0, 255.0 / 65536.0, 255.0 / 16777216.0);
float uint8x3_to_float24x1(const in vec3 v) {
    return dot(v, premultUint8x3); // a1 * b1 + a2 * b2 + a3 * b3  ;)
}

varying vec2 v_uv;

const vec4 outlineColor = vec4(0.8, 0.85, 0.89, 1.0);

/* https://stackoverflow.com/a/44226776 */
float perspectiveDepthToViewZ(float z, float near, float far) {
  return ((near * far) / ((far - near) * z - far));
}

/* https://github.com/mrdoob/three.js/issues/12312#issuecomment-333370596 */
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
    return ( viewZ + near ) / ( near - far );
}

/**
 * Based on https://github.com/OmarShehata/webgl-outlines
 */
// Helper functions for reading from depth buffer.
float readDepth (vec2 coord) {
    vec3 encodedDepth = texture(u_depth, coord).rgb;
	float decodedDepth = uint8x3_to_float24x1(encodedDepth);	
    decodedDepth = (decodedDepth - 0.5) * 2.0; // 0..1 --> -1..1
    
    float fragCoordZ = decodedDepth;
    float viewZ = perspectiveDepthToViewZ( fragCoordZ, u_near, u_far );
    return viewZToOrthographicDepth( viewZ, u_near, u_far );
}

// Helper functions for reading normals and depth of neighboring pixels.
float getPixelDepth(float x, float y) {
    // u_screenSize.zw is pixel size 
    // v_uv is current position
    return readDepth(v_uv + u_screenSize.zw * vec2(x, y));
}

vec3 getPixelNormal(float x, float y) {
    vec3 normal = texture(u_normal, vec2(v_uv + u_screenSize.zw * vec2(x, y))).rgb;
    normal = (normal - vec3(0.5)) * 2.0; // 0..1 --> -1..1
    return normal;
}

float saturate(float num) {
    return clamp(num, 0.0, 1.0);
}


void main(void)
{
    vec4 sceneColor = texture(u_source, v_uv);

    if (!u_enableOutlineRendering)
    {
        fragColor = sceneColor;
        return;
    }
    
    float depth = getPixelDepth(0.0, 0.0);
    vec3 normal = getPixelNormal(0.0, 0.0);

    // Get the difference between depth of neighboring pixels and current.
    float depthDiff = 0.0;
    depthDiff += abs(depth - getPixelDepth(0.5, 0.0));
    depthDiff += abs(depth - getPixelDepth(-0.5, 0.0));
    depthDiff += abs(depth - getPixelDepth(0.0, 0.5));
    depthDiff += abs(depth - getPixelDepth(0.0, -0.5));

    // Get the difference between normals of neighboring pixels and current
    float normalDiff = 0.0;
    normalDiff += distance(normal, getPixelNormal(0.5, 0.0));
    normalDiff += distance(normal, getPixelNormal(0.0, 0.5));
    normalDiff += distance(normal, getPixelNormal(0.0, 0.5));
    normalDiff += distance(normal, getPixelNormal(0.0, -0.5));

    // Apply multiplier & bias to each 
    float depthBias = 1.0;
    float depthMultiplier = 1.0;
    float normalBias = 1.0;
    float normalMultiplier = 0.5;

    depthDiff = depthDiff * depthMultiplier;
    depthDiff = saturate(depthDiff);
    depthDiff = pow(depthDiff, depthBias);

    normalDiff = normalDiff * normalMultiplier;
    normalDiff = saturate(normalDiff);
    normalDiff = pow(normalDiff, normalBias);

    float outline = normalDiff + depthDiff;

    outline *= max(0.0, 1.0 - (smoothstep(0.0, 0.25, depth) * 4.0));
    
    fragColor = vec4(mix(sceneColor, outlineColor, outline));
}