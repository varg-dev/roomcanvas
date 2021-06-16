precision highp int;
precision highp float;
/**
 * Based on https://www.willusher.io/webgl/2019/01/13/volume-rendering-with-webgl
 */

@import ./facade.frag;

#if __VERSION__ == 100
    #define fragColor gl_FragColor
#else
    layout(location = 0) out vec4 fragColor;
#endif

uniform highp sampler2D u_transferFunction;
uniform highp sampler2D u_transparencyTransferFunction;
uniform highp sampler2D u_depth;
uniform ivec3 u_volumeDims;
uniform float u_dtScale;

uniform bool u_useLowBitDistanceMap;
uniform highp sampler3D u_sensorDistanceMap3DHigh;
uniform highp sampler3D u_sensorDistanceMap3DLow;
uniform highp sampler3D u_outsideDistanceMap3D;

#define MAX_SENSORS 16
uniform int u_numSensors;
uniform float u_sensorValues[MAX_SENSORS];
uniform float u_sensorMinValue;
uniform float u_sensorMaxValue;

uniform float u_inverseDistanceWeightExponent;
uniform float u_outsideTemperature;
uniform float u_averageIndoorTemperature;

uniform ivec2 u_canvasDims;
uniform vec3 u_volumeScale;     // local
uniform mat4 u_invView;
uniform mat4 u_invProjection;
uniform mat4 u_invModel;        // world --> local
uniform mat4 u_cube;		    // local --> cube
uniform float u_minDistanceThreshold;
uniform float u_maxDistanceThreshold;

uniform vec2 u_ndcOffset;

uniform bool u_showBoundingVolume;

uniform vec3 u_bboxMin; // world
uniform vec3 u_bboxMax; // world

in vec3 v_viewRayDir;
flat in vec3 v_transformedEye;

in vec3 v_vertexCube;

vec2 intersect_box(vec3 orig, vec3 dir) {
	vec4 box_min_vec4 = u_cube * (u_invModel * vec4(u_bboxMin, 1.0));
	vec3 box_min = box_min_vec4.xyz;
	vec4 box_max_vec4 = u_cube * (u_invModel * vec4(u_bboxMax, 1.0));
	vec3 box_max = box_max_vec4.xyz;
	vec3 inv_dir = 1.0 / dir;
	vec3 tmin_tmp = (box_min - orig) * inv_dir;
	vec3 tmax_tmp = (box_max - orig) * inv_dir;
	vec3 tmin = min(tmin_tmp, tmax_tmp);
	vec3 tmax = max(tmin_tmp, tmax_tmp);
	float t0 = max(tmin.x, max(tmin.y, tmin.z));
	float t1 = min(tmax.x, min(tmax.y, tmax.z));
	return vec2(t0, t1);
}

bool is_inside_box(vec3 point) {
	vec4 box_min_vec4 = u_cube * (u_invModel * vec4(u_bboxMin, 1.0));
	vec3 box_min = box_min_vec4.xyz;
	vec4 box_max_vec4 = u_cube * (u_invModel * vec4(u_bboxMax, 1.0));
	vec3 box_max = box_max_vec4.xyz;
	return !(any(lessThan(point, box_min)) || any(greaterThan(point, box_max)));
}

// Pseudo-random number gen from
// http://www.reedbeta.com/blog/quick-and-easy-gpu-random-numbers-in-d3d11/
// with some tweaks for the range of values
float wang_hash(int seed) {
	seed = (seed ^ 61) ^ (seed >> 16);
	seed *= 9;
	seed = seed ^ (seed >> 4);
	seed *= 0x27d4eb2d;
	seed = seed ^ (seed >> 15);
	return float(seed % 2147483647) / float(2147483647);
}

// Reconstruct the view-space position
vec4 compute_view_pos(float z) {
	vec4 pos = vec4(gl_FragCoord.xy / vec2(u_canvasDims) * 2.0 - 1.0, z, 1.0);
	pos = u_invProjection * pos;
	return pos / pos.w;
}

const vec3 premultUint8x3 = vec3(255.0 / 256.0, 255.0 / 65536.0, 255.0 / 16777216.0);
float uint8x3_to_float24x1(const in vec3 v) {
    return dot(v, premultUint8x3); // a1 * b1 + a2 * b2 + a3 * b3  ;)
}

