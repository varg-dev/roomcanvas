/* eslint-disable @typescript-eslint/no-var-requires */
import * as React from 'react';
import { useEffect } from 'react';

import Axios from 'axios';
import { parse } from 'yaml';

import { vec3 } from 'gl-matrix';

import { evaluate } from 'mathjs';
import { Easing, Tween } from '@tweenjs/tween.js';

import { gl_matrix_extensions } from 'webgl-operate';
import { Camera } from 'webgl-operate';

import { DateTime, Duration, DurationObject, Settings } from 'luxon';
import SunCalc = require('suncalc');

import Select from 'react-select';
import DatePicker from 'react-datepicker';
import { createStyles, Mark, Slider, withStyles } from '@material-ui/core';

import { TASADataProvider, TestTASADataProvider, State } from '../source/components/TASADataProvider';
import { TASALiveDataDispatcher } from '../source/components/TASALiveDataDispatcher';
import { TASAStaticDataDispatcher } from '../source/components/TASAStaticDataDispatcher';
import { SamplingMode, TASAHistoricalDataDispatcher } from '../source/components/TASAHistoricalDataDispatcher';

import { FunctionPlot } from '../source/components/FunctionPlot';

import { TASAViewerApp } from '../source/components/TASAViewerApp';
import { HoverEvent, LabellingAlgorithmOrderBy, SensorValueLabelsConfig } from '../source/renderer/renderer';

const { v3 } = gl_matrix_extensions;

const styles = () =>
    createStyles({
        root: {
            color: '#007bff',
            height: 8,
        },
        thumb: {
            height: 16,
            width: 16,
            backgroundColor: 'currentColor',
            border: '2px solid currentColor',
            marginTop: -4,
            marginLeft: -8,
            '&:focus, &:hover, &$active': {
                boxShadow: 'inherit',
            },
            '&.Mui-disabled.MuiSlider-thumb': {
                height: 16,
                width: 16,
                marginTop: -4,
                marginLeft: -8,
            },
        },
        active: {},
        valueLabel: {
            left: 'calc(-50% + 4px)',
        },
        track: {
            height: 8,
            borderRadius: 4,
        },
        rail: {
            height: 8,
            borderRadius: 4,
        },
        mark: {
            marginTop: 12,
        },
        markLabel: {
            top: 29,
            fontSize: '0.65rem',
            fontWeight: 700,
        },
    });

const StyledSlider = withStyles(styles)(Slider);

const colorScalePresets = [
    ['smithwalt', 'viridis'],
    ['smithwalt', 'inferno'],

    ['marcosci', 'cividis'],
    ['smithwalt', 'magma'],

    ['colorbrewer', 'Greys'],
    ['smithwalt', 'plasma'],

    ['colorbrewer', 'Spectral'],
    ['mikhailov', 'turbo'],

    ['colorbrewer', 'BrBG'],
    ['colorbrewer', 'RdBu'],
    ['colorbrewer', 'RdYlBu'],
    ['colorbrewer', 'PuOr'],

    ['colorbrewer', 'OrRd'],
    ['colorbrewer', 'RdPu'],

    ['colorbrewer', 'Accent'],
    ['colorbrewer', 'Paired'],
    ['colorbrewer', 'Pastel2'],
    ['colorbrewer', 'Dark2'],
];

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
// const robotoRegular = require('./data/fonts/roboto/roboto-regular-52abed8d.fnt');
// const robotoThin = require('./data/fonts/roboto/roboto-thin-52abed8d.fnt');
const robotoLight = require('./data/fonts/roboto/roboto-light-52abed8d.fnt');
// const robotoMedium = require('./data/fonts/roboto/roboto-medium-52abed8d.fnt');
// const robotoBold = require('./data/fonts/roboto/roboto-bold-52abed8d.fnt');
// const robotoBlack = require('./data/fonts/roboto/roboto-black-52abed8d.fnt');

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const customFont = require('./data/fonts/icon-fonts/icons/distancefield_12.fnt');

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const sensorFont = require('./data/fonts/icon-fonts/sensors/weather-sensor-a7cb1a84.fnt');

// TODO(config): Make this value configuration-based/dynamic
const MOCKED_CONTEXT_STATE = {
    isLoading: false,
    data: {
        sensorValues: new Map([
            [
                338,
                {
                    attributes: {
                        name: 'Fensteröffnung Zimmer 2 - 2',
                        description: null,
                        serial: null,
                        sensor_type_id: 40,
                        asset_id: 82,
                        precision: null,
                        display_unit: '',
                        attribute_key_unit: '',
                        attribute_key_id: 387,
                        key: 'room_2_window_1_contact',
                        sampling_rate_value: null,
                        sampling_rate_unit: null,
                        last_value: {
                            value: 0.0,
                            timestamp: '2020-11-26T21:31:16.505+01:00',
                        },
                        total_value_range: { min: 0.0, max: 2.0 },
                    },
                    // sensorData: [
                    //     {
                    //         timestamp: '2020-11-26T20:38:10.300Z',
                    //         unit: '',
                    //         value: 0,
                    //     },
                    // ],
                },
            ],
            [
                324,
                {
                    attributes: {
                        name: 'Temperatur Küche',
                        last_value: {
                            value: 18.4,
                            timestamp: '2020-11-26T21:31:16.505+01:00',
                        },
                    },
                    sensorData: [
                        {
                            timestamp: '2020-11-26T20:38:10.300Z',
                            unit: '°C',
                            value: 18.4,
                        },
                    ],
                },
            ],
        ]),
    },
    // error: 'Sample error message',
} as State;

const KIOSK_MODE = false;

type DisplayDataMode = 'live' | 'historical' | 'mocked';

interface StoredCamera {
    eye: vec3;
    center: vec3;
    up: vec3;
    label: string;
    id: number;
}

