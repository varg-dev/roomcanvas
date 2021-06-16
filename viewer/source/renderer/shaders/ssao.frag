precision highp float;

@import ./facade.frag;

#if __VERSION__ == 100
    #define fragColor gl_FragColor
#else
    layout(location = 0) out vec4 fragColor;
#endif


uniform bool u_enableSSAO;

uniform sampler2D u_source;
uniform highp sampler2D u_depth;
uniform sampler2D u_normal;
uniform highp sampler2D u_noise;

uniform mat4 u_view;
uniform mat4 u_projection;
uniform mat4 u_invProjection;

uniform float u_near;
uniform float u_far;

// x: width in pixels
// y: height in pixels
// z: 1 / width in pixels = fraction of the screen space width that one pixel takes
// w: 1 / height in pixels = fraction of the screen space height that one pixel takes
uniform vec4 u_screenSize;

const vec3 premultUint8x3 = vec3(255.0 / 256.0, 255.0 / 65536.0, 255.0 / 16777216.0);
float uint8x3_to_float24x1(const in vec3 v) {
    return dot(v, premultUint8x3); // a1 * b1 + a2 * b2 + a3 * b3  ;)
}

varying vec2 v_uv;

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
float readDepthNonLinear (vec2 coord) {
    vec3 encodedDepth = texture(u_depth, coord).rgb;
	float decodedDepth = uint8x3_to_float24x1(encodedDepth);	
    return decodedDepth;
}

float getViewZ( const in float depth ) {
    float ndcDepth = (depth - 0.5) * 2.0; // 0..1 --> -1..1
    float fragCoordZ = ndcDepth;
    float viewZ = perspectiveDepthToViewZ( fragCoordZ, u_near, u_far );
    return perspectiveDepthToViewZ( depth, u_near, u_far );
}

/**
 * Based on https://github.com/OmarShehata/webgl-outlines
 */
// Helper functions for reading from depth buffer.
float readDepth (vec2 coord) {
	float decodedDepth = readDepthNonLinear(coord);
    float viewZ = getViewZ(decodedDepth);
    return viewZToOrthographicDepth( viewZ, u_near, u_far );
}

// Helper functions for reading normals and depth of neighboring pixels.
float getPixelDepth(float x, float y) {
    // u_screenSize.zw is pixel size 
    // v_uv is current position
    return readDepth(v_uv + u_screenSize.zw * vec2(x, y));
}

float getPixelDepthNonLinear(float x, float y) {
    return readDepthNonLinear(v_uv + u_screenSize.zw * vec2(x, y));
}

vec3 getPixelNormal(float x, float y) {
    vec3 normal = texture(u_normal, vec2(v_uv + u_screenSize.zw * vec2(x, y))).rgb;
    normal = (normal - vec3(0.5)) * 2.0; // 0..1 --> -1..1
    return normal;
}

float saturate(float num) {
    return clamp(num, 0.0, 1.0);
}

vec3 getViewPosition( const in vec2 screenPosition, const in float depth, const in float viewZ ) {
    float clipW = u_projection[2][3] * viewZ + u_projection[3][3];
    vec4 clipPosition = vec4( ( vec3( screenPosition, depth ) - 0.5 ) * 2.0, 1.0 );
    clipPosition *= clipW; // unprojection.
    return ( u_invProjection * clipPosition ).xyz;
}

// TODO(config): Make this value configuration-based/dynamic
const int KERNEL_SIZE = 32;

// TODO(config): Make this value configuration-based/dynamic
const float kernelRadius = 0.8;

uniform float u_ssaoMinDistance; 
uniform float u_ssaoMaxDistance;

uniform vec3 u_kernel[KERNEL_SIZE];

// Taken from: https://gist.github.com/yiwenl/3f804e80d0930e34a0b33359259b556c
vec2 rotate(vec2 v, float a) {
	float s = sin(a);
	float c = cos(a);
	mat2 m = mat2(c, -s, s, c);
	return m * v;
}

