
/**
 * The gradient() and inverseDistanceWeight() functions are taken from
 * https://www.shadertoy.com/view/MtjczR. 
 */

#if __VERSION__ == 100

    #ifdef GL_OES_standard_derivatives
        #extension GL_OES_standard_derivatives : enable
    #endif

#endif

precision highp float;
precision highp int;

@import ./facade.frag;

uniform vec2 u_lightNearFar;
uniform mat4 u_lightViewProjection;
uniform vec3 u_lightPosition;

@import ./shadowpass;

const vec4 shadowColorWebGLOperate = vec4(0.494, 0.753, 0.933, 1.0);
const vec4 shadowColorCustom = vec4(159.0/255.0, 171.0/255.0, 168.0/255.0, 1.0);
vec4 shadowColor = mix(shadowColorWebGLOperate, shadowColorCustom, 0.4);

uniform int u_shadowMappingMethod; // default: 0 = Shadow Mapping = SMDepth
uniform float u_SMShadowBias; // default: -0.002
uniform float u_VSMShadowMinVariance; // default: 0.1
uniform float u_VSMShadowLightBleedingReduction; // default: 0.1
uniform float u_ESMShadowExponent; // default: 80.0
uniform vec2 u_EVSMShadowExponents; // default: vec2(30.0, 10.0)


#if __VERSION__ == 100
    #define fragColor gl_FragColor
#else
    layout(location = 0) out vec4 fragColor;
    layout(location = 1) out vec4 idColor;
#endif


// .rgb: 24bit diffuse (max 1x diffuse bounce, no shadows)
// .a:   8bit ambient occlusion
uniform sampler2D u_baked; 
uniform bool u_buildingModelContainsLightmap;

varying vec2 v_uv;
varying vec3 v_normal;

uniform vec2 u_sensorVisualizationYRange;

const float aoIntensity = 6.0 / 6.0;
const float linearBrightnessEnhancementFactor = 1.0;

varying vec4 v_vertex;

uniform bool u_visualizeOnAssetLevel;

uniform bool u_showGrid;

uniform bool u_sunIsUp;
uniform bool u_enableShadowMapping;

// TODO(limit): Check if a larger limit instead of 16 is possible
#define MAX_SENSORS 16
uniform int u_numSensors;
uniform float u_sensorValues[MAX_SENSORS];
uniform float u_sensorMinValue;
uniform float u_sensorMaxValue;
uniform vec3 u_sensorMinColor;
uniform vec3 u_sensorMaxColor;

// TODO(limit): Check if a larger limit instead of 16 is possible
#define MAX_ASSETS 16
uniform int u_numAssets;
uniform float u_assetValues[MAX_ASSETS];
uniform int u_assetIndices[MAX_ASSETS];

uniform bool u_debugSensorDistances;
uniform int u_debugSensorIndices[MAX_SENSORS];
uniform int u_debugSensorIndicesLength;
uniform float u_debugMaxSensorDistance;
uniform bool u_debugVisualizeSensorDistanceUsingColorMap;
uniform bool u_debugUseDirectNeighborMinFilter;
uniform bool u_debugUseDiagonalMinFilter;
uniform float u_debugDistanceMapCoordsOffsetFactorX;
uniform float u_debugDistanceMapCoordsOffsetFactorY;
uniform float u_debugDistanceMapCoordsOffsetFactorZ;

uniform bool u_useLowBitDistanceMap;
uniform vec3 u_bboxMin;
uniform vec3 u_bboxMax;
uniform highp sampler3D u_sensorDistanceMap3DHigh;
uniform highp sampler3D u_sensorDistanceMap3DLow;
uniform highp sampler3D u_outsideDistanceMap3D;
uniform sampler2D u_colorScale;

uniform vec4 u_encodedID;
uniform int u_ID;
uniform int u_hoveredID;

uniform sampler2D u_shadowMap;

uniform float u_inverseDistanceWeightExponent;
uniform float u_outsideTemperature;
uniform float u_averageIndoorTemperature;