const App: React.FunctionComponent = () => {
    const [availableBuildingModels, setAvailableBuildingModels] = React.useState(
        [] as Array<{ id: number; label: string; assetContentRoot: string }>,
    );
    const [selectedBuildingModelIndex, setSelectedBuildingModelIndex] = React.useState(undefined as undefined | number);

    const [buildingModelGltfUri, setBuildingModelGltfUri] = React.useState(undefined as undefined | string);
    const [buildingModelHierarchyGltfUri, setBuildingModelHierarchyGltfUri] = React.useState(undefined as undefined | string);

    const [availableSensors, setAvailableSensors] = React.useState(
        [] as Array<{
            value: number;
            label: string;
        }>,
    );

    const [sensorPositions, setSensorPositions] = React.useState(
        undefined as undefined | { sensorPositions: Map<number, [number, number, number]> },
    );

    const [labeledSensorIds, setLabeledSensorIds] = React.useState([] as number[]);
    const [liveDataSensorIds, setLiveDataSensorIds] = React.useState([] as number[]);

    const [outsideTemperatureAssetId, setOutsideTemperatureAssetId] = React.useState(undefined as undefined | number);
    const [outsideTemperatureSensorId, setOutsideTemperatureSensorId] = React.useState(undefined as undefined | number);

    const [apartmentBboxMin, setApartmentBboxMin] = React.useState([-1.8249350786209106, 0.0, -5.399456024169922] as [
        number,
        number,
        number,
    ]);
    const [apartmentBboxMax, setApartmentBboxMax] = React.useState([17.7653865814209, 3.4400007724761963, 10.044034004211426] as [
        number,
        number,
        number,
    ]);
    const [fontSizeInMeters, setFontSizeInMeters] = React.useState(1.0);
    const [basePlaneYOffset, setBasePlaneYOffset] = React.useState(0.0);
    const [distanceMapHeightSlices, setDistanceMapHeightSlices] = React.useState(28);

    const [selectedColorScaleId, setSelectedColorScaleId] = React.useState(10);
    const [colorScaleStops, setColorScaleStops] = React.useState(6);
    const [useLinearColorInterpolation, setUseLinearColorInterpolation] = React.useState(false);
    const [invertColorScale, setInvertColorScale] = React.useState(true);
    const [selectedDatetime, setSelectedDatetime] = React.useState(DateTime.local());

    const [enableSensorDistanceDebug, setEnableSensorDistanceDebug] = React.useState(false);
    const [debugSensorIndices, setDebugSensorIndices] = React.useState([344]);
    const [debugMaxSensorDistance, setDebugMaxSensorDistance] = React.useState(10.0);
    const [debugUseDiagonalMinFilter, setDebugUseDiagonalMinFilter] = React.useState(false);
    const [debugUseDirectNeighborMinFilter, setDebugUseDirectNeighborMinFilter] = React.useState(false);
    const [debugVisualizeSensorDistanceUsingColorMap, setDebugVisualizeSensorDistanceUsingColorMap] = React.useState(false);
    const [debugDistanceMapCoordsOffsetFactorX, setDebugDistanceMapCoordsOffsetFactorX] = React.useState(undefined as undefined | number);
    const [debugDistanceMapCoordsOffsetFactorY, setDebugDistanceMapCoordsOffsetFactorY] = React.useState(undefined as undefined | number);
    const [debugDistanceMapCoordsOffsetFactorZ, setDebugDistanceMapCoordsOffsetFactorZ] = React.useState(undefined as undefined | number);

    const [enableAssetHighlightingOnHover, setEnableAssetHighlightingOnHover] = React.useState(false);

    const [displayDataMode, setDisplayDataMode] = React.useState('historical' as DisplayDataMode);

    const availableSamplingModes = [
        {
            rate: 1,
            unit: 'days',
        },
        {
            rate: 1,
            unit: 'weeks',
        },
        {
            rate: 2,
            unit: 'weeks',
        },
        {
            rate: 1,
            unit: 'months',
        },
    ] as SamplingMode[];
    const [samplingMode, setSamplingMode] = React.useState('none' as SamplingMode);

    const [animationTween, setAnimationTween] = React.useState(undefined as Tween<any> | undefined);
    const [timeSliderUsed, setTimeSliderUsed] = React.useState(false);

    // TODO(config): Make this value configurable via the debug UI
    const [ssaoMinDistance] = React.useState(0.0001);
    // TODO(config): Make this value configurable via the debug UI
    const [ssaoMaxDistance] = React.useState(0.035);
    // TODO(config): Make this value configurable via the debug UI
    const [ssaoSpiralTurns] = React.useState(122);

    const [visualizeOnAssetLevel, setVisualizeOnAssetLevel] = React.useState(false);
    const [useLowBitDistanceMap, setUseLowBitDistanceMap] = React.useState(true);
    const [showGrid, setShowGrid] = React.useState(false);
    const [enableEdgeOutlineRendering, setEnableEdgeOutlineRendering] = React.useState(false);
    const [enableSSAO, setEnableSSAO] = React.useState(false);
    const [enableMetadataAndColorScaleLabelling, setEnableMetadataAndColorScaleLabelling] = React.useState(true);
    const [enableSensorIcons, setEnableSensorIcons] = React.useState(false);
    const [sensorValueLabelsConfig, setSensorValueLabelsConfig] = React.useState({
        displayLabels: true,
        approximateOptimalLabellingPositions: true,
        labellingAlgorithmConfig: {
            filtering: {
                mustFaceCamera: true,
                mustBeInsideViewport: true,
                mustNotBeBehindObstacles: true,
                mustNotBeUpsideDown: true,
            },
            ordering: {
                orderBy: [
                    LabellingAlgorithmOrderBy.RunningLength,
                    LabellingAlgorithmOrderBy.InverseDistanceToCameraEye,
                    LabellingAlgorithmOrderBy.HowDirectlyFacingCamera,
                    LabellingAlgorithmOrderBy.HowStraighlyAlignedHorizontally,
                ],
            },
        },
    } as SensorValueLabelsConfig);

    const [interpolateBetweenValues, setInterpolateBetweenValues] = React.useState(true);
    const [show1stDerivative, setShow1stDerivative] = React.useState(false);

    const [sensorMinValue, setSensorMinValue] = React.useState(18.0);
    const [sensorMaxValue, setSensorMaxValue] = React.useState(25.0);

    const [historicalDataDatetime, setHistoricalDataDatetime] = React.useState(DateTime.local());
    const [animationDataDatetime, setAnimationDataDatetime] = React.useState(undefined as DateTime | undefined);
    const [historicalDataDatetimeSyncSun, setHistoricalDataDatetimeSyncSun] = React.useState(true);

    const [hoverInformation, setHoverInformation] = React.useState(undefined as HoverEvent);
    const [rendererIsLoading, setRendererIsLoading] = React.useState(true);

    const [volumeVisibleDistances, setVolumeVisibleDistances] = React.useState([0.0, 1.0] as [number, number]);
    const [enableVolumeTransparencyTransferFunction, setEnableVolumeTransparencyTransferFunction] = React.useState(true);
    const [volumeTransparencyTransferFunctionSamples, setVolumeTransparencyTransferFunctionSamples] = React.useState(5);
    const [customVolumeTransparencyTransferFunction, setCustomVolumeTransparencyTransferFunction] = React.useState('0.1 + 0.1 * x^2');

    const [volumeBboxCubeMin, setVolumeBboxCubeMin] = React.useState([0, 0, 0] as [number, number, number]);
    const [volumeBboxCubeMax, setVolumeBboxCubeMax] = React.useState([1, 1, 1] as [number, number, number]);

    const [assetName, setAssetName] = React.useState('Eurovis, Zurich 21');

    const [enableSurfaceSensorDataVisualization, setEnableSurfaceSensorDataVisualization] = React.useState(true);
    const [enableVolumeSensorDataVisualization, setEnableVolumeSensorDataVisualization] = React.useState(false);

    const [storedCameraPositions, setStoredCameraPositions] = React.useState([] as StoredCamera[]);

    const [selectedCameraPositionIndex, setSelectedCameraPositionIndex] = React.useState(0);

    const [cameraConfig, setCameraConfig] = React.useState({
        eye: (undefined as unknown) as vec3,
        center: (undefined as unknown) as vec3,
        up: (undefined as unknown) as vec3,
    });
    const [controlledCameraConfig, setControlledCameraConfig] = React.useState(
        undefined as
            | {
                  eye: vec3;
                  center: vec3;
                  up: vec3;
              }
            | undefined,
    );
    const cameraEye = cameraConfig.eye;
    const cameraCenter = cameraConfig.center;
    const cameraUp = cameraConfig.up;

    const usedSunDatetime = historicalDataDatetimeSyncSun
        ? animationDataDatetime
            ? animationDataDatetime
            : historicalDataDatetime
        : selectedDatetime;

    const [buildingModelContainsLightmap, setBuildingModelContainsLightmap] = React.useState(false);
    const [enableShadowMapping, setEnableShadowMapping] = React.useState(true);

    const [latitude, setLatitude] = React.useState(undefined as undefined | number);
    const [longitude, setLongitude] = React.useState(undefined as undefined | number);
    const [northOffsetRadians, setNorthOffsetRadians] = React.useState(0.0); // 0 degrees
    const [distanceOfSunToSceneOrigin, setDistanceOfSunToSceneOrigin] = React.useState(40.0); // in meters

    useEffect(() => {
        const fetchAvailableBuildingModels = async () => {
            const availableBuildingModels = await Axios.get('data/availableBuildingModels.json');
            setAvailableBuildingModels(availableBuildingModels.data);
        };

        const fetchDataForSelectedBuildingModel = async () => {
            if (selectedBuildingModelIndex === undefined) {
                return;
            }

            const buildingConfigData = await Axios.get(
                `${availableBuildingModels[selectedBuildingModelIndex].assetContentRoot}/properties/config.yaml`,
            );

            const buildingConfig = parse(buildingConfigData.data) as {
                buildingModel: {
                    presentationGlb: string;
                    apartmentBboxMin: [number, number, number];
                    apartmentBboxMax: [number, number, number];
                    hierarchyGltf?: string;
                    containsLightmap?: boolean;
                    basePlaneYOffset?: number;
                };
                positionAndLocale?: {
                    latitude: number;
                    longitude: number;
                    northOffsetRadians: number;
                    timeZone: string;
                    distanceOfSunToSceneOrigin?: number;
                };
                sensorPositions?: { [sensorId: number]: [number, number, number] };
                sensorLabels?: { [sensorId: number]: string };
                defaultDisplayConfiguration?: {
                    labeledSensorIds: number[];
                    liveDataSensorIds: number[];
                    storedCameraPositions?: StoredCamera[];
                    fontSizeInMeters?: number;
                    outsideTemperatureAssetId?: number;
                    outsideTemperatureSensorId?: number;
                };
                distanceMaps?: {
                    amountOfSlices: number;
                };
            };

            if (buildingConfig.positionAndLocale) {
                buildingConfig.positionAndLocale.latitude && setLatitude(buildingConfig.positionAndLocale.latitude);
                buildingConfig.positionAndLocale.longitude && setLongitude(buildingConfig.positionAndLocale.longitude);
                buildingConfig.positionAndLocale.northOffsetRadians &&
                    setNorthOffsetRadians(buildingConfig.positionAndLocale.northOffsetRadians);

                buildingConfig.positionAndLocale.distanceOfSunToSceneOrigin &&
                    setDistanceOfSunToSceneOrigin(buildingConfig.positionAndLocale.distanceOfSunToSceneOrigin);

                // Configure Luxon to use the timezone of the asset, independent from the user’s configured timezone
                buildingConfig.positionAndLocale.timeZone
                    ? (Settings.defaultZoneName = buildingConfig.positionAndLocale.timeZone)
                    : undefined;
            }

            const apartmentBboxExtents = [
                buildingConfig.buildingModel.apartmentBboxMax[0] - buildingConfig.buildingModel.apartmentBboxMin[0],
                buildingConfig.buildingModel.apartmentBboxMax[1] - buildingConfig.buildingModel.apartmentBboxMin[1],
                buildingConfig.buildingModel.apartmentBboxMax[2] - buildingConfig.buildingModel.apartmentBboxMin[2],
            ];

            if (!(buildingConfig.distanceMaps || buildingConfig.sensorPositions)) {
                setEnableSurfaceSensorDataVisualization(false);
                setEnableVolumeSensorDataVisualization(false);
            }

            if (buildingConfig.buildingModel.containsLightmap === undefined || buildingConfig.buildingModel.containsLightmap === false) {
                setEnableSSAO(true);
            }

            if (!buildingConfig.defaultDisplayConfiguration || !buildingConfig.defaultDisplayConfiguration.storedCameraPositions) {
                const defaultCameraDistance = 2.0 * Math.max(...apartmentBboxExtents);

                const cameraCenter = vec3.fromValues(
                    buildingConfig.buildingModel.apartmentBboxMin[0] + 0.5 * apartmentBboxExtents[0],
                    buildingConfig.buildingModel.apartmentBboxMin[1],
                    buildingConfig.buildingModel.apartmentBboxMin[2] + 0.5 * apartmentBboxExtents[2],
                );

                let cameraEye = vec3.scaleAndAdd(v3(), cameraCenter, vec3.fromValues(1.0, 0.0, 0.0), defaultCameraDistance);

                // Let the camera look at the scene from a 45 degree angle from above
                cameraEye = vec3.rotateZ(v3(), cameraEye, cameraCenter, Math.PI / 4);

                const phi = Math.PI / 4; // 45 degrees
                cameraEye = vec3.rotateY(v3(), cameraEye, cameraCenter, phi);

                setControlledCameraConfig({
                    center: cameraCenter,
                    eye: cameraEye,
                    up: vec3.fromValues(0.0, 1.0, 0.0),
                });
            }

            if (!buildingConfig.defaultDisplayConfiguration || !buildingConfig.defaultDisplayConfiguration.fontSizeInMeters) {
                const defaultFontSizeInMeters = Math.max(...apartmentBboxExtents) / 17.0;

                setFontSizeInMeters(defaultFontSizeInMeters);
            }

            setBuildingModelGltfUri(
                `${availableBuildingModels[selectedBuildingModelIndex].assetContentRoot}3d-floor-plans/${buildingConfig.buildingModel.presentationGlb}`,
            );

            buildingConfig.buildingModel.containsLightmap !== undefined &&
                setBuildingModelContainsLightmap(buildingConfig.buildingModel.containsLightmap);

            buildingConfig.buildingModel.hierarchyGltf &&
                setBuildingModelHierarchyGltfUri(
                    `${availableBuildingModels[selectedBuildingModelIndex].assetContentRoot}3d-floor-plans/${buildingConfig.buildingModel.hierarchyGltf}`,
                );

            buildingConfig.sensorLabels &&
                setAvailableSensors(
                    Object.entries(buildingConfig.sensorLabels).map(([sensorId, label]) => ({ value: Number(sensorId), label: label })),
                );

            if (buildingConfig.sensorPositions) {
                setSensorPositions({
                    sensorPositions: new Map(
                        Object.entries(buildingConfig.sensorPositions).map(([sensorId, sensorPosition]) => [
                            Number(sensorId),
                            sensorPosition,
                        ]),
                    ),
                });
            } else {
                setSensorPositions(undefined);
            }

            if (buildingConfig.defaultDisplayConfiguration) {
                buildingConfig.defaultDisplayConfiguration.labeledSensorIds &&
                    setLabeledSensorIds(buildingConfig.defaultDisplayConfiguration.labeledSensorIds);
                buildingConfig.defaultDisplayConfiguration.liveDataSensorIds &&
                    setLiveDataSensorIds(buildingConfig.defaultDisplayConfiguration.liveDataSensorIds);

                buildingConfig.defaultDisplayConfiguration.outsideTemperatureAssetId &&
                    setOutsideTemperatureAssetId(buildingConfig.defaultDisplayConfiguration.outsideTemperatureAssetId);
                buildingConfig.defaultDisplayConfiguration.outsideTemperatureSensorId &&
                    setOutsideTemperatureSensorId(buildingConfig.defaultDisplayConfiguration.outsideTemperatureSensorId);

                if (
                    buildingConfig.defaultDisplayConfiguration.storedCameraPositions &&
                    buildingConfig.defaultDisplayConfiguration.storedCameraPositions.length > 0
                ) {
                    const cameraPositions = buildingConfig.defaultDisplayConfiguration.storedCameraPositions.map((storedCamera) => ({
                        ...storedCamera,
                        center: vec3.fromValues(...(storedCamera.center as [number, number, number])),
                        eye: vec3.fromValues(...(storedCamera.eye as [number, number, number])),
                        up: vec3.fromValues(...(storedCamera.up as [number, number, number])),
                    }));
                    setStoredCameraPositions(cameraPositions);
                    setControlledCameraConfig(cameraPositions[0]);
                }

                if (buildingConfig.defaultDisplayConfiguration.fontSizeInMeters) {
                    setFontSizeInMeters(buildingConfig.defaultDisplayConfiguration.fontSizeInMeters);
                }
            }

            setApartmentBboxMin(buildingConfig.buildingModel.apartmentBboxMin);
            setApartmentBboxMax(buildingConfig.buildingModel.apartmentBboxMax);
            buildingConfig.buildingModel.basePlaneYOffset && setBasePlaneYOffset(buildingConfig.buildingModel.basePlaneYOffset);

            if (buildingConfig.distanceMaps) {
                buildingConfig.distanceMaps.amountOfSlices && setDistanceMapHeightSlices(buildingConfig.distanceMaps.amountOfSlices);
            }
        };

        if (availableBuildingModels.length !== 0) {
            fetchDataForSelectedBuildingModel();
        } else {
            fetchAvailableBuildingModels();
        }
    }, [availableBuildingModels, selectedBuildingModelIndex]);

    const getHistoricalDataDate = (): DateTime => {
        if (samplingMode === 'none') {
            return historicalDataDatetime.endOf('day');
        } else {
            return historicalDataDatetime.endOf(samplingMode.unit);
        }
    };

    const getHistoricalDataDuration = (): Duration | DurationObject => {
        if (samplingMode === 'none') {
            return { hours: 24 };
        } else {
            switch (samplingMode.unit) {
                case 'years':
                    return { years: 4 };
                case 'months':
                    return { months: 12 };
                case 'weeks':
                    return { weeks: 10 };
                case 'days':
                    return { days: 14 };
                case 'hours':
                    return { hours: 48 };
                case 'minutes':
                    return { hours: 2 };
            }
        }
    };

    let animationDatetimesMarks;

    const minStep =
        samplingMode === 'none'
            ? historicalDataDatetime.startOf('day').toMillis()
            : getHistoricalDataDate().minus(getHistoricalDataDuration()).toMillis();
    const maxStep =
        samplingMode === 'none' ? historicalDataDatetime.endOf('day').toMillis() : getHistoricalDataDate().endOf('day').toMillis();

    let stepDuration: DurationObject;
    if (samplingMode === 'none') {
        stepDuration = { hours: 1 };
    } else {
        switch (samplingMode.unit) {
            case 'years':
                stepDuration = { years: 1 };
                break;
            case 'months':
                stepDuration = { months: 1 };
                break;
            case 'weeks':
                stepDuration = { weeks: 1 };
                break;
            case 'days':
                stepDuration = { days: 1 };
                break;
            case 'hours':
                stepDuration = { hours: 1 };
                break;
            case 'minutes':
                stepDuration = { hours: 1 };
                break;
        }
    }

    let markFormat = 'HH';
    if (samplingMode !== 'none') {
        switch (samplingMode.unit) {
            case 'years':
                markFormat = 'yy';
                break;
            case 'months':
                markFormat = 'LL.';
                break;
            case 'weeks':
                markFormat = 'WW';
                break;
            case 'days':
                markFormat = 'dd.';
                break;
            case 'hours':
                markFormat = 'HH';
                break;
            case 'minutes':
                markFormat = 'mm';
                break;
        }
    }

    const intermediateSteps = [];
    for (
        let step = DateTime.fromMillis(minStep).plus(stepDuration).toMillis();
        step < DateTime.fromMillis(maxStep).toMillis();
        step = DateTime.fromMillis(step).plus(stepDuration).toMillis()
    ) {
        intermediateSteps.push(step);
    }
    animationDatetimesMarks = [minStep, ...intermediateSteps, maxStep].map((millis) => ({
        value: millis,
        label: DateTime.fromMillis(millis + 1).toFormat(markFormat),
    })) as Mark[];

    const [collapsedSettings, setCollapsedSettings] = React.useState({
        buildingModel: false,
        dataToDisplay: true,
        shadowRendering: true,
        surfaceBasedSensorDataVisualization: true,
        volumeBasedSensorDataVisualization: true,
        labels: true,
        outlineRenderingAndSSAO: true,
        colorScaleConfiguration: true,
        interactions: true,
        cameraPosition: true,
        sensorDistanceMaps: true,
    });

    let sampledCustomTransparencyTransferFunctionPoints = undefined as [number, number][] | undefined;
    // TODO: Set sampledCustomTransparencyTransferFunctionPoints to undefined if the customVolumeTransparencyTransferFunction cannot be evaluated!
    sampledCustomTransparencyTransferFunctionPoints = [...Array(volumeTransparencyTransferFunctionSamples).keys()].map((index) => {
        const x = index / (volumeTransparencyTransferFunctionSamples - 1);
        try {
            return [x, evaluate(customVolumeTransparencyTransferFunction, { x }) as number];
        } catch {
            return [x, 0.5];
        }
    });

    const DebugControls = (
        <section className="mt-4">
            <div className="row mb-2">
                <div className="col">
                    <h5 className="h6">
                        <em>B. König, D. Limberger, J. Klimke, B. Hagedorn, and J. Döllner</em>
                    </h5>
                </div>
            </div>
            <div className="row mb-2">
                <div className="col">
                    <h2 className="h4">RoomCanvas: A Visualization System for Spatiotemporal Temperature Data in Smart Homes</h2>
                </div>
            </div>
            {selectedBuildingModelIndex === undefined && (
                <div className="row mb-3">
                    <div className="col-12 control-group">
                        <h3 className="h5">
                            <a
                                href="#"
                                onClick={(event) => {
                                    event.preventDefault();
                                    setCollapsedSettings({ ...collapsedSettings, buildingModel: !collapsedSettings.buildingModel });
                                }}
                            >
                                Building model{' '}
                                <button
                                    className="btn btn-link color-dark ml-2"
                                    onClick={(event) => {
                                        event.preventDefault();
                                        setCollapsedSettings({ ...collapsedSettings, buildingModel: !collapsedSettings.buildingModel });
                                    }}
                                >
                                    {collapsedSettings.buildingModel ? '▸' : '▾'}
                                </button>
                            </a>
                        </h3>
                        <div className={`collapse ${!collapsedSettings.buildingModel && 'show'}`}>
                            <Select
                                isMulti={false}
                                name="select-building-model"
                                className="basic-multi-select"
                                classNamePrefix="select"
                                options={availableBuildingModels.map(({ id, label }) => ({ value: id, label }))}
                                value={
                                    selectedBuildingModelIndex
                                        ? {
                                              value: selectedBuildingModelIndex,
                                              label: availableBuildingModels[selectedBuildingModelIndex].label,
                                          }
                                        : undefined
                                }
                                onChange={(selectedBuildingModel) =>
                                    selectedBuildingModel
                                        ? setSelectedBuildingModelIndex(selectedBuildingModel.value)
                                        : setSelectedBuildingModelIndex(undefined)
                                }
                            />
                        </div>
                    </div>
                </div>
            )}
            <div className="row mb-3">
                <div className="col-12 control-group">
                    <h3 className="h5">
                        <a
                            href="#"
                            onClick={(event) => {
                                event.preventDefault();
                                setCollapsedSettings({ ...collapsedSettings, dataToDisplay: !collapsedSettings.dataToDisplay });
                            }}
                        >
                            Data to display{' '}
                            <button
                                className="btn btn-link color-dark ml-2"
                                onClick={(event) => {
                                    event.preventDefault();
                                    setCollapsedSettings({ ...collapsedSettings, dataToDisplay: !collapsedSettings.dataToDisplay });
                                }}
                            >
                                {collapsedSettings.dataToDisplay ? '▸' : '▾'}
                            </button>
                        </a>
                    </h3>
                    <div className={`collapse ${!collapsedSettings.dataToDisplay && 'show'}`}>
                        {!KIOSK_MODE && (
                            <div className="form-group row mt-3">
                                <label htmlFor="display-data-mode" className="col-sm-8 col-form-label">
                                    Choose between live/historical/mocked data:
                                </label>
                                <div className="col-sm-4">
                                    <select
                                        disabled={rendererIsLoading}
                                        className="form-control"
                                        id="display-data-mode"
                                        value={displayDataMode}
                                        onChange={(event) => setDisplayDataMode(event.target.value as DisplayDataMode)}
                                    >
                                        {[
                                            { mode: 'live', available: false },
                                            { mode: 'historical', available: true },
                                            { mode: 'mocked', available: true },
                                        ].map(({ mode, available }) => (
                                            <option disabled={!available} value={mode} key={`mode__${mode}`}>
                                                {mode}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}
                        {displayDataMode === 'live' && undefined}
                        {displayDataMode === 'historical' && (
                            <>
                                <div className="form-group row mt-3">
                                    <label htmlFor="sampling-mode" className="col-sm-5 col-form-label">
                                        Sampling rate:
                                    </label>
                                    <div className="col-sm-7">
                                        <select
                                            disabled={rendererIsLoading}
                                            className="form-control"
                                            id="sampling-mode"
                                            value={samplingMode !== 'none' ? `${samplingMode.rate}_${samplingMode.unit}` : 'all'}
                                            onChange={(event) => {
                                                if (event.target.value !== 'none') {
                                                    setSamplingMode(
                                                        availableSamplingModes.find((mode) => {
                                                            if (mode && mode !== 'none') {
                                                                return (
                                                                    mode.rate === parseInt(event.target.value.split('_')[0], 10) &&
                                                                    mode.unit === event.target.value.split('_')[1]
                                                                );
                                                            }
                                                            return false;
                                                        }) || 'none',
                                                    );
                                                } else {
                                                    setSamplingMode('none');
                                                }
                                                setTimeSliderUsed(false);
                                            }}
                                        >
                                            {['none', ...availableSamplingModes].map((mode) => {
                                                if (mode !== 'none') {
                                                    const { rate, unit } = mode as {
                                                        rate: number;
                                                        unit: 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years';
                                                    };
                                                    return (
                                                        <option value={`${rate}_${unit}`} key={`mode__${rate}_${unit}`}>
                                                            {rate} {rate > 1 ? unit : unit.slice(0, -1)}
                                                        </option>
                                                    );
                                                } else {
                                                    return (
                                                        <option value="none" key={`mode__none`}>
                                                            All values
                                                        </option>
                                                    );
                                                }
                                            })}
                                        </select>
                                    </div>
                                </div>
                                <div className="form-group row mt-3">
                                    <label htmlFor="historical-data-date" className="col-sm-5 col-form-label">
                                        Show data of this date:
                                    </label>
                                    <div className="col-sm-7">
                                        <DatePicker
                                            disabled={rendererIsLoading}
                                            className="form-control"
                                            id="historical-data-date"
                                            selected={historicalDataDatetime.toJSDate()}
                                            onChange={(date: Date) => {
                                                setAnimationDataDatetime(undefined);
                                                setHistoricalDataDatetime(DateTime.fromJSDate(date));
                                                setTimeSliderUsed(false);
                                            }}
                                            wrapperClassName="w-100"
                                            // TODO: Get this selectable start date dynamically, preferrably from TASA API
                                            minDate={new Date(2020, 11, 1)}
                                            maxDate={new Date()} // max: current day
                                            popperPlacement="bottom-start"
                                            popperModifiers={{
                                                offset: {
                                                    enabled: true,
                                                    offset: '5px, 10px',
                                                },
                                                preventOverflow: {
                                                    enabled: true,
                                                    escapeWithReference: false,
                                                    boundariesElement: 'scrollParent',
                                                },
                                            }}
                                        />
                                    </div>
                                </div>
                                <div className="form-group row">
                                    <div className="col-sm-5">
                                        <button
                                            disabled={rendererIsLoading}
                                            type="button"
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => {
                                                if (animationTween !== undefined) {
                                                    const tween = animationTween;
                                                    tween.stop();
                                                    setAnimationTween(undefined);
                                                } else {
                                                    const startAt = {
                                                        date: minStep,
                                                    };
                                                    const tween = new Tween(startAt)
                                                        .to(
                                                            {
                                                                date: maxStep,
                                                            },
                                                            10000,
                                                        )
                                                        .easing(Easing.Linear.None)
                                                        .onUpdate((dateObject) => {
                                                            setAnimationDataDatetime(DateTime.fromMillis(dateObject.date));
                                                        })
                                                        .onStart(() => {
                                                            setAnimationTween(tween);
                                                        })
                                                        .onComplete(() => {
                                                            setAnimationTween(undefined);
                                                            setAnimationDataDatetime(undefined);
                                                        })
                                                        .onStop(() => {
                                                            setAnimationTween(undefined);
                                                        })
                                                        .start();
                                                }
                                            }}
                                        >
                                            {animationTween !== undefined ? '◾️ Stop' : '▶ Animate'}
                                        </button>
                                    </div>
                                    {!KIOSK_MODE && (
                                        <div className="col-sm-7">
                                            <div className="form-check">
                                                <input
                                                    type="checkbox"
                                                    className="form-check-input"
                                                    checked={historicalDataDatetimeSyncSun}
                                                    onChange={(event) => setHistoricalDataDatetimeSyncSun(event.target.checked)}
                                                    id="historical-data-date-influences-sun-datetime"
                                                />
                                                <label htmlFor="historical-data-date-influences-sun-datetime" className="form-check-label">
                                                    Sync with sun simulation
                                                </label>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="form-group row">
                                    <div className="col-sm-12">
                                        <StyledSlider
                                            className="form-control-range"
                                            track={false}
                                            min={minStep}
                                            max={maxStep}
                                            value={
                                                animationDataDatetime ? animationDataDatetime.toMillis() : historicalDataDatetime.toMillis()
                                            }
                                            onChange={(event, value) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                setAnimationDataDatetime(DateTime.fromMillis(value as number));
                                                setTimeSliderUsed(true);
                                            }}
                                            disabled={rendererIsLoading || animationTween !== undefined}
                                            marks={animationDatetimesMarks}
                                        />
                                    </div>
                                </div>
                                <div className="form-group row">
                                    <label htmlFor="asset-name" className="col-sm-5 col-form-label">
                                        Asset name:
                                    </label>
                                    <div className="col-sm-7">
                                        <input
                                            disabled={rendererIsLoading}
                                            id="asset-name"
                                            type="text"
                                            className="form-control"
                                            placeholder="Asset name"
                                            aria-label="Asset name"
                                            value={assetName}
                                            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setAssetName(event.target.value)}
                                        />
                                    </div>
                                </div>
                                {!KIOSK_MODE && (
                                    <div className="form-group row">
                                        <div className="col-sm-5">
                                            <div className="form-check">
                                                <input
                                                    type="checkbox"
                                                    className="form-check-input"
                                                    checked={show1stDerivative}
                                                    onChange={(event) => setShow1stDerivative(event.target.checked)}
                                                    id="historical-data-show-1st-derivative"
                                                />
                                                <label htmlFor="historical-data-show-1st-derivative" className="form-check-label">
                                                    Visualize 1<sup>st</sup> derivative
                                                </label>
                                            </div>
                                        </div>
                                        <div className="col-sm-7">
                                            <div className="form-check">
                                                <input
                                                    type="checkbox"
                                                    className="form-check-input"
                                                    checked={interpolateBetweenValues}
                                                    onChange={(event) => setInterpolateBetweenValues(event.target.checked)}
                                                    id="historical-data-interpolate-between-values"
                                                />
                                                <label htmlFor="historical-data-interpolate-between-values" className="form-check-label">
                                                    Interpolate between values
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                        {displayDataMode === 'mocked' && undefined}
                    </div>
                </div>
            </div>
            <div className="row mb-3">
                <div className="col-12 control-group">
                    <h3 className="h5">
                        <a
                            href="#"
                            onClick={(event) => {
                                event.preventDefault();
                                setCollapsedSettings({ ...collapsedSettings, shadowRendering: !collapsedSettings.shadowRendering });
                            }}
                        >
                            Shadow rendering{' '}
                            <button
                                className="btn btn-link color-dark ml-2"
                                onClick={(event) => {
                                    event.preventDefault();
                                    setCollapsedSettings({ ...collapsedSettings, shadowRendering: !collapsedSettings.shadowRendering });
                                }}
                            >
                                {collapsedSettings.shadowRendering ? '▸' : '▾'}
                            </button>
                        </a>
                    </h3>
                    <div className={`collapse ${!collapsedSettings.shadowRendering && 'show'}`}>
                        <div className="form-group row">
                            <div className="col">
                                <div className="form-check">
                                    <input
                                        disabled={rendererIsLoading}
                                        type="checkbox"
                                        className="form-check-input"
                                        checked={enableShadowMapping}
                                        onChange={(event) => {
                                            if (event.target.checked) {
                                                setEnableShadowMapping(true);
                                            } else {
                                                setEnableShadowMapping(false);
                                            }
                                        }}
                                        id="enable-shadow-rendering"
                                    />
                                    <label htmlFor="enable-shadow-rendering" className="form-check-label">
                                        Enable shadow rendering of approximated sun shadows
                                    </label>
                                </div>
                            </div>
                        </div>
                        {!KIOSK_MODE && (
                            <>
                                <div className="form-group row mt-3">
                                    <label htmlFor="datetime" className="col-sm-5 col-form-label">
                                        Date and time to visualize:
                                    </label>
                                    <div className="col-sm-7">
                                        {/* TODO: Replace this datetime-local with <DatePicker /> as well */}
                                        <input
                                            className="form-control"
                                            type="datetime-local"
                                            id="datetime"
                                            disabled={historicalDataDatetimeSyncSun}
                                            value={usedSunDatetime.toISO().substr(0, 16)}
                                            onChange={(event) => setSelectedDatetime(DateTime.fromISO(event.target.value))}
                                        />
                                    </div>
                                </div>
                                <div className="form-group row mt-3">
                                    {latitude && longitude ? (
                                        <>
                                            <div className="col-sm-6">
                                                <small>
                                                    ↑{' '}
                                                    {DateTime.fromISO(
                                                        SunCalc.getTimes(
                                                            usedSunDatetime.toJSDate(),
                                                            latitude,
                                                            longitude /* (34 + 10.32) */,
                                                        ).sunrise.toISOString(),
                                                    ).toISO()}
                                                    <br />
                                                </small>
                                            </div>
                                            <div className="col-sm-6">
                                                <small>
                                                    ↓{' '}
                                                    {DateTime.fromISO(
                                                        SunCalc.getTimes(
                                                            usedSunDatetime.toJSDate(),
                                                            latitude,
                                                            longitude /* (34 + 10.32) */,
                                                        ).sunset.toISOString(),
                                                    ).toISO()}
                                                    <br />
                                                </small>
                                            </div>
                                            <div className="col-sm-12">
                                                <small>
                                                    Sun altitude above the horizon:{' '}
                                                    {`${SunCalc.getPosition(
                                                        usedSunDatetime.toJSDate(),
                                                        latitude,
                                                        longitude,
                                                    ).altitude.toFixed(3)}rad`}{' '}
                                                    ={' '}
                                                    {`${(
                                                        (SunCalc.getPosition(usedSunDatetime.toJSDate(), latitude, longitude).altitude /
                                                            Math.PI) *
                                                        180
                                                    ).toFixed(3)}°`}
                                                    <br />
                                                </small>
                                            </div>
                                            <div className="col-sm-12">
                                                <small>
                                                    Sun azimuth:{' '}
                                                    {`${SunCalc.getPosition(
                                                        usedSunDatetime.toJSDate(),
                                                        latitude,
                                                        longitude,
                                                    ).azimuth.toFixed(3)}rad`}{' '}
                                                    ={' '}
                                                    {`${(
                                                        (SunCalc.getPosition(usedSunDatetime.toJSDate(), latitude, longitude).azimuth /
                                                            Math.PI) *
                                                        180
                                                    ).toFixed(3)}°`}
                                                    <br />
                                                </small>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="col-sm-12">
                                            <small>
                                                To calculate the sun position, (approximate) latitude and longitude coordinates for the
                                                building model have to be provided.
                                            </small>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
            <div className="row mb-3">
                <div className="col-12 control-group">
                    <h3 className="h5">
                        <a
                            href="#"
                            onClick={(event) => {
                                event.preventDefault();
                                setCollapsedSettings({
                                    ...collapsedSettings,
                                    surfaceBasedSensorDataVisualization: !collapsedSettings.surfaceBasedSensorDataVisualization,
                                });
                            }}
                        >
                            Surface-based sensor data visualization{' '}
                            <button
                                className="btn btn-link color-dark ml-2"
                                onClick={(event) => {
                                    event.preventDefault();
                                    setCollapsedSettings({
                                        ...collapsedSettings,
                                        surfaceBasedSensorDataVisualization: !collapsedSettings.surfaceBasedSensorDataVisualization,
                                    });
                                }}
                            >
                                {collapsedSettings.surfaceBasedSensorDataVisualization ? '▸' : '▾'}
                            </button>
                        </a>
                    </h3>
                    <div className={`collapse ${!collapsedSettings.surfaceBasedSensorDataVisualization && 'show'}`}>
                        <div className="form-group row">
                            <div className="col">
                                <div className="form-check">
                                    <input
                                        disabled={rendererIsLoading}
                                        type="checkbox"
                                        className="form-check-input"
                                        checked={enableSurfaceSensorDataVisualization}
                                        onChange={(event) => setEnableSurfaceSensorDataVisualization(event.target.checked)}
                                        id="enable-surface-based-visualization"
                                    />
                                    <label htmlFor="enable-surface-based-visualization" className="form-check-label">
                                        Enable surface-based sensor data visualization (on walls, floors, ceilings)
                                    </label>
                                </div>
                            </div>
                        </div>
                        <div className="form-group row">
                            <div className="col">
                                <div className="form-check">
                                    <input
                                        disabled={rendererIsLoading || !enableSurfaceSensorDataVisualization}
                                        type="checkbox"
                                        className="form-check-input"
                                        checked={visualizeOnAssetLevel}
                                        onChange={(event) => setVisualizeOnAssetLevel(event.target.checked)}
                                        id="visualize-on-asset-level"
                                    />
                                    <label htmlFor="visualize-on-asset-level" className="form-check-label">
                                        Visualize data on room level
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="row mb-3">
                <div className="col-12 control-group">
                    <h3 className="h5">
                        <a
                            href="#"
                            onClick={(event) => {
                                event.preventDefault();
                                setCollapsedSettings({
                                    ...collapsedSettings,
                                    volumeBasedSensorDataVisualization: !collapsedSettings.volumeBasedSensorDataVisualization,
                                });
                            }}
                        >
                            Volume-based sensor data visualization{' '}
                            <button
                                className="btn btn-link color-dark ml-2"
                                onClick={(event) => {
                                    event.preventDefault();
                                    setCollapsedSettings({
                                        ...collapsedSettings,
                                        volumeBasedSensorDataVisualization: !collapsedSettings.volumeBasedSensorDataVisualization,
                                    });
                                }}
                            >
                                {collapsedSettings.volumeBasedSensorDataVisualization ? '▸' : '▾'}
                            </button>
                        </a>
                    </h3>
                    <div className={`collapse ${!collapsedSettings.volumeBasedSensorDataVisualization && 'show'}`}>
                        <div className="form-group row">
                            <div className="col">
                                <div className="form-check">
                                    <input
                                        disabled={rendererIsLoading}
                                        type="checkbox"
                                        className="form-check-input"
                                        checked={enableVolumeSensorDataVisualization}
                                        onChange={(event) => setEnableVolumeSensorDataVisualization(event.target.checked)}
                                        id="enable-volume-based-visualization"
                                    />
                                    <label htmlFor="enable-volume-based-visualization" className="form-check-label">
                                        Enable volume-based sensor data visualization
                                    </label>
                                </div>
                            </div>
                        </div>
                        <div className="alert alert-info" role="alert">
                            You can click anywhere in the 3D scene to place <em>probes</em>. Those probes are spheres–with a diameter of 1
                            meter–in which the interpolated sensor values are visualized via volume rendering.
                        </div>
                        <div className="form-group row">
                            <label htmlFor="min-max-distance" className="col-sm-4 col-form-label">
                                Min/max distance:
                            </label>
                            <div className="col-sm-8">
                                <StyledSlider
                                    disabled={rendererIsLoading || !enableVolumeSensorDataVisualization}
                                    id="min-max-distance"
                                    className="form-control-range"
                                    track="normal"
                                    min={0}
                                    max={1}
                                    value={volumeVisibleDistances}
                                    onChange={(event, value) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        setVolumeVisibleDistances(value as [number, number]);
                                    }}
                                    step={0.0001}
                                />
                            </div>
                        </div>
                        <div className="form-group row mb-0">
                            <label htmlFor="volume-bbox-cube-x" className="col-sm-4 col-form-label">
                                Cube Slicing [x]:
                            </label>
                            <div className="col-sm-8">
                                <StyledSlider
                                    disabled={rendererIsLoading || !enableVolumeSensorDataVisualization}
                                    id="volume-bbox-cube-x"
                                    className="form-control-range"
                                    track="normal"
                                    min={0}
                                    max={1}
                                    value={[volumeBboxCubeMin[0], volumeBboxCubeMax[0]]}
                                    onChange={(event, value) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        setVolumeBboxCubeMin([(value as [number, number])[0], volumeBboxCubeMin[1], volumeBboxCubeMin[2]]);
                                        setVolumeBboxCubeMax([(value as [number, number])[1], volumeBboxCubeMax[1], volumeBboxCubeMax[2]]);
                                    }}
                                    step={0.0001}
                                />
                            </div>
                        </div>
                        <div className="form-group row mb-0">
                            <label htmlFor="volume-bbox-cube-y" className="col-sm-4 col-form-label">
                                Cube Slicing [y]:
                            </label>
                            <div className="col-sm-8">
                                <StyledSlider
                                    disabled={rendererIsLoading || !enableVolumeSensorDataVisualization}
                                    id="volume-bbox-cube-y"
                                    className="form-control-range"
                                    track="normal"
                                    min={0}
                                    max={1}
                                    value={[volumeBboxCubeMin[1], volumeBboxCubeMax[1]]}
                                    onChange={(event, value) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        setVolumeBboxCubeMin([volumeBboxCubeMin[0], (value as [number, number])[0], volumeBboxCubeMin[2]]);
                                        setVolumeBboxCubeMax([volumeBboxCubeMax[0], (value as [number, number])[1], volumeBboxCubeMax[2]]);
                                    }}
                                    step={0.0001}
                                />
                            </div>
                        </div>
                        <div className="form-group row">
                            <label htmlFor="volume-bbox-cube-z" className="col-sm-4 col-form-label">
                                Cube Slicing [z]:
                            </label>
                            <div className="col-sm-8">
                                <StyledSlider
                                    disabled={rendererIsLoading || !enableVolumeSensorDataVisualization}
                                    id="volume-bbox-cube-z"
                                    className="form-control-range"
                                    track="normal"
                                    min={0}
                                    max={1}
                                    value={[volumeBboxCubeMin[2], volumeBboxCubeMax[2]]}
                                    onChange={(event, value) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        setVolumeBboxCubeMin([volumeBboxCubeMin[0], volumeBboxCubeMin[1], (value as [number, number])[0]]);
                                        setVolumeBboxCubeMax([volumeBboxCubeMax[0], volumeBboxCubeMax[1], (value as [number, number])[1]]);
                                    }}
                                    step={0.0001}
                                />
                            </div>
                        </div>
                        {!KIOSK_MODE && (
                            <div className="row mt-1">
                                <div className="col-12">
                                    <h4 className="h5">Transparency Transfer Function</h4>
                                </div>
                                <div className="col-12">
                                    <div className="form-group row">
                                        <div className="col">
                                            <div className="form-check">
                                                <input
                                                    disabled={rendererIsLoading || !enableVolumeSensorDataVisualization}
                                                    type="checkbox"
                                                    className="form-check-input"
                                                    checked={enableVolumeTransparencyTransferFunction}
                                                    onChange={(event) => setEnableVolumeTransparencyTransferFunction(event.target.checked)}
                                                    id="enable-volume-transparency-transfer-function"
                                                />
                                                <label htmlFor="enable-volume-transparency-transfer-function" className="form-check-label">
                                                    Enable transparency transfer function for volume rendering
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="col-12">
                                    <div className="form-group row">
                                        <label htmlFor="custom-volume-transparency-transfer-function" className="col-sm-12 col-form-label">
                                            Custom transparency transfer function:
                                        </label>
                                        <div className="col-sm-12">
                                            <input
                                                disabled={
                                                    rendererIsLoading ||
                                                    !enableVolumeSensorDataVisualization ||
                                                    !enableVolumeTransparencyTransferFunction
                                                }
                                                id="custom-volume-transparency-transfer-function"
                                                type="text"
                                                className="form-control"
                                                placeholder="Definition of a function f(x)"
                                                aria-label="Definition of a function f(x)"
                                                value={customVolumeTransparencyTransferFunction}
                                                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                                                    // TODO: Add validation/checking whether it is a proper, evaluate-able function f(x)
                                                    setCustomVolumeTransparencyTransferFunction(event.target.value);
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="col-12">
                                    <div className="form-group row">
                                        <label htmlFor="volume-transparency-transfer-function-samples" className="col-sm-5 col-form-label">
                                            Amount of samples:
                                        </label>
                                        <div className="col-sm-7">
                                            <input
                                                disabled={
                                                    rendererIsLoading ||
                                                    !enableVolumeSensorDataVisualization ||
                                                    !enableVolumeTransparencyTransferFunction
                                                }
                                                type="number"
                                                min="1"
                                                className="form-control"
                                                id="volume-transparency-transfer-function-samples"
                                                value={volumeTransparencyTransferFunctionSamples}
                                                onChange={(event) =>
                                                    Number(event.target.value) !== 0
                                                        ? setVolumeTransparencyTransferFunctionSamples(Number(event.target.value))
                                                        : undefined
                                                }
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="col-12">
                                    <FunctionPlot
                                        options={{
                                            target: 'noop',
                                            width: 320,
                                            height: 300,
                                            yAxis: {
                                                domain: [0, 1],
                                                label: 'Opacity [0..1]',
                                            },
                                            xAxis: {
                                                domain: [0, 1],
                                                label: 'Temperature [°C]',
                                            },
                                            tip: {
                                                xLine: true,
                                                yLine: true,
                                            },
                                            data: [
                                                sampledCustomTransparencyTransferFunctionPoints
                                                    ? {
                                                          points: sampledCustomTransparencyTransferFunctionPoints,
                                                          fnType: 'points',
                                                          graphType: 'scatter',
                                                      }
                                                    : {},
                                                {
                                                    fn: customVolumeTransparencyTransferFunction,
                                                    skipTip: true,
                                                    closed: true,
                                                },
                                            ],
                                        }}
                                        tickFormat={(d: number) => {
                                            return `${sensorMinValue + (sensorMaxValue - sensorMinValue) * d}`;
                                        }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <div className="row mb-3">
                <div className="col-12 control-group">
                    <h3 className="h5">
                        <a
                            href="#"
                            onClick={(event) => {
                                event.preventDefault();
                                setCollapsedSettings({ ...collapsedSettings, labels: !collapsedSettings.labels });
                            }}
                        >
                            Labels{' '}
                            <button
                                className="btn btn-link color-dark ml-2"
                                onClick={(event) => {
                                    event.preventDefault();
                                    setCollapsedSettings({ ...collapsedSettings, labels: !collapsedSettings.labels });
                                }}
                            >
                                {collapsedSettings.labels ? '▸' : '▾'}
                            </button>
                        </a>
                    </h3>
                    <div className={`collapse ${!collapsedSettings.labels && 'show'}`}>
                        <div className="form-group row">
                            <div className="col">
                                <div className="form-check">
                                    <input
                                        disabled={rendererIsLoading}
                                        type="checkbox"
                                        className="form-check-input"
                                        checked={enableMetadataAndColorScaleLabelling}
                                        onChange={(event) => setEnableMetadataAndColorScaleLabelling(event.target.checked)}
                                        id="enable-metadata-and-color-scale-labelling"
                                    />
                                    <label htmlFor="enable-metadata-and-color-scale-labelling" className="form-check-label">
                                        Enable metadata and color scale labelling
                                    </label>
                                </div>
                            </div>
                        </div>
                        <div className="form-group row">
                            <div className="col">
                                <div className="form-check">
                                    <input
                                        disabled={rendererIsLoading}
                                        type="checkbox"
                                        className="form-check-input"
                                        checked={enableSensorIcons}
                                        onChange={(event) => setEnableSensorIcons(event.target.checked)}
                                        id="enable-sensor-icons"
                                    />
                                    <label htmlFor="enable-sensor-icons" className="form-check-label">
                                        Enable sensor icons
                                    </label>
                                </div>
                            </div>
                        </div>
                        <div className="form-group row">
                            <div className="col">
                                <div className="form-check">
                                    <input
                                        disabled={rendererIsLoading}
                                        type="checkbox"
                                        className="form-check-input"
                                        checked={sensorValueLabelsConfig.displayLabels}
                                        onChange={(event) =>
                                            setSensorValueLabelsConfig({ ...sensorValueLabelsConfig, displayLabels: event.target.checked })
                                        }
                                        id="enable-sensor-value-labels"
                                    />
                                    <label htmlFor="enable-sensor-value-labels" className="form-check-label">
                                        Enable sensor value labels
                                    </label>
                                </div>
                            </div>
                        </div>
                        {!KIOSK_MODE && (
                            <>
                                <div className="form-group row">
                                    <div className="col">
                                        <div className="form-check">
                                            <input
                                                disabled={rendererIsLoading || !sensorValueLabelsConfig.displayLabels}
                                                type="checkbox"
                                                className="form-check-input"
                                                checked={sensorValueLabelsConfig.approximateOptimalLabellingPositions}
                                                onChange={(event) =>
                                                    setSensorValueLabelsConfig({
                                                        ...sensorValueLabelsConfig,
                                                        approximateOptimalLabellingPositions: event.target.checked,
                                                    })
                                                }
                                                id="approximate-optimal-labelling-positions"
                                            />
                                            <label htmlFor="approximate-optimal-labelling-positions" className="form-check-label">
                                                Approximate optimal labelling positions
                                            </label>
                                        </div>
                                    </div>
                                </div>
                                <div className="form-group row">
                                    <div className="col-12">
                                        <h4 className="h5">Filtering conditions:</h4>
                                    </div>
                                    <div className="col">
                                        <div className="form-check">
                                            <input
                                                disabled={
                                                    rendererIsLoading ||
                                                    !sensorValueLabelsConfig.displayLabels ||
                                                    !sensorValueLabelsConfig.approximateOptimalLabellingPositions
                                                }
                                                type="checkbox"
                                                className="form-check-input"
                                                checked={sensorValueLabelsConfig.labellingAlgorithmConfig.filtering.mustFaceCamera}
                                                onChange={(event) =>
                                                    setSensorValueLabelsConfig({
                                                        ...sensorValueLabelsConfig,
                                                        labellingAlgorithmConfig: {
                                                            ...sensorValueLabelsConfig.labellingAlgorithmConfig,
                                                            filtering: {
                                                                ...sensorValueLabelsConfig.labellingAlgorithmConfig.filtering,
                                                                mustFaceCamera: event.target.checked,
                                                            },
                                                        },
                                                    })
                                                }
                                                id="labelling-algorithm-config--must-face-camera"
                                            />
                                            <label
                                                htmlFor="labelling-algorithm-config--must-face-camera"
                                                className="form-check-label small"
                                            >
                                                Must face camera
                                            </label>
                                        </div>
                                    </div>
                                    <div className="col">
                                        <div className="form-check">
                                            <input
                                                disabled={
                                                    rendererIsLoading ||
                                                    !sensorValueLabelsConfig.displayLabels ||
                                                    !sensorValueLabelsConfig.approximateOptimalLabellingPositions
                                                }
                                                type="checkbox"
                                                className="form-check-input"
                                                checked={sensorValueLabelsConfig.labellingAlgorithmConfig.filtering.mustBeInsideViewport}
                                                onChange={(event) =>
                                                    setSensorValueLabelsConfig({
                                                        ...sensorValueLabelsConfig,
                                                        labellingAlgorithmConfig: {
                                                            ...sensorValueLabelsConfig.labellingAlgorithmConfig,
                                                            filtering: {
                                                                ...sensorValueLabelsConfig.labellingAlgorithmConfig.filtering,
                                                                mustBeInsideViewport: event.target.checked,
                                                            },
                                                        },
                                                    })
                                                }
                                                id="labelling-algorithm-config--must-be-inside-viewport"
                                            />
                                            <label
                                                htmlFor="labelling-algorithm-config--must-be-inside-viewport"
                                                className="form-check-label small"
                                            >
                                                Must be inside viewport
                                            </label>
                                        </div>
                                    </div>
                                    <div className="col">
                                        <div className="form-check">
                                            <input
                                                disabled={
                                                    rendererIsLoading ||
                                                    !sensorValueLabelsConfig.displayLabels ||
                                                    !sensorValueLabelsConfig.approximateOptimalLabellingPositions
                                                }
                                                type="checkbox"
                                                className="form-check-input"
                                                checked={
                                                    sensorValueLabelsConfig.labellingAlgorithmConfig.filtering.mustNotBeBehindObstacles
                                                }
                                                onChange={(event) =>
                                                    setSensorValueLabelsConfig({
                                                        ...sensorValueLabelsConfig,
                                                        labellingAlgorithmConfig: {
                                                            ...sensorValueLabelsConfig.labellingAlgorithmConfig,
                                                            filtering: {
                                                                ...sensorValueLabelsConfig.labellingAlgorithmConfig.filtering,
                                                                mustNotBeBehindObstacles: event.target.checked,
                                                            },
                                                        },
                                                    })
                                                }
                                                id="labelling-algorithm-config--must-not-be-behind-obstacles"
                                            />
                                            <label
                                                htmlFor="labelling-algorithm-config--must-not-be-behind-obstacles"
                                                className="form-check-label small"
                                            >
                                                Must not be behind obstacles
                                            </label>
                                        </div>
                                    </div>
                                    <div className="col">
                                        <div className="form-check">
                                            <input
                                                disabled={
                                                    rendererIsLoading ||
                                                    !sensorValueLabelsConfig.displayLabels ||
                                                    !sensorValueLabelsConfig.approximateOptimalLabellingPositions
                                                }
                                                type="checkbox"
                                                className="form-check-input"
                                                checked={sensorValueLabelsConfig.labellingAlgorithmConfig.filtering.mustNotBeUpsideDown}
                                                onChange={(event) =>
                                                    setSensorValueLabelsConfig({
                                                        ...sensorValueLabelsConfig,
                                                        labellingAlgorithmConfig: {
                                                            ...sensorValueLabelsConfig.labellingAlgorithmConfig,
                                                            filtering: {
                                                                ...sensorValueLabelsConfig.labellingAlgorithmConfig.filtering,
                                                                mustNotBeUpsideDown: event.target.checked,
                                                            },
                                                        },
                                                    })
                                                }
                                                id="labelling-algorithm-config--must-not-be-upside-down"
                                            />
                                            <label
                                                htmlFor="labelling-algorithm-config--must-not-be-upside-down"
                                                className="form-check-label small"
                                            >
                                                Must not be upside down
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
            <div className="row mb-3">
                <div className="col-12 control-group">
                    <h3 className="h5">
                        <a
                            href="#"
                            onClick={(event) => {
                                event.preventDefault();
                                setCollapsedSettings({
                                    ...collapsedSettings,
                                    outlineRenderingAndSSAO: !collapsedSettings.outlineRenderingAndSSAO,
                                });
                            }}
                        >
                            Outline rendering &amp; SSAO{' '}
                            <button
                                className="btn btn-link color-dark ml-2"
                                onClick={(event) => {
                                    event.preventDefault();
                                    setCollapsedSettings({
                                        ...collapsedSettings,
                                        outlineRenderingAndSSAO: !collapsedSettings.outlineRenderingAndSSAO,
                                    });
                                }}
                            >
                                {collapsedSettings.outlineRenderingAndSSAO ? '▸' : '▾'}
                            </button>
                        </a>
                    </h3>
                    <div className={`collapse ${!collapsedSettings.outlineRenderingAndSSAO && 'show'}`}>
                        <div className="form-group row">
                            <div className="col">
                                <div className="form-check">
                                    <input
                                        disabled={rendererIsLoading}
                                        type="checkbox"
                                        className="form-check-input"
                                        checked={enableEdgeOutlineRendering}
                                        onChange={(event) => setEnableEdgeOutlineRendering(event.target.checked)}
                                        id="enable-outline-rendering"
                                    />
                                    <label htmlFor="enable-outline-rendering" className="form-check-label">
                                        Enable outline rendering
                                    </label>
                                </div>
                            </div>
                        </div>
                        <div className="form-group row">
                            <div className="col">
                                <div className="form-check">
                                    <input
                                        disabled={rendererIsLoading}
                                        type="checkbox"
                                        className="form-check-input"
                                        checked={enableSSAO}
                                        onChange={(event) => setEnableSSAO(event.target.checked)}
                                        id="enable-ssao"
                                    />
                                    <label htmlFor="enable-ssao" className="form-check-label">
                                        Enable Screen-Space Ambient Occlusion (SSAO)
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="row mb-3">
                <div className="col-12 control-group">
                    <h3 className="h5">
                        <a
                            href="#"
                            onClick={(event) => {
                                event.preventDefault();
                                setCollapsedSettings({
                                    ...collapsedSettings,
                                    colorScaleConfiguration: !collapsedSettings.colorScaleConfiguration,
                                });
                            }}
                        >
                            Color scale configuration{' '}
                            <button
                                className="btn btn-link color-dark ml-2"
                                onClick={(event) => {
                                    event.preventDefault();
                                    setCollapsedSettings({
                                        ...collapsedSettings,
                                        colorScaleConfiguration: !collapsedSettings.colorScaleConfiguration,
                                    });
                                }}
                            >
                                {collapsedSettings.colorScaleConfiguration ? '▸' : '▾'}
                            </button>
                        </a>
                    </h3>
                    <div className={`collapse ${!collapsedSettings.colorScaleConfiguration && 'show'}`}>
                        <div className="form-group row mt-3">
                            <label htmlFor="color-scale-preset" className="col-sm-5 col-form-label">
                                Color scale:
                            </label>
                            <div className="col-sm-7">
                                <select
                                    disabled={rendererIsLoading}
                                    className="form-control"
                                    id="color-scale-preset"
                                    value={selectedColorScaleId}
                                    onChange={(event) => setSelectedColorScaleId(Number(event.target.value))}
                                >
                                    {colorScalePresets.map(([type, presetIdentifier], index) => (
                                        <option value={index} key={`${type}__${presetIdentifier}`}>
                                            {type}
                                            __
                                            {presetIdentifier}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="form-group row">
                            <div className="col-sm-7 offset-sm-5">
                                <div className="form-check">
                                    <input
                                        disabled={rendererIsLoading}
                                        type="checkbox"
                                        className="form-check-input"
                                        checked={invertColorScale}
                                        onChange={(event) => setInvertColorScale(event.target.checked)}
                                        id="invert-color-scale"
                                    />
                                    <label htmlFor="invert-color-scale" className="form-check-label">
                                        Invert color scale
                                    </label>
                                </div>
                            </div>
                        </div>
                        <div className="form-group row">
                            <label htmlFor="color-scale-stops" className="col-sm-5 col-form-label">
                                Amount of color stops:
                            </label>
                            <div className="col-sm-7">
                                <input
                                    disabled={rendererIsLoading}
                                    type="number"
                                    min="1"
                                    className="form-control"
                                    id="color-scale-stops"
                                    value={colorScaleStops}
                                    onChange={(event) =>
                                        Number(event.target.value) !== 0 ? setColorScaleStops(Number(event.target.value)) : undefined
                                    }
                                />
                            </div>
                        </div>
                        <div className="form-group row">
                            <div className="col-sm-7 offset-sm-5">
                                <div className="form-check">
                                    <input
                                        disabled={rendererIsLoading}
                                        type="checkbox"
                                        className="form-check-input"
                                        checked={useLinearColorInterpolation}
                                        onChange={(event) => setUseLinearColorInterpolation(event.target.checked)}
                                        id="use-linear-color-scale-filtering"
                                    />
                                    <label htmlFor="use-linear-color-scale-filtering" className="form-check-label">
                                        Smooth interpolation (LINEAR)
                                    </label>
                                </div>
                            </div>
                        </div>
                        {!KIOSK_MODE && (
                            <div className="form-group row">
                                <label htmlFor="sensor-min-value" className="col-sm-2 col-form-label">
                                    Min:
                                </label>
                                <div className="col-sm-4">
                                    <input
                                        type="number"
                                        className="form-control"
                                        id="sensor-min-value"
                                        value={sensorMinValue}
                                        max={sensorMaxValue - 1}
                                        onChange={(event) => setSensorMinValue(Number(event.target.value))}
                                    />
                                </div>
                                <label htmlFor="sensor-max-value" className="col-sm-2 col-form-label">
                                    Max:
                                </label>
                                <div className="col-sm-4">
                                    <input
                                        type="number"
                                        className="form-control"
                                        id="sensor-max-value"
                                        value={sensorMaxValue}
                                        min={sensorMinValue + 1}
                                        onChange={(event) => setSensorMaxValue(Number(event.target.value))}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <div className="row mb-3">
                <div className="col-12 control-group">
                    <h3 className="h5">
                        <a
                            href="#"
                            onClick={(event) => {
                                event.preventDefault();
                                setCollapsedSettings({
                                    ...collapsedSettings,
                                    interactions: !collapsedSettings.interactions,
                                });
                            }}
                        >
                            Interactions{' '}
                            <button
                                className="btn btn-link color-dark ml-2"
                                onClick={(event) => {
                                    event.preventDefault();
                                    setCollapsedSettings({
                                        ...collapsedSettings,
                                        interactions: !collapsedSettings.interactions,
                                    });
                                }}
                            >
                                {collapsedSettings.interactions ? '▸' : '▾'}
                            </button>
                        </a>
                    </h3>
                    <div className={`collapse ${!collapsedSettings.interactions && 'show'}`}>
                        <div className="form-group row">
                            <div className="col">
                                <div className="form-check">
                                    <input
                                        type="checkbox"
                                        className="form-check-input"
                                        checked={enableAssetHighlightingOnHover}
                                        onChange={(event) => {
                                            setEnableAssetHighlightingOnHover(event.target.checked);
                                        }}
                                        id="enable-asset-highlighting-on-hover"
                                    />
                                    <label htmlFor="enable-asset-highlighting-on-hover" className="form-check-label">
                                        Highlight assets (i.e., rooms) on hover
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="row mb-3">
                <div className="col-12 control-group">
                    <h3 className="h5">
                        <a
                            href="#"
                            onClick={(event) => {
                                event.preventDefault();
                                setCollapsedSettings({ ...collapsedSettings, cameraPosition: !collapsedSettings.cameraPosition });
                            }}
                        >
                            Camera position{' '}
                            <button
                                className="btn btn-link color-dark ml-2"
                                onClick={(event) => {
                                    event.preventDefault();
                                    setCollapsedSettings({ ...collapsedSettings, cameraPosition: !collapsedSettings.cameraPosition });
                                }}
                            >
                                {collapsedSettings.cameraPosition ? '▸' : '▾'}
                            </button>
                        </a>
                    </h3>
                    <div className={`collapse ${!collapsedSettings.cameraPosition && 'show'}`}>
                        <div className="form-group row">
                            <div className="col">
                                {storedCameraPositions.map((cameraPosition) => {
                                    return (
                                        <div className="form-check" key={cameraPosition.id}>
                                            <input
                                                disabled={rendererIsLoading}
                                                type="radio"
                                                className="form-check-input"
                                                name="camera-position-radio"
                                                checked={cameraPosition.id === selectedCameraPositionIndex}
                                                onChange={(event) => {
                                                    if (event.target.checked === true) {
                                                        setSelectedCameraPositionIndex(cameraPosition.id);
                                                        const oldCameraSettings = {
                                                            center: vec3.clone(cameraCenter),
                                                            eye: vec3.clone(cameraEye),
                                                            up: vec3.clone(cameraUp),
                                                        };
                                                        // TODO: Use quaternions (gl-matrix#quat) and slerp (gl-matrix#quat.slerp) here
                                                        // TODO: @see https://stackoverflow.com/a/41981610
                                                        new Tween(oldCameraSettings)
                                                            .to(
                                                                {
                                                                    center: storedCameraPositions[cameraPosition.id].center,
                                                                    eye: storedCameraPositions[cameraPosition.id].eye,
                                                                    up: storedCameraPositions[cameraPosition.id].up,
                                                                },
                                                                1400,
                                                            )
                                                            .easing(Easing.Quadratic.InOut)
                                                            .onUpdate((cameraSettings) => {
                                                                setControlledCameraConfig(cameraSettings);
                                                            })
                                                            .onStart((cameraSettings) => {
                                                                setControlledCameraConfig(cameraSettings);
                                                            })
                                                            .start();
                                                        // TODO: Ensure that manual camera interactions stop the running tween animation!
                                                    }
                                                }}
                                                id={`enable-camera-position-${cameraPosition.id}`}
                                            />
                                            <label htmlFor={`enable-camera-position-${cameraPosition.id}`} className="form-check-label">
                                                {cameraPosition.label}
                                            </label>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {!KIOSK_MODE && (
                <div className="row mb-3">
                    <div className="col-12 control-group">
                        <h3 className="h5">
                            <a
                                href="#"
                                onClick={(event) => {
                                    event.preventDefault();
                                    setCollapsedSettings({
                                        ...collapsedSettings,
                                        sensorDistanceMaps: !collapsedSettings.sensorDistanceMaps,
                                    });
                                }}
                            >
                                Sensor distance maps{' '}
                                <button
                                    className="btn btn-link color-dark ml-2"
                                    onClick={(event) => {
                                        event.preventDefault();
                                        setCollapsedSettings({
                                            ...collapsedSettings,
                                            sensorDistanceMaps: !collapsedSettings.sensorDistanceMaps,
                                        });
                                    }}
                                >
                                    {collapsedSettings.sensorDistanceMaps ? '▸' : '▾'}
                                </button>
                            </a>
                        </h3>
                        <div className={`collapse ${!collapsedSettings.sensorDistanceMaps && 'show'}`}>
                            <div className="form-group row">
                                <div className="col">
                                    <div className="form-check">
                                        <input
                                            type="checkbox"
                                            className="form-check-input"
                                            checked={useLowBitDistanceMap}
                                            onChange={(event) => setUseLowBitDistanceMap(event.target.checked)}
                                            id="use-low-bit-distance-map"
                                        />
                                        <label htmlFor="use-low-bit-distance-map" className="form-check-label">
                                            Use lower bit distance map as well
                                        </label>
                                    </div>
                                </div>
                            </div>
                            <div className="form-group row">
                                <div className="col">
                                    <div className="form-check">
                                        <input
                                            type="checkbox"
                                            className="form-check-input"
                                            checked={showGrid}
                                            onChange={(event) => setShowGrid(event.target.checked)}
                                            id="show-grid"
                                        />
                                        <label htmlFor="show-grid" className="form-check-label">
                                            Show a debug co-ordinate grid
                                        </label>
                                    </div>
                                </div>
                            </div>
                            <div className="form-group row">
                                <div className="col">
                                    <div className="form-check">
                                        <input
                                            type="checkbox"
                                            className="form-check-input"
                                            checked={enableSensorDistanceDebug}
                                            onChange={(event) => {
                                                if (event.target.checked === true && debugSensorIndices.length === 0) {
                                                    setDebugSensorIndices([344]);
                                                }
                                                setEnableSensorDistanceDebug(event.target.checked);
                                            }}
                                            id="enable-sensor-distance-debug"
                                        />
                                        <label htmlFor="enable-sensor-distance-debug" className="form-check-label">
                                            Debug visualize sensor distance maps
                                        </label>
                                    </div>
                                </div>
                            </div>
                            <div className="form-group row">
                                <div className="col">
                                    <Select
                                        isMulti={true}
                                        name="debug-sensor-indices"
                                        className="basic-multi-select"
                                        classNamePrefix="select"
                                        options={availableSensors}
                                        value={availableSensors.filter((sensor) => debugSensorIndices.includes(sensor.value))}
                                        onChange={(selectedSensors) =>
                                            selectedSensors === null || selectedSensors === undefined
                                                ? (() => {
                                                      setDebugSensorIndices([]);
                                                      setEnableSensorDistanceDebug(false);
                                                  })()
                                                : setDebugSensorIndices(selectedSensors.map((sensor) => sensor.value))
                                        }
                                    />
                                </div>
                            </div>
                            <div className="form-group row">
                                <div className="col">
                                    <div className="form-check">
                                        <input
                                            type="checkbox"
                                            className="form-check-input"
                                            checked={debugVisualizeSensorDistanceUsingColorMap}
                                            onChange={(event) => {
                                                setDebugVisualizeSensorDistanceUsingColorMap(event.target.checked);
                                            }}
                                            id="debug-visualize-sensor-distance-using-color-map"
                                        />
                                        <label htmlFor="debug-visualize-sensor-distance-using-color-map" className="form-check-label">
                                            Use color map instead of grayscale gradient
                                        </label>
                                    </div>
                                </div>
                            </div>
                            <div className="form-group row">
                                <label htmlFor="debug-max-sensor-distance" className="col-sm-6 col-form-label">
                                    Max distance to visualize [m]:
                                </label>
                                <div className="col-sm-6">
                                    <input
                                        type="number"
                                        min="0.5"
                                        step="0.5"
                                        className="form-control"
                                        id="debug-max-sensor-distance"
                                        value={debugMaxSensorDistance}
                                        onChange={(event) => setDebugMaxSensorDistance(Number(event.target.value))}
                                    />
                                </div>
                            </div>
                            <div className="form-group row">
                                <label className="col-12 col-form-label h6">Minimum filter (on distance map texture level):</label>
                                <div className="col-sm-6">
                                    <div className="form-check">
                                        <input
                                            type="checkbox"
                                            className="form-check-input"
                                            checked={debugUseDirectNeighborMinFilter}
                                            onChange={(event) => {
                                                setDebugUseDirectNeighborMinFilter(event.target.checked);
                                            }}
                                            id="debug-use-direct-neighbor-min-filter"
                                        />
                                        <label htmlFor="debug-use-direct-neighbor-min-filter" className="form-check-label">
                                            Direct neighbor interpolation
                                        </label>
                                    </div>
                                </div>
                                <div className="col-sm-6">
                                    <div className="form-check">
                                        <input
                                            type="checkbox"
                                            className="form-check-input"
                                            checked={debugUseDiagonalMinFilter}
                                            onChange={(event) => {
                                                setDebugUseDiagonalMinFilter(event.target.checked);
                                            }}
                                            id="debug-use-diagonal-neighbor-min-filter"
                                        />
                                        <label htmlFor="debug-use-diagonal-neighbor-min-filter" className="form-check-label">
                                            Diagonal neighbor interpolation
                                        </label>
                                    </div>
                                </div>
                            </div>
                            <div className="form-group row">
                                <label className="col-12 col-form-label h6">Texture coordinate offset [px]:</label>
                                <label htmlFor="debug-distance-map-coords-offset-factor-x" className="col-sm-1 col-form-label">
                                    x:
                                </label>
                                <div className="col-sm-3">
                                    <input
                                        type="number"
                                        step="0.5"
                                        className="form-control"
                                        id="debug-distance-map-coords-offset-factor-x"
                                        value={debugDistanceMapCoordsOffsetFactorX}
                                        onChange={(event) => {
                                            if (event.target.value === '') {
                                                setDebugDistanceMapCoordsOffsetFactorX(undefined);
                                            } else {
                                                setDebugDistanceMapCoordsOffsetFactorX(Number(event.target.value));
                                            }
                                        }}
                                    />
                                </div>
                                <label htmlFor="debug-distance-map-coords-offset-factor-y" className="col-sm-1 col-form-label">
                                    y:
                                </label>
                                <div className="col-sm-3">
                                    <input
                                        type="number"
                                        step="0.5"
                                        className="form-control"
                                        id="debug-distance-map-coords-offset-factor-y"
                                        value={debugDistanceMapCoordsOffsetFactorY}
                                        onChange={(event) => {
                                            if (event.target.value === '') {
                                                setDebugDistanceMapCoordsOffsetFactorY(undefined);
                                            } else {
                                                setDebugDistanceMapCoordsOffsetFactorY(Number(event.target.value));
                                            }
                                        }}
                                    />
                                </div>
                                <label htmlFor="debug-distance-map-coords-offset-factor-z" className="col-sm-1 col-form-label">
                                    z:
                                </label>
                                <div className="col-sm-3">
                                    <input
                                        type="number"
                                        step="0.5"
                                        className="form-control"
                                        id="debug-distance-map-coords-offset-factor-z"
                                        value={debugDistanceMapCoordsOffsetFactorZ}
                                        onChange={(event) => {
                                            if (event.target.value === '') {
                                                setDebugDistanceMapCoordsOffsetFactorZ(undefined);
                                            } else {
                                                setDebugDistanceMapCoordsOffsetFactorZ(Number(event.target.value));
                                            }
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );

    const getSunPosition = (): [number, number, number] | undefined => {
        if (!(latitude && longitude)) {
            return undefined;
        }

        const distance = distanceOfSunToSceneOrigin;

        /**
         * Blender sun_position plug-in follows NOAA:
         * > Azimuth is measured in degrees clockwise from _north_.
         * Suncalc npm module doesn’t:
         * > azimuth: sun azimuth in radians ([…], measured from _south_ to west), e.g. _0 is south_
         */
        let azimuthRadians = SunCalc.getPosition(usedSunDatetime.toJSDate(), latitude, longitude).azimuth;

        // Make the suncalc azimuth (0 at south) conform to NOAA/Blender convention (0 at north) by adding 180 degrees
        azimuthRadians += Math.PI;

        // Keep the azimuth within the [0..2 pi] range
        azimuthRadians %= 2 * Math.PI;

        // Add the configured (clockwise) north offset
        const azimuthOffsetRadians = azimuthRadians + northOffsetRadians;

        const altitudeRadians = SunCalc.getPosition(usedSunDatetime.toJSDate(), latitude, longitude).altitude;

        const theta = Math.PI / 2 - altitudeRadians;
        let phi = azimuthOffsetRadians * -1;

        const xBlender = Math.sin(phi) * Math.sin(-theta) * distance;
        const yBlender = Math.sin(theta) * Math.cos(phi) * distance;
        const zBlender = Math.cos(theta) * distance;

        return [xBlender, zBlender, -yBlender];
    };

    const onChangeCamera = (camera: Camera) => {
        if (controlledCameraConfig !== undefined) {
            return;
        }
        const matchingCameraPosition = storedCameraPositions.find((storedCamera) => {
            const distEye = vec3.distance(storedCamera.eye, camera.eye);
            const distCenter = vec3.distance(storedCamera.center, camera.center);
            const distUp = vec3.distance(storedCamera.up, camera.up);
            return distEye < 2 && distCenter < 2 && distUp < 2;
        });
        if (matchingCameraPosition) {
            setSelectedCameraPositionIndex(matchingCameraPosition.id);
        } else {
            setSelectedCameraPositionIndex((undefined as unknown) as number);
        }
        setCameraConfig({
            eye: camera.eye,
            center: camera.center,
            up: camera.up,
        });
        setControlledCameraConfig(undefined);
    };

    const TasaViewerAppInstance = buildingModelGltfUri ? (
        <TASAViewerApp
            buildingModelGltfUri={buildingModelGltfUri}
            buildingModelHierarchyGltfUri={buildingModelHierarchyGltfUri}
            labelFontFntUri={robotoLight}
            iconFontFntUri={customFont}
            sensorFontFntUri={sensorFont}
            sensorPositions={sensorPositions}
            cameraEye={controlledCameraConfig ? controlledCameraConfig.eye : undefined}
            cameraCenter={controlledCameraConfig ? controlledCameraConfig.center : undefined}
            cameraUp={controlledCameraConfig ? controlledCameraConfig.up : undefined}
            onChangeCamera={onChangeCamera}
            onHover={(hoverEvent) => {
                setHoverInformation(hoverEvent);
            }}
            onLoadingFinished={() => {
                setRendererIsLoading(false);
                setTimeSliderUsed(true);
            }}
            loadingIsFinished={!rendererIsLoading}
            visualizeOnAssetLevel={visualizeOnAssetLevel}
            useLowBitDistanceMap={useLowBitDistanceMap}
            samplingMode={samplingMode}
            showLabelsForSensorIds={labeledSensorIds}
            visualizeValuesForSensorIds={liveDataSensorIds}
            outsideTemperatureSensorId={outsideTemperatureSensorId}
            colorScaleConfiguration={{
                selectedColorScale: {
                    type: colorScalePresets[selectedColorScaleId][0],
                    presetIdentifier: colorScalePresets[selectedColorScaleId][1],
                },
                colorScaleStops,
                useLinearColorInterpolation,
                invertColorScale,
            }}
            sunPosition={getSunPosition()}
            sunIsUp={getSunPosition() !== undefined ? getSunPosition()![1] > 3 : undefined}
            enableShadowMapping={enableShadowMapping}
            enableSurfaceSensorDataVisualization={enableSurfaceSensorDataVisualization}
            enableVolumeSensorDataVisualization={enableVolumeSensorDataVisualization}
            enableVolumeTransparencyTransferFunction={enableVolumeTransparencyTransferFunction}
            sampledCustomTransparencyTransferFunctionPoints={sampledCustomTransparencyTransferFunctionPoints}
            debugSensorDistancesConfiguration={
                enableSensorDistanceDebug === true
                    ? {
                          enableDebug: true,
                          debugSensorIndices,
                          debugMaxSensorDistance,
                          debugUseDiagonalMinFilter,
                          debugUseDirectNeighborMinFilter,
                          debugVisualizeSensorDistanceUsingColorMap,
                          debugDistanceMapCoordsOffsetFactorX,
                          debugDistanceMapCoordsOffsetFactorY,
                          debugDistanceMapCoordsOffsetFactorZ,
                      }
                    : {
                          enableDebug: false,
                      }
            }
            visualizeDataForDatetimeMillis={
                displayDataMode === 'historical'
                    ? animationDataDatetime
                        ? animationDataDatetime.toMillis()
                        : historicalDataDatetime.toMillis()
                    : undefined
            }
            interpolateBetweenNearestValues={interpolateBetweenValues}
            show1stDerivative={show1stDerivative}
            sensorMinValue={sensorMinValue}
            sensorMaxValue={sensorMaxValue}
            showGrid={showGrid}
            enableEdgeOutlineRendering={enableEdgeOutlineRendering}
            enableSensorIcons={enableSensorIcons}
            enableMetadataAndColorScaleLabelling={enableMetadataAndColorScaleLabelling}
            enableAssetHighlightingOnHover={enableAssetHighlightingOnHover}
            sensorValueLabelsConfig={sensorValueLabelsConfig}
            volumeVisibleDistances={volumeVisibleDistances}
            volumeBboxCubeMin={volumeBboxCubeMin}
            volumeBboxCubeMax={volumeBboxCubeMax}
            distanceMapHeightSlices={distanceMapHeightSlices}
            labellingData={{
                assetName: assetName,
            }}
            apartmentBboxMin={apartmentBboxMin}
            apartmentBboxMax={apartmentBboxMax}
            assetContentRoot={
                selectedBuildingModelIndex !== undefined ? availableBuildingModels[selectedBuildingModelIndex].assetContentRoot : ''
            }
            basePlaneYOffset={basePlaneYOffset}
            buildingModelContainsLightmap={buildingModelContainsLightmap}
            fontSizeInMeters={fontSizeInMeters}
            enableSSAO={enableSSAO}
            ssaoMinDistance={ssaoMinDistance}
            ssaoMaxDistance={ssaoMaxDistance}
            ssaoSpiralTurns={ssaoSpiralTurns}
        />
    ) : undefined;

    const children = (
        <div className="row mr-0">
            {/* TODO: Fix necessity for pl-0 here by properly calculating mouse event co-ordinates in renderer.ts */}
            <div className="col-8 pl-0">
                <div className="sticky-top">
                    <>
                        {selectedBuildingModelIndex === undefined && (
                            <div
                                className="position-absolute shadow px-3 py-2 bg-white rounded"
                                style={{
                                    zIndex: 1021,
                                    transform: `translate(50%, 50%)`,
                                    pointerEvents: 'none',
                                    marginLeft: '1rem',
                                }}
                            >
                                Please select a building model using the controls on the right side of the screen.
                            </div>
                        )}
                        {selectedBuildingModelIndex !== undefined && rendererIsLoading && (
                            <div
                                className="d-flex position-relative shadow px-3 py-2 bg-white rounded"
                                style={{
                                    zIndex: 1021,
                                    transform: 'translate(-50%, 0)',
                                    pointerEvents: 'none',
                                    // marginLeft: '1rem',
                                    left: '50%',
                                }}
                            >
                                <div
                                    className="spinner-border mr-3 align-self-baseline"
                                    role="status"
                                    style={{
                                        width: '1.3rem',
                                        height: '1.3rem',
                                        borderWidth: '1.5px',
                                    }}
                                >
                                    <span className="sr-only">Loading...</span>
                                </div>
                                Loading the 3D assets and data … please wait.
                            </div>
                        )}
                        {hoverInformation && (
                            <div
                                className="position-absolute shadow px-3 py-2 bg-white rounded"
                                style={{
                                    zIndex: 1021,
                                    transform: `translate(${hoverInformation.x}px, ${hoverInformation.y}px)`,
                                    pointerEvents: 'none',
                                    marginLeft: '1rem',
                                }}
                                dangerouslySetInnerHTML={{ __html: hoverInformation.label }}
                            ></div>
                        )}
                        {TasaViewerAppInstance}
                    </>
                </div>
            </div>
            <div className="col-4">{DebugControls}</div>
        </div>
    );

    return (
        <>
            <section className="container-fluid">
                {displayDataMode === 'mocked' ? (
                    <TestTASADataProvider value={MOCKED_CONTEXT_STATE}>{children}</TestTASADataProvider>
                ) : (
                    <TASADataProvider>
                        <TASAStaticDataDispatcher sensorIds={[...new Set([...liveDataSensorIds, ...labeledSensorIds])]}>
                            {displayDataMode === 'live' && (
                                <TASALiveDataDispatcher sensorIds={liveDataSensorIds}>{children}</TASALiveDataDispatcher>
                            )}
                            {displayDataMode === 'historical' && (
                                <TASAHistoricalDataDispatcher
                                    sensorIds={liveDataSensorIds}
                                    // TODO(config): Make this value configuration-based/dynamic
                                    assetId={79}
                                    from={getHistoricalDataDate()}
                                    samplingMode={samplingMode}
                                    duration={getHistoricalDataDuration()}
                                    isLocked={animationTween !== undefined || timeSliderUsed}
                                >
                                    {outsideTemperatureAssetId && outsideTemperatureSensorId ? (
                                        <TASAHistoricalDataDispatcher
                                            sensorIds={[outsideTemperatureSensorId]}
                                            assetId={outsideTemperatureAssetId}
                                            from={getHistoricalDataDate()}
                                            samplingMode={samplingMode}
                                            duration={getHistoricalDataDuration()}
                                            isLocked={animationTween !== undefined || timeSliderUsed}
                                        >
                                            {children}
                                        </TASAHistoricalDataDispatcher>
                                    ) : (
                                        <>{children}</>
                                    )}
                                </TASAHistoricalDataDispatcher>
                            )}
                        </TASAStaticDataDispatcher>
                    </TASADataProvider>
                )}
            </section>
        </>
    );
};

export { App };
