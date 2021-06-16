
#if __VERSION__ == 100

    #ifdef GL_OES_standard_derivatives
        #extension GL_OES_standard_derivatives : enable
    #endif

#endif

precision highp float;

@import ./facade.frag;


uniform vec2 u_lightNearFar;
uniform vec3 u_lightPosition;


#if __VERSION__ == 100
    #define fragColor gl_FragColor
#else
    layout(location = 0) out vec4 fragColor;
#endif


varying vec4 v_vertex;


@import ./shadowpass;

uniform int u_shadowMappingMethod; // default: 0 = Shadow Mapping = SMDepth
uniform float u_ESMShadowExponent; // default: 80.0
uniform vec2 u_EVSMShadowExponents; // default: vec2(30.0, 10.0)


void main(void)
{
    if (u_shadowMappingMethod == 0)
    {
        fragColor = vec4(SMDepth(v_vertex.xyz, u_lightPosition, u_lightNearFar), 0.0, 0.0, 1.0);
        return;
    }
    else if (u_shadowMappingMethod == 1)
    {
        fragColor = vec4(ESMDepth(v_vertex.xyz, u_lightPosition, u_lightNearFar, u_ESMShadowExponent), 0.0, 0.0, 1.0);
        return;
    }
    else if (u_shadowMappingMethod == 2)
    {
        fragColor = vec4(VSMDepth(v_vertex.xyz, u_lightPosition, u_lightNearFar), 0.0, 1.0);
        return;
    } else
    {
        fragColor = EVSMDepth(v_vertex.xyz, u_lightPosition, u_lightNearFar, u_EVSMShadowExponents);
        return;
    }
}