// TODO(config): Make this value configuration-based/dynamic
#define INVERT_AO_MAP_ON_HOVER
const vec4 BASE_COLOR = vec4(87.0 / 100.0, 89.0 / 100.0, 91.0 / 100.0, 1.0);

// TODO(structure): Factor this out into a shared .glsl file used by asset-baked.frag and volume.frag
float distFromOutsideInM()
{
    vec3 distanceMapCoords = (v_vertex.xzy - u_bboxMin.xzy) / (u_bboxMax.xzy - u_bboxMin.xzy);

    float x = max(0.0, min(1.0, distanceMapCoords.x));
    float y = max(0.0, min(1.0, distanceMapCoords.y));
    float z = max(0.0, min(1.0, distanceMapCoords.z));

    float distanceToOutside = texture(u_outsideDistanceMap3D, vec3(x, y, z)).r;

    vec3 boundingBoxExtents = u_bboxMax.xzy - u_bboxMin.xzy;
    float maxDistance = max(max(boundingBoxExtents.x, boundingBoxExtents.y), boundingBoxExtents.z);

    return distanceToOutside * maxDistance;
}

// TODO(structure): Factor this out into a shared .glsl file used by asset-baked.frag and volume.frag
float distFromSensorInM(int sensorIndex)
{
    vec3 distanceMapCoords = (v_vertex.xzy - u_bboxMin.xzy) / (u_bboxMax.xzy - u_bboxMin.xzy);

    float x = max(0.0, min(1.0, distanceMapCoords.x));
        float y = max(0.0, min(1.0, distanceMapCoords.y)) / float(u_numSensors) + (float(sensorIndex) / float(u_numSensors));
    float z = max(0.0, min(1.0, distanceMapCoords.z));

    float distanceToSensor = 0.0;

    if (u_useLowBitDistanceMap)
    {
        distanceToSensor = texture(u_sensorDistanceMap3DHigh, vec3(x, y, z)).r * 255.0 / 256.0;
        distanceToSensor += texture(u_sensorDistanceMap3DLow, vec3(x, y, z)).r / 65536.0 * 255.0;
    }
    else
    {
        distanceToSensor = texture(u_sensorDistanceMap3DHigh, vec3(x, y, z)).r * 255.0 / 256.0;    
    }

    vec3 boundingBoxExtents = u_bboxMax.xzy - u_bboxMin.xzy;
    float maxDistance = max(max(boundingBoxExtents.x, boundingBoxExtents.y), boundingBoxExtents.z);

    return distanceToSensor * maxDistance;
}

// TODO(structure): Factor this out into a shared .glsl file used by asset-baked.frag and volume.frag
float inverseDistanceWeight(vec3 fragmentPosition)
{
    float sum, weightSum;

    for (int sensorIndex = 0; sensorIndex < MAX_SENSORS; sensorIndex++)
    {
        if (sensorIndex < u_numSensors) {
            float distanceToSensor = distFromSensorInM(sensorIndex);

            if (distanceToSensor > 0.0) 
            {
                float weight = (1.0 / pow(distanceToSensor, u_inverseDistanceWeightExponent));
                sum += u_sensorValues[sensorIndex] * weight;
                weightSum += weight;
            } 
            else 
            {
                return u_sensorValues[sensorIndex];
            }
        }
    }

    float distFromOutside = distFromOutsideInM();

    // We assume that 10 % of the temperature of the "outside" goes "through" the windows
    // TODO(config): Make this value configuration-based/dynamic
    const float OUTSIDE_TEMPERATURE_INFLUENCE_FACTOR = 0.10;

    if (distFromOutside <= 0.0)
    {
        return u_outsideTemperature * OUTSIDE_TEMPERATURE_INFLUENCE_FACTOR + (1.0 - OUTSIDE_TEMPERATURE_INFLUENCE_FACTOR) * u_averageIndoorTemperature;
    }
    
    vec3 boundingBoxExtents = u_bboxMax.xzy - u_bboxMin.xzy;
    float maxDistance = max(max(boundingBoxExtents.x, boundingBoxExtents.y), boundingBoxExtents.z);

    // We assume that the influence of the outside temperature decreases three times as much by distance as the one of indoor temperature
    // TODO(config): Make this value configuration-based/dynamic
    distFromOutside = min(maxDistance, distFromOutside * 3.0);
    float weight = (1.0 / pow(distFromOutside, u_inverseDistanceWeightExponent));
    
    sum += (u_outsideTemperature * OUTSIDE_TEMPERATURE_INFLUENCE_FACTOR + (1.0 - OUTSIDE_TEMPERATURE_INFLUENCE_FACTOR) * u_averageIndoorTemperature) * weight;
    weightSum += weight;

    // Everything that is more than 4 meters away from a sensor/from the outside is considered to have the average/mean indoor temperature
    // TODO(config): Make this value configuration-based/dynamic
    float falloffThreshold = 1.0 / pow(4.0, u_inverseDistanceWeightExponent);
    if (weightSum <= falloffThreshold)
    {
        sum += u_averageIndoorTemperature * (falloffThreshold - weightSum);
        weightSum += (falloffThreshold - weightSum);
    }

    return sum / weightSum;
}

