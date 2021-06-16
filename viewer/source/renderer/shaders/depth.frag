
precision highp float;

@import ./facade.frag;


#if __VERSION__ == 100
    #define fragColor gl_FragColor
#else
    layout(location = 0) out vec4 fragColor;
#endif

varying vec4 v_vertex;

uniform mat4 u_viewProjection;

const float one255ths = 1.0 / 255.0;

vec3 float24x1_to_uint8x3(const in float f) {
    vec3 uint8x3 = vec3(f, fract(f * 256.0), fract(f * 65536.0));
    return floor(uint8x3 * 256.0) * one255ths;
}

void main(void)
{
    vec4 viewPosition = u_viewProjection * v_vertex;
    viewPosition /= viewPosition.w;
    float depth = viewPosition.z;
    depth = (depth + 1.0) / 2.0; // -1..1 --> 0..1
    fragColor = vec4(float24x1_to_uint8x3(depth), 0.0);
}