// TODO(structure): Factor this out into a shared .glsl file used by asset-baked.frag and volume.frag
float distFromOutsideInM(vec3 distanceMapCoords)
{
    float distanceToOutside = texture(u_outsideDistanceMap3D, distanceMapCoords).r;

    vec3 boundingBoxExtents = u_volumeScale;
    float maxDistance = max(max(boundingBoxExtents.x, boundingBoxExtents.y), boundingBoxExtents.z);

    return distanceToOutside * maxDistance;
}

// TODO(structure): Factor this out into a shared .glsl file used by asset-baked.frag and volume.frag
float distFromSensorInM(int sensorIndex, vec3 distanceMapCoords)
{
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

    vec3 boundingBoxExtents = u_volumeScale;
    float maxDistance = max(max(boundingBoxExtents.x, boundingBoxExtents.y), boundingBoxExtents.z);

    return distanceToSensor * maxDistance;
}

// TODO(structure): Factor this out into a shared .glsl file used by asset-baked.frag and volume.frag
float inverseDistanceWeight(vec3 distanceMapCoords)
{
    float sum, weightSum;

	vec3 boundingBoxExtents = u_volumeScale;
    float maxDistance = max(max(boundingBoxExtents.x, boundingBoxExtents.y), boundingBoxExtents.z);

    for (int sensorIndex = 0; sensorIndex < MAX_SENSORS; sensorIndex++)
    {
        if (sensorIndex < u_numSensors) {
            float distanceToSensor = distFromSensorInM(sensorIndex, distanceMapCoords);

            if (distanceToSensor > 0.0) 
            {
				if (distanceToSensor >= u_minDistanceThreshold * maxDistance && distanceToSensor <= u_maxDistanceThreshold * maxDistance)
				{
					float weight = (1.0 / pow(distanceToSensor, u_inverseDistanceWeightExponent));
					sum += u_sensorValues[sensorIndex] * weight;
					weightSum += weight;
				}
            } 
            else 
            {
                return u_sensorValues[sensorIndex];
            }
        }
    }

    float distFromOutside = distFromOutsideInM(distanceMapCoords);

    // We assume that 10 % of the temperature of the "outside" goes "through" the windows
	// TODO(config): Make this value configuration-based/dynamic
    const float OUTSIDE_TEMPERATURE_INFLUENCE_FACTOR = 0.10;

    if (distFromOutside <= 0.0)
    {
        return u_outsideTemperature * OUTSIDE_TEMPERATURE_INFLUENCE_FACTOR + (1.0 - OUTSIDE_TEMPERATURE_INFLUENCE_FACTOR) * u_averageIndoorTemperature;
    }

    // We assume that the influence of the outside temperature decreases three times as much by distance as the one of indoor temperature
	// TODO(config): Make this value configuration-based/dynamic
    distFromOutside = min(maxDistance, distFromOutside * 3.0);

	if (distFromOutside >= u_minDistanceThreshold * maxDistance && distFromOutside <= u_maxDistanceThreshold * maxDistance)
	{
		float weight = (1.0 / pow(distFromOutside, u_inverseDistanceWeightExponent));
    	sum += (u_outsideTemperature * OUTSIDE_TEMPERATURE_INFLUENCE_FACTOR + (1.0 - OUTSIDE_TEMPERATURE_INFLUENCE_FACTOR) * u_averageIndoorTemperature) * weight;
    	weightSum += weight;
	}

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

void main(void)
{
	// Step 1: Normalize the view ray
	vec3 viewRayDirNormalized = normalize(v_viewRayDir);

	if (u_showBoundingVolume) {
		fragColor = vec4(v_transformedEye.xyz, 1.0);
		return;
	}

    // Step 2: Intersect the ray with the volume bounds to find the interval
	// along the ray overlapped by the volume.
	vec2 t_hit = intersect_box(v_transformedEye, viewRayDirNormalized);

	if (t_hit.x > t_hit.y) {
		discard;
	}

    // We don't want to sample voxels behind the eye if it's
	// inside the volume, so keep the starting point at or in front
	// of the eye
	t_hit.x = max(t_hit.x, 0.0);

    // Step 3: Compute the step size to march through the volume grid
	vec3 dt_vec = 1.0 / (vec3(u_volumeDims) * abs(viewRayDirNormalized)); 

	float dt = u_dtScale * min(dt_vec.x, min(dt_vec.y, dt_vec.z));

	float dt_correction = u_dtScale;

	float offset = wang_hash(int(
		gl_FragCoord.x
		+ float(u_canvasDims.x) * gl_FragCoord.y
		+ float(u_canvasDims.x) * float(u_canvasDims.y) * u_ndcOffset.x
		+ float(u_canvasDims.x) * float(u_canvasDims.y) * 100.0 * u_ndcOffset.y
	));

	vec3 encodedDepth = texelFetch(u_depth, ivec2(gl_FragCoord), 0).rgb;
	float decodedDepth = uint8x3_to_float24x1(encodedDepth);
	decodedDepth = decodedDepth * 2.0 - 1.0;	
	
	if (decodedDepth < 0.9999999403953552) {
		float z = decodedDepth;
		vec4 geom_pos4 = (u_invView * compute_view_pos(z));
		vec3 geom_pos = (geom_pos4 / geom_pos4.w).xyz;

		// world --> local --> cube [0..1]		
		geom_pos = (u_invModel * vec4(geom_pos, 1.0)).xyz;
		geom_pos = (u_cube * vec4(geom_pos, 1.0)).xyz;
		
		float geom_t = length(geom_pos - v_transformedEye);

		// We want to adjust the sampling rate to still take a reasonable
		// number of samples in the volume up to the surface
		float samples = 1.0 / dt;

		float newdt = (geom_t - t_hit.x) / samples; 
		newdt = max(dt, newdt); // stops everything with geom_t <= 1.0 from increasing the sampling rate
		dt_correction = u_dtScale * newdt / dt;
		dt = newdt;
		t_hit.y = geom_t;
	}

	// Step 4: Starting from the entry point, march the ray through the volume
	// and sample it
	vec3 p = v_transformedEye + (t_hit.x + offset * dt) * viewRayDirNormalized;
	float t;

	// TODO: Find a more robust way of determining an appropriate opacity per sample (instead of the fixed 0.1 = 10 % from below)
	// float opacityPerSample = (t_hit.y - t_hit.x) / dt;
	float opacityPerSample = 0.1;

	for (t = t_hit.x; t < t_hit.y; t += dt) {
		// Step 4.1: Sample the volume, and color it by the transfer function.
		float interpolatedValue = u_averageIndoorTemperature;
		interpolatedValue = inverseDistanceWeight(p);
		float interpolatedValueNormalized = (interpolatedValue - u_sensorMinValue) / (u_sensorMaxValue - u_sensorMinValue);
		float val = interpolatedValueNormalized;

		vec4 val_color = vec4(texture(u_transferFunction, vec2(val, 0.0)).rgb, 1.0);
		val_color.a = texture(u_transparencyTransferFunction, vec2(val, 0.0)).a * opacityPerSample;

		// Opacity correction
		val_color.a = 1.0 - pow(1.0 - val_color.a, dt_correction);

		// Step 4.2: Accumulate the color and opacity using the front-to-back
		// compositing equation
		fragColor.rgb += (1.0 - fragColor.a) * val_color.a * val_color.rgb;
		fragColor.a += (1.0 - fragColor.a) * val_color.a;
		
		// Optimization: break out of the loop when the color is near opaque
		if (fragColor.a >= 0.99) {
			break;
		}
		p += viewRayDirNormalized * dt;
	}

	// If we have the surface, take a final sample at the surface point
	if (decodedDepth < 0.9999999403953552) {
		p = v_transformedEye + t_hit.y * viewRayDirNormalized;

		if (!is_inside_box(p)) {
			return;
		}

		float interpolatedValue = u_averageIndoorTemperature;
		interpolatedValue = inverseDistanceWeight(p);
		float interpolatedValueNormalized = (interpolatedValue - u_sensorMinValue) / (u_sensorMaxValue - u_sensorMinValue);
		float val = interpolatedValueNormalized;

		vec4 val_color = vec4(texture(u_transferFunction, vec2(val, 0.0)).rgb, 1.0);
		val_color.a = texture(u_transparencyTransferFunction, vec2(val, 0.0)).a * opacityPerSample;

		// Opacity correction
		val_color.a = 1.0 - pow(1.0 - val_color.a, (t_hit.y - t) * u_dtScale);
		fragColor.rgb += (1.0 - fragColor.a) * val_color.a * val_color.rgb;
		fragColor.a += (1.0 - fragColor.a) * val_color.a;
	}
}