void main()
{
    float light_depth = SMDepth(v_vertex.xyz, u_lightPosition, u_lightNearFar);
    vec2 shadow_uv = SMCoordinates(v_vertex, u_lightViewProjection);

    float visibility = 1.0;
    if (u_shadowMappingMethod == 0)
    {
        visibility = SMCompare(u_shadowMap, shadow_uv, light_depth, u_SMShadowBias);
    }
    else if (u_shadowMappingMethod == 1)
    {
        visibility = ESMCompare(u_shadowMap, shadow_uv, light_depth, u_ESMShadowExponent);
    }
    else if (u_shadowMappingMethod == 2)
    {
        visibility = VSMCompare(u_shadowMap, shadow_uv, light_depth, u_VSMShadowMinVariance, u_VSMShadowLightBleedingReduction);
    } else
    {
        visibility = EVSMCompare(u_shadowMap, shadow_uv, light_depth, u_EVSMShadowExponents, u_VSMShadowLightBleedingReduction);
    }

    if (any(greaterThan(shadow_uv, vec2(1.0))) || any(lessThan(shadow_uv, vec2(0.0)))) {
        visibility = 1.0;
    }

    // TODO(config): Make this dynamic, i.e., replace it with the application/renderer’s clear color
    vec4 baked = vec4(0.960784314, 0.976470588, 1.0, 1.0);
    if (u_buildingModelContainsLightmap) {
        baked = texture(u_baked, v_uv);
    }

#ifdef INVERT_AO_MAP_ON_HOVER
    if (u_ID != 0 && u_ID == u_hoveredID) {
        vec4 shadowInfluence = BASE_COLOR - baked;
        baked = BASE_COLOR + shadowInfluence;
    }
#endif

    vec3 albedo = baked.rgb * linearBrightnessEnhancementFactor;
    float ao = mix(1.0, baked.a, aoIntensity);

    vec4 color = baked;

    float interpolatedValue = u_averageIndoorTemperature;
    if (u_visualizeOnAssetLevel) {
        if (u_ID != 0) {
            for (int assetIndex = 0; assetIndex < MAX_ASSETS; assetIndex++)
            {
                if (assetIndex < u_numAssets) 
                {
                    int assetId = u_assetIndices[assetIndex];
                    if (assetId == u_ID)
                    {
                        interpolatedValue = u_assetValues[assetIndex];
                    }
                }
            }
        }
    } else {
        interpolatedValue = inverseDistanceWeight(v_vertex.xyz);
    }
    float interpolatedValueNormalized = (interpolatedValue - u_sensorMinValue) / (u_sensorMaxValue - u_sensorMinValue);

    float visualizeSensorValues = 0.0;
    if (v_vertex.y >= u_sensorVisualizationYRange[0] && v_vertex.y <= u_sensorVisualizationYRange[1]) {
        visualizeSensorValues = 1.0;
    }

    // TODO: Find a better way of blending the colors here than simple multiplication
    color *= mix(vec4(1.0, 1.0, 1.0, 1.0), vec4(texture(u_colorScale, vec2(interpolatedValueNormalized, 0.0)).rgb, 1.0), visualizeSensorValues);
    fragColor = color;

    if (u_debugSensorDistances) {
        vec3 summedColor = vec3(0.0, 0.0, 0.0);
        int amountOfSensorsDebugged = 0;
        for (int sensorIndex = 0; sensorIndex < MAX_SENSORS; sensorIndex++)
        {
            if (sensorIndex < u_debugSensorIndicesLength) 
            {
                int toBeDebuggedSensorIndex = u_debugSensorIndices[sensorIndex];
                if (toBeDebuggedSensorIndex != -1)
                {
                    float distanceToSensor = distFromSensorInM(toBeDebuggedSensorIndex);
                    if (u_debugMaxSensorDistance != -1.0)
                    {
                        distanceToSensor = distanceToSensor / u_debugMaxSensorDistance;
                    }

                    vec3 debugColor = vec3(0.0, 0.0, 0.0);
                    if (u_debugVisualizeSensorDistanceUsingColorMap)
                    {
                        debugColor = texture(u_colorScale, vec2(distanceToSensor, 0.0)).rgb;
                    }
                    else
                    {
                        debugColor = vec3(distanceToSensor, distanceToSensor, distanceToSensor);
                    }
                    summedColor = summedColor + debugColor;
                    amountOfSensorsDebugged = amountOfSensorsDebugged + 1;
                }
            }
        }
        if (amountOfSensorsDebugged > 0)
        {
            fragColor = vec4(
                summedColor.r / float(amountOfSensorsDebugged), 
                summedColor.g / float(amountOfSensorsDebugged), 
                summedColor.b / float(amountOfSensorsDebugged), 
                1.0
            );
        }
        else 
        {
            fragColor = vec4(1.0, 0.0, 0.0, 1.0);
        }
    }

    if (u_enableShadowMapping)
    {
        if (!u_sunIsUp)
        {
            visibility = 0.0;
        }
        fragColor = mix(shadowColor * fragColor, fragColor, visibility);
    }
    fragColor.a = 1.0;

    #if __VERSION__ == 100
        // TODO: Find out how to store second fragment in OpenGL ES 1.0 -- maybe needs another fragment shader?
    #else
        idColor = u_encodedID;
    #endif

    if (u_showGrid) {
        // Based on http://asliceofrendering.com/scene%20helper/2020/01/05/InfiniteGrid/ 
        // Major tick every 1.0 m
        float majorScale = 1.0;
        vec3 majorCoord = v_vertex.xyz * majorScale;
        vec3 majorDerivative = fwidth(majorCoord.xyz);
        float minimumx = min(majorDerivative.x, 1.0);
        float minimumy = min(majorDerivative.y, 1.0);
        float minimumz = min(majorDerivative.z, 1.0);
        vec3 majorGrid = abs(fract(majorCoord.xyz - 0.5) - 0.5) / majorDerivative;
        float majorLine = min(min(majorGrid.x, majorGrid.y), majorGrid.z);

        // Minor tick every 0.1 m = 10 cm
        float minorScale = 10.0;
        vec3 minorCoord = v_vertex.xyz * minorScale;
        vec3 minorDerivative = fwidth(minorCoord.xyz);
        vec3 minorGrid = abs(fract(minorCoord.xyz - 0.5) - 0.5) / minorDerivative;
        float minorLine = min(min(minorGrid.x, minorGrid.y), minorGrid.z);

        vec4 gridColor = vec4(0.2, 0.2, 0.2, 0.5 - 0.5 * min(majorLine, 1.0) - 0.25 * min(minorLine, 1.0));

        // x axis
        if(majorCoord.x > -0.5 * minimumx && majorCoord.x < 0.5 * minimumx)
            gridColor.x = 1.0;
        // y axis
        if(majorCoord.y > -0.5 * minimumy && majorCoord.y < 0.5 * minimumy)
            gridColor.y = 1.0;
        // z axis
        if(majorCoord.z > -0.5 * minimumz && majorCoord.z < 0.5 * minimumz)
            gridColor.z = 1.0;
        fragColor = vec4(fragColor.rgb * (1.0 - gridColor.a) + (gridColor.rgb * gridColor.a), 1.0);
    }
}
