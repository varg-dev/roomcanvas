precision highp float;

@import ./facade.frag;

#if __VERSION__ == 100
    #define fragColor gl_FragColor
#else
    layout(location = 0) out vec4 fragColor;
    #define varying in
#endif


uniform sampler2D u_source;
uniform sampler2D u_assetIndices;

uniform vec4 u_hoveredAssetEncodedID;

varying vec2 v_uv;

const int MAX_ITERATIONS = 8;


vec4 spectrumOffset(const in float t) 
{
    // ... minified spectral offset computation:

    float w = max(0.0, 1.0 - 3.0 * abs(t - 0.5));

    vec4 lohi = vec4(t, 0.5, 1.0, 1.0);
    return step(lohi.xwyw, lohi.ywxw) * vec4(1.0 - w, w, 1.0 - w, 1.0);
}

// 2D barrel distortion for a given 2D coordinate
vec2 barrelDistort(const in vec2 uv, const in float amt)
{
    vec2 center = uv - 0.5;
    float dist = dot(center, center);

    return uv + center * dist * amt;
}

// Compute chromatic aberration effect.
 vec4 chromaticAberration(
    const in sampler2D sampler,
    const in vec2 uv,
    const in int numberOfIterations,
    const in float maximalDistortion)
{
    vec4 sumColor = vec4(0.0);
    vec4 sumWeights = vec4(0.0);

    float numberOfIterationsInverse = 1.0 / float(numberOfIterations);       
    for (int i = 0; i < MAX_ITERATIONS; ++i)
    {
        if (i < numberOfIterations) {
            float t = float(i) * numberOfIterationsInverse;
            
            vec4 weight = spectrumOffset(t);
            
            sumWeights += weight;
            sumColor += weight * texture(sampler, barrelDistort(uv, maximalDistortion * t));
        }
    }
        
    return sumColor / sumWeights;
}

// TODO(structure): Factor this out into a separate shader outside chromaticAberration.frag
/**
 * Taken from: https://andreashackel.de/tech-art/stripes-shader-1/
 */
vec4 stripes(
    const in float direction,
    const in float warpTiling,
    const in float warpScale,
    const in float tiling,
    const in vec4 color1,
    const in vec4 color2)
{
    const float PI = 3.14159;

	vec2 pos;
	pos.x = mix(v_uv.x, v_uv.y, direction);
	pos.y = mix(v_uv.y, 1.0 - v_uv.x, direction);

	pos.x += sin(pos.y * warpTiling * PI * 2.0) * warpScale;
	pos.x *= tiling;

	float value = floor(fract(pos.x) + 0.5);
	return mix(color1, color2, value);
}


void main(void)
{
    fragColor = chromaticAberration(u_source, v_uv, 4, 0.05);

    vec4 encodedAssetIDAtFragment = texture(u_assetIndices, v_uv);
    if (
        encodedAssetIDAtFragment != vec4(0.0, 0.0, 0.0, 0.0)
        && encodedAssetIDAtFragment == u_hoveredAssetEncodedID) 
    {
        vec4 stripeColor = stripes(
            0.2, // direction [0..1]
            1.0, // warpTiling [1..10]
            0.0, // warpScale [0..1]
            70.0, // tiling [1..500]
            vec4(1., 1., 1., 0.), // color1
            vec4(1., 1., 1., 0.25)  // color2
        );
        // Blend the stripe color with the actual fragment color using a multiply blend mode
        fragColor = fragColor * stripeColor * stripeColor.a + fragColor * (1.0 - stripeColor.a);
    }
}