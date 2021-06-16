
precision lowp float;

@import ./facade.frag;


#if __VERSION__ == 100
    #define fragColor gl_FragColor
#else
    layout(location = 0) out vec4 fragColor;
    layout(location = 1) out vec4 idColor;
#endif


varying vec4 v_vertex;
varying vec2 v_uv;

uniform vec4 u_encodedID;

uniform bool u_renderIDToFragColor;

uniform vec4 u_hoveredEncodedID;

// TODO(config): Make this value configuration-based/dynamic
// #define USE_SEMITRANSPARENT_HIGHLIGHTING

void main(void)
{
    fragColor = vec4(0.0, 0.0, 0.0, 0.0);
    
#ifdef USE_SEMITRANSPARENT_HIGHLIGHTING
    fragColor = vec4(1.0, 1.0, 1.0, 0.2);

    if (u_encodedID == u_hoveredEncodedID)
    {
        fragColor = vec4(1.0, 1.0, 1.0, 0.6);
    }
#endif

    #if __VERSION__ == 100
        // TODO: Find out how to store second fragment in OpenGL ES 1.0 -- maybe needs another fragment shader?
    #else
        idColor = u_encodedID;
    #endif

    if (u_renderIDToFragColor)
    {
        fragColor = u_encodedID;
    }
}
