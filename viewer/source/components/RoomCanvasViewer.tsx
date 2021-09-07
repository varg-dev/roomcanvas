import * as React from 'react';
import { useEffect, useRef } from 'react';

import { update } from '@tweenjs/tween.js';

import { Camera, LoadingStatus, vec3 } from 'webgl-operate';

import { RoomCanvasApplication } from '../renderer/application';
import {
    AssetValue,
    DebugSensorDistancesConfiguration,
    HoverEvent,
    LabellingMetadata,
    SensorValue,
    SensorValueLabel,
    SensorValueLabelsConfig,
    SSAOConfiguration,
} from '../renderer/renderer';

export interface ColorScaleConfiguration {
    selectedColorScale: {
        type: string;
        presetIdentifier: string;
    };
    colorScaleStops: number;
    useLinearColorInterpolation: boolean;
    invertColorScale: boolean;
}

export interface RoomCanvasViewerProps {
    sensorValueLabels: SensorValueLabel[] | undefined;
    sensorValues: SensorValue[] | undefined;
    assetValues: AssetValue[] | undefined;
    buildingModelGltfUri: string;
    labelFontFntUri: string;
    iconFontFntUri: string;
    sensorFontFntUri: string;
    cameraEye: vec3;
    cameraCenter: vec3;
    cameraUp: vec3;
    onChangeCamera: (camera: Camera) => void;
    onHover: (hoverEvent: HoverEvent) => void;
    onLoadingFinished: () => void;
    visualizeOnAssetLevel: boolean;
    useLowBitDistanceMap: boolean;
    averageIndoorTemperature: number;
    outsideTemperature: number;
    volumeVisibleDistances: [number, number];
    volumeBboxCubeMin: [number, number, number];
    volumeBboxCubeMax: [number, number, number];
    distanceMapHeightSlices: number;
    apartmentBboxMin: [number, number, number];
    apartmentBboxMax: [number, number, number];
    assetContentRoot: string;
    basePlaneYOffset: number;
    buildingModelContainsLightmap: boolean;

    buildingModelHierarchyGltfUri?: string;
    className?: string;
    colorScaleConfiguration?: ColorScaleConfiguration;
    sunPosition?: [number, number, number];
    sunIsUp?: boolean;
    enableShadowMapping?: boolean;
    enableSurfaceSensorDataVisualization?: boolean;
    enableVolumeSensorDataVisualization?: boolean;
    enableVolumeTransparencyTransferFunction?: boolean;
    sampledCustomTransparencyTransferFunctionPoints?: [number, number][] | undefined;
    debugSensorDistancesConfiguration?: DebugSensorDistancesConfiguration;
    sensorMinValue?: number;
    sensorMaxValue?: number;
    labellingMetadata?: LabellingMetadata;
    showGrid?: boolean;
    enableEdgeOutlineRendering?: boolean;
    enableSensorIcons?: boolean;
    enableAssetHighlightingOnHover?: boolean;
    enableMetadataAndColorScaleLabelling?: boolean;
    sensorValueLabelsConfig?: SensorValueLabelsConfig;
    inverseDistanceWeightExponent?: number;
    fontSizeInMeters?: number;
    enableSSAO?: boolean;
    ssaoMinDistance?: number;
    ssaoMaxDistance?: number;
    ssaoSpiralTurns?: number;
}

const animate = (time: number) => {
    requestAnimationFrame(animate);
    update(time);
};

