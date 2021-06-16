precision lowp float;

@import ./facade.frag;

#if __VERSION__ == 100
    #define fragColor gl_FragColor
#else
    layout(location = 0) out vec4 fragColor;
#endif

varying vec4 v_color;

void main(void)
{
    fragColor = v_color;
}
