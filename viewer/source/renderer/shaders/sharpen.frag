precision highp float;

@import ./facade.frag;

#if __VERSION__ == 100
    #define fragColor gl_FragColor
#else
    layout(location = 0) out vec4 fragColor;
#endif


uniform sampler2D u_source;
uniform vec2 u_resolution;

varying vec2 v_uv;

#define UNSHARP // 5 x 5
// #define SHARP_9 // 3 x 3
// #define SHARP_5 // 3 x 3 cross

const float sharpenAmount = 6.0 / 6.0;

vec4 fetch2(in ivec4 uv) {
    uv = clamp(ivec4(gl_FragCoord.xyxy) + uv, ivec4(0), ivec4(u_resolution.xyxy) - ivec4(1));
    return texelFetch(u_source, uv.xy, 0) + texelFetch(u_source, uv.zw, 0);
}


void main(void)
{
    ivec2 uv = ivec2(gl_FragCoord.xy);
    
    vec4 source = texelFetch(u_source, uv, 0);
    vec4 target = source;

#ifdef UNSHARP

    target *= 1.85980;

    target -= 0.00391 * ( fetch2(ivec4(-2, -2, +2, +2))
                        + fetch2(ivec4(+2, -2, -2, +2)));

    target -= 0.01563 * ( fetch2(ivec4(-1, -2, +1, -2))
                        + fetch2(ivec4(-2, -1, +2, -1))
                        + fetch2(ivec4(-2, +1, +2, +1))
                        + fetch2(ivec4(-1, +2, +1, +2)));

    target -= 0.02344 * ( fetch2(ivec4( 0, -2, -2,  0))
                        + fetch2(ivec4(+2,  0,  0, +2)));

    target -= 0.06250 * ( fetch2(ivec4(-1, -1, +1, -1))
                        + fetch2(ivec4(-1, +1, +1, +1)));

    target -= 0.09375 * ( fetch2(ivec4( 0, -1, -1,  0))
                        + fetch2(ivec4(+1,  0,  0, +1)));

#elif defined(SHARP_9)

    target *= 9.0;
    
    target -= fetch2(ivec4(-1, -1, +1, +1));
    target -= fetch2(ivec4(-1,  0,  0, -1));
    target -= fetch2(ivec4(-1, +1, +1, -1));
    target -= fetch2(ivec4(+1,  0,  0, +1));

#elif defined(SHARP_5)

    target *= 5.0;

    target -= fetch2(ivec4(-1,  0,  0, -1));
    target -= fetch2(ivec4( 0, +1, +1,  0));

#endif

    fragColor = mix(source, target, sharpenAmount);
}