const RoomCanvasViewer: React.FunctionComponent<RoomCanvasViewerProps> & {
    defaultProps: Partial<RoomCanvasViewerProps>;
} = (props: RoomCanvasViewerProps) => {
    // eslint-disable-next-line no-null/no-null
    const canvasElement = useRef<HTMLCanvasElement>(null);
    const applicationRef = useRef(new RoomCanvasApplication());
    const application = applicationRef.current;

    useEffect(() => {
        if (canvasElement && canvasElement.current) {
            application.initialize(canvasElement.current, {
                buildingModelGltfUri: props.buildingModelGltfUri,
                labelFontFntUri: props.labelFontFntUri,
                iconFontFntUri: props.iconFontFntUri,
                sensorFontFntUri: props.sensorFontFntUri,
                buildingModelHierarchyGltfUri: props.buildingModelHierarchyGltfUri,
            });

            application.enableFullscreenOnCtrlClick();

            application.renderer.visualizeOnAssetLevel = props.visualizeOnAssetLevel;
            application.renderer.useLowBitDistanceMap = props.useLowBitDistanceMap;
            if (props.showGrid) {
                application.renderer.showGrid = props.showGrid;
            } else {
                application.renderer.showGrid = false;
            }
            if (props.enableEdgeOutlineRendering) {
                application.renderer.enableEdgeOutlineRendering = props.enableEdgeOutlineRendering;
            } else {
                application.renderer.enableEdgeOutlineRendering = false;
            }
            if (props.enableSensorIcons) {
                application.renderer.enableSensorIcons = props.enableSensorIcons;
            } else {
                application.renderer.enableSensorIcons = true;
            }
            if (props.enableAssetHighlightingOnHover) {
                application.renderer.enableAssetHighlightingOnHover = props.enableAssetHighlightingOnHover;
            } else {
                application.renderer.enableAssetHighlightingOnHover = false;
            }
            if (props.enableMetadataAndColorScaleLabelling) {
                application.renderer.enableMetadataAndColorScaleLabelling = props.enableMetadataAndColorScaleLabelling;
            } else {
                application.renderer.enableMetadataAndColorScaleLabelling = true;
            }
            if (props.sensorValueLabelsConfig) {
                application.renderer.sensorValueLabelsConfig = props.sensorValueLabelsConfig;
            }
            application.renderer.sensorValueLabels = props.sensorValueLabels;
            application.renderer.sensorValues = props.sensorValues;
            application.renderer.assetValues = props.assetValues;

            if (props.enableSSAO !== undefined) {
                application.renderer.enableSSAO = props.enableSSAO;
            }

            const ssaoConfig = {
                minDistance: 0.0024,
                maxDistance: 0.0116,
                spiralTurns: 4,
            } as SSAOConfiguration;
            if (props.ssaoMinDistance) {
                ssaoConfig.minDistance = props.ssaoMinDistance;
            }
            if (props.ssaoMaxDistance) {
                ssaoConfig.maxDistance = props.ssaoMaxDistance;
            }
            if (props.ssaoSpiralTurns) {
                ssaoConfig.spiralTurns = props.ssaoSpiralTurns;
            }
            application.renderer.ssaoConfig = ssaoConfig;

            application.renderer.averageIndoorTemperature = props.averageIndoorTemperature;
            application.renderer.outsideTemperature = props.outsideTemperature;

            if (props.inverseDistanceWeightExponent) {
                application.renderer.inverseDistanceWeightExponent = props.inverseDistanceWeightExponent;
            }

            if (props.sensorMinValue) {
                application.renderer.sensorMinValue = props.sensorMinValue;
            }
            if (props.sensorMaxValue) {
                application.renderer.sensorMaxValue = props.sensorMaxValue;
            }

            if (props.sunPosition) {
                application.renderer.sunPosition = props.sunPosition;
            }

            if (props.sunIsUp !== undefined) {
                application.renderer.sunIsUp = props.sunIsUp;
            }

            if (props.enableShadowMapping !== undefined) {
                application.renderer.enableShadowMapping = props.enableShadowMapping;
            }

            if (props.enableSurfaceSensorDataVisualization !== undefined) {
                application.renderer.enableSurfaceSensorDataVisualization = props.enableSurfaceSensorDataVisualization;
            }

            if (props.enableVolumeSensorDataVisualization !== undefined) {
                application.renderer.enableVolumeSensorDataVisualization = props.enableVolumeSensorDataVisualization;
            }

            if (props.enableVolumeTransparencyTransferFunction !== undefined) {
                application.renderer.useTransparencyTransferFunctionForVolumeRendering = props.enableVolumeTransparencyTransferFunction;
            }

            if (props.sampledCustomTransparencyTransferFunctionPoints !== undefined) {
                application.renderer.sampledCustomTransparencyTransferFunctionPoints =
                    props.sampledCustomTransparencyTransferFunctionPoints;
            }

            if (props.debugSensorDistancesConfiguration) {
                application.renderer.debugSensorDistancesConfiguration = props.debugSensorDistancesConfiguration;
            }

            if (props.labellingMetadata) {
                application.renderer.labellingMetadata = props.labellingMetadata;
            }

            application.renderer.volumeVisibleDistances = props.volumeVisibleDistances;
            application.renderer.volumeBboxCubeMin = props.volumeBboxCubeMin;
            application.renderer.volumeBboxCubeMax = props.volumeBboxCubeMax;
            application.renderer.distanceMapHeightSlices = props.distanceMapHeightSlices;
            application.renderer.apartmentBboxMin = props.apartmentBboxMin;
            application.renderer.apartmentBboxMax = props.apartmentBboxMax;
            application.renderer.basePlaneYOffset = props.basePlaneYOffset;
            application.renderer.buildingModelContainsLightmap = props.buildingModelContainsLightmap;

            if (props.fontSizeInMeters) {
                application.renderer.fontSizeInMeters = props.fontSizeInMeters;
            }

            application.renderer.assetContentRoot = props.assetContentRoot;

            application.renderer.camera$.subscribe((camera) => {
                props.onChangeCamera(camera);
            });

            application.renderer.hoverEvent$.subscribe((hoverEvent) => {
                props.onHover(hoverEvent);
            });

            application.renderer.loadingStatus$.subscribe((loadingStatus) => {
                if (loadingStatus === LoadingStatus.Finished) {
                    props.onLoadingFinished();
                }
            });

            requestAnimationFrame(animate);
        }

        // returned function will be called on component unmount
        return () => {
            application.uninitialize();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [application]);

    useEffect(() => {
        if (props.cameraEye === undefined || props.cameraCenter === undefined || props.cameraUp === undefined) {
            return;
        }
        if (application.renderer.initialized === false) {
            return;
        }
        application.renderer.camera.eye = props.cameraEye;
        application.renderer.camera.center = props.cameraCenter;
        application.renderer.camera.up = props.cameraUp;
        application.renderer.camera.altered = true;
        application.renderer.forceRerender(true);
    }, [props.cameraEye, props.cameraCenter, props.cameraUp, application.renderer]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        if (props.labellingMetadata) {
            application.renderer.labellingMetadata = props.labellingMetadata;
            application.renderer.updateLabels();
            application.renderer.forceRerender();
        }
    }, [props.labellingMetadata, application.renderer]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        if (props.buildingModelHierarchyGltfUri) {
            application.renderer.buildingModelHierarchyGltfUri = props.buildingModelHierarchyGltfUri;
            application.renderer.forceRerender();
        }
    }, [props.buildingModelHierarchyGltfUri, application.renderer]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        if (props.fontSizeInMeters) {
            application.renderer.fontSizeInMeters = props.fontSizeInMeters;
            application.renderer.updateLabels();
            application.renderer.forceRerender();
        }
    }, [props.fontSizeInMeters, application.renderer]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        if (props.sensorMinValue) {
            application.renderer.sensorMinValue = props.sensorMinValue;
            application.renderer.forceRerender();
        }
    }, [props.sensorMinValue, application.renderer]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        if (props.sensorMaxValue) {
            application.renderer.sensorMaxValue = props.sensorMaxValue;
            application.renderer.forceRerender();
        }
    }, [props.sensorMaxValue, application.renderer]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        if (props.enableSSAO !== undefined) {
            application.renderer.enableSSAO = props.enableSSAO;
            application.renderer.forceRerender();
        }
    }, [props.enableSSAO, application.renderer]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        if (props.ssaoMinDistance) {
            application.renderer.ssaoConfig = { ...application.renderer.ssaoConfig, minDistance: props.ssaoMinDistance };
            application.renderer.forceRerender();
        }
    }, [props.ssaoMinDistance, application.renderer]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        if (props.ssaoSpiralTurns) {
            application.renderer.ssaoConfig = { ...application.renderer.ssaoConfig, spiralTurns: props.ssaoSpiralTurns };
            application.renderer.forceRerender();
        }
    }, [props.ssaoSpiralTurns, application.renderer]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        if (props.ssaoMaxDistance) {
            application.renderer.ssaoConfig = { ...application.renderer.ssaoConfig, maxDistance: props.ssaoMaxDistance };
            application.renderer.forceRerender();
        }
    }, [props.ssaoMaxDistance, application.renderer]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        if (props.inverseDistanceWeightExponent) {
            application.renderer.inverseDistanceWeightExponent = props.inverseDistanceWeightExponent;
            application.renderer.forceRerender();
        }
    }, [props.inverseDistanceWeightExponent, application.renderer]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        application.renderer.sensorValueLabels = props.sensorValueLabels;
        application.renderer.updateLabels();
        application.renderer.forceRerender();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        // To make the useEffect hook only trigger on actual changes of the sensorValueLabels array **content**,
        // an ES6 template literal representation of the array is used
        // @see https://stackoverflow.com/a/65728647
        // eslint-disable-next-line react-hooks/exhaustive-deps, @typescript-eslint/restrict-template-expressions
        `${props.sensorValueLabels}`,
        application.renderer,
    ]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        let updateIndices = false;
        if (
            JSON.stringify([...new Set(props.sensorValues?.map((sensorValue) => sensorValue.sensorId))]) !==
            JSON.stringify([...new Set(application.renderer.sensorValues?.map((sensorValue) => sensorValue.sensorId))])
        ) {
            updateIndices = true;
        }
        application.renderer.sensorValues = props.sensorValues;
        if (updateIndices) {
            application.renderer.onSensorIndicesChange();
        }
        application.renderer.forceRerender();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        // To make the useEffect hook only trigger on actual changes of the sensorValues array **content**,
        // an ES6 template literal representation of the array is used
        // @see https://stackoverflow.com/a/65728647
        // eslint-disable-next-line react-hooks/exhaustive-deps, @typescript-eslint/restrict-template-expressions
        `${props.sensorValues}`,
        application.renderer,
    ]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        let updateIndices = false;
        if (
            JSON.stringify([...new Set(props.assetValues?.map((assetValue) => assetValue.assetId))]) !==
            JSON.stringify([...new Set(application.renderer.assetValues?.map((assetValue) => assetValue.assetId))])
        ) {
            updateIndices = true;
        }
        application.renderer.assetValues = props.assetValues;
        if (updateIndices) {
            application.renderer.onAssetIndicesChange();
        }
        application.renderer.forceRerender();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        // To make the useEffect hook only trigger on actual changes of the assetValues array **content**,
        // an ES6 template literal representation of the array is used
        // @see https://stackoverflow.com/a/65728647
        // eslint-disable-next-line react-hooks/exhaustive-deps, @typescript-eslint/restrict-template-expressions
        `${props.assetValues}`,
        application.renderer,
    ]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        application.renderer.outsideTemperature = props.outsideTemperature;
        application.renderer.forceRerender();
    }, [props.outsideTemperature, application.renderer]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        application.renderer.volumeVisibleDistances = props.volumeVisibleDistances;
        application.renderer.forceRerender();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        // To make the useEffect hook only trigger on actual changes of the volumeVisibleDistances array **content**,
        // an ES6 template literal representation of the array is used
        // @see https://stackoverflow.com/a/65728647
        // eslint-disable-next-line react-hooks/exhaustive-deps, @typescript-eslint/restrict-template-expressions
        `${props.volumeVisibleDistances}`,
        application.renderer,
    ]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        application.renderer.volumeBboxCubeMin = props.volumeBboxCubeMin;
        application.renderer.forceRerender();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        // To make the useEffect hook only trigger on actual changes of the volumeBboxCubeMin array **content**,
        // an ES6 template literal representation of the array is used
        // @see https://stackoverflow.com/a/65728647
        // eslint-disable-next-line react-hooks/exhaustive-deps, @typescript-eslint/restrict-template-expressions
        `${props.volumeBboxCubeMin}`,
        application.renderer,
    ]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        application.renderer.volumeBboxCubeMax = props.volumeBboxCubeMax;
        application.renderer.forceRerender();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        // To make the useEffect hook only trigger on actual changes of the volumeBboxCubeMax array **content**,
        // an ES6 template literal representation of the array is used
        // @see https://stackoverflow.com/a/65728647
        // eslint-disable-next-line react-hooks/exhaustive-deps, @typescript-eslint/restrict-template-expressions
        `${props.volumeBboxCubeMax}`,
        application.renderer,
    ]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        application.renderer.apartmentBboxMin = props.apartmentBboxMin;
        application.renderer.forceRerender();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        // To make the useEffect hook only trigger on actual changes of the apartmentBboxMin array **content**,
        // an ES6 template literal representation of the array is used
        // @see https://stackoverflow.com/a/65728647
        // eslint-disable-next-line react-hooks/exhaustive-deps, @typescript-eslint/restrict-template-expressions
        `${props.apartmentBboxMin}`,
        application.renderer,
    ]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        application.renderer.apartmentBboxMax = props.apartmentBboxMax;
        application.renderer.forceRerender();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        // To make the useEffect hook only trigger on actual changes of the apartmentBboxMax array **content**,
        // an ES6 template literal representation of the array is used
        // @see https://stackoverflow.com/a/65728647
        // eslint-disable-next-line react-hooks/exhaustive-deps, @typescript-eslint/restrict-template-expressions
        `${props.apartmentBboxMax}`,
        application.renderer,
    ]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        application.renderer.basePlaneYOffset = props.basePlaneYOffset;
        application.renderer.forceRerender();
    }, [props.basePlaneYOffset, application.renderer]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        application.renderer.buildingModelContainsLightmap = props.buildingModelContainsLightmap;
        application.renderer.forceRerender();
    }, [props.buildingModelContainsLightmap, application.renderer]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        application.renderer.assetContentRoot = props.assetContentRoot;
        application.renderer.forceRerender();
    }, [props.assetContentRoot, application.renderer]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        application.renderer.distanceMapHeightSlices = props.distanceMapHeightSlices;
        application.renderer.forceRerender();
    }, [props.distanceMapHeightSlices, application.renderer]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        application.renderer.averageIndoorTemperature = props.averageIndoorTemperature;
        application.renderer.forceRerender();
    }, [props.averageIndoorTemperature, application.renderer]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        if (props.colorScaleConfiguration) {
            application.renderer.colorScaleConfiguration = props.colorScaleConfiguration;
        }
        application.renderer.forceRerender();
    }, [props.colorScaleConfiguration, application.renderer]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        if (props.sunPosition) {
            application.renderer.sunPosition = props.sunPosition;
        }
        application.renderer.forceRerender();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        // To make the useEffect hook only trigger on actual changes of the sunPosition array **content**,
        // an ES6 template literal representation of the array is used
        // @see https://stackoverflow.com/a/65728647
        // eslint-disable-next-line react-hooks/exhaustive-deps, @typescript-eslint/restrict-template-expressions
        `${props.sunPosition}`,
        application.renderer,
    ]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        if (props.sunIsUp !== undefined) {
            application.renderer.sunIsUp = props.sunIsUp;
        }
        application.renderer.forceRerender();
    }, [props.sunIsUp, application.renderer]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        if (props.enableShadowMapping !== undefined) {
            application.renderer.enableShadowMapping = props.enableShadowMapping;
        }
        application.renderer.forceRerender();
    }, [props.enableShadowMapping, application.renderer]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        if (props.enableSurfaceSensorDataVisualization !== undefined) {
            if (application.renderer.enableSurfaceSensorDataVisualization !== props.enableSurfaceSensorDataVisualization) {
                application.renderer.enableSurfaceSensorDataVisualization = props.enableSurfaceSensorDataVisualization;
            }
        }
        application.renderer.forceRerender();
    }, [props.enableSurfaceSensorDataVisualization, application.renderer]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        if (props.enableVolumeSensorDataVisualization !== undefined) {
            if (application.renderer.enableVolumeSensorDataVisualization !== props.enableVolumeSensorDataVisualization) {
                application.renderer.enableVolumeSensorDataVisualization = props.enableVolumeSensorDataVisualization;
            }
        }
        application.renderer.forceRerender();
    }, [props.enableVolumeSensorDataVisualization, application.renderer]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        if (props.enableVolumeTransparencyTransferFunction !== undefined) {
            if (application.renderer.useTransparencyTransferFunctionForVolumeRendering !== props.enableVolumeTransparencyTransferFunction) {
                application.renderer.useTransparencyTransferFunctionForVolumeRendering = props.enableVolumeTransparencyTransferFunction;
            }
        }
        application.renderer.forceRerender();
    }, [props.enableVolumeTransparencyTransferFunction, application.renderer]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        if (props.sampledCustomTransparencyTransferFunctionPoints !== undefined) {
            if (
                application.renderer.sampledCustomTransparencyTransferFunctionPoints !==
                props.sampledCustomTransparencyTransferFunctionPoints
            ) {
                application.renderer.sampledCustomTransparencyTransferFunctionPoints =
                    props.sampledCustomTransparencyTransferFunctionPoints;
            }
        }
        application.renderer.forceRerender();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        // To make the useEffect hook only trigger on actual changes of the sampledCustomTransparencyTransferFunctionPoints array **content**,
        // an ES6 template literal representation of the array is used
        // @see https://stackoverflow.com/a/65728647
        // eslint-disable-next-line react-hooks/exhaustive-deps, @typescript-eslint/restrict-template-expressions
        `${props.sampledCustomTransparencyTransferFunctionPoints}`,
        application.renderer,
    ]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        if (props.visualizeOnAssetLevel !== undefined) {
            application.renderer.visualizeOnAssetLevel = props.visualizeOnAssetLevel;
        }
        application.renderer.forceRerender();
    }, [props.visualizeOnAssetLevel, application.renderer]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        if (props.useLowBitDistanceMap !== undefined) {
            application.renderer.useLowBitDistanceMap = props.useLowBitDistanceMap;
        }
        application.renderer.forceRerender();
    }, [props.useLowBitDistanceMap, application.renderer]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        if (props.showGrid !== undefined) {
            application.renderer.showGrid = props.showGrid;
        }
        application.renderer.forceRerender();
    }, [props.showGrid, application.renderer]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        if (props.enableEdgeOutlineRendering !== undefined) {
            application.renderer.enableEdgeOutlineRendering = props.enableEdgeOutlineRendering;
        }
        application.renderer.forceRerender();
    }, [props.enableEdgeOutlineRendering, application.renderer]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        if (props.enableSensorIcons !== undefined) {
            application.renderer.enableSensorIcons = props.enableSensorIcons;
            application.renderer.forceRerender();
        }
    }, [props.enableSensorIcons, application.renderer]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        if (props.enableAssetHighlightingOnHover !== undefined) {
            application.renderer.enableAssetHighlightingOnHover = props.enableAssetHighlightingOnHover;
            application.renderer.forceRerender();
        }
    }, [props.enableAssetHighlightingOnHover, application.renderer]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        if (props.enableMetadataAndColorScaleLabelling !== undefined) {
            application.renderer.enableMetadataAndColorScaleLabelling = props.enableMetadataAndColorScaleLabelling;
            application.renderer.forceRerender();
        }
    }, [props.enableMetadataAndColorScaleLabelling, application.renderer]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        if (props.sensorValueLabelsConfig !== undefined) {
            application.renderer.sensorValueLabelsConfig = props.sensorValueLabelsConfig;
            application.renderer.forceRerender();
        }
    }, [props.sensorValueLabelsConfig, application.renderer]);

    useEffect(() => {
        if (application.renderer.initialized === false) {
            return;
        }
        if (props.debugSensorDistancesConfiguration) {
            application.renderer.debugSensorDistancesConfiguration = props.debugSensorDistancesConfiguration;
        } else {
            application.renderer.debugSensorDistancesConfiguration = undefined;
        }
        application.renderer.forceRerender();
    }, [props.debugSensorDistancesConfiguration, application.renderer]);

    return <canvas className={props.className} ref={canvasElement} />;
};

RoomCanvasViewer.defaultProps = {
    className: 'embed-responsive-item w-100',
};

export { RoomCanvasViewer };