uniform sampler2D u_spiralKernel;
uniform int u_frameNumber;

const float MULTIFRAME_RENDERING_MAX_FRAME_NUMBER = 64.0;

/**
 * Progressive Screen-Space Ambient Occlusion (SSAO) using a spiral-shaped kernel.

 * Reference:
 * Daniel Limberger, Marcel Pursche, Jan Klimke, and Jürgen Döllner. “Progressive high-quality rendering
 * for interactive information cartography using WebGL”. In: Proceedings of the 22nd International
 * Conference on 3D Web Technology. Web3D’17. ACM, June 2017, pp. 1–4. doi: 10.1145/3055624.3075951.
 * 
 * The implementation is partly based on: https://github.com/mrdoob/three.js/blob/6df08ab12ec3f568c5371084556018200df35b06/examples/js/shaders/SSAOShader.js
 */
void main(void)
{
    vec4 sceneColor = texture(u_source, v_uv);

    if (!u_enableSSAO) {
        fragColor = sceneColor;
        return;
    }
    
    vec4 darkenedSceneColor = sceneColor * 0.2;
    darkenedSceneColor.a = 1.0;

    float depth = getPixelDepthNonLinear(0.0, 0.0);
    float viewZ = getViewZ(depth);
    
    vec3 viewPosition = getViewPosition( v_uv, depth, viewZ );
    vec4 viewNormalVec4 = vec4(getPixelNormal(0.0, 0.0), 1.0);
    viewNormalVec4 = u_view * viewNormalVec4;
    vec3 viewNormal = vec3(viewNormalVec4.x, viewNormalVec4.y, viewNormalVec4.z);
    viewNormal = normalize(viewNormal);

    vec2 noiseScale = vec2( u_screenSize.x / 4.0, u_screenSize.y / 4.0 );
    vec3 random = texture( u_noise, v_uv * noiseScale ).xyz * 2.0 - 1.0;

    // compute matrix used to reorient a kernel vector
    vec3 tangent = normalize( random - viewNormal * dot( random, viewNormal ) );
    vec3 bitangent = cross( viewNormal, tangent );
    mat3 kernelMatrix = mat3( tangent, bitangent, viewNormal );

    float occlusion = 0.0;

    for ( int i = 0; i < KERNEL_SIZE; i ++ ) {
        float angle = texelFetch(u_spiralKernel, ivec2(2 * i, u_frameNumber), 0).r; // [0..2 * pi * spiralTurns]
        float alpha = texelFetch(u_spiralKernel, ivec2(2 * i + 1, u_frameNumber), 0).r; // [0..1]

        vec2 sampleVector2D = vec2(0.0, alpha);
        sampleVector2D = rotate(sampleVector2D, angle);

        vec3 sampleVector = vec3(sampleVector2D.xy, 0.0);
        sampleVector = kernelMatrix * sampleVector; // reorient sample vector in view space
        vec3 samplePoint = viewPosition + ( sampleVector * kernelRadius ); // calculate sample point

        vec4 samplePointNDC = u_projection * vec4( samplePoint, 1.0 ); // project point and calculate NDC
        samplePointNDC /= samplePointNDC.w;

        vec2 samplePointUv = samplePointNDC.xy * 0.5 + 0.5; // compute uv coordinates

        float realDepth = readDepth( samplePointUv ); // get linear depth from depth texture
        float sampleDepth = viewZToOrthographicDepth( samplePoint.z, u_near, u_far ); // compute linear depth of the sample view Z value
        float delta = sampleDepth - realDepth;

        if ( delta > u_ssaoMinDistance && delta < u_ssaoMaxDistance ) { // if fragment is before sample point, increase occlusion
            occlusion += 1.0;
        }
    }

    occlusion = clamp((( occlusion / float( KERNEL_SIZE )) - 0.5 ) * 0.8, 0.0, 1.0 );
    
    fragColor = vec4( vec3( 1.0 - occlusion ), 1.0 );
    fragColor = mix(sceneColor, darkenedSceneColor, occlusion);
}
