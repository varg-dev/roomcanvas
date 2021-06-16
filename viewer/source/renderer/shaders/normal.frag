
precision lowp float;

@import ./facade.frag;


#if __VERSION__ == 100
    #define fragColor gl_FragColor
#else
    layout(location = 0) out vec4 fragColor;
#endif

varying vec3 v_normal;

void main(void)
{
    fragColor = vec4(v_normal + vec3(1.0) / 2.0, 0.0);
}
