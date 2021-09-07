/* eslint-disable @typescript-eslint/indent */
/* eslint-disable max-classes-per-file */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { GLclampf4, GLfloat3 } from 'webgl-operate/lib/tuples';
import { Observable, ReplaySubject } from 'rxjs';
import { auxiliaries, gl_matrix_extensions, mat4, quat, vec2, vec3, vec4 } from 'webgl-operate';
import {
    AccumulatePass,
    AntiAliasingKernel,
    BlitPass,
    Buffer,
    Camera,
    ChangeLookup,
    Color,
    ColorScale,
    Context,
    CuboidGeometry,
    DebugPass,
    DefaultFramebuffer,
    EventProvider,
    FontFace,
    Framebuffer,
    GLTFLoader,
    GLTFPbrMaterial,
    Geometry,
    GeosphereGeometry,
    Invalidate,
    Label,
    LabelRenderPass,
    Material,
    Navigation,
    NdcFillingTriangle,
    Position3DLabel,
    Program,
    ReadbackPass,
    Renderbuffer,
    Renderer,
    Shader,
    ShadowPass,
    Text,
    Texture2D,
    Texture3D,
    Wizard,
} from 'webgl-operate';

import { Benchmark } from './benchmark';

import { ColorScaleConfiguration } from '../components/RoomCanvasViewer';
import { ForwardSceneRenderPassWithIdentities } from './ForwardSceneRenderPassWithIdentities';
import { OrthographicCamera } from './OrthographicCamera';
import { PlaneGeometryUV01 } from './PlaneGeometryUV01';

const { v2, v3 } = gl_matrix_extensions;

export type HoverEvent =
    | {
          label: string;
          x: number;
          y: number;
      }
    | undefined;

export interface LabellingMetadata {
    assetName?: string;
    date?: string;
    time?: string;
}

export interface SensorValueLabel {
    sensorId: number;
    position: vec3;
    labelText: string;
}

export interface RoomCanvasRendererOptions {
    buildingModelGltfUri: string;
    labelFontFntUri: string;
    iconFontFntUri: string;
    sensorFontFntUri: string;
    buildingModelHierarchyGltfUri?: string;
}

export class SensorValue {
    public sensorId: number;
    public position: vec3;
    public value: number;

    constructor(sensorId: number, position: vec3, value: number) {
        this.sensorId = sensorId;
        this.position = position;
        this.value = value;
    }
}

export interface AssetValue {
    assetId: number;
    sensorValues: SensorValue[] | undefined;
}

export type DebugSensorDistancesConfiguration =
    | {
          enableDebug: false;
      }
    | {
          enableDebug: true;
          debugSensorIndices: number[];
          debugMaxSensorDistance: number;
          debugVisualizeSensorDistanceUsingColorMap: boolean;
          debugUseDirectNeighborMinFilter: boolean;
          debugUseDiagonalMinFilter: boolean;
          debugDistanceMapCoordsOffsetFactorX: number | undefined;
          debugDistanceMapCoordsOffsetFactorY: number | undefined;
          debugDistanceMapCoordsOffsetFactorZ: number | undefined;
      };

export enum ShadowMappingMode {
    ShadowMapping = 0,
    ExponentialShadowMapping,
    VarianceShadowMapping,
    ExponentialVarianceShadowMapping,
}

export type SensorValueLabelsConfig = {
    displayLabels: boolean;
    approximateOptimalLabellingPositions: boolean;
    labellingAlgorithmConfig: {
        filtering: {
            mustFaceCamera: boolean;
            mustBeInsideViewport: boolean;
            mustNotBeBehindObstacles: boolean;
            mustNotBeUpsideDown: boolean;
        };
        ordering: {
            orderBy: LabellingAlgorithmOrderBy[];
        };
    };
};

export enum LabellingAlgorithmOrderBy {
    RunningLength,
    InverseDistanceToCameraEye,
    HowDirectlyFacingCamera,
    HowStraighlyAlignedHorizontally,
}

export type ShadowMappingConfiguration =
    | {
          type: ShadowMappingMode.ShadowMapping;
          shadowBias: number; // default: -0.002
      }
    | {
          type: ShadowMappingMode.ExponentialShadowMapping;
          shadowExponent: number; // default: 80.0
      }
    | {
          type: ShadowMappingMode.VarianceShadowMapping;
          shadowMinVariance: number; // default: 0.1
          shadowLightBleedingReduction: number; // default: 0.1
      }
    | {
          type: ShadowMappingMode.ExponentialVarianceShadowMapping;
          shadowExponents: [number, number]; // default: [30.0, 10.0]
          shadowLightBleedingReduction: number; // default: 0.1
      };

export type SSAOConfiguration = {
    minDistance: number;
    maxDistance: number;
    spiralTurns: number;
};

// TODO(config): Make this value configuration-based/dynamic
const SPIRAL_SAMPLES_PER_FRAME = 32;

export class RoomCanvasRenderer extends Renderer {
    protected _initializationFinished = false;
    protected _assetLoadingFinished = false;

    protected _defaultCameraCenter = vec3.fromValues(0.5856786370277405, 0.7781350612640381, 0.4010432958602905);
    protected _defaultCameraEye = vec3.fromValues(5.034944534301758, 11.989127159118652, 6.837262153625488);
    protected _benchmark: Benchmark;

    protected _sensorValueLabels: SensorValueLabel[] | undefined;
    protected _visualizeOnAssetLevel = true;
    protected _inverseDistanceWeightExponent = 4.0;
    protected _outsideTemperature = 19.0;
    protected _averageIndoorTemperature = 3.0;
    protected _useLowBitDistanceMap = true;
    protected _showGrid = false;
    protected _enableSensorIcons = true;
    protected _enableAssetHighlightingOnHover = false;
    protected _enableMetadataAndColorScaleLabelling = true;
    protected _sensorValueLabelsConfig = {
        displayLabels: true,
        approximateOptimalLabellingPositions: false,
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
    } as SensorValueLabelsConfig;
    protected _sensorValues: SensorValue[] | undefined;
    protected _assetValues: AssetValue[] | undefined;
    protected _debugSensorDistancesConfiguration: DebugSensorDistancesConfiguration | undefined;
    protected _sensorMinValue = 18.0;
    protected _sensorMaxValue = 22.0;

    protected _distanceMapHeightSlices = 28;
    protected _apartmentBboxMin = [-1.8249350786209106, 0.0, -5.399456024169922] as vec3;
    protected _apartmentBboxMax = [17.7653865814209, 3.4400007724761963, 10.044034004211426] as vec3;
    protected _basePlaneYOffset = -10.32;
    protected _fontSizeInMeters = 1.0;
    protected _buildingModelContainsLightmap = false;

    protected _assetContentRoot = undefined as undefined | string;

    protected _shadowMappingConfiguration: ShadowMappingConfiguration = {
        type: ShadowMappingMode.ShadowMapping,
        shadowBias: -0.0015,
    };

    protected _selectedColorScaleIndex = 0;

    protected _hoveredAssetID: number | undefined = undefined;

    protected _colorScaleConfiguration: ColorScaleConfiguration = {
        selectedColorScale: {
            type: 'colorbrewer',
            presetIdentifier: 'RdYlBu',
        },
        colorScaleStops: 7,
        invertColorScale: true,
        useLinearColorInterpolation: false,
    };

    protected _sunIsUp = true;
    protected _enableShadowMapping = true;
    protected _enableSurfaceSensorDataVisualization = true;
    protected _enableVolumeSensorDataVisualization = false;

    protected _sunPosition: [number, number, number] = [-15.1302, 23.3389, 28.2616];

    protected _cuboid: CuboidGeometry;
    protected _uCuboidViewProjection: WebGLUniformLocation;
    protected _uCuboidModelMatrix: WebGLUniformLocation;
    protected _uCuboidEncodedId: WebGLUniformLocation;
    protected _cuboidProgram: Program;

    protected _colorScalePlane: PlaneGeometryUV01;
    protected _uColorScalePlaneViewProjection: WebGLUniformLocation;
    protected _uColorScalePlaneModelMatrix: WebGLUniformLocation;
    protected _colorScaleProgram: Program;
    protected _uColorScaleNdcOffset: WebGLUniformLocation;

    protected _probingLocations: vec3[];

    protected _points: Float32Array; // x, y, z, r, g, b, data=size
    protected _lines: Float32Array; // x, y, z, r, g, b
    protected _pointsBuffer: any;
    protected _linesBuffer: any;

    protected _pointsProgram: Program;
    protected _uPointsViewProjection: WebGLUniformLocation;
    protected _uPointsNdcOffset: WebGLUniformLocation;
    protected _linesProgram: Program;
    protected _uLinesViewProjection: WebGLUniformLocation;
    protected _uLinesNdcOffset: WebGLUniformLocation;

    protected _labellingMetadata: LabellingMetadata | undefined = undefined;

    protected readonly _altered = Object.assign(this._altered, {
        colorScaleConfiguration: false,
        shadowMappingConfiguration: false,
        enableSSAO: false,
        ssaoConfig: false,
        sunPosition: false,
        sunIsUp: false,
        enableShadowMapping: false,
        enableSurfaceSensorDataVisualization: false,
        enableVolumeSensorDataVisualization: false,
        sensorValues: false,
        assetValues: false,
        sensorValueLabels: false,
        debugSensorDistancesConfiguration: false,
        selectedColorScaleIndex: false,
        hoveredAssetID: false,
        sensorMinValue: false,
        sensorMaxValue: false,
        labellingMetadata: false,
        visualizeOnAssetLevel: false,
        useLowBitDistanceMap: false,
        showGrid: false,
        enableEdgeOutlineRendering: false,
        enableSensorIcons: false,
        enableAssetHighlightingOnHover: false,
        enableMetadataAndColorScaleLabelling: false,
        sensorValueLabelsConfig: false,
        inverseDistanceWeightExponent: false,
        outsideTemperature: false,
        volumeVisibleDistances: false,
        averageIndoorTemperature: false,
        points: false,
        lines: false,
        probingLocations: false,
        volumeBboxCubeMin: false,
        volumeBboxCubeMax: false,
        apartmentBboxMin: false,
        apartmentBboxMax: false,
        assetContentRoot: false,
        basePlaneYOffset: false,
        useTransparencyTransferFunctionForVolumeRendering: false,
        selectedTransparencyTransferFunctionIndex: false,
        sampledCustomTransparencyTransferFunctionPoints: false,
        distanceMapHeightSlices: false,
        buildingModelContainsLightmap: false,
        fontSizeInMeters: false,
        buildingModelHierarchyGltfUri: false,
    }) as ChangeLookup & {
        // eslint-disable-next-line id-blacklist
        any: boolean;
        multiFrameNumber: boolean;
        frameSize: boolean;
        canvasSize: boolean;
        framePrecision: boolean;
        clearColor: boolean;
        debugTexture: boolean;
        colorScaleConfiguration: boolean;
        shadowMappingConfiguration: boolean;
        enableSSAO: boolean;
        ssaoConfig: boolean;
        debugSensorDistancesConfiguration: boolean;
        selectedColorScaleIndex: boolean;
        sunPosition: boolean;
        sunIsUp: boolean;
        enableShadowMapping: boolean;
        enableSurfaceSensorDataVisualization: boolean;
        enableVolumeSensorDataVisualization: boolean;
        sensorValues: boolean;
        assetValues: boolean;
        sensorValueLabels: boolean;
        hoveredAssetID: boolean;
        sensorMinValue: boolean;
        sensorMaxValue: boolean;
        labellingMetadata: boolean;
        visualizeOnAssetLevel: boolean;
        useLowBitDistanceMap: boolean;
        showGrid: boolean;
        enableEdgeOutlineRendering: boolean;
        enableSensorIcons: boolean;
        enableAssetHighlightingOnHover: boolean;
        enableMetadataAndColorScaleLabelling: boolean;
        sensorValueLabelsConfig: boolean;
        inverseDistanceWeightExponent: boolean;
        outsideTemperature: boolean;
        volumeVisibleDistances: boolean;
        averageIndoorTemperature: boolean;
        points: boolean;
        lines: boolean;
        probingLocations: boolean;
        volumeBboxCubeMin: boolean;
        volumeBboxCubeMax: boolean;
        apartmentBboxMin: boolean;
        apartmentBboxMax: boolean;
        assetContentRoot: boolean;
        basePlaneYOffset: boolean;
        useTransparencyTransferFunctionForVolumeRendering: boolean;
        selectedTransparencyTransferFunctionIndex: boolean;
        sampledCustomTransparencyTransferFunctionPoints: boolean;
        distanceMapHeightSlices: boolean;
        buildingModelContainsLightmap: boolean;
        fontSizeInMeters: boolean;
        buildingModelHierarchyGltfUri: boolean;
    };

    set enableSSAO(enableSSAO: boolean) {
        this._enableSSAO = enableSSAO;
        this._altered.alter('enableSSAO');
    }

    get enableSSAO(): boolean {
        return this._enableSSAO;
    }

    set buildingModelHierarchyGltfUri(buildingModelHierarchyGltfUri: string | undefined) {
        this._buildingModelHierarchyGltfUri = buildingModelHierarchyGltfUri;
        this._altered.alter('buildingModelHierarchyGltfUri');
    }

    get buildingModelHierarchyGltfUri(): string | undefined {
        return this._buildingModelHierarchyGltfUri;
    }

    protected _ssaoConfig: SSAOConfiguration = {
        minDistance: 0.0024,
        maxDistance: 0.0116,
        spiralTurns: 4,
    };

    set ssaoConfig(ssaoConfig: SSAOConfiguration) {
        if (JSON.stringify(ssaoConfig) === JSON.stringify(this._ssaoConfig)) {
            return;
        }
        this._ssaoConfig = ssaoConfig;
        this._altered.alter('ssaoConfig');
    }

    get ssaoConfig(): SSAOConfiguration {
        return this._ssaoConfig;
    }

    set labellingMetadata(labellingMetadata: LabellingMetadata | undefined) {
        if (JSON.stringify(this._labellingMetadata) === JSON.stringify(labellingMetadata)) {
            return;
        }
        this._labellingMetadata = labellingMetadata;
        this._altered.alter('labellingMetadata');
    }

    get labellingMetadata(): LabellingMetadata | undefined {
        return this._labellingMetadata;
    }

    set sensorMinValue(sensorMinValue: number) {
        if (this._sensorMinValue === sensorMinValue) {
            return;
        }
        this._sensorMinValue = sensorMinValue;
        this._altered.alter('sensorMinValue');
    }

    get sensorMinValue(): number {
        return this._sensorMinValue;
    }

    set sensorMaxValue(sensorMaxValue: number) {
        if (this._sensorMaxValue === sensorMaxValue) {
            return;
        }
        this._sensorMaxValue = sensorMaxValue;
        this._altered.alter('sensorMaxValue');
    }

    get sensorMaxValue(): number {
        return this._sensorMaxValue;
    }

    set hoveredAssetID(hoveredAssetID: number | undefined) {
        if (this._hoveredAssetID === hoveredAssetID) {
            return;
        }
        this._hoveredAssetID = hoveredAssetID;
        this._altered.alter('hoveredAssetID');
    }

    get hoveredAssetID(): number | undefined {
        return this._hoveredAssetID;
    }

    set debugSensorDistancesConfiguration(debugSensorDistancesConfiguration: DebugSensorDistancesConfiguration | undefined) {
        if (JSON.stringify(debugSensorDistancesConfiguration) === JSON.stringify(this._debugSensorDistancesConfiguration)) {
            return;
        }
        this._debugSensorDistancesConfiguration = debugSensorDistancesConfiguration;
        this._altered.alter('debugSensorDistancesConfiguration');
    }

    get debugSensorDistancesConfiguration(): DebugSensorDistancesConfiguration | undefined {
        return this._debugSensorDistancesConfiguration;
    }

    set selectedColorScaleIndex(selectedColorScaleIndex: number) {
        if (selectedColorScaleIndex === this._selectedColorScaleIndex) {
            return;
        }
        this._selectedColorScaleIndex = selectedColorScaleIndex;
        this._altered.alter('selectedColorScaleIndex');
    }

    get selectedColorScaleIndex(): number {
        return this._selectedColorScaleIndex;
    }

    set colorScaleConfiguration(colorScaleConfiguration: ColorScaleConfiguration) {
        if (JSON.stringify(colorScaleConfiguration) === JSON.stringify(this._colorScaleConfiguration)) {
            return;
        }
        this._colorScaleConfiguration = colorScaleConfiguration;
        this._altered.alter('colorScaleConfiguration');
    }

    get colorScaleConfiguration(): ColorScaleConfiguration {
        return this._colorScaleConfiguration;
    }

    set shadowMappingConfiguration(shadowMappingConfiguration: ShadowMappingConfiguration) {
        if (JSON.stringify(shadowMappingConfiguration) === JSON.stringify(this._shadowMappingConfiguration)) {
            return;
        }
        this._shadowMappingConfiguration = shadowMappingConfiguration;
        this._altered.alter('shadowMappingConfiguration');
    }

    get shadowMappingConfiguration(): ShadowMappingConfiguration {
        return this._shadowMappingConfiguration;
    }

    set sensorValueLabels(sensorValueLabels: SensorValueLabel[] | undefined) {
        if (JSON.stringify(sensorValueLabels) === JSON.stringify(this._sensorValueLabels)) {
            return;
        }
        this._sensorValueLabels = sensorValueLabels;
        this._altered.alter('sensorValueLabels');
    }

    get sensorValueLabels(): SensorValueLabel[] | undefined {
        return this._sensorValueLabels;
    }

    set sensorValues(sensorValues: SensorValue[] | undefined) {
        if (JSON.stringify(sensorValues) === JSON.stringify(this._sensorValues)) {
            return;
        }
        this._sensorValues = sensorValues;
        this._altered.alter('sensorValues');
    }

    get sensorValues(): SensorValue[] | undefined {
        return this._sensorValues;
    }

    set assetValues(assetValues: AssetValue[] | undefined) {
        if (JSON.stringify(assetValues) === JSON.stringify(this._assetValues)) {
            return;
        }
        this._assetValues = assetValues;
        this._altered.alter('assetValues');
    }

    get assetValues(): AssetValue[] | undefined {
        return this._assetValues;
    }

    set sunPosition(sunPosition: [number, number, number]) {
        if (JSON.stringify(sunPosition) === JSON.stringify(this._sunPosition)) {
            return;
        }
        this._sunPosition = sunPosition;
        this._altered.alter('sunPosition');
    }

    get sunPosition(): [number, number, number] {
        return this._sunPosition;
    }

    set sunIsUp(sunIsUp: boolean) {
        this._sunIsUp = sunIsUp;
        this._altered.alter('sunIsUp');
    }

    get sunIsUp(): boolean {
        return this._sunIsUp;
    }

    set enableShadowMapping(enableShadowMapping: boolean) {
        this._enableShadowMapping = enableShadowMapping;
        this._altered.alter('enableShadowMapping');
    }

    get enableShadowMapping(): boolean {
        return this._enableShadowMapping;
    }

    set enableSurfaceSensorDataVisualization(enableSurfaceSensorDataVisualization: boolean) {
        this._enableSurfaceSensorDataVisualization = enableSurfaceSensorDataVisualization;
        this._altered.alter('enableSurfaceSensorDataVisualization');
    }

    get enableSurfaceSensorDataVisualization(): boolean {
        return this._enableSurfaceSensorDataVisualization;
    }

    set enableVolumeSensorDataVisualization(enableVolumeSensorDataVisualization: boolean) {
        this._enableVolumeSensorDataVisualization = enableVolumeSensorDataVisualization;
        this._altered.alter('enableVolumeSensorDataVisualization');
    }

    get enableVolumeSensorDataVisualization(): boolean {
        return this._enableVolumeSensorDataVisualization;
    }

    set visualizeOnAssetLevel(visualizeOnAssetLevel: boolean) {
        if (this._visualizeOnAssetLevel === visualizeOnAssetLevel) {
            return;
        }
        this._visualizeOnAssetLevel = visualizeOnAssetLevel;
        this._altered.alter('visualizeOnAssetLevel');
    }

    get visualizeOnAssetLevel(): boolean {
        return this._visualizeOnAssetLevel;
    }

    set useLowBitDistanceMap(useLowBitDistanceMap: boolean) {
        if (this._useLowBitDistanceMap === useLowBitDistanceMap) {
            return;
        }
        this._useLowBitDistanceMap = useLowBitDistanceMap;
        this._altered.alter('useLowBitDistanceMap');
    }

    get useLowBitDistanceMap(): boolean {
        return this._useLowBitDistanceMap;
    }

    set showGrid(showGrid: boolean) {
        if (this._showGrid === showGrid) {
            return;
        }
        this._showGrid = showGrid;
        this._altered.alter('showGrid');
    }

    get showGrid(): boolean {
        return this._showGrid;
    }

    set enableEdgeOutlineRendering(enableEdgeOutlineRendering: boolean) {
        this._enableEdgeOutlineRendering = enableEdgeOutlineRendering;
        this._altered.alter('enableEdgeOutlineRendering');
    }

    get enableEdgeOutlineRendering(): boolean {
        return this._enableEdgeOutlineRendering;
    }

    set enableSensorIcons(enableSensorIcons: boolean) {
        if (this._enableSensorIcons === enableSensorIcons) {
            return;
        }
        this._enableSensorIcons = enableSensorIcons;
        this._altered.alter('enableSensorIcons');
    }

    get enableSensorIcons(): boolean {
        return this._enableSensorIcons;
    }

    set enableAssetHighlightingOnHover(enableAssetHighlightingOnHover: boolean) {
        if (this._enableAssetHighlightingOnHover === enableAssetHighlightingOnHover) {
            return;
        }
        this._enableAssetHighlightingOnHover = enableAssetHighlightingOnHover;
        this._altered.alter('enableAssetHighlightingOnHover');
    }

    get enableAssetHighlightingOnHover(): boolean {
        return this._enableAssetHighlightingOnHover;
    }

    set enableMetadataAndColorScaleLabelling(enableMetadataAndColorScaleLabelling: boolean) {
        if (this._enableMetadataAndColorScaleLabelling === enableMetadataAndColorScaleLabelling) {
            return;
        }
        this._enableMetadataAndColorScaleLabelling = enableMetadataAndColorScaleLabelling;
        this._altered.alter('enableMetadataAndColorScaleLabelling');
    }

    get enableMetadataAndColorScaleLabelling(): boolean {
        return this._enableMetadataAndColorScaleLabelling;
    }

    set sensorValueLabelsConfig(sensorValueLabelsConfig: SensorValueLabelsConfig) {
        if (JSON.stringify(sensorValueLabelsConfig) === JSON.stringify(this._sensorValueLabelsConfig)) {
            return;
        }
        this._sensorValueLabelsConfig = sensorValueLabelsConfig;
        this._altered.alter('sensorValueLabelsConfig');
    }

    get sensorValueLabelsConfig(): SensorValueLabelsConfig {
        return this._sensorValueLabelsConfig;
    }

    set inverseDistanceWeightExponent(inverseDistanceWeightExponent: number) {
        if (this._inverseDistanceWeightExponent === inverseDistanceWeightExponent) {
            return;
        }
        this._inverseDistanceWeightExponent = inverseDistanceWeightExponent;
        this._altered.alter('inverseDistanceWeightExponent');
    }

    get inverseDistanceWeightExponent(): number {
        return this._inverseDistanceWeightExponent;
    }

    set outsideTemperature(outsideTemperature: number) {
        if (this._outsideTemperature === outsideTemperature) {
            return;
        }
        this._outsideTemperature = outsideTemperature;
        this._altered.alter('outsideTemperature');
    }

    get outsideTemperature(): number {
        return this._outsideTemperature;
    }

    set averageIndoorTemperature(averageIndoorTemperature: number) {
        if (this._averageIndoorTemperature === averageIndoorTemperature) {
            return;
        }
        this._averageIndoorTemperature = averageIndoorTemperature;
        this._altered.alter('averageIndoorTemperature');
    }

    get averageIndoorTemperature(): number {
        return this._averageIndoorTemperature;
    }

    set points(points: Float32Array) {
        if (JSON.stringify(points) === JSON.stringify(this._points)) {
            return;
        }
        this._points = points;

        const gl = this._context.gl;
        this._pointsBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._pointsBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this._points, gl.STATIC_DRAW);

        this._altered.alter('points');
    }

    get points(): Float32Array {
        return this._points;
    }

    set lines(lines: Float32Array) {
        if (JSON.stringify(lines) === JSON.stringify(this._lines)) {
            return;
        }
        this._lines = lines;

        const gl = this._context.gl;
        this._linesBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._linesBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this._lines, gl.STATIC_DRAW);

        this._altered.alter('lines');
    }

    get lines(): Float32Array {
        return this._lines;
    }

    set probingLocations(probingLocations: vec3[]) {
        if (JSON.stringify(probingLocations) === JSON.stringify(this._probingLocations)) {
            return;
        }
        this._probingLocations = probingLocations;
        this._altered.alter('probingLocations');
    }

    get probingLocations(): vec3[] {
        return this._probingLocations;
    }

    set distanceMapHeightSlices(distanceMapHeightSlices: number) {
        if (this._distanceMapHeightSlices === distanceMapHeightSlices) {
            return;
        }
        this._distanceMapHeightSlices = distanceMapHeightSlices;
        this._altered.alter('distanceMapHeightSlices');
    }

    get distanceMapHeightSlices(): number {
        return this._distanceMapHeightSlices;
    }

    set apartmentBboxMin(apartmentBboxMin: vec3) {
        if (JSON.stringify(this._apartmentBboxMin) === JSON.stringify(apartmentBboxMin)) {
            return;
        }
        this._apartmentBboxMin = apartmentBboxMin;
        this._altered.alter('apartmentBboxMin');
    }

    get apartmentBboxMin(): vec3 {
        return this._apartmentBboxMin;
    }

    set apartmentBboxMax(apartmentBboxMax: vec3) {
        if (JSON.stringify(this._apartmentBboxMax) === JSON.stringify(apartmentBboxMax)) {
            return;
        }
        this._apartmentBboxMax = apartmentBboxMax;
        this._altered.alter('apartmentBboxMax');
    }

    get apartmentBboxMax(): vec3 {
        return this._apartmentBboxMax;
    }

    set basePlaneYOffset(basePlaneYOffset: number) {
        if (this._basePlaneYOffset === basePlaneYOffset) {
            return;
        }
        this._basePlaneYOffset = basePlaneYOffset;
        this._altered.alter('basePlaneYOffset');
    }

    get basePlaneYOffset(): number {
        return this._basePlaneYOffset;
    }

    set fontSizeInMeters(fontSizeInMeters: number) {
        if (this._fontSizeInMeters === fontSizeInMeters) {
            return;
        }
        this._fontSizeInMeters = fontSizeInMeters;
        this._altered.alter('fontSizeInMeters');
    }

    get fontSizeInMeters(): number {
        return this._fontSizeInMeters;
    }

    set buildingModelContainsLightmap(buildingModelContainsLightmap: boolean) {
        if (this._buildingModelContainsLightmap === buildingModelContainsLightmap) {
            return;
        }
        this._buildingModelContainsLightmap = buildingModelContainsLightmap;
        this._altered.alter('buildingModelContainsLightmap');
    }

    get buildingModelContainsLightmap(): boolean {
        return this._buildingModelContainsLightmap;
    }

    set assetContentRoot(assetContentRoot: string | undefined) {
        if (this._assetContentRoot === assetContentRoot) {
            return;
        }
        this._assetContentRoot = assetContentRoot;
        this._altered.alter('assetContentRoot');
    }

    get assetContentRoot(): string | undefined {
        return this._assetContentRoot;
    }

    protected _uVisualizeOnAssetLevel: WebGLUniformLocation;

    protected _uShowGrid: WebGLUniformLocation;

    protected _uNumSensors: WebGLUniformLocation;
    protected _uSensorValues: WebGLUniformLocation[];
    protected _uSensorMinValue: WebGLUniformLocation;
    protected _uSensorMaxValue: WebGLUniformLocation;
    protected _uSensorMinColor: WebGLUniformLocation;
    protected _uSensorMaxColor: WebGLUniformLocation;

    protected _uNumAssets: WebGLUniformLocation;
    protected _uAssetValues: WebGLUniformLocation[];
    protected _uAssetIndices: WebGLUniformLocation[];

    protected _uDebugSensorDistances: WebGLUniformLocation;
    protected _uDebugSensorIndices: WebGLUniformLocation[];
    protected _uDebugSensorIndicesLength: WebGLUniformLocation;
    protected _uDebugMaxSensorDistance: WebGLUniformLocation;
    protected _uDebugVisualizeSensorDistanceUsingColorMap: WebGLUniformLocation;
    protected _uDebugUseDirectNeighborMinFilter: WebGLUniformLocation;
    protected _uDebugUseDiagonalMinFilter: WebGLUniformLocation;
    protected _uDebugDistanceMapCoordsOffsetFactorX: WebGLUniformLocation;
    protected _uDebugDistanceMapCoordsOffsetFactorY: WebGLUniformLocation;
    protected _uDebugDistanceMapCoordsOffsetFactorZ: WebGLUniformLocation;

    protected _buildingModelGltfUri: string;
    protected _buildingModelHierarchyGltfUri: string | undefined;
    protected _labelFontFntUri: string;
    protected _iconFontFntUri: string;
    protected _sensorFontFntUri: string;

    protected _loader: GLTFLoader;
    protected _hierarchyLoader: GLTFLoader;

    protected _navigation: Navigation;
    protected _camera: Camera;
    protected _cameraSubject = new ReplaySubject<Camera>(10);
    protected _light: OrthographicCamera;
    protected _lightSamples: Array<vec3>;

    protected _assetPass: ForwardSceneRenderPassWithIdentities;
    protected _uAssetEncodedId: WebGLUniformLocation;
    protected _uAssetId: WebGLUniformLocation;
    protected _uAssetHoveredID: WebGLUniformLocation;
    protected _uInverseDistanceWeightExponent: WebGLUniformLocation;
    protected _uOutsideTemperature: WebGLUniformLocation;
    protected _uAverageIndoorTemperature: WebGLUniformLocation;

    protected _assetHierarchyPass: ForwardSceneRenderPassWithIdentities;
    protected _uHierarchyViewProjection: WebGLUniformLocation;
    protected _uHierarchyModelMatrix: WebGLUniformLocation;
    protected _uHierarchyEncodedId: WebGLUniformLocation;
    protected _uHierarchyRenderIDToFragColor: WebGLUniformLocation;
    protected _uHierarchyHoveredEncodedID: WebGLUniformLocation;
    protected _uHierarchyNdcOffset: WebGLUniformLocation;

    protected _preDepthFBO: Framebuffer;
    protected _preDepthRenderbuffer: Renderbuffer;
    protected _depthTexture: Texture2D;
    protected _depthProgram: Program;

    protected _uDepthView: WebGLUniformLocation;
    protected _uDepthProjection: WebGLUniformLocation;
    protected _uDepthCameraNearFar: WebGLUniformLocation;
    protected _uDepthModel: WebGLUniformLocation;
    protected _uDepthNdcOffset: WebGLUniformLocation;

    protected _normalProgram: Program;
    protected _normalTexture: Texture2D;
    protected _noiseTexture: Texture2D;

    protected _uNormalViewProjection: WebGLUniformLocation;
    protected _uNormalModel: WebGLUniformLocation;
    protected _uNormalNdcOffset: WebGLUniformLocation;

    protected _volumePass: ForwardSceneRenderPassWithIdentities;
    protected _volumeRenderingProgram: Program;
    protected _uVolumeViewProjection: WebGLUniformLocation;
    protected _uVolumeModel: WebGLUniformLocation;
    protected _uVolumeInvModel: WebGLUniformLocation;
    protected _uVolumeCube: WebGLUniformLocation;
    protected _uVolumeEyePosition: WebGLUniformLocation;
    protected _uVolumeVolumeScale: WebGLUniformLocation;
    protected _uVolumeDtScale: WebGLUniformLocation;
    protected _uVolumeMinDistanceThreshold: WebGLUniformLocation;
    protected _uVolumeMaxDistanceThreshold: WebGLUniformLocation;
    protected _uVolumeNdcOffset: WebGLUniformLocation;
    protected _uVolumeVolumeDimensions: WebGLUniformLocation;
    protected _uVolumeBboxMin: WebGLUniformLocation;
    protected _uVolumeBboxMax: WebGLUniformLocation;

    protected _uVolumeUseLowBitDistanceMap: WebGLUniformLocation;
    protected _uVolumeSensorDistanceMap3DHigh: WebGLUniformLocation;
    protected _uVolumeSensorDistanceMap3DLow: WebGLUniformLocation;
    protected _uVolumeOutsideDistanceMap3D: WebGLUniformLocation;
    protected _uVolumeNumSensors: WebGLUniformLocation;
    protected _uVolumeSensorValues: WebGLUniformLocation[];
    protected _uVolumeSensorMinValue: WebGLUniformLocation;
    protected _uVolumeSensorMaxValue: WebGLUniformLocation;
    protected _uVolumeInverseDistanceWeightExponent: WebGLUniformLocation;
    protected _uVolumeOutsideTemperature: WebGLUniformLocation;
    protected _uVolumeAverageIndoorTemperature: WebGLUniformLocation;

    protected _volumeVisibleDistances = [0.0, 1.0] as [number, number];
    protected _volumeBboxCubeMin = [0, 0, 0] as vec3;
    protected _volumeBboxCubeMax = [1, 1, 1] as vec3;

    protected _useTransparencyTransferFunctionForVolumeRendering = true;
    set useTransparencyTransferFunctionForVolumeRendering(useTransparencyTransferFunctionForVolumeRendering: boolean) {
        this._useTransparencyTransferFunctionForVolumeRendering = useTransparencyTransferFunctionForVolumeRendering;
        this._altered.alter('useTransparencyTransferFunctionForVolumeRendering');
    }
    get useTransparencyTransferFunctionForVolumeRendering(): boolean {
        return this._useTransparencyTransferFunctionForVolumeRendering;
    }

    protected _empty1x1OpaqueTexture: Texture2D;

    protected _transparencyTransferTextures = new Array<Texture2D>();

    protected _selectedTransparencyTransferFunctionIndex = 0;
    set selectedTransparencyTransferFunctionIndex(selectedTransparencyTransferFunctionIndex: number) {
        if (selectedTransparencyTransferFunctionIndex === this._selectedTransparencyTransferFunctionIndex) {
            return;
        }
        this._selectedTransparencyTransferFunctionIndex = selectedTransparencyTransferFunctionIndex;
        this._altered.alter('selectedTransparencyTransferFunctionIndex');
    }
    get selectedTransparencyTransferFunctionIndex(): number {
        return this._selectedTransparencyTransferFunctionIndex;
    }

    protected _sampledCustomTransparencyTransferFunctionPoints = undefined as [number, number][] | undefined;
    set sampledCustomTransparencyTransferFunctionPoints(sampledCustomTransparencyTransferFunctionPoints: [number, number][] | undefined) {
        if (sampledCustomTransparencyTransferFunctionPoints === this._sampledCustomTransparencyTransferFunctionPoints) {
            return;
        }
        this._sampledCustomTransparencyTransferFunctionPoints = sampledCustomTransparencyTransferFunctionPoints;
        this._altered.alter('sampledCustomTransparencyTransferFunctionPoints');
    }
    get sampledCustomTransparencyTransferFunctionPoints(): [number, number][] | undefined {
        return this._sampledCustomTransparencyTransferFunctionPoints;
    }

    set volumeVisibleDistances(volumeVisibleDistances: [number, number]) {
        if (JSON.stringify(this._volumeVisibleDistances) === JSON.stringify(volumeVisibleDistances)) {
            return;
        }
        this._volumeVisibleDistances = volumeVisibleDistances;
        this._altered.alter('volumeVisibleDistances');
    }

    get volumeVisibleDistances(): [number, number] {
        return this._volumeVisibleDistances;
    }

    set volumeBboxCubeMin(volumeBboxCubeMin: vec3) {
        if (JSON.stringify(this._volumeBboxCubeMin) === JSON.stringify(volumeBboxCubeMin)) {
            return;
        }
        this._volumeBboxCubeMin = volumeBboxCubeMin;
        this._altered.alter('volumeBboxCubeMin');
    }

    get volumeBboxCubeMin(): vec3 {
        return this._volumeBboxCubeMin;
    }

    set volumeBboxCubeMax(volumeBboxCubeMax: vec3) {
        if (JSON.stringify(this._volumeBboxCubeMax) === JSON.stringify(volumeBboxCubeMax)) {
            return;
        }
        this._volumeBboxCubeMax = volumeBboxCubeMax;
        this._altered.alter('volumeBboxCubeMax');
    }

    get volumeBboxCubeMax(): vec3 {
        return this._volumeBboxCubeMax;
    }

    protected _shadowPass: ShadowPass;
    protected _empty1x1TransparentTexture: Texture2D;

    protected _depthRenderbuffer: Renderbuffer;
    protected _colorRenderTextures: Array<Texture2D>;
    protected _intermediateFBOs: Array<Framebuffer>;

    protected _idRenderTexture: Texture2D;
    protected _idRenderTextureAsset: Texture2D;
    protected _readbackPass: ReadbackPass;
    protected _readbackPassAsset: ReadbackPass;
    protected _hoverEvent: HoverEvent;
    protected _hoverEventSubject = new ReplaySubject<HoverEvent>(10);

    protected _ndcTriangle: NdcFillingTriangle;
    protected _ndcOffsetKernel: AntiAliasingKernel;
    protected _uNdcOffset: WebGLUniformLocation;

    protected _texture: Texture2D;
    protected _defaultFBO: Framebuffer;

    protected _assetProgram: Program;
    protected _assetHierarchyProgram: Program;
    protected _uViewProjection: WebGLUniformLocation;
    protected _uModel: WebGLUniformLocation;
    protected _uBaked: WebGLUniformLocation;
    protected _uBuildingModelContainsLightmap: WebGLUniformLocation;

    protected _shadowProgram: Program;
    protected _uModelShadow: WebGLUniformLocation;
    protected _uLightNearFar: WebGLUniformLocation;
    protected _uLightViewProjection: WebGLUniformLocation;
    protected _uLightPosition: WebGLUniformLocation;
    protected _uShadowMap: WebGLUniformLocation;
    protected _uSunIsUp: WebGLUniformLocation;
    protected _uEnableShadowMapping: WebGLUniformLocation;

    protected _uUseLowBitDistanceMap: WebGLUniformLocation;
    protected _sensorDistanceMapTexture3DHigh: Texture3D;
    protected _sensorDistanceMapTexture3DLow: Texture3D;
    protected _outsideDistanceMapTexture3D: Texture3D;
    protected _uSensorDistanceMap3DHigh: WebGLUniformLocation;
    protected _uSensorDistanceMap3DLow: WebGLUniformLocation;
    protected _uOutsideDistanceMap3D: WebGLUniformLocation;
    protected _uBboxMin: WebGLUniformLocation;
    protected _uBboxMax: WebGLUniformLocation;
    protected _uSensorVisualizationYRange: WebGLUniformLocation;

    protected _uColorScaleTexture: WebGLUniformLocation;
    protected _colorScaleTextures = new Array<Texture2D>();

    protected _labelPass: LabelRenderPass;

    protected _labels: Label[];
    protected _fontFace: FontFace | undefined;
    protected _iconFontFace: FontFace | undefined;
    protected _sensorFontFace: FontFace | undefined;

    protected _chromaticAberrationProgram: Program;
    protected _uCAResolution: WebGLUniformLocation;
    protected _uCAHoveredAssetEncodedID: WebGLUniformLocation;

    protected _sharpenProgram: Program;
    protected _uSharpenResolution: WebGLUniformLocation;

    protected _enableEdgeOutlineRendering = false;
    protected _edgeProgram: Program;
    protected _uEdgeEnableOutlineRendering: WebGLUniformLocation;
    protected _uEdgeResolution: WebGLUniformLocation;
    protected _uEdgeView: WebGLUniformLocation;
    protected _uEdgeNear: WebGLUniformLocation;
    protected _uEdgeFar: WebGLUniformLocation;
    protected _uEdgeScreenSize: WebGLUniformLocation;

    protected _enableSSAO = false;
    protected _ssaoProgram: Program;
    protected _ssaoSpiralKernelTexture: Texture2D;
    protected _uSSAOEnableSSAO: WebGLUniformLocation;
    protected _uSSAOView: WebGLUniformLocation;
    protected _uSSAOProjection: WebGLUniformLocation;
    protected _uSSAOInvProjection: WebGLUniformLocation;
    protected _uSSAONear: WebGLUniformLocation;
    protected _uSSAOFar: WebGLUniformLocation;
    protected _uSSAOScreenSize: WebGLUniformLocation;
    protected _uSSAOKernel: WebGLUniformLocation;
    protected _uSSAOMinDistance: WebGLUniformLocation;
    protected _uSSAOMaxDistance: WebGLUniformLocation;
    protected _uSSAOSpiralKernel: WebGLUniformLocation;
    protected _uSSAOFrameNumber: WebGLUniformLocation;

    protected _accumulate: AccumulatePass;
    protected _blit: BlitPass;

    protected _debugPass: DebugPass;

    protected _noDrag: boolean;

    constructor(options: RoomCanvasRendererOptions) {
        super();
        this._buildingModelGltfUri = options.buildingModelGltfUri;
        this._buildingModelHierarchyGltfUri = options.buildingModelHierarchyGltfUri;
        this._labelFontFntUri = options.labelFontFntUri;
        this._iconFontFntUri = options.iconFontFntUri;
        this._sensorFontFntUri = options.sensorFontFntUri;
    }

    public forceRerender(force?: boolean): void {
        this.assertInitialized();
        this.invalidate(force ?? false);
    }

    get camera(): Camera {
        return this._camera;
    }

    set camera(camera: Camera) {
        if (camera === this._camera) {
            return;
        }

        this._camera = camera;
        this._camera.altered = true;

        this.invalidate(true);
    }

    get camera$(): Observable<Camera> {
        return this._cameraSubject.asObservable();
    }

    get hoverEvent(): HoverEvent {
        return this._hoverEvent;
    }

    set hoverEvent(hoverEvent: HoverEvent) {
        if (JSON.stringify(hoverEvent) === JSON.stringify(this._hoverEvent)) {
            return;
        }

        this._hoverEvent = hoverEvent;
        this.hoverEventNext();
    }

    get hoverEvent$(): Observable<HoverEvent> {
        return this._hoverEventSubject.asObservable();
    }

    onSensorIndicesChange(): void {
        const sensorValuesUniforms = [];
        const debugSensorIndicesUniforms = [];
        const volumeSensorValuesUniforms = [];

        if (this.sensorValues && this.sensorValues.length > 0) {
            for (let sensorIndex = 0; sensorIndex < this.sensorValues.length; sensorIndex++) {
                sensorValuesUniforms.push(this._assetProgram.uniform(`u_sensorValues[${sensorIndex}]`));
                volumeSensorValuesUniforms.push(this._volumeRenderingProgram.uniform(`u_sensorValues[${sensorIndex}]`));
                debugSensorIndicesUniforms.push(this._assetProgram.uniform(`u_debugSensorIndices[${sensorIndex}]`));
            }
            void this.initializeSensorDistanceMapTexture3D(this.sensorValues).then(() => {
                this.invalidate(true);
            });

            this._uDebugSensorIndices = debugSensorIndicesUniforms;
            this._uSensorValues = sensorValuesUniforms;
            this._uVolumeSensorValues = volumeSensorValuesUniforms;
        }
    }

    onAssetIndicesChange(): void {
        const assetValuesUniforms = [];
        const assetIndicesUniforms = [];

        if (this.assetValues && this.assetValues.length > 0) {
            for (let assetIndex = 0; assetIndex < this.assetValues.length; assetIndex++) {
                assetValuesUniforms.push(this._assetProgram.uniform(`u_assetValues[${assetIndex}]`));
                assetIndicesUniforms.push(this._assetProgram.uniform(`u_assetIndices[${assetIndex}]`));
            }
            this._uAssetValues = assetValuesUniforms;
            this._uAssetIndices = assetIndicesUniforms;
        }
    }

    updateLabels(): void {
        const labels = [];

        this._labelPass.labels = [];

        if (this.enableSensorIcons) {
            if (this.sensorValueLabels && this.sensorValueLabels.length > 0) {
                for (const sensorValueLabel of this.sensorValueLabels) {
                    const backgroundLabel = new Position3DLabel(new Text('A'), Label.Type.Static);
                    backgroundLabel.lineAnchor = Label.LineAnchor.Center;
                    backgroundLabel.alignment = Label.Alignment.Center;
                    backgroundLabel.position = vec3.add(vec3.create(), sensorValueLabel.position, vec3.fromValues(0, 0.25, 0));
                    backgroundLabel.color.fromHex('#F0F0F0');
                    backgroundLabel.fontFace = this._sensorFontFace;
                    backgroundLabel.fontSize = 0.25 * this.fontSizeInMeters;
                    backgroundLabel.fontSizeUnit = Label.Unit.World;
                    labels.push(backgroundLabel);

                    const foregroundLabel = new Position3DLabel(new Text('B'), Label.Type.Static);
                    foregroundLabel.lineAnchor = Label.LineAnchor.Center;
                    foregroundLabel.alignment = Label.Alignment.Center;
                    foregroundLabel.position = vec3.add(vec3.create(), sensorValueLabel.position, vec3.fromValues(0, 0.25, 0));
                    foregroundLabel.color.fromHex('#C1C2C6');
                    foregroundLabel.fontFace = this._sensorFontFace;
                    foregroundLabel.fontSize = 0.25 * this.fontSizeInMeters;
                    foregroundLabel.fontSizeUnit = Label.Unit.World;
                    labels.push(foregroundLabel);
                }
            }
        }

        if (this.sensorValueLabelsConfig.displayLabels) {
            if (this.sensorValueLabels && this.sensorValueLabels.length > 0) {
                if (this.sensorValueLabelsConfig.approximateOptimalLabellingPositions) {
                    // TODO(config): Make this value configuration-based/dynamic
                    const availableSensorLabellingPositions = [
                        {
                            name: 'sensor_334',
                            labellingPositions: [
                                {
                                    position: [10.902435302734375, -3.953610897064209, 2.440000534057617],
                                    runningDirectionLocalX: [1.0, 0.0, 0.0],
                                    upLocalY: [0.0, -4.371138828673793e-8, 1.0],
                                    frontFaceLocalZ: [0.0, -1.0, -4.371138828673793e-8],
                                    runningLengthLocalXLength: 5.250566482543945,
                                },
                                {
                                    position: [10.902435302734375, -4.953610897064209, 0.0],
                                    runningDirectionLocalX: [1.0, 0.0, 0.0],
                                    upLocalY: [0.0, 1.0, 0.0],
                                    frontFaceLocalZ: [0.0, 0.0, 1.0],
                                    runningLengthLocalXLength: 5.250566482543945,
                                },
                                {
                                    position: [15.65300178527832, -4.453610897064209, 0.0],
                                    runningDirectionLocalX: [-4.371138828673793e-8, -1.0, 0.0],
                                    upLocalY: [1.0, -4.371138828673793e-8, 0.0],
                                    frontFaceLocalZ: [0.0, 0.0, 1.0],
                                    runningLengthLocalXLength: 3.2505664825439453,
                                },
                                {
                                    position: [16.075592041015625, -6.079219818115234, 3.536251469427043e-8],
                                    runningDirectionLocalX: [-0.9883854985237122, -0.15196755528450012, 0.0],
                                    upLocalY: [0.15196755528450012, -0.9883854985237122, 0.0],
                                    frontFaceLocalZ: [0.0, 0.0, 1.0],
                                    runningLengthLocalXLength: 5.230540752410889,
                                },
                                {
                                    position: [11.402435302734375, -7.3036088943481445, 0.0],
                                    runningDirectionLocalX: [-4.371138828673793e-8, 1.0, 0.0],
                                    upLocalY: [-1.0, -4.371138828673793e-8, 0.0],
                                    frontFaceLocalZ: [0.0, 0.0, 1.0],
                                    runningLengthLocalXLength: 2.8499979972839355,
                                },
                                {
                                    position: [16.65300178527832, -4.453610897064209, 2.440000534057617],
                                    runningDirectionLocalX: [-4.371138828673793e-8, -1.0, 0.0],
                                    upLocalY: [-4.371138828673793e-8, 1.910685676922942e-15, 1.0],
                                    frontFaceLocalZ: [-1.0, 4.371138828673793e-8, -4.371138828673793e-8],
                                    runningLengthLocalXLength: 0.9743843078613281,
                                },
                            ],
                        },
                        {
                            name: 'sensor_340',
                            labellingPositions: [
                                {
                                    position: [6.387650012969971, -2.5014688968658447, 2.440000534057617],
                                    runningDirectionLocalX: [1.0, 0.0, 0.0],
                                    upLocalY: [0.0, -4.371138828673793e-8, 1.0],
                                    frontFaceLocalZ: [0.0, -1.0, -4.371138828673793e-8],
                                    runningLengthLocalXLength: 3.159862518310547,
                                },
                                {
                                    position: [10.04751205444336, -3.0014688968658447, 2.440000534057617],
                                    runningDirectionLocalX: [-4.371138828673793e-8, -1.0, 0.0],
                                    upLocalY: [-4.371138828673793e-8, 1.910685676922942e-15, 1.0],
                                    frontFaceLocalZ: [-1.0, 4.371138828673793e-8, -4.371138828673793e-8],
                                    runningLengthLocalXLength: 1.4000763893127441,
                                },
                                {
                                    position: [10.04751205444336, -7.361545085906982, 2.440000534057617],
                                    runningDirectionLocalX: [-4.371138828673793e-8, -1.0, 0.0],
                                    upLocalY: [-4.371138828673793e-8, 1.910685676922942e-15, 1.0],
                                    frontFaceLocalZ: [-1.0, 4.371138828673793e-8, -4.371138828673793e-8],
                                    runningLengthLocalXLength: 1.7202086448669434,
                                },
                                {
                                    position: [5.887650012969971, -8.82999324798584, 2.440000534057617],
                                    runningDirectionLocalX: [-4.371138828673793e-8, 1.0, 0.0],
                                    upLocalY: [4.371138828673793e-8, 1.910685676922942e-15, 1.0],
                                    frontFaceLocalZ: [1.0, 4.371138828673793e-8, -4.371138828673793e-8],
                                    runningLengthLocalXLength: 5.828524112701416,
                                },
                                {
                                    position: [6.887650012969971, -9.081753730773926, 2.384185791015625e-7],
                                    runningDirectionLocalX: [-4.371138828673793e-8, 1.0, -4.371139183945161e-8],
                                    upLocalY: [-1.0, -4.371138828673793e-8, 0.0],
                                    frontFaceLocalZ: [-1.910685676922942e-15, 4.371139183945161e-8, 1.0],
                                    runningLengthLocalXLength: 6.08028507232666,
                                },
                                {
                                    position: [6.3876495361328125, -3.5014686584472656, 2.384185791015625e-7],
                                    runningDirectionLocalX: [1.0, 0.0, -4.371138828673793e-8],
                                    upLocalY: [0.0, 1.0, 0.0],
                                    frontFaceLocalZ: [4.371138828673793e-8, 0.0, 1.0],
                                    runningLengthLocalXLength: 3.159862518310547,
                                },
                                {
                                    position: [9.04751205444336, -3.0014686584472656, 7.844090532671544e-8],
                                    runningDirectionLocalX: [-4.371138828673793e-8, -1.0, -4.371138473402425e-8],
                                    upLocalY: [1.0, -4.371138828673793e-8, 0.0],
                                    frontFaceLocalZ: [-1.910685465164705e-15, -4.371138473402425e-8, 1.0],
                                    runningLengthLocalXLength: 6.08028507232666,
                                },
                                {
                                    position: [9.54751205444336, -8.581753730773926, -8.153676844813162e-8],
                                    runningDirectionLocalX: [-1.0, -3.2584136988589307e-7, -4.371138828673793e-8],
                                    upLocalY: [3.2584136988589307e-7, -1.0, 0.0],
                                    frontFaceLocalZ: [-4.371138828673793e-8, -1.4242977592693676e-14, 1.0],
                                    runningLengthLocalXLength: 3.159862518310547,
                                },
                            ],
                        },
                        {
                            name: 'sensor_348',
                            labellingPositions: [
                                {
                                    position: [9.574624061584473, -2.081545114517212, 2.440000534057617],
                                    runningDirectionLocalX: [-1.0, 3.2584136988589307e-7, 0.0],
                                    upLocalY: [1.424297928675957e-14, 4.371138828673793e-8, 1.0],
                                    frontFaceLocalZ: [3.2584136988589307e-7, 1.0, -4.371138828673793e-8],
                                    runningLengthLocalXLength: 4.082021236419678,
                                },
                                {
                                    position: [9.907085418701172, -0.21172448992729187, 2.440000534057617],
                                    runningDirectionLocalX: [0.1917017102241516, -0.9814532399177551, 0.0],
                                    upLocalY: [-4.2900683894231406e-8, -8.379548610548682e-9, 1.0],
                                    frontFaceLocalZ: [-0.9814532399177551, -0.1917017102241516, -4.371138828673793e-8],
                                    runningLengthLocalXLength: 1.2968246936798096,
                                },
                                {
                                    position: [6.772068977355957, 0.1730043888092041, 2.440000534057617],
                                    runningDirectionLocalX: [1.0, -2.384185791015625e-7, 0.0],
                                    upLocalY: [-1.042160708588074e-14, -4.371138828673793e-8, 1.0],
                                    frontFaceLocalZ: [-2.384185791015625e-7, -1.0, -4.371138828673793e-8],
                                    runningLengthLocalXLength: 2.3639111518859863,
                                },
                                {
                                    position: [6.772068977355957, -0.8269956111907959, -5.989629130453977e-7],
                                    runningDirectionLocalX: [1.0, 1.0421607932913687e-14, 0.0],
                                    upLocalY: [-1.0421607932913687e-14, 1.0, 0.0],
                                    frontFaceLocalZ: [0.0, 0.0, 1.0],
                                    runningLengthLocalXLength: 2.7162458896636963,
                                },
                                {
                                    position: [8.995345115661621, -0.38659653067588806, -0.00013077646144665778],
                                    runningDirectionLocalX: [0.11715324223041534, -0.9931138753890991, 0.0],
                                    upLocalY: [0.9930354356765747, 0.11714398860931396, -0.01256520114839077],
                                    frontFaceLocalZ: [0.012478675693273544, 0.001472054049372673, 0.9999210834503174],
                                    runningLengthLocalXLength: 1.2032339572906494,
                                },
                                {
                                    position: [9.5807523727417, -1.081545114517212, -1.417347334609076e-6],
                                    runningDirectionLocalX: [-1.0, 3.2584136988589307e-7, 0.0],
                                    upLocalY: [-3.2584136988589307e-7, -1.0, 0.0],
                                    frontFaceLocalZ: [0.0, 0.0, 1.0],
                                    runningLengthLocalXLength: 4.088149070739746,
                                },
                                {
                                    position: [7.272068977355957, -1.5815448760986328, -5.989629130453977e-7],
                                    runningDirectionLocalX: [-4.371138828673793e-8, 1.0, 0.0],
                                    upLocalY: [-1.0, -4.371138828673793e-8, 0.0],
                                    frontFaceLocalZ: [0.0, 0.0, 1.0],
                                    runningLengthLocalXLength: 1.254549264907837,
                                },
                                {
                                    position: [5.590078830718994, -0.5913158059120178, 2.440000534057617],
                                    runningDirectionLocalX: [1.0, -2.384185791015625e-7, 0.0],
                                    upLocalY: [-1.042160708588074e-14, -4.371138828673793e-8, 1.0],
                                    frontFaceLocalZ: [-2.384185791015625e-7, -1.0, -4.371138828673793e-8],
                                    runningLengthLocalXLength: 0.18199026584625244,
                                },
                            ],
                        },
                        {
                            name: 'sensor_344',
                            labellingPositions: [
                                {
                                    position: [4.992602825164795, -2.081545114517212, 2.440000534057617],
                                    runningDirectionLocalX: [-1.0, 3.2584136988589307e-7, 0.0],
                                    upLocalY: [1.424297928675957e-14, 4.371138828673793e-8, 1.0],
                                    frontFaceLocalZ: [3.2584136988589307e-7, 1.0, -4.371138828673793e-8],
                                    runningLengthLocalXLength: 4.023294925689697,
                                },
                                {
                                    position: [4.992602825164795, -1.0815445184707642, 0.0],
                                    runningDirectionLocalX: [-1.0, -1.5099580252808664e-7, 3.258413983076025e-7],
                                    upLocalY: [1.5099580252808664e-7, -1.0, 0.0],
                                    frontFaceLocalZ: [3.258413983076025e-7, 4.920068123531393e-14, 1.0],
                                    runningLengthLocalXLength: 4.023294925689697,
                                },
                                {
                                    position: [0.9693081378936768, -1.5913150310516357, 1.3109560086377314e-6],
                                    runningDirectionLocalX: [1.0, 2.384185791015625e-7, 3.258413983076025e-7],
                                    upLocalY: [-2.384185791015625e-7, 1.0, 0.0],
                                    frontFaceLocalZ: [-3.258413983076025e-7, -7.768664319696486e-14, 1.0],
                                    runningLengthLocalXLength: 4.023294925689697,
                                },
                                {
                                    position: [0.46930885314941406, -1.581545114517212, 2.440000534057617],
                                    runningDirectionLocalX: [4.887620548288396e-7, 1.0, 0.0],
                                    upLocalY: [4.371138828673793e-8, -2.1364468083106408e-14, 1.0],
                                    frontFaceLocalZ: [1.0, -4.887620548288396e-7, -4.371138828673793e-8],
                                    runningLengthLocalXLength: 0.3201301097869873,
                                },
                                {
                                    position: [1.0667839050292969, -0.5913159847259521, 2.440000534057617],
                                    runningDirectionLocalX: [1.0, -2.384185791015625e-7, 0.0],
                                    upLocalY: [-1.042160708588074e-14, -4.371138828673793e-8, 1.0],
                                    frontFaceLocalZ: [-2.384185791015625e-7, -1.0, -4.371138828673793e-8],
                                    runningLengthLocalXLength: 4.023294925689697,
                                },
                            ],
                        },
                        {
                            name: 'sensor_329',
                            labellingPositions: [
                                {
                                    position: [5.505824089050293, 3.5917341709136963, 2.440000534057617],
                                    runningDirectionLocalX: [0.4623939096927643, -0.8866746425628662, 0.0],
                                    upLocalY: [-3.875777920825385e-8, -2.0211880169540564e-8, 1.0],
                                    frontFaceLocalZ: [-0.8866746425628662, -0.4623939096927643, -4.371138828673793e-8],
                                    runningLengthLocalXLength: 0.8023757934570312,
                                },
                                {
                                    position: [6.112298011779785, 1.939173936843872, 2.440000534057617],
                                    runningDirectionLocalX: [-4.371138828673793e-8, -1.0, 0.0],
                                    upLocalY: [-4.371138828673793e-8, 1.910685676922942e-15, 1.0],
                                    frontFaceLocalZ: [-1.0, 4.371138828673793e-8, -4.371138828673793e-8],
                                    runningLengthLocalXLength: 1.870718002319336,
                                },
                                {
                                    position: [4.693078517913818, 0.06845593452453613, 2.440000534057617],
                                    runningDirectionLocalX: [-4.371138828673793e-8, 1.0, 0.0],
                                    upLocalY: [4.371138828673793e-8, 1.910685676922942e-15, 1.0],
                                    frontFaceLocalZ: [1.0, 4.371138828673793e-8, -4.371138828673793e-8],
                                    runningLengthLocalXLength: 3.1540756225585938,
                                },
                                {
                                    position: [5.61165189743042, -0.43154358863830566, 2.440000534057617],
                                    runningDirectionLocalX: [-1.0, 3.2584136988589307e-7, 0.0],
                                    upLocalY: [1.424297928675957e-14, 4.371138828673793e-8, 1.0],
                                    frontFaceLocalZ: [3.2584136988589307e-7, 1.0, -4.371138828673793e-8],
                                    runningLengthLocalXLength: 0.41857385635375977,
                                },
                                {
                                    position: [5.153703212738037, 2.8081650733947754, 4.76837158203125e-7],
                                    runningDirectionLocalX: [-4.371138828673793e-8, -1.0, 4.371139183945161e-8],
                                    upLocalY: [1.0, -4.371138828673793e-8, 0.0],
                                    frontFaceLocalZ: [1.910685676922942e-15, 4.371139183945161e-8, 1.0],
                                    runningLengthLocalXLength: 2.7397091388702393,
                                },
                                {
                                    position: [5.653703212738037, 0.06845593452453613, 5.965936225038604e-7],
                                    runningDirectionLocalX: [-4.371138828673793e-8, 1.0, 4.371139183945161e-8],
                                    upLocalY: [-1.0, -4.371138828673793e-8, 0.0],
                                    frontFaceLocalZ: [1.910685676922942e-15, -4.371139183945161e-8, 1.0],
                                    runningLengthLocalXLength: 2.7397091388702393,
                                },
                            ],
                        },
                        {
                            name: 'sensor_324',
                            labellingPositions: [
                                {
                                    position: [0.8427534103393555, 0.06845599412918091, 2.440000534057617],
                                    runningDirectionLocalX: [-4.371138828673793e-8, 1.0, 0.0],
                                    upLocalY: [4.371138828673793e-8, 1.910685676922942e-15, 1.0],
                                    frontFaceLocalZ: [1.0, 4.371138828673793e-8, -4.371138828673793e-8],
                                    runningLengthLocalXLength: 0.8691620826721191,
                                },
                                {
                                    position: [0.5667845010757446, 1.9376180171966553, 2.440000534057617],
                                    runningDirectionLocalX: [-4.371138828673793e-8, 1.0, 0.0],
                                    upLocalY: [4.371138828673793e-8, 1.910685676922942e-15, 1.0],
                                    frontFaceLocalZ: [1.0, 4.371138828673793e-8, -4.371138828673793e-8],
                                    runningLengthLocalXLength: 0.9069259166717529,
                                },
                                {
                                    position: [2.9671969413757324, -0.4315435588359833, 2.440000534057617],
                                    runningDirectionLocalX: [-1.0, -3.2584136988589307e-7, 0.0],
                                    upLocalY: [-1.424297928675957e-14, 4.371138828673793e-8, 1.0],
                                    frontFaceLocalZ: [-3.2584136988589307e-7, 1.0, -4.371138828673793e-8],
                                    runningLengthLocalXLength: 1.6244440078735352,
                                },
                                {
                                    position: [3.4671969413757324, 3.108569860458374, 2.440000534057617],
                                    runningDirectionLocalX: [4.887620548288396e-7, -1.0, 0.0],
                                    upLocalY: [-4.371138828673793e-8, -2.1364468083106408e-14, 1.0],
                                    frontFaceLocalZ: [-1.0, -4.887620548288396e-7, -4.371138828673793e-8],
                                    runningLengthLocalXLength: 3.040113925933838,
                                },
                                {
                                    position: [2.0525240898132324, 3.608570098876953, 2.440000534057617],
                                    runningDirectionLocalX: [1.0, 6.516827397717861e-7, 0.0],
                                    upLocalY: [2.848595857351914e-14, -4.371138828673793e-8, 1.0],
                                    frontFaceLocalZ: [6.516827397717861e-7, -1.0, -4.371138828673793e-8],
                                    runningLengthLocalXLength: 0.9146728515625,
                                },
                                {
                                    position: [2.4671969413757324, 3.108570098876953, 0.0],
                                    runningDirectionLocalX: [1.1924880638503055e-8, -1.0, -4.887621116722585e-7],
                                    upLocalY: [1.0, 1.1924880638503055e-8, 0.0],
                                    frontFaceLocalZ: [5.828429898408578e-15, -4.887621116722585e-7, 1.0],
                                    runningLengthLocalXLength: 3.040114164352417,
                                },
                                {
                                    position: [2.9671969413757324, 0.5684559345245361, -1.5077484931680374e-6],
                                    runningDirectionLocalX: [-1.0, 1.5099580252808664e-7, -4.887620548288396e-7],
                                    upLocalY: [-1.5099580252808664e-7, -1.0, 0.0],
                                    frontFaceLocalZ: [-4.887620548288396e-7, 7.380101846483911e-14, 1.0],
                                    runningLengthLocalXLength: 1.6244440078735352,
                                },
                                {
                                    position: [1.8427528142929077, 0.06845629215240479, -2.55528334491828e-6],
                                    runningDirectionLocalX: [1.9470718370939721e-7, 1.0, -4.887619979854207e-7],
                                    upLocalY: [-1.0, 1.9470718370939721e-7, 0.0],
                                    frontFaceLocalZ: [9.516547299541836e-14, 4.887619979854207e-7, 1.0],
                                    runningLengthLocalXLength: 3.040759563446045,
                                },
                                {
                                    position: [1.5667840242385864, 1.9376178979873657, -4.958912995789433e-7],
                                    runningDirectionLocalX: [1.9470718370939721e-7, 1.0, -4.887619979854207e-7],
                                    upLocalY: [-1.0, 1.9470718370939721e-7, 0.0],
                                    frontFaceLocalZ: [9.516547299541836e-14, 4.887619979854207e-7, 1.0],
                                    runningLengthLocalXLength: 1.170952320098877,
                                },
                                {
                                    position: [1.0667845010757446, 2.608570098876953, -2.003954932661145e-6],
                                    runningDirectionLocalX: [1.0, -2.384185791015625e-7, -4.887619411420019e-7],
                                    upLocalY: [2.384185791015625e-7, 1.0, 0.0],
                                    frontFaceLocalZ: [4.887619411420019e-7, -1.165299275259976e-13, 1.0],
                                    runningLengthLocalXLength: 1.9004125595092773,
                                },
                            ],
                        },
                    ];

                    const availableSensorLabellingPositionsMapped = availableSensorLabellingPositions.map((labellingData) => ({
                        ...labellingData,
                        labellingPositions: labellingData.labellingPositions.map((values) => {
                            const { position, frontFaceLocalZ, runningDirectionLocalX, runningLengthLocalXLength, upLocalY } = values;
                            const runningLength = runningLengthLocalXLength;
                            let positionMapped = vec3.fromValues(position[0], position[1], position[2]);
                            positionMapped = vec3.rotateX(
                                positionMapped,
                                positionMapped,
                                vec3.fromValues(0, 0, 0),
                                auxiliaries.DEG2RAD * -90,
                            );
                            let frontFaceNormal = vec3.fromValues(frontFaceLocalZ[0], frontFaceLocalZ[1], frontFaceLocalZ[2]);
                            frontFaceNormal = vec3.rotateX(
                                frontFaceNormal,
                                frontFaceNormal,
                                vec3.fromValues(0, 0, 0),
                                auxiliaries.DEG2RAD * -90,
                            );
                            let runningDirection = vec3.fromValues(
                                runningDirectionLocalX[0],
                                runningDirectionLocalX[1],
                                runningDirectionLocalX[2],
                            );
                            runningDirection = vec3.rotateX(
                                runningDirection,
                                runningDirection,
                                vec3.fromValues(0, 0, 0),
                                auxiliaries.DEG2RAD * -90,
                            );
                            let up = vec3.fromValues(upLocalY[0], upLocalY[1], upLocalY[2]);
                            up = vec3.rotateX(up, up, vec3.fromValues(0, 0, 0), auxiliaries.DEG2RAD * -90);
                            return {
                                position: positionMapped,
                                runningLength,
                                frontFaceNormal,
                                runningDirection,
                                up,
                            };
                        }),
                    }));

                    for (const sensorValueLabel of this.sensorValueLabels) {
                        const availableLabellingPositionsForSensor = availableSensorLabellingPositionsMapped.find(
                            (labellingPos) => labellingPos.name === `sensor_${sensorValueLabel.sensorId}`,
                        );

                        // TODO: Fix the bug that the sensor label positions get only updated properly when rotating/panning the camera,
                        // TODO: *not* when zooming in/out.

                        if (availableLabellingPositionsForSensor) {
                            const possibleSensorLabellingPositions = availableLabellingPositionsForSensor.labellingPositions.flatMap(
                                (labellingPos) => {
                                    const {
                                        // runningLength,
                                        frontFaceNormal,
                                        // runningDirection,
                                        up,
                                        position,
                                    } = labellingPos;
                                    const labelToCameraEye = vec3.sub(v3(), this.camera.eye, position);

                                    // [-1,0) means: camera faces back of labelling position
                                    // 0 means: camera faces labelling position from a 90° angle
                                    // (0, 1] means: camera faces front of labelling position
                                    // 1.0 is optimal (camera faces labelling position right from its front)
                                    const dotProductFrontFaceNormalLabelToCameraEye = vec3.dot(
                                        vec3.normalize(v3(), labelToCameraEye),
                                        frontFaceNormal,
                                    );

                                    // (1) Check that front of labelling position is facing the camera, i.e., that the dot product between the normalized position-to-camera vector and the labelling position’s front facing (normal) vector is >0 (ideally close to 1.0)
                                    if (this.sensorValueLabelsConfig.labellingAlgorithmConfig.filtering.mustFaceCamera) {
                                        if (dotProductFrontFaceNormalLabelToCameraEye < 0.0) {
                                            // The labelling position’s forward (front-facing) normal vector faces ”away from” the camera
                                            return [];
                                        }
                                    }

                                    // (2) Check that labelling position would be inside the visible volume, i.e., that the labelling position transformed to NDC is inside [-1;1]
                                    // FIXME: This takes only the labelling position’s origin (bottom-left point in local space) into account, i.e., the label could still start inside the viewport and get cropped off at the viewport’s bounds

                                    // Offset the labelling position towards its front face (normal) vector slightly to avoid visibility check false negatives caused by z-fighting
                                    let positionWithZOffset = position;
                                    let zFightingOffset = vec3.fromValues(0, 0, 0);
                                    zFightingOffset = vec3.scale(v3(), frontFaceNormal, 0.1);
                                    positionWithZOffset = vec3.add(v3(), position, zFightingOffset);
                                    const labellingPosInNDC3D = vec3.transformMat4(v3(), positionWithZOffset, this._camera.viewProjection);
                                    // labellingPosInNDC3D = vec3.scale(v3(), labellingPosInNDC3D, 1 / labellingPosInNDC3D[2]);
                                    const labellingPosInNDC = vec2.fromValues(labellingPosInNDC3D[0], labellingPosInNDC3D[1]);

                                    if (this.sensorValueLabelsConfig.labellingAlgorithmConfig.filtering.mustBeInsideViewport) {
                                        if (
                                            labellingPosInNDC[0] < -1 ||
                                            labellingPosInNDC[0] > 1 ||
                                            labellingPosInNDC[1] < -1 ||
                                            labellingPosInNDC[1] > 1
                                        ) {
                                            // The labelling position is outside the camera’s viewport
                                            return [];
                                        }
                                    }

                                    // (3) Check that labelling position is not behind an obstacle, i.e., whether the coordsAt() (based on the depth buffer) at the labelling position transformed to NDC is approximately equal to the labelling position
                                    // FIXME: This (as well) takes only the labelling position’s origin (bottom-left point in local space) into account, i.e., the label could be visible at its origin but behind an obstacle at any other point/area inside it’s positioning rectangle
                                    const labelPosOnScreen = vec2.scaleAndAdd(v2(), vec2.fromValues(0.5, 0.5), labellingPosInNDC, 0.5);

                                    const x = labelPosOnScreen[0] * this._depthTexture.width;
                                    const y = (1.0 - labelPosOnScreen[1]) * this._depthTexture.height;

                                    if (this.sensorValueLabelsConfig.labellingAlgorithmConfig.filtering.mustNotBeBehindObstacles) {
                                        if (this._depthTexture.valid && this._readbackPass.initialized) {
                                            const labelPosPotentiallyBehindWall = this._readbackPass.coordsAt(
                                                x,
                                                y,
                                                undefined,
                                                this._camera.viewProjectionInverse as mat4,
                                            );

                                            if (labelPosPotentiallyBehindWall) {
                                                const offsetFromActualWorldPosition = vec3.distance(
                                                    labelPosPotentiallyBehindWall,
                                                    position,
                                                );
                                                if (offsetFromActualWorldPosition > 0.1) {
                                                    // The label is behind an obstacle
                                                    return [];
                                                }
                                            }
                                        }
                                    }

                                    // (4) Check that the labelling position is not upside-down, i.e., that the dot product between (a) the labelling position’s up vector transformed to NDC and (b) the NDC’s up/y vector (0, +1, 0) is >0 (ideally close to 1.0)
                                    // FIXME: Better take the runningDirection into account (as well), because otherwise upside-down placements are still possible due to perspective distortion effects
                                    const translatedUp = vec3.add(v3(), position, up);
                                    const translatedUpInNDC3D = vec3.transformMat4(v3(), translatedUp, this._camera.viewProjection);
                                    const translatedUpInNDC = vec2.fromValues(translatedUpInNDC3D[0], translatedUpInNDC3D[1]);

                                    const labellingUpInNDC = vec2.normalize(
                                        v2(),
                                        vec2.subtract(v2(), translatedUpInNDC, labellingPosInNDC),
                                    );

                                    const dotProductLabellingUpToViewportUpNDC = vec2.dot(labellingUpInNDC, vec2.fromValues(0.0, 1.0));

                                    if (this.sensorValueLabelsConfig.labellingAlgorithmConfig.filtering.mustNotBeUpsideDown) {
                                        if (dotProductLabellingUpToViewportUpNDC < 0.0) {
                                            // The labelling position’s up vector points downwards (in screen space), i.e., the label would be upside down
                                            return [];
                                        }
                                    }

                                    return [
                                        {
                                            ...labellingPos,
                                            distanceToCameraEye: vec3.distance(this._camera.eye, position),
                                            dotProductFrontFaceNormalLabelToCameraEye,
                                            dotProductLabellingUpToViewportUpNDC,
                                        },
                                    ];
                                },
                            );

                            if (possibleSensorLabellingPositions.length > 0) {
                                const bestSensorLabellingPosition = possibleSensorLabellingPositions.reduce((prev, curr) => {
                                    // If all applies, i.e., if there are multiple candidates matching:
                                    // Sort descending by:

                                    // (a) The labelling position’s runningLength (larger is better, because the label probably won’t have to be cut off)
                                    if (curr.runningLength > prev.runningLength) {
                                        return curr;
                                    }
                                    // (b) The inverse of the distance to the camera -- length(labelToCameraEye) (smaller is better, because the resulting text will be larger on screen)
                                    if (curr.distanceToCameraEye < prev.distanceToCameraEye) {
                                        return curr;
                                    }

                                    // (c) The dot product described in (1) (larger is better, because the label faces more “directly” into the camera)
                                    if (curr.dotProductFrontFaceNormalLabelToCameraEye > prev.dotProductFrontFaceNormalLabelToCameraEye) {
                                        return curr;
                                    }

                                    // (d) The dot product described in (4) (larger is better, because the label is more “straightly” aligned to a horizontal line on the screen)
                                    if (curr.dotProductLabellingUpToViewportUpNDC > prev.dotProductLabellingUpToViewportUpNDC) {
                                        return curr;
                                    }

                                    return prev;
                                    // TODO: Reduce potential flakiness of the labelling algorithm by preferring recently-chosen positions in favour of potentially slightly better positions
                                });

                                const text = new Text(`${sensorValueLabel.labelText}`);
                                const textLabel = new Position3DLabel(text, Label.Type.Static);
                                textLabel.lineAnchor = Label.LineAnchor.Baseline;
                                textLabel.alignment = Label.Alignment.Left;
                                textLabel.lineWidth = bestSensorLabellingPosition.runningLength;
                                textLabel.elide = Label.Elide.Right;
                                textLabel.position = bestSensorLabellingPosition.position;
                                let zFightingOffset = vec3.fromValues(0, 0, 0);
                                zFightingOffset = vec3.scale(zFightingOffset, bestSensorLabellingPosition.frontFaceNormal, 1e-3);
                                textLabel.position = vec3.add(textLabel.position, textLabel.position, zFightingOffset);
                                textLabel.direction = bestSensorLabellingPosition.runningDirection;
                                textLabel.up = bestSensorLabellingPosition.up;
                                textLabel.fontSize = 0.5 * this.fontSizeInMeters;
                                textLabel.fontSizeUnit = Label.Unit.World;
                                textLabel.fontFace = this._fontFace;
                                textLabel.color.fromHex('#FFFFFF');
                                labels.push(textLabel);
                            }
                        }
                    }
                } else {
                    for (const sensorValueLabel of this.sensorValueLabels) {
                        const textLabel = new Position3DLabel(new Text(`${sensorValueLabel.labelText}`), Label.Type.Static);
                        textLabel.lineAnchor = Label.LineAnchor.Center;
                        textLabel.alignment = Label.Alignment.Left;
                        textLabel.position = vec3.add(vec3.create(), sensorValueLabel.position, vec3.fromValues(0.25, 0.25, 0));
                        textLabel.color.fromHex('#FFFFFF');
                        textLabel.fontFace = this._fontFace;
                        textLabel.fontSize = 0.25 * this.fontSizeInMeters;
                        textLabel.fontSizeUnit = Label.Unit.World;
                        labels.push(textLabel);
                    }
                }
            }
        }

        this._labelPass.labels = labels;

        const metadata = this.labellingMetadata;

        // TODO: Get rid of need for explicit `rotationAroundYInDegrees` property by inferring rotation from `direction` and `up`
        // TODO: @see webgl-operate’s Position3DLabel#typeset
        const availableLabellingPositions = [
            {
                name: 'east',
                direction: vec3.fromValues(1, 0, 0),
                up: vec3.fromValues(0, 0, -1),
                position: vec3.fromValues(
                    this.apartmentBboxMin[0],
                    this.apartmentBboxMin[1] + this.basePlaneYOffset + 1e-1,
                    this.apartmentBboxMax[2] + 1.5 * this.fontSizeInMeters,
                ),
                rotationAroundYInDegrees: 0,
            },
            {
                name: 'south',
                direction: vec3.fromValues(0, 0, 1),
                up: vec3.fromValues(1, 0, 0),
                position: vec3.fromValues(
                    this.apartmentBboxMin[0] - 1.5 * this.fontSizeInMeters,
                    this.apartmentBboxMin[1] + this.basePlaneYOffset + 1e-1,
                    this.apartmentBboxMin[2],
                ),
                rotationAroundYInDegrees: 270,
            },
            {
                name: 'west',
                direction: vec3.fromValues(-1, 0, 0),
                up: vec3.fromValues(0, 0, 1),
                position: vec3.fromValues(
                    this.apartmentBboxMax[0],
                    this.apartmentBboxMin[1] + this.basePlaneYOffset + 1e-1,
                    this.apartmentBboxMin[2] - 1.5 * this.fontSizeInMeters,
                ),
                rotationAroundYInDegrees: 180,
            },
            {
                name: 'north',
                direction: vec3.fromValues(0, 0, -1),
                up: vec3.fromValues(-1, 0, 0),
                position: vec3.fromValues(
                    this.apartmentBboxMax[0] + 1.5 * this.fontSizeInMeters,
                    this.apartmentBboxMin[1] + this.basePlaneYOffset + 1e-1,
                    this.apartmentBboxMax[2],
                ),
                rotationAroundYInDegrees: 90,
            },
        ];

        const cameraEyeToCenter = vec3.fromValues(0, 0, 0);
        vec3.subtract(cameraEyeToCenter, this._camera.center, this._camera.eye);

        const labellingPositionWithSmallestAngle = availableLabellingPositions.reduce((prev, curr) => {
            const currentDot = vec3.dot(curr.up, cameraEyeToCenter);
            const prevDot = vec3.dot(prev.up, cameraEyeToCenter);
            if (currentDot > prevDot) {
                return curr;
            } else {
                return prev;
            }
        });

        const lineOrParagraphOffsetDirection = vec3.fromValues(0, 0, 0);
        vec3.negate(lineOrParagraphOffsetDirection, labellingPositionWithSmallestAngle.up);

        const withinLineOffsetDirection = vec3.fromValues(0, 0, 0);
        vec3.negate(withinLineOffsetDirection, labellingPositionWithSmallestAngle.direction);

        if (this.enableMetadataAndColorScaleLabelling) {
            if (metadata?.assetName) {
                const lineOrParagraphOffset = vec3.fromValues(0, 0, 0);
                vec3.scale(lineOrParagraphOffset, lineOrParagraphOffsetDirection, 0.5 * this.fontSizeInMeters);

                const offsetFromIconToStartOfText = vec3.fromValues(0, 0, 0);
                vec3.scale(offsetFromIconToStartOfText, labellingPositionWithSmallestAngle.direction, 1.3 * this.fontSizeInMeters);

                const assetIconLabel = new Position3DLabel(new Text('\u0001'), Label.Type.Static);
                assetIconLabel.lineAnchor = Label.LineAnchor.Baseline;
                assetIconLabel.alignment = Label.Alignment.Left;
                vec3.add(assetIconLabel.position, labellingPositionWithSmallestAngle.position, lineOrParagraphOffset);
                assetIconLabel.direction = labellingPositionWithSmallestAngle.direction;
                assetIconLabel.up = labellingPositionWithSmallestAngle.up;
                assetIconLabel.fontSize = 1.0 * this.fontSizeInMeters;
                assetIconLabel.fontSizeUnit = Label.Unit.World;
                assetIconLabel.fontFace = this._iconFontFace;
                assetIconLabel.color.fromHex('#8e969f');
                this._labelPass.labels.push(assetIconLabel);

                const assetNameLabel = new Position3DLabel(new Text(metadata.assetName), Label.Type.Static);
                assetNameLabel.lineAnchor = Label.LineAnchor.Baseline;
                assetNameLabel.alignment = Label.Alignment.Left;
                vec3.add(assetNameLabel.position, labellingPositionWithSmallestAngle.position, lineOrParagraphOffset);
                vec3.add(assetNameLabel.position, assetNameLabel.position, offsetFromIconToStartOfText);
                assetNameLabel.direction = labellingPositionWithSmallestAngle.direction;
                assetNameLabel.up = labellingPositionWithSmallestAngle.up;
                assetNameLabel.fontSize = 1.0 * this.fontSizeInMeters;
                assetNameLabel.fontSizeUnit = Label.Unit.World;
                assetNameLabel.fontFace = this._fontFace;
                assetNameLabel.color.fromHex('#8e969f');
                this._labelPass.labels.push(assetNameLabel);
            }

            if (metadata?.date) {
                const dateLabel = new Position3DLabel(new Text(metadata.date), Label.Type.Static);
                dateLabel.lineAnchor = Label.LineAnchor.Baseline;
                dateLabel.alignment = Label.Alignment.Left;
                const lineOrParagraphOffset = vec3.fromValues(0, 0, 0);
                vec3.scale(lineOrParagraphOffset, lineOrParagraphOffsetDirection, 2.0 * this.fontSizeInMeters);
                vec3.add(dateLabel.position, labellingPositionWithSmallestAngle.position, lineOrParagraphOffset);
                dateLabel.direction = labellingPositionWithSmallestAngle.direction;
                dateLabel.up = labellingPositionWithSmallestAngle.up;
                dateLabel.fontSize = 1.0 * this.fontSizeInMeters;
                dateLabel.fontSizeUnit = Label.Unit.World;
                dateLabel.fontFace = this._fontFace;
                dateLabel.color.fromHex('#8e969f');
                this._labelPass.labels.push(dateLabel);
            }

            if (metadata?.time) {
                const timeLabel = new Position3DLabel(new Text(metadata.time), Label.Type.Static);
                timeLabel.lineAnchor = Label.LineAnchor.Baseline;
                timeLabel.alignment = Label.Alignment.Left;
                const lineOrParagraphOffset = vec3.fromValues(0, 0, 0);
                vec3.scale(lineOrParagraphOffset, lineOrParagraphOffsetDirection, 3.2 * this.fontSizeInMeters);
                timeLabel.position = vec3.add(timeLabel.position, labellingPositionWithSmallestAngle.position, lineOrParagraphOffset);
                timeLabel.direction = labellingPositionWithSmallestAngle.direction;
                timeLabel.up = labellingPositionWithSmallestAngle.up;
                timeLabel.fontSize = 1.0 * this.fontSizeInMeters;
                timeLabel.fontSizeUnit = Label.Unit.World;
                timeLabel.fontFace = this._fontFace;
                timeLabel.color.fromHex('#8e969f');
                this._labelPass.labels.push(timeLabel);

                const offsetFromStartOfTimeToColorScale = vec3.fromValues(0, 0, 0);
                vec3.scale(offsetFromStartOfTimeToColorScale, labellingPositionWithSmallestAngle.direction, 4.0 * this.fontSizeInMeters);

                if (this._colorScalePlane) {
                    const translation = vec3.fromValues(0, 0, 0);
                    vec3.add(translation, timeLabel.position, offsetFromStartOfTimeToColorScale);
                    const lineOrParagraphOffset = vec3.fromValues(0, 0, 0);
                    vec3.scale(lineOrParagraphOffset, lineOrParagraphOffsetDirection, 0.8 * this.fontSizeInMeters);
                    vec3.sub(translation, translation, lineOrParagraphOffset);
                    this._colorScalePlane.scale = vec2.fromValues(8.0 * this.fontSizeInMeters, 0.8 * this.fontSizeInMeters);
                    this._colorScalePlane.translation = translation;
                    this._colorScalePlane.rotation = quat.fromEuler(
                        quat.fromValues(0, 0, 0, 0),
                        0,
                        labellingPositionWithSmallestAngle.rotationAroundYInDegrees,
                        0,
                    );
                }

                let tickLabels = [];

                for (let tickIndex = 0; tickIndex < this.colorScaleConfiguration.colorScaleStops + 1; tickIndex += 1) {
                    const translation = vec3.fromValues(0, 0, 0);
                    vec3.add(translation, timeLabel.position, offsetFromStartOfTimeToColorScale);
                    const offset = vec3.fromValues(0, 0, 0);
                    vec3.scale(
                        offset,
                        labellingPositionWithSmallestAngle.direction,
                        (8.0 * this.fontSizeInMeters * tickIndex) / this.colorScaleConfiguration.colorScaleStops,
                    );
                    vec3.add(translation, translation, offset);
                    const value =
                        this.sensorMinValue +
                        (tickIndex / this.colorScaleConfiguration.colorScaleStops) * (this.sensorMaxValue - this.sensorMinValue);
                    const tickLabel = new Position3DLabel(new Text(`${parseFloat(value.toFixed(1))}`), Label.Type.Static);
                    tickLabel.lineAnchor = Label.LineAnchor.Top;
                    tickLabel.alignment = Label.Alignment.Center;
                    tickLabel.position = translation;
                    tickLabel.direction = labellingPositionWithSmallestAngle.direction;
                    tickLabel.up = labellingPositionWithSmallestAngle.up;
                    tickLabel.fontSize = 0.5 * this.fontSizeInMeters;
                    tickLabel.fontSizeUnit = Label.Unit.World;
                    tickLabel.fontFace = this._fontFace;
                    tickLabel.color.fromHex('#8e969f');
                    tickLabels.push(tickLabel);
                }

                // TODO: Find a better way of reducing the amount of ticks when amount of color stops is large, e. g., by increasing step width
                if (tickLabels.length > 7) {
                    tickLabels = [tickLabels[0], tickLabels[tickLabels.length - 1]];
                }

                this._labelPass.labels.push(...tickLabels);
            }
        }
    }

    protected cameraNext(): void {
        this._cameraSubject.next(this._camera);
    }

    protected hoverEventNext(): void {
        this._hoverEventSubject.next(this._hoverEvent);
    }

    protected createColorScaleTexture = (
        context: Context,
        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        gl: any,
        i: number,
        source: string,
        preset: string,
        steps: number,
        invert: boolean,
        useLinearFiltering: boolean,
    ): void => {
        const newColorScaleTexture = new Texture2D(context, `Texture${preset}`);
        newColorScaleTexture.initialize(steps, 1, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE);

        if (useLinearFiltering) {
            newColorScaleTexture.filter(gl.LINEAR, gl.LINEAR);
        } else {
            newColorScaleTexture.filter(gl.NEAREST, gl.NEAREST);
        }

        // TODO: Cache the loaded JSON files, i. e., don’t reload if it has already been loaded
        void ColorScale.fromPreset(`./data/colorscales/${source}.json`, preset, steps).then((scale: ColorScale) => {
            if (invert) {
                scale.invert();
            }
            const data = scale.bitsUI8(Color.Space.RGB, false);
            newColorScaleTexture.data(data, true, false);
            this._colorScaleTextures[i] = newColorScaleTexture;
        });
    };

    protected createTransparencyTransferFunctionFromSamplePoints = (sampledCustomTransparencyTransferFunctionPoints: number[]): void => {
        const gl = this._context.gl;
        const useLinearFiltering = true;
        const preset = 'linear';
        const steps = sampledCustomTransparencyTransferFunctionPoints.length;
        const invert = false;
        const transparencyTransferTexture = new Texture2D(this._context, `TransparencyTransferTexture${preset}`);
        transparencyTransferTexture.initialize(steps, 1, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE);
        transparencyTransferTexture.wrap(gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE);

        if (useLinearFiltering) {
            transparencyTransferTexture.filter(gl.LINEAR, gl.LINEAR);
        } else {
            transparencyTransferTexture.filter(gl.NEAREST, gl.NEAREST);
        }

        let dataArray = [...Array(steps).keys()].map((index) => [
            255,
            255,
            255,
            Math.max(0, Math.min(255, Math.round(sampledCustomTransparencyTransferFunctionPoints[index] * 255))),
        ]);

        if (invert) {
            dataArray = dataArray.reverse();
        }

        const data = Uint8Array.from(dataArray.flat());
        transparencyTransferTexture.data(data, true, false);
        this._transparencyTransferTextures[0] = transparencyTransferTexture;
    };

    /**
     * Initializes and sets up rendering passes, navigation, loads a font face and links shaders with program.
     *
     * @param context - valid context to create the object for.
     * @param identifier - meaningful name for identification of this instance.
     * @param eventProvider - required for interaction
     * @returns - whether initialization was successful
     */
    protected onInitialize(context: Context, callback: Invalidate, eventProvider: EventProvider): boolean {
        this.startLoading();

        context.enable([
            'ANGLE_instanced_arrays',
            'OES_standard_derivatives',
            'EXT_shader_texture_lod',
            'WEBGL_color_buffer_float',
            'OES_texture_float',
            'OES_texture_float_linear',
            'OES_texture_half_float',
            'OES_texture_half_float_linear',
            'WEBGL_depth_texture',
            'EXT_color_buffer_float',
            'EXT_color_buffer_half_float',
        ]);

        const gl = this._context.gl;
        const gl2facade = this._context.gl2facade;

        // prettier-ignore
        this.points = new Float32Array([
            // x, y, z, r, g, b, data,
            0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 10.0
        ]);

        // prettier-ignore
        this.lines = new Float32Array([
            // x, y, z, r, g, b,
            0.0, 0.0, 0.0, 1.0, 0.0, 0.0,
            1.0, 0.0, 0.0, 1.0, 0.0, 0.0,

            0.0, 0.0, 0.0, 0.0, 1.0, 0.0,
            0.0, 1.0, 0.0, 0.0, 1.0, 0.0,

            0.0, 0.0, 0.0, 0.0, 0.0, 1.0,
            0.0, 0.0, 1.0, 0.0, 0.0, 1.0,
        ]);

        this.probingLocations = [];

        const vertPoint = new Shader(context, gl.VERTEX_SHADER, 'point.vert');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        vertPoint.initialize(require('./shaders/point.vert'));
        const fragPoint = new Shader(context, gl.FRAGMENT_SHADER, 'point.frag');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        fragPoint.initialize(require('./shaders/point.frag'));

        this._pointsProgram = new Program(context, 'PointProgram');
        this._pointsProgram.initialize([vertPoint, fragPoint], false);

        this._pointsProgram.attribute('a_vertex', 0);
        this._pointsProgram.attribute('a_color', 1);
        this._pointsProgram.attribute('a_data', 2);
        this._pointsProgram.link();
        this._pointsProgram.bind();

        this._uPointsViewProjection = this._pointsProgram.uniform('u_viewProjection');
        this._uPointsNdcOffset = this._pointsProgram.uniform('u_ndcOffset');

        const vertLine = new Shader(context, gl.VERTEX_SHADER, 'line.vert');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        vertLine.initialize(require('./shaders/line.vert'));
        const fragLine = new Shader(context, gl.FRAGMENT_SHADER, 'line.frag');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        fragLine.initialize(require('./shaders/line.frag'));

        this._linesProgram = new Program(context, 'LineProgram');
        this._linesProgram.initialize([vertLine, fragLine], false);

        this._linesProgram.attribute('a_vertex', 0);
        this._linesProgram.attribute('a_color', 1);
        this._linesProgram.link();
        this._linesProgram.bind();

        this._uLinesViewProjection = this._linesProgram.uniform('u_viewProjection');
        this._uLinesNdcOffset = this._linesProgram.uniform('u_ndcOffset');

        this._cuboid = new CuboidGeometry(context, 'Cuboid', true, [2.0, 2.0, 2.0]);
        this._cuboid.initialize();

        const vertFlat = new Shader(context, gl.VERTEX_SHADER, 'mesh.vert');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        vertFlat.initialize(require('./shaders/mesh.vert'));
        const fragFlat = new Shader(context, gl.FRAGMENT_SHADER, 'mesh.frag');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        fragFlat.initialize(require('./shaders/mesh.frag'));

        this._cuboidProgram = new Program(context, 'CubeProgram');
        this._cuboidProgram.initialize([vertFlat, fragFlat], false);

        this._cuboidProgram.attribute('a_vertex', this._cuboid.vertexLocation);
        this._cuboidProgram.attribute('a_texCoord', this._cuboid.uvCoordLocation);
        this._cuboidProgram.link();
        this._cuboidProgram.bind();

        this._uCuboidViewProjection = this._cuboidProgram.uniform('u_viewProjection');
        this._uCuboidModelMatrix = this._cuboidProgram.uniform('u_model');
        this._uCuboidEncodedId = this._cuboidProgram.uniform('u_encodedID');

        this._colorScalePlane = new PlaneGeometryUV01(context, 'ColorScalePlane');
        this._colorScalePlane.scale = vec2.fromValues(8.0 * this.fontSizeInMeters, 0.8 * this.fontSizeInMeters);
        this._colorScalePlane.translation = vec3.fromValues(0.0, 0.0, 0.0);
        // TODO: Update rotation dynamically similar to `availableLabellingPositions` usage
        // const rotation: quat = (undefined as unknown) as quat;
        // quat.fromEuler(rotation, 0, 0, 0);
        // this._colorScalePlane.rotation = rotation;

        // Explicitly set the layout locations of the vertex and texCoord attributes to the ones of mesh.vert:
        this._colorScalePlane.initialize(
            0, // layout(location = 0) in vec3 a_vertex;
            3, // layout(location = 3) in vec2 a_texCoord;
        );

        const fragColorScale = new Shader(context, gl.FRAGMENT_SHADER, 'colorscale.frag');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        fragColorScale.initialize(require('./shaders/colorscale.frag'));

        this._colorScaleProgram = new Program(context, 'ColorScaleProgram');
        this._colorScaleProgram.initialize([vertFlat, fragColorScale], false);

        this._colorScaleProgram.attribute('a_vertex', this._colorScalePlane.vertexLocation);
        this._colorScaleProgram.attribute('a_texCoord', this._colorScalePlane.texCoordLocation);
        this._colorScaleProgram.link();
        this._colorScaleProgram.bind();

        this._uColorScalePlaneViewProjection = this._colorScaleProgram.uniform('u_viewProjection');
        this._uColorScalePlaneModelMatrix = this._colorScaleProgram.uniform('u_model');
        this._uColorScaleNdcOffset = this._colorScaleProgram.uniform('u_ndcOffset');

        this._loader = new GLTFLoader(this._context);
        this._hierarchyLoader = new GLTFLoader(this._context);

        this._defaultFBO = new DefaultFramebuffer(this._context, 'DefaultFBO');
        this._defaultFBO.initialize();

        this._ndcTriangle = new NdcFillingTriangle(this._context);
        this._ndcTriangle.initialize();

        const internalFormatAndType = Wizard.queryInternalTextureFormat(this._context, gl.RGBA, Wizard.Precision.byte);

        this._colorRenderTextures = new Array<Texture2D>(2);

        this._colorRenderTextures[0] = new Texture2D(this._context, 'ColorRenderTexture-0');
        this._colorRenderTextures[0].initialize(1, 1, internalFormatAndType[0], gl.RGBA, internalFormatAndType[1]);
        this._colorRenderTextures[0].filter(gl.LINEAR, gl.LINEAR);
        this._colorRenderTextures[0].wrap(gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE);

        this._colorRenderTextures[1] = new Texture2D(this._context, 'ColorRenderTexture-1');
        this._colorRenderTextures[1].initialize(1, 1, internalFormatAndType[0], gl.RGBA, internalFormatAndType[1]);
        this._colorRenderTextures[1].filter(gl.LINEAR, gl.LINEAR);
        this._colorRenderTextures[1].wrap(gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE);

        const internalFormatAndTypeIDRenderTexture = Wizard.queryInternalTextureFormat(this._context, gl.RGBA, Wizard.Precision.byte);

        this._idRenderTexture = new Texture2D(this._context, 'IDRenderTexture');
        this._idRenderTexture.initialize(1, 1, internalFormatAndTypeIDRenderTexture[0], gl.RGBA, internalFormatAndTypeIDRenderTexture[1]);

        this._idRenderTextureAsset = new Texture2D(this._context, 'IDRenderTextureAsset');
        this._idRenderTextureAsset.initialize(
            1,
            1,
            internalFormatAndTypeIDRenderTexture[0],
            gl.RGBA,
            internalFormatAndTypeIDRenderTexture[1],
        );

        const internalFormatAndTypeFloat = Wizard.queryInternalTextureFormat(this._context, gl.RED, Wizard.Precision.float);

        this._ssaoSpiralKernelTexture = new Texture2D(this._context, 'SSAOSpiralKernelTexture');
        this._ssaoSpiralKernelTexture.initialize(
            2 * SPIRAL_SAMPLES_PER_FRAME,
            // TODO: Get rid of this `|| 64` and instead dynamically resize the texture if the multiFrameNumber ist altered
            this._multiFrameNumber || 64,
            internalFormatAndTypeFloat[0],
            gl.RED,
            internalFormatAndTypeFloat[1],
        );
        this._ssaoSpiralKernelTexture.filter(gl.NEAREST, gl.NEAREST);

        /* Initialize pre depth program */
        const depthVert = new Shader(this._context, gl.VERTEX_SHADER, 'mesh.vert');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        depthVert.initialize(require('./shaders/mesh.vert'));
        const depthFrag = new Shader(this._context, gl.FRAGMENT_SHADER, 'depth.frag');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        depthFrag.initialize(require('./shaders/depth.frag'));
        this._depthProgram = new Program(this._context, 'NormalDepthProgram');
        this._depthProgram.initialize([depthVert, depthFrag], true);
        this._depthProgram.link();
        this._depthProgram.bind();

        this._uDepthView = this._depthProgram.uniform('u_view');
        this._uDepthProjection = this._depthProgram.uniform('u_viewProjection');
        this._uDepthCameraNearFar = this._depthProgram.uniform('u_cameraNearFar');
        this._uDepthModel = this._depthProgram.uniform('u_model');
        this._uDepthNdcOffset = this._depthProgram.uniform('u_ndcOffset');

        this._preDepthRenderbuffer = new Renderbuffer(this._context, 'PreDepthRenderbuffer');
        this._preDepthRenderbuffer.initialize(1, 1, gl.DEPTH_COMPONENT16);

        const depthTextureFormatAndType = Wizard.queryInternalTextureFormat(this._context, gl.RGB, Wizard.Precision.byte);

        this._depthTexture = new Texture2D(this._context, 'DepthTexture');
        this._depthTexture.initialize(1, 1, depthTextureFormatAndType[0], gl.RGB, depthTextureFormatAndType[1]);
        this._depthTexture.wrap(gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE);
        this._depthTexture.filter(gl.LINEAR, gl.LINEAR);

        this._preDepthFBO = new Framebuffer(this._context, 'PreDepthFBO');
        this._preDepthFBO.initialize([
            [gl2facade.COLOR_ATTACHMENT0, this._depthTexture],
            [gl.DEPTH_ATTACHMENT, this._preDepthRenderbuffer],
        ]);

        this._depthRenderbuffer = new Renderbuffer(this._context, 'DepthRenderbuffer');
        this._depthRenderbuffer.initialize(1, 1, gl.DEPTH_COMPONENT16);

        /* Initialize normal G-Buffer program */
        const normalVert = new Shader(this._context, gl.VERTEX_SHADER, 'mesh.vert');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        normalVert.initialize(require('./shaders/mesh.vert'));
        const normalFrag = new Shader(this._context, gl.FRAGMENT_SHADER, 'normal.frag');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        normalFrag.initialize(require('./shaders/normal.frag'));
        this._normalProgram = new Program(this._context, 'NormalProgram');
        this._normalProgram.initialize([normalVert, normalFrag], true);
        this._normalProgram.link();
        this._normalProgram.bind();

        this._uNormalViewProjection = this._normalProgram.uniform('u_viewProjection');
        this._uNormalModel = this._normalProgram.uniform('u_model');
        this._uNormalNdcOffset = this._normalProgram.uniform('u_ndcOffset');

        const internalFormatAndTypeNormalTexture = Wizard.queryInternalTextureFormat(this._context, gl.RGB, Wizard.Precision.byte);

        this._normalTexture = new Texture2D(this._context, 'NormalTexture');
        this._normalTexture.initialize(1, 1, internalFormatAndTypeNormalTexture[0], gl.RGB, internalFormatAndTypeNormalTexture[1]);
        this._normalTexture.filter(gl.LINEAR, gl.LINEAR);
        this._normalTexture.wrap(gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE);

        this._noiseTexture = new Texture2D(this._context, 'NoiseTexture');
        this._noiseTexture.initialize(4, 4, internalFormatAndTypeNormalTexture[0], gl.RGB, internalFormatAndTypeNormalTexture[1]);
        this._noiseTexture.wrap(gl.REPEAT, gl.REPEAT);
        // TODO: Replace this manually copied Simplex noise data from ThreeJS with auto-generated, dynamic one
        this._noiseTexture.data(
            new Uint8Array([
                ((0.14662903547286987 + 1.0) / 2.0) * 255,
                ((0.14662903547286987 + 1.0) / 2.0) * 255,
                ((0.14662903547286987 + 1.0) / 2.0) * 255,
                ((-0.17294633388519287 + 1.0) / 2.0) * 255,
                ((-0.17294633388519287 + 1.0) / 2.0) * 255,
                ((-0.17294633388519287 + 1.0) / 2.0) * 255,
                ((-0.31999874114990234 + 1.0) / 2.0) * 255,
                ((-0.31999874114990234 + 1.0) / 2.0) * 255,
                ((-0.31999874114990234 + 1.0) / 2.0) * 255,
                ((-0.2349499613046646 + 1.0) / 2.0) * 255,
                ((-0.2349499613046646 + 1.0) / 2.0) * 255,
                ((-0.2349499613046646 + 1.0) / 2.0) * 255,
                ((-0.31101223826408386 + 1.0) / 2.0) * 255,
                ((-0.31101223826408386 + 1.0) / 2.0) * 255,
                ((-0.31101223826408386 + 1.0) / 2.0) * 255,
                ((0.5459900498390198 + 1.0) / 2.0) * 255,
                ((0.5459900498390198 + 1.0) / 2.0) * 255,
                ((0.5459900498390198 + 1.0) / 2.0) * 255,
                ((-0.6403372287750244 + 1.0) / 2.0) * 255,
                ((-0.6403372287750244 + 1.0) / 2.0) * 255,
                ((-0.6403372287750244 + 1.0) / 2.0) * 255,
                ((-0.3396574556827545 + 1.0) / 2.0) * 255,
                ((-0.3396574556827545 + 1.0) / 2.0) * 255,
                ((-0.3396574556827545 + 1.0) / 2.0) * 255,
                ((-0.0031710390467196703 + 1.0) / 2.0) * 255,
                ((-0.0031710390467196703 + 1.0) / 2.0) * 255,
                ((-0.0031710390467196703 + 1.0) / 2.0) * 255,
                ((-0.06846035271883011 + 1.0) / 2.0) * 255,
                ((-0.06846035271883011 + 1.0) / 2.0) * 255,
                ((-0.06846035271883011 + 1.0) / 2.0) * 255,
                ((0.2018507719039917 + 1.0) / 2.0) * 255,
                ((0.2018507719039917 + 1.0) / 2.0) * 255,
                ((0.2018507719039917 + 1.0) / 2.0) * 255,
                ((0.11899077892303467 + 1.0) / 2.0) * 255,
                ((0.11899077892303467 + 1.0) / 2.0) * 255,
                ((0.11899077892303467 + 1.0) / 2.0) * 255,
                ((-0.04265100508928299 + 1.0) / 2.0) * 255,
                ((-0.04265100508928299 + 1.0) / 2.0) * 255,
                ((-0.04265100508928299 + 1.0) / 2.0) * 255,
                ((-0.0038338620215654373 + 1.0) / 2.0) * 255,
                ((-0.0038338620215654373 + 1.0) / 2.0) * 255,
                ((-0.0038338620215654373 + 1.0) / 2.0) * 255,
                ((0.2562946379184723 + 1.0) / 2.0) * 255,
                ((0.2562946379184723 + 1.0) / 2.0) * 255,
                ((0.2562946379184723 + 1.0) / 2.0) * 255,
                ((-0.10501603037118912 + 1.0) / 2.0) * 255,
                ((-0.10501603037118912 + 1.0) / 2.0) * 255,
                ((-0.10501603037118912 + 1.0) / 2.0) * 255,
            ]),
        );

        this._intermediateFBOs = new Array<Framebuffer>(4);

        this._intermediateFBOs[0] = new Framebuffer(this._context, 'IntermediateFBO-0');
        this._intermediateFBOs[1] = new Framebuffer(this._context, 'IntermediateFBO-1');
        this._intermediateFBOs[2] = new Framebuffer(this._context, 'IntermediateFBO-2');
        this._intermediateFBOs[3] = new Framebuffer(this._context, 'IntermediateFBO-3');
        this._intermediateFBOs[4] = new Framebuffer(this._context, 'IntermediateFBO-4');

        this._intermediateFBOs[0].initialize([
            [gl2facade.COLOR_ATTACHMENT0, this._colorRenderTextures[0]],
            [gl.DEPTH_ATTACHMENT, this._depthRenderbuffer],
        ]);

        this._intermediateFBOs[1].initialize([[gl2facade.COLOR_ATTACHMENT0, this._colorRenderTextures[1]]]);

        this._intermediateFBOs[2].initialize([
            [gl2facade.COLOR_ATTACHMENT0, this._idRenderTexture],
            [gl.DEPTH_ATTACHMENT, this._depthRenderbuffer],
        ]);

        this._intermediateFBOs[3].initialize([
            [gl2facade.COLOR_ATTACHMENT0, this._idRenderTextureAsset],
            [gl.DEPTH_ATTACHMENT, this._depthRenderbuffer],
        ]);

        this._intermediateFBOs[4].initialize([
            [gl2facade.COLOR_ATTACHMENT0, this._normalTexture],
            [gl.DEPTH_ATTACHMENT, this._depthRenderbuffer],
        ]);

        this._intermediateFBOs[0].clearColor(this._clearColor);
        this._intermediateFBOs[1].clearColor(this._clearColor);
        this._intermediateFBOs[2].clearColor([0, 0, 0, 0]);
        this._intermediateFBOs[3].clearColor([0, 0, 0, 0]);
        this._intermediateFBOs[4].clearColor([0, 0, 0, 0]);

        const vert = new Shader(context, gl.VERTEX_SHADER, 'asset-baked.vert');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        vert.initialize(require('./shaders/asset-baked.vert'));
        const frag = new Shader(context, gl.FRAGMENT_SHADER, 'asset-baked.frag');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        frag.initialize(require('./shaders/asset-baked.frag'));

        this._assetProgram = new Program(context, 'AssetBakedProgram');
        this._assetProgram.initialize([vert, frag], true);
        this._assetProgram.link();
        this._assetProgram.bind();

        const assetIdVert = new Shader(context, gl.VERTEX_SHADER, 'asset-id.vert');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        assetIdVert.initialize(require('./shaders/asset-id.vert'));
        const assetIdFrag = new Shader(context, gl.FRAGMENT_SHADER, 'asset-id.frag');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        assetIdFrag.initialize(require('./shaders/asset-id.frag'));

        this._assetHierarchyProgram = new Program(context, 'AssetHierarchyProgram');
        this._assetHierarchyProgram.initialize([vert, assetIdFrag], true);
        this._assetHierarchyProgram.link();
        this._assetHierarchyProgram.bind();

        this._uHierarchyViewProjection = this._assetHierarchyProgram.uniform('u_viewProjection');
        this._uHierarchyModelMatrix = this._assetHierarchyProgram.uniform('u_model');
        this._uHierarchyEncodedId = this._assetHierarchyProgram.uniform('u_encodedID');
        this._uHierarchyRenderIDToFragColor = this._assetHierarchyProgram.uniform('u_renderIDToFragColor');
        this._uHierarchyHoveredEncodedID = this._assetHierarchyProgram.uniform('u_hoveredEncodedID');
        this._uHierarchyNdcOffset = this._assetHierarchyProgram.uniform('u_ndcOffset');

        const shadowVert = new Shader(context, gl.VERTEX_SHADER, 'shadow.vert');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        shadowVert.initialize(require('./shaders/shadow.vert'));
        const shadowFrag = new Shader(context, gl.FRAGMENT_SHADER, 'shadow.frag');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        shadowFrag.initialize(require('./shaders/shadow.frag'));

        this._shadowProgram = new Program(context);
        this._shadowProgram.initialize([shadowVert, shadowFrag], false);
        this._shadowProgram.attribute('a_vertex', this._ndcTriangle.vertexLocation);
        this._shadowProgram.link();
        this._shadowProgram.bind();

        this._empty1x1TransparentTexture = new Texture2D(this._context, 'Empty1x1TransparentTexture');
        this._empty1x1TransparentTexture.initialize(1, 1, internalFormatAndType[0], gl.RGBA, internalFormatAndType[1]);
        this._empty1x1TransparentTexture.wrap(gl.REPEAT, gl.REPEAT);
        this._empty1x1TransparentTexture.filter(gl.NEAREST, gl.NEAREST);
        this._empty1x1TransparentTexture.data(new ImageData(new Uint8ClampedArray([255, 255, 255, 0]), 1, 1));

        this._uViewProjection = this._assetProgram.uniform('u_viewProjection');
        this._uAssetEncodedId = this._assetProgram.uniform('u_encodedID');
        this._uAssetId = this._assetProgram.uniform('u_ID');
        this._uAssetHoveredID = this._assetProgram.uniform('u_hoveredID');
        this._uInverseDistanceWeightExponent = this._assetProgram.uniform('u_inverseDistanceWeightExponent');
        this._uOutsideTemperature = this._assetProgram.uniform('u_outsideTemperature');
        this._uAverageIndoorTemperature = this._assetProgram.uniform('u_averageIndoorTemperature');
        this._uModel = this._assetProgram.uniform('u_model');

        this._uVisualizeOnAssetLevel = this._assetProgram.uniform('u_visualizeOnAssetLevel');

        this._uShowGrid = this._assetProgram.uniform('u_showGrid');

        this._uNumSensors = this._assetProgram.uniform('u_numSensors');

        this._uNumAssets = this._assetProgram.uniform('u_numAssets');
        const assetIndicesUniforms = [];
        if (this.assetValues && this.assetValues.length > 0) {
            for (let assetIndex = 0; assetIndex < this.assetValues.length; assetIndex++) {
                assetIndicesUniforms.push(this._assetProgram.uniform(`u_assetIndices[${assetIndex}]`));
            }
        }
        this._uAssetIndices = assetIndicesUniforms;

        this._uDebugSensorDistances = this._assetProgram.uniform('u_debugSensorDistances');
        this._uDebugSensorIndicesLength = this._assetProgram.uniform('u_debugSensorIndicesLength');
        const debugSensorIndicesUniforms = [];
        if (this.sensorValues && this.sensorValues.length > 0) {
            for (let sensorIndex = 0; sensorIndex < this.sensorValues.length; sensorIndex++) {
                debugSensorIndicesUniforms.push(this._assetProgram.uniform(`u_debugSensorIndices[${sensorIndex}]`));
            }
        }
        this._uDebugSensorIndices = debugSensorIndicesUniforms;

        this._uDebugMaxSensorDistance = this._assetProgram.uniform('u_debugMaxSensorDistance');
        this._uDebugVisualizeSensorDistanceUsingColorMap = this._assetProgram.uniform('u_debugVisualizeSensorDistanceUsingColorMap');
        this._uDebugUseDirectNeighborMinFilter = this._assetProgram.uniform('u_debugUseDirectNeighborMinFilter');
        this._uDebugUseDiagonalMinFilter = this._assetProgram.uniform('u_debugUseDiagonalMinFilter');
        this._uDebugDistanceMapCoordsOffsetFactorX = this._assetProgram.uniform('u_debugDistanceMapCoordsOffsetFactorX');
        this._uDebugDistanceMapCoordsOffsetFactorY = this._assetProgram.uniform('u_debugDistanceMapCoordsOffsetFactorY');
        this._uDebugDistanceMapCoordsOffsetFactorZ = this._assetProgram.uniform('u_debugDistanceMapCoordsOffsetFactorZ');

        this._uHierarchyEncodedId = this._assetHierarchyProgram.uniform('u_encodedID');

        const sensorValuesUniforms = [];

        if (this.sensorValues && this.sensorValues.length > 0) {
            for (let sensorIndex = 0; sensorIndex < this.sensorValues.length; sensorIndex++) {
                sensorValuesUniforms.push(this._assetProgram.uniform(`u_sensorValues[${sensorIndex}]`));
            }
        }

        this._uSensorValues = sensorValuesUniforms;

        const assetValuesUniforms = [];

        if (this.assetValues && this.assetValues.length > 0) {
            for (let assetIndex = 0; assetIndex < this.assetValues.length; assetIndex++) {
                assetValuesUniforms.push(this._assetProgram.uniform(`u_sensorValues[${assetIndex}]`));
            }
        }

        this._uAssetValues = assetValuesUniforms;

        this._uSensorMinValue = this._assetProgram.uniform('u_sensorMinValue');
        this._uSensorMaxValue = this._assetProgram.uniform('u_sensorMaxValue');
        this._uSensorMinColor = this._assetProgram.uniform('u_sensorMinColor');
        this._uSensorMaxColor = this._assetProgram.uniform('u_sensorMaxColor');

        this._uBboxMin = this._assetProgram.uniform('u_bboxMin');
        this._uBboxMax = this._assetProgram.uniform('u_bboxMax');
        this._uSensorVisualizationYRange = this._assetProgram.uniform('u_sensorVisualizationYRange');

        this._uNdcOffset = this._assetProgram.uniform('u_ndcOffset');
        this._uBaked = this._assetProgram.uniform('u_baked');
        this._uBuildingModelContainsLightmap = this._assetProgram.uniform('u_buildingModelContainsLightmap');
        this._uLightNearFar = this._assetProgram.uniform('u_lightNearFar');
        this._uLightViewProjection = this._assetProgram.uniform('u_lightViewProjection');
        this._uLightPosition = this._assetProgram.uniform('u_lightPosition');

        this._uShadowMap = this._assetProgram.uniform('u_shadowMap');
        this._uSunIsUp = this._assetProgram.uniform('u_sunIsUp');
        this._uEnableShadowMapping = this._assetProgram.uniform('u_enableShadowMapping');

        this._uUseLowBitDistanceMap = this._assetProgram.uniform('u_useLowBitDistanceMap');
        this._uSensorDistanceMap3DHigh = this._assetProgram.uniform('u_sensorDistanceMap3DHigh');
        this._uSensorDistanceMap3DLow = this._assetProgram.uniform('u_sensorDistanceMap3DLow');
        this._uOutsideDistanceMap3D = this._assetProgram.uniform('u_outsideDistanceMap3D');

        this._uColorScaleTexture = this._assetProgram.uniform('u_colorScale');

        this._sensorDistanceMapTexture3DHigh = new Texture3D(context, 'Texture-SensorDistanceMap3DHigh');
        this._sensorDistanceMapTexture3DHigh.initialize(1, 1, 1, gl.R8, gl.RED, gl.UNSIGNED_BYTE);
        this._sensorDistanceMapTexture3DHigh.wrap(gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE);
        this._sensorDistanceMapTexture3DHigh.filter(gl.LINEAR, gl.LINEAR);

        this._sensorDistanceMapTexture3DLow = new Texture3D(context, 'Texture-SensorDistanceMap3DLow');
        this._sensorDistanceMapTexture3DLow.initialize(1, 1, 1, gl.R8, gl.RED, gl.UNSIGNED_BYTE);
        this._sensorDistanceMapTexture3DLow.wrap(gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE);
        this._sensorDistanceMapTexture3DLow.filter(gl.LINEAR, gl.LINEAR);

        if (this.sensorValues && this.sensorValues.length > 0) {
            void this.initializeSensorDistanceMapTexture3D(this.sensorValues).then(() => {
                this.invalidate(true);
            });
        }

        this._outsideDistanceMapTexture3D = new Texture3D(context, 'Texture-OutsideDistanceMap3D');
        this._outsideDistanceMapTexture3D.initialize(1, 1, 1, gl.R8, gl.RED, gl.UNSIGNED_BYTE);
        this._outsideDistanceMapTexture3D.wrap(gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE);
        this._outsideDistanceMapTexture3D.filter(gl.LINEAR, gl.LINEAR);

        if (this.assetContentRoot) {
            void this._outsideDistanceMapTexture3D
                .load(`${this.assetContentRoot}distance-maps/outside.png`, this.distanceMapHeightSlices, false, true)
                .then(() => {
                    this.invalidate(true);
                });
        }

        this.createColorScaleTexture(
            context,
            gl,
            0,
            this._colorScaleConfiguration.selectedColorScale.type,
            this._colorScaleConfiguration.selectedColorScale.presetIdentifier,
            this._colorScaleConfiguration.colorScaleStops,
            this._colorScaleConfiguration.invertColorScale,
            this._colorScaleConfiguration.useLinearColorInterpolation,
        );

        /* Create and configure camera and lights. */

        this._camera = new Camera();
        this._camera.center = this._defaultCameraCenter;
        this._camera.up = vec3.fromValues(0.0, 1.0, 0.0);
        this._camera.eye = this._defaultCameraEye;
        // TODO(config): Make this value configuration-based/dynamic
        this._camera.near = 1.0;
        // TODO(config): Make this value configuration-based/dynamic
        this._camera.far = 512.0;
        this.cameraNext();

        if (this._light === undefined) {
            this._light = new OrthographicCamera();
            this._light.center = vec3.fromValues(7.8, 0.0, 3.9);
            this._light.up = vec3.fromValues(0.0, 1.0, 0.0);
            this._light.eye = vec3.fromValues(...this.sunPosition);
            this._light.frustumHeight = 40.0;
            this._light.far = 190.0;
            this._light.near = 20.0;
        }

        this._uModelShadow = this._shadowProgram.uniform('u_model');

        /* Create and configure navigation */

        this._navigation = new Navigation((force) => {
            callback(force);
        }, eventProvider);
        this._navigation.camera = this._camera;

        /* Create and configure shadow pass */

        this._shadowPass = new ShadowPass(context);

        // TODO(config): Make this value (the shadow map size) configuration-based/dynamic
        this._shadowPass.initialize(ShadowPass.ShadowMappingType.HardLinear, [1024, 1024], [1024, 1024]);

        /* Create and configure forward pass. */

        this._assetHierarchyPass = new ForwardSceneRenderPassWithIdentities(context);
        this._assetHierarchyPass.uIDEndcoded = this._uHierarchyEncodedId;
        this._assetHierarchyPass.initialize();

        this._assetHierarchyPass.camera = this._camera;
        this._assetHierarchyPass.target = this._intermediateFBOs[0];

        this._assetHierarchyPass.program = this._assetHierarchyProgram;

        this._assetHierarchyPass.updateModelTransform = (matrix: mat4) => {
            gl.uniformMatrix4fv(this._uHierarchyModelMatrix, false, matrix);
        };
        this._assetHierarchyPass.updateViewProjectionTransform = () => {};
        this._assetHierarchyPass.bindUniforms = () => {};
        this._assetHierarchyPass.bindGeometry = () => {};
        this._assetHierarchyPass.bindMaterial = () => {};

        this._assetHierarchyPass.clearColor = [0, 0, 0, 0];

        this._assetPass = new ForwardSceneRenderPassWithIdentities(context);
        this._assetPass.uIDEndcoded = this._uAssetEncodedId;
        this._assetPass.uID = this._uAssetId;
        this._assetPass.initialize();

        this._assetPass.camera = this._camera;
        this._assetPass.target = this._intermediateFBOs[0];

        this._assetPass.program = this._assetProgram;
        this._assetPass.updateModelTransform = (matrix: mat4) => {
            gl.uniformMatrix4fv(this._uModel, false, matrix);
        };
        this._assetPass.updateViewProjectionTransform = (matrix: mat4) => {
            gl.uniformMatrix4fv(this._uViewProjection, false, matrix);
        };

        this._assetPass.bindUniforms = () => {
            gl.uniform2f(this._uLightNearFar, this._light.near, this._light.far);
            gl.uniformMatrix4fv(this._uLightViewProjection, false, this._light.viewProjection);
            gl.uniform3fv(this._uLightPosition, this._light.eye);

            gl.uniform1i(this._assetProgram.uniform('u_shadowMappingMethod'), this.shadowMappingConfiguration.type);
            switch (this.shadowMappingConfiguration.type) {
                case ShadowMappingMode.ExponentialShadowMapping:
                    gl.uniform1f(this._assetProgram.uniform('u_ESMShadowExponent'), this.shadowMappingConfiguration.shadowExponent);
                    break;
                case ShadowMappingMode.ExponentialVarianceShadowMapping:
                    gl.uniform2fv(this._assetProgram.uniform('u_EVSMShadowExponents'), this.shadowMappingConfiguration.shadowExponents);
                    gl.uniform1f(
                        this._assetProgram.uniform('u_VSMShadowLightBleedingReduction'),
                        this.shadowMappingConfiguration.shadowLightBleedingReduction,
                    );
                    break;
                case ShadowMappingMode.VarianceShadowMapping:
                    gl.uniform1f(
                        this._assetProgram.uniform('u_VSMShadowLightBleedingReduction'),
                        this.shadowMappingConfiguration.shadowLightBleedingReduction,
                    );
                    gl.uniform1f(this._assetProgram.uniform('u_VSMShadowMinVariance'), this.shadowMappingConfiguration.shadowMinVariance);
                    break;
                case ShadowMappingMode.ShadowMapping:
                    gl.uniform1f(this._assetProgram.uniform('u_SMShadowBias'), this.shadowMappingConfiguration.shadowBias);
                    break;
                default:
                    break;
            }

            gl.uniform1i(this._uShadowMap, 4);

            gl.uniform1i(this._uSunIsUp, this.sunIsUp);
            gl.uniform1i(this._uEnableShadowMapping, this.enableShadowMapping);

            gl.uniform1i(this._uBaked, 0);
            gl.uniform1i(this._uBuildingModelContainsLightmap, this.buildingModelContainsLightmap);
            gl.uniform1i(this._uSensorDistanceMap3DHigh, 2);
            gl.uniform1i(this._uColorScaleTexture, 3);
            gl.uniform1i(this._uOutsideDistanceMap3D, 1);
            gl.uniform1i(this._uSensorDistanceMap3DLow, 5);

            gl.uniform1i(this._uVisualizeOnAssetLevel, this.visualizeOnAssetLevel);
            gl.uniform1i(this._uUseLowBitDistanceMap, this.useLowBitDistanceMap);

            gl.uniform1i(this._uShowGrid, this.showGrid);

            gl.uniform1f(this._uInverseDistanceWeightExponent, this.inverseDistanceWeightExponent);
            gl.uniform1f(this._uOutsideTemperature, this.outsideTemperature);
            gl.uniform1f(this._uAverageIndoorTemperature, this.averageIndoorTemperature);

            gl.uniform1i(this._uNumSensors, this.sensorValues?.length || 0);
            gl.uniform1i(this._uNumAssets, this.assetValues?.length || 0);

            if (this.debugSensorDistancesConfiguration?.enableDebug) {
                gl.uniform1i(this._uDebugSensorDistances, true);

                const {
                    debugSensorIndices,
                    debugMaxSensorDistance,
                    debugVisualizeSensorDistanceUsingColorMap,
                    debugUseDirectNeighborMinFilter,
                    debugUseDiagonalMinFilter,
                    debugDistanceMapCoordsOffsetFactorX,
                    debugDistanceMapCoordsOffsetFactorY,
                    debugDistanceMapCoordsOffsetFactorZ,
                } = this.debugSensorDistancesConfiguration;

                if (debugSensorIndices.length > 0) {
                    const availableSensorIDs = this.sensorValues?.map((sensorValue) => sensorValue.sensorId);
                    for (let sensorIndex = 0; sensorIndex < 16; sensorIndex++) {
                        if (
                            debugSensorIndices[sensorIndex] !== undefined &&
                            availableSensorIDs?.includes(debugSensorIndices[sensorIndex])
                        ) {
                            gl.uniform1i(
                                this._uDebugSensorIndices[sensorIndex],
                                availableSensorIDs.findIndex((id) => id === debugSensorIndices[sensorIndex]),
                            );
                        } else {
                            gl.uniform1i(this._uDebugSensorIndices[sensorIndex], -1);
                        }
                    }
                }

                gl.uniform1i(this._uDebugSensorIndicesLength, debugSensorIndices.length);

                gl.uniform1f(this._uDebugMaxSensorDistance, debugMaxSensorDistance);
                gl.uniform1i(this._uDebugVisualizeSensorDistanceUsingColorMap, debugVisualizeSensorDistanceUsingColorMap);
                gl.uniform1i(this._uDebugUseDirectNeighborMinFilter, debugUseDirectNeighborMinFilter);
                gl.uniform1i(this._uDebugUseDiagonalMinFilter, debugUseDiagonalMinFilter);

                if (debugDistanceMapCoordsOffsetFactorX) {
                    gl.uniform1f(this._uDebugDistanceMapCoordsOffsetFactorX, debugDistanceMapCoordsOffsetFactorX);
                } else {
                    gl.uniform1f(this._uDebugDistanceMapCoordsOffsetFactorX, -1.0);
                }
                if (debugDistanceMapCoordsOffsetFactorY) {
                    gl.uniform1f(this._uDebugDistanceMapCoordsOffsetFactorY, debugDistanceMapCoordsOffsetFactorY);
                } else {
                    gl.uniform1f(this._uDebugDistanceMapCoordsOffsetFactorY, -1.0);
                }
                if (debugDistanceMapCoordsOffsetFactorZ) {
                    gl.uniform1f(this._uDebugDistanceMapCoordsOffsetFactorZ, debugDistanceMapCoordsOffsetFactorZ);
                } else {
                    gl.uniform1f(this._uDebugDistanceMapCoordsOffsetFactorZ, -1.0);
                }
            } else {
                gl.uniform1i(this._uDebugSensorDistances, false);
            }

            gl.uniform1f(this._uSensorMinValue, this.sensorMinValue);
            gl.uniform1f(this._uSensorMaxValue, this.sensorMaxValue);

            gl.uniform3fv(this._uSensorMinColor, vec3.fromValues(5 / 255.0, 48 / 255.0, 97 / 255.0));
            gl.uniform3fv(this._uSensorMaxColor, vec3.fromValues(103 / 255.0, 0 / 255.0, 31 / 255.0));

            gl.uniform3fv(this._uBboxMin, this.apartmentBboxMin);
            gl.uniform3fv(this._uBboxMax, this.apartmentBboxMax);
            gl.uniform2fv(this._uSensorVisualizationYRange, vec2.fromValues(this.apartmentBboxMin[1], this.apartmentBboxMax[1] - 1e-2));

            if (this.sensorValues && this.sensorValues.length > 0) {
                for (let sensorIndex = 0; sensorIndex < this.sensorValues.length; sensorIndex++) {
                    const sensorValue = this.sensorValues[sensorIndex];
                    gl.uniform1f(this._uSensorValues[sensorIndex], sensorValue.value);
                }
            }

            if (this.assetValues && this.assetValues.length > 0) {
                for (let assetIndex = 0; assetIndex < 16; assetIndex++) {
                    if (assetIndex < this.assetValues.length) {
                        const { assetId, sensorValues } = this.assetValues[assetIndex];
                        let value = -1;
                        if (sensorValues && sensorValues.length > 1) {
                            // Calculate the mean of the values
                            const valueSum = sensorValues.reduce((a, b) => a + Number(b.value), 0);
                            value = valueSum / sensorValues.length || 0;
                        } else if (sensorValues && sensorValues.length === 1) {
                            value = Number(sensorValues[0].value);
                        }
                        gl.uniform1f(this._uAssetValues[assetIndex], value);
                        gl.uniform1i(this._uAssetIndices[assetIndex], assetId);
                    } else {
                        gl.uniform1f(this._uAssetValues[assetIndex], -1);
                        gl.uniform1i(this._uAssetIndices[assetIndex], -1);
                    }
                }
                gl.uniform1i(this._uNumAssets, this.assetValues.length);
            }
        };

        this._assetPass.bindGeometry = () => {};

        this._assetPass.bindMaterial = (material: Material) => {
            if (this.buildingModelContainsLightmap) {
                const pbrMaterial = material as GLTFPbrMaterial;
                pbrMaterial.baseColorTexture?.bind(gl.TEXTURE0);
            } else {
                this._empty1x1TransparentTexture.bind(gl.TEXTURE0);
            }

            if (this._sensorDistanceMapTexture3DHigh !== undefined && this._sensorDistanceMapTexture3DHigh.valid) {
                this._sensorDistanceMapTexture3DHigh.bind(gl.TEXTURE2);
            }
            if (this._sensorDistanceMapTexture3DLow !== undefined && this._sensorDistanceMapTexture3DLow.valid) {
                this._sensorDistanceMapTexture3DLow.bind(gl.TEXTURE5);
            }
            if (this._outsideDistanceMapTexture3D !== undefined && this._outsideDistanceMapTexture3D.valid) {
                this._outsideDistanceMapTexture3D.bind(gl.TEXTURE1);
            }

            if (this.enableSurfaceSensorDataVisualization) {
                this._colorScaleTextures[this.selectedColorScaleIndex]?.bind(gl.TEXTURE3);
            } else {
                this._empty1x1TransparentTexture.bind(gl.TEXTURE3);
            }
        };

        /* Create and configure label pass. */

        this._labelPass = new LabelRenderPass(context);
        this._labelPass.initialize();
        this._labelPass.camera = this._camera;
        this._labelPass.target = this._intermediateFBOs[0];
        this._labelPass.depthMask = false;

        FontFace.fromFile(this._labelFontFntUri, context)
            .then((fontFace) => {
                for (const label of this._labelPass.labels) {
                    label.fontFace = fontFace;
                }
                this._fontFace = fontFace;
                this.updateLabels();

                this.invalidate(true);
            })
            .catch((reason) => auxiliaries.log(auxiliaries.LogLevel.Error, reason));

        FontFace.fromFile(this._iconFontFntUri, context)
            .then((fontFace) => {
                this._iconFontFace = fontFace;
                this.updateLabels();

                this.invalidate(true);
            })
            .catch((reason) => auxiliaries.log(auxiliaries.LogLevel.Error, reason));

        FontFace.fromFile(this._sensorFontFntUri, context)
            .then((fontFace) => {
                this._sensorFontFace = fontFace;
                this.updateLabels();

                this.invalidate(true);
            })
            .catch((reason) => auxiliaries.log(auxiliaries.LogLevel.Error, reason));

        // post-processing
        const postprocessingVert = new Shader(context, gl.VERTEX_SHADER, 'ndcvertices.vert');
        postprocessingVert.initialize(
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            require('./shaders/ndcvertices.vert'),
        );

        // chromatic aberration
        const chromaticAberrationFrag = new Shader(context, gl.FRAGMENT_SHADER, 'chromaticAberration.frag');
        chromaticAberrationFrag.initialize(
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            require('./shaders/chromaticAberration.frag'),
        );

        this._chromaticAberrationProgram = new Program(context, 'PostprocessingProgram');
        this._chromaticAberrationProgram.initialize([postprocessingVert, chromaticAberrationFrag], true);
        this._chromaticAberrationProgram.attribute('a_vertex', this._ndcTriangle.vertexLocation);
        this._chromaticAberrationProgram.link();
        this._chromaticAberrationProgram.bind();

        gl.uniform1i(this._chromaticAberrationProgram.uniform('u_source'), 0);
        gl.uniform1i(this._chromaticAberrationProgram.uniform('u_assetIndices'), 1);
        this._uCAResolution = this._chromaticAberrationProgram.uniform('u_resolution');
        this._uCAHoveredAssetEncodedID = this._chromaticAberrationProgram.uniform('u_hoveredAssetEncodedID');

        // sharpen
        const sharpenFrag = new Shader(context, gl.FRAGMENT_SHADER, 'sharpen.frag');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        sharpenFrag.initialize(require('./shaders/sharpen.frag'));

        this._sharpenProgram = new Program(context, 'SharpenProgram');
        this._sharpenProgram.initialize([postprocessingVert, sharpenFrag], true);
        this._sharpenProgram.attribute('a_vertex', this._ndcTriangle.vertexLocation);
        this._sharpenProgram.link();
        this._sharpenProgram.bind();

        gl.uniform1i(this._sharpenProgram.uniform('u_source'), 0);
        this._uSharpenResolution = this._sharpenProgram.uniform('u_resolution');

        // contours/edge
        const edgeFrag = new Shader(context, gl.FRAGMENT_SHADER, 'edge.frag');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        edgeFrag.initialize(require('./shaders/edge.frag'));

        this._edgeProgram = new Program(context, 'EdgeProgram');
        this._edgeProgram.initialize([postprocessingVert, edgeFrag], true);
        this._edgeProgram.attribute('a_vertex', this._ndcTriangle.vertexLocation);
        this._edgeProgram.link();
        this._edgeProgram.bind();

        gl.uniform1i(this._edgeProgram.uniform('u_source'), 0);
        gl.uniform1i(this._edgeProgram.uniform('u_depth'), 1);
        gl.uniform1i(this._edgeProgram.uniform('u_normal'), 2);

        this._uEdgeEnableOutlineRendering = this._edgeProgram.uniform('u_enableOutlineRendering');
        this._uEdgeView = this._edgeProgram.uniform('u_view');
        this._uEdgeNear = this._edgeProgram.uniform('u_near');
        this._uEdgeFar = this._edgeProgram.uniform('u_far');
        this._uEdgeScreenSize = this._edgeProgram.uniform('u_screenSize');

        // ssao
        const ssaoFrag = new Shader(context, gl.FRAGMENT_SHADER, 'ssao.frag');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        ssaoFrag.initialize(require('./shaders/ssao.frag'));

        this._ssaoProgram = new Program(context, 'SSAOProgram');
        this._ssaoProgram.initialize([postprocessingVert, ssaoFrag], true);
        this._ssaoProgram.attribute('a_vertex', this._ndcTriangle.vertexLocation);
        this._ssaoProgram.link();
        this._ssaoProgram.bind();

        gl.uniform1i(this._ssaoProgram.uniform('u_source'), 0);
        gl.uniform1i(this._ssaoProgram.uniform('u_depth'), 1);
        gl.uniform1i(this._ssaoProgram.uniform('u_normal'), 2);
        gl.uniform1i(this._ssaoProgram.uniform('u_noise'), 3);

        this._uSSAOEnableSSAO = this._ssaoProgram.uniform('u_enableSSAO');
        this._uSSAOView = this._ssaoProgram.uniform('u_view');
        this._uSSAOProjection = this._ssaoProgram.uniform('u_projection');
        this._uSSAOInvProjection = this._ssaoProgram.uniform('u_invProjection');
        this._uSSAONear = this._ssaoProgram.uniform('u_near');
        this._uSSAOFar = this._ssaoProgram.uniform('u_far');
        this._uSSAOScreenSize = this._ssaoProgram.uniform('u_screenSize');

        this._uSSAOKernel = this._ssaoProgram.uniform('u_kernel');
        this._uSSAOMinDistance = this._ssaoProgram.uniform('u_ssaoMinDistance');
        this._uSSAOMaxDistance = this._ssaoProgram.uniform('u_ssaoMaxDistance');

        this._uSSAOSpiralKernel = this._ssaoProgram.uniform('u_spiralKernel');
        gl.uniform1i(this._uSSAOSpiralKernel, 4);
        this._uSSAOFrameNumber = this._ssaoProgram.uniform('u_frameNumber');

        this.createSSAOKernel();

        const kernelSize = 32;
        const kernel = [] as number[];

        // Based on: https://github.com/mattdesl/lerp/blob/master/index.js
        const lerp = (v0: number, v1: number, t: number) => {
            return v0 * (1 - t) + v1 * t;
        };

        for (let i = 0; i < kernelSize; i++) {
            let sample = vec3.create();
            sample[0] = Math.random() * 2 - 1;
            sample[1] = Math.random() * 2 - 1;
            sample[2] = Math.random();
            sample = vec3.normalize(v3(), sample);
            let scale = i / kernelSize;
            scale = lerp(0.1, 1.0, scale * scale);
            sample = vec3.scale(v3(), sample, scale);
            kernel.push(sample[0], sample[1], sample[2]);
        }

        gl.uniform3fv(this._uSSAOKernel, new Float32Array(kernel));

        this._accumulate = new AccumulatePass(context);
        this._accumulate.initialize(this._ndcTriangle);
        this._accumulate.precision = this._framePrecision;
        this._accumulate.texture = this._colorRenderTextures[0];

        this._blit = new BlitPass(this._context);
        this._blit.initialize(this._ndcTriangle);
        this._blit.readBuffer = gl2facade.COLOR_ATTACHMENT0;
        this._blit.enforceProgramBlit = true;
        this._blit.drawBuffer = gl.BACK;
        this._blit.target = this._defaultFBO;

        this._debugPass = new DebugPass(this._context);
        this._debugPass.initialize();

        this._debugPass.enforceProgramBlit = true;
        this._debugPass.debug = DebugPass.Mode.None;

        this._debugPass.framebuffer = this._intermediateFBOs[4];
        this._debugPass.readBuffer = gl.COLOR_ATTACHMENT0;

        this._debugPass.target = this._defaultFBO;
        this._debugPass.drawBuffer = gl.BACK;

        this._readbackPass = new ReadbackPass(context);
        this._readbackPass.initialize(this._ndcTriangle, true);
        this._readbackPass.idFBO = this._intermediateFBOs[2];
        this._readbackPass.idAttachment = gl2facade.COLOR_ATTACHMENT0;

        this._readbackPass.depthFBO = this._preDepthFBO;
        this._readbackPass.depthAttachment = gl2facade.COLOR_ATTACHMENT0;

        this._readbackPass.cache = true;

        this._readbackPassAsset = new ReadbackPass(context);
        this._readbackPassAsset.initialize(this._ndcTriangle, false);
        this._readbackPassAsset.idFBO = this._intermediateFBOs[3];
        this._readbackPassAsset.idAttachment = gl2facade.COLOR_ATTACHMENT0;
        this._readbackPassAsset.cache = true;

        eventProvider.mouseEventProvider.down$.subscribe(() => (this._noDrag = true));
        eventProvider.mouseEventProvider.move$.subscribe(() => (this._noDrag ? (this._noDrag = false) : undefined));

        /**
         * TODO: Here and at all usages of EventTarget.clientX/client.Y, properly take the position of the canvas on the
         * page into account, i. e., add any possible offsets of the canvas element to the calculated X and Y.
         */
        eventProvider.mouseEventProvider.click$.subscribe((value) => {
            if (this._noDrag && this._idRenderTexture.valid && this._readbackPass.initialized && value.target) {
                const x = (value.clientX / (value.target as any).clientWidth) * this._idRenderTexture.width;
                const y = (value.clientY / (value.target as any).clientHeight) * this._idRenderTexture.height;
                const nodeId = this._readbackPass.idAt(x, y);
                if (nodeId) {
                    console.log(`Clicked on node with ID: ${nodeId}`);
                } else {
                    console.log('Clicked on background (no node ID)');
                }
            }

            if (this._noDrag && this._depthTexture.valid && this._readbackPass.initialized && value.target) {
                const x = (value.clientX / (value.target as any).clientWidth) * this._depthTexture.width;
                const y = (value.clientY / (value.target as any).clientHeight) * this._depthTexture.height;
                const readDepthAt = this._readbackPass.readDepthAt(x, y);
                console.log(
                    `readDepth at [${x}, ${y}]: ${gl_matrix_extensions.decode_float24x1_from_uint8x3([
                        readDepthAt[0],
                        readDepthAt[1],
                        readDepthAt[2],
                    ])}`,
                );

                const depthAt = this._readbackPass.depthAt(x, y);
                console.log(`readDepth at [${x}, ${y}]: ${depthAt || 'undefined'}`);

                const coordsAt = this._readbackPass.coordsAt(x, y, undefined, this._camera.viewProjectionInverse as mat4);
                console.log(`Coords at [${x}, ${y}]: ${coordsAt?.toString() ?? 'undefined'}`);

                if (coordsAt) {
                    // prettier-ignore
                    this.points = new Float32Array([
                        // x, y, z, r, g, b, data,
                        coordsAt[0], coordsAt[1], coordsAt[2], 0.0, 0.0, 0.0, 10.0,
                    ]);

                    // prettier-ignore
                    this.lines = new Float32Array([
                        // x, y, z, r, g, b,
                        coordsAt[0],       coordsAt[1], coordsAt[2], 1.0, 0.0, 0.0,
                        coordsAt[0] + 1.0, coordsAt[1], coordsAt[2], 1.0, 0.0, 0.0,

                        coordsAt[0], coordsAt[1],       coordsAt[2], 0.0, 1.0, 0.0,
                        coordsAt[0], coordsAt[1] + 1.0, coordsAt[2], 0.0, 1.0, 0.0,

                        coordsAt[0], coordsAt[1], coordsAt[2],       0.0, 0.0, 1.0,
                        coordsAt[0], coordsAt[1], coordsAt[2] + 1.0, 0.0, 0.0, 1.0,
                    ]);

                    this.probingLocations = [...this.probingLocations, coordsAt];
                }
            }

            if (this._noDrag && this._idRenderTextureAsset.valid && this._readbackPassAsset.initialized && value.target) {
                const x = (value.clientX / (value.target as any).clientWidth) * this._idRenderTextureAsset.width;
                const y = (value.clientY / (value.target as any).clientHeight) * this._idRenderTextureAsset.height;
                const nodeId = this._readbackPassAsset.idAt(x, y);
                if (nodeId) {
                    console.log(`Clicked on asset with ID: ${nodeId}`);
                } else {
                    console.log('Clicked on background (no asset ID)');
                }
            }
        });

        eventProvider.mouseEventProvider.move$.subscribe((value) => {
            let hoverEvent = undefined as HoverEvent;

            if (this._idRenderTextureAsset.valid && this._readbackPassAsset.initialized && value.target) {
                const x = (value.clientX / (value.target as any).clientWidth) * this._idRenderTextureAsset.width;
                const y = (value.clientY / (value.target as any).clientHeight) * this._idRenderTextureAsset.height;
                const nodeId = this._readbackPassAsset.idAt(x, y);
                this.hoveredAssetID = nodeId;
                if (nodeId) {
                    hoverEvent = {
                        label: `asset_${nodeId}`,
                        x: value.clientX,
                        y: value.clientY,
                    };
                }
            }

            if (this._idRenderTexture.valid && this._readbackPass.initialized && value.target) {
                const x = (value.clientX / (value.target as any).clientWidth) * this._idRenderTexture.width;
                const y = (value.clientY / (value.target as any).clientHeight) * this._idRenderTexture.height;
                const nodeId = this._readbackPass.idAt(x, y);
                if (nodeId) {
                    if (hoverEvent) {
                        hoverEvent.label = `${hoverEvent.label}<br />node_${nodeId}`;
                    } else {
                        hoverEvent = {
                            label: `node_${nodeId}`,
                            x: value.clientX,
                            y: value.clientY,
                        };
                    }
                }
            }

            this.hoverEvent = hoverEvent;
        });

        gl.cullFace(gl.BACK);

        void this.loadAsset().then(() => {
            this._assetLoadingFinished = true;
            this.finishLoadingIfSetupComplete();
        });

        this.initializeVolumeRenderingProgram(context);

        this._initializationFinished = true;
        this.finishLoadingIfSetupComplete();

        return true;
    }

    protected finishLoadingIfSetupComplete(): void {
        if (this._initializationFinished && this._assetLoadingFinished) {
            this.finishLoading();
        }
    }

    protected createSSAOKernel(): void {
        /**
         * Computes a spiral shaped kernel for optimized sampling of SSAO.
         *
         * Source:
         * Daniel Limberger, Marcel Pursche, Jan Klimke, and Jürgen Döllner. “Progressive high-quality rendering
         * for interactive information cartography using WebGL”. In: Proceedings of the 22nd International
         * Conference on 3D Web Technology. Web3D’17. ACM, June 2017, pp. 1–4. doi: 10.1145/3055624.3075951.
         *
         * @param samplesPerFrame The amount of samples which should be computed in every frame
         * @param spiralTurns The number of turns the spiral shape should take
         * @param numFrames The number of frames for which the sampling kernel should be created
         * @returns A Float32Array of the created spiral shaped kernel, representing the data of a float texture with width `2 * samplesPerFrame` and height `numFrames`
         */
        const ssaoKernel = (samplesPerFrame: number, spiralTurns: number, numFrames: number): Float32Array => {
            const numSamples = samplesPerFrame * numFrames;
            const samplePosition = (sampleId: number) => {
                const alpha = (sampleId + 0.5) / numSamples;
                const angle = alpha * spiralTurns * Math.PI * 2.0;
                return [angle, alpha];
            };

            const imageData = new Float32Array(numSamples * 2);

            for (let y = 0; y < numFrames; ++y) {
                for (let x = 0; x < samplesPerFrame; ++x) {
                    const [angle, alpha] = samplePosition(x * numFrames + y);
                    imageData[2 * (x + y * samplesPerFrame)] = angle;
                    imageData[2 * (x + y * samplesPerFrame) + 1] = alpha;
                }
            }

            return imageData;
        };

        const kernelImageData = ssaoKernel(SPIRAL_SAMPLES_PER_FRAME, this.ssaoConfig.spiralTurns, this._multiFrameNumber || 64);
        this._ssaoSpiralKernelTexture.data(kernelImageData);
    }

    /**
     * Uninitializes Buffers, Textures, and Program.
     */
    protected onUninitialize(): void {
        for (const colorScaleTexture of this._colorScaleTextures) {
            colorScaleTexture.uninitialize();
        }

        this._colorScalePlane.uninitialize();
        this._colorScaleProgram.uninitialize();

        this._cuboid.uninitialize();
        this._cuboidProgram.uninitialize();

        this._chromaticAberrationProgram.uninitialize();
        this._sharpenProgram.uninitialize();
        this._edgeProgram.uninitialize();
        this._ssaoProgram.uninitialize();

        this._accumulate.uninitialize();
        this._blit.uninitialize();

        const gl = this._context.gl;
        gl.deleteBuffer(this._pointsBuffer);
        this._pointsProgram.uninitialize();

        gl.deleteBuffer(this._linesBuffer);
        this._linesProgram.uninitialize();

        this._labelPass.uninitialize();
        this._readbackPass.uninitialize();
        this._shadowPass.uninitialize();
        this._assetHierarchyPass.uninitialize();
        this._assetPass.uninitialize();

        this._defaultFBO.uninitialize();

        for (const colorRenderTexture of this._colorRenderTextures) {
            colorRenderTexture.uninitialize();
        }
        this._idRenderTexture.uninitialize();
        this._idRenderTextureAsset.uninitialize();
        this._depthRenderbuffer.uninitialize();
        this._empty1x1TransparentTexture.uninitialize();

        this._sensorDistanceMapTexture3DHigh.uninitialize();
        this._sensorDistanceMapTexture3DLow.uninitialize();
        this._outsideDistanceMapTexture3D.uninitialize();

        for (const intermediateFBO of this._intermediateFBOs) {
            intermediateFBO.uninitialize();
        }

        this._ndcTriangle.uninitialize();
    }

    protected onDiscarded(): void {
        this._altered.alter('canvasSize');
        this._altered.alter('clearColor');
        this._altered.alter('frameSize');
        this._altered.alter('multiFrameNumber');
    }

    /**
     * This is invoked in order to check if rendering of a frame is required by means of implementation specific
     * evaluation (e.g., lazy non continuous rendering). Regardless of the return value a new frame (preparation,
     * frame, swap) might be invoked anyway, e.g., when update is forced or canvas or context properties have
     * changed or the renderer was invalidated @see{@link invalidate}.
     * Updates the navigaten and the AntiAliasingKernel.
     *
     * @returns whether to redraw
     */
    protected onUpdate(): boolean {
        this._navigation.update();
        this._assetPass.update();

        if (this.sensorValueLabelsConfig.displayLabels || this.enableMetadataAndColorScaleLabelling) {
            this._labelPass.update();

            for (const label of this._labelPass.labels) {
                if (label.altered || label.color.altered) {
                    return true;
                }
            }
        }

        const cameraAltered = this._camera.altered;

        if (cameraAltered) {
            this.cameraNext();
        }

        return this._altered.any || cameraAltered;
    }

    /**
     * This is invoked in order to prepare rendering of one or more frames, regarding multi-frame rendering and
     * camera-updates.
     */
    protected onPrepare(): void {
        const gl = this._context.gl;

        if (this.sensorValueLabelsConfig.displayLabels || this.enableMetadataAndColorScaleLabelling) {
            if (
                this._altered.sensorValueLabels ||
                this._altered.enableSensorIcons ||
                this._altered.sensorValueLabelsConfig ||
                this._altered.enableMetadataAndColorScaleLabelling
            ) {
                this.updateLabels();
            }
        }

        if (this._altered.assetContentRoot && this.assetContentRoot) {
            void this._outsideDistanceMapTexture3D
                .load(`${this.assetContentRoot}distance-maps/outside.png`, this.distanceMapHeightSlices, false, true)
                .then(() => {
                    this.invalidate(true);
                });
        }

        if (this._altered.buildingModelHierarchyGltfUri) {
            void this.loadAsset(true);
        }

        if (this._altered.ssaoConfig) {
            this.createSSAOKernel();
        }

        if (this._altered.frameSize) {
            this._intermediateFBOs[0].resize(this._frameSize[0], this._frameSize[1]);
            this._intermediateFBOs[1].resize(this._frameSize[0], this._frameSize[1]);
            this._intermediateFBOs[2].resize(this._frameSize[0], this._frameSize[1]);
            this._intermediateFBOs[3].resize(this._frameSize[0], this._frameSize[1]);
            this._intermediateFBOs[4].resize(this._frameSize[0], this._frameSize[1]);

            this._preDepthFBO.resize(this._frameSize[0], this._frameSize[1]);

            if (this._sharpenProgram && this._sharpenProgram.valid) {
                this._sharpenProgram.bind();
                gl.uniform2f(this._uSharpenResolution, this._frameSize[0], this._frameSize[1]);
                this._sharpenProgram.unbind();
            }

            if (this._chromaticAberrationProgram && this._chromaticAberrationProgram.valid) {
                this._chromaticAberrationProgram.bind();
                gl.uniform2f(this._uCAResolution, this._frameSize[0], this._frameSize[1]);
                this._chromaticAberrationProgram.unbind();
            }

            if (this._edgeProgram && this._edgeProgram.valid) {
                this._edgeProgram.bind();
                gl.uniform4fv(this._uEdgeScreenSize, [
                    this._frameSize[0],
                    this._frameSize[1],
                    1 / this._frameSize[0],
                    1 / this._frameSize[1],
                ]);
                this._edgeProgram.unbind();
            }

            if (this._ssaoProgram && this._ssaoProgram.valid) {
                this._ssaoProgram.bind();
                gl.uniform4fv(this._uSSAOScreenSize, [
                    this._frameSize[0],
                    this._frameSize[1],
                    1 / this._frameSize[0],
                    1 / this._frameSize[1],
                ]);
                this._ssaoProgram.unbind();
            }

            this._camera.viewport = [this._frameSize[0], this._frameSize[1]];
        }

        if (this._altered.canvasSize) {
            this._camera.aspect = this._canvasSize[0] / this._canvasSize[1];

            this._debugPass.dstBounds = vec4.fromValues(
                this._canvasSize[0] * (1.0 - 0.187),
                this._canvasSize[1] * (1.0 - 0.187 * this._camera.aspect),
                this._canvasSize[0] * (1.0 - 0.008),
                this._canvasSize[1] * (1.0 - 0.008 * this._camera.aspect),
            );

            this.updateLabels();
        }

        if (this._altered.clearColor) {
            this._assetPass.clearColor = this._clearColor;
            this._defaultFBO.clearColor(this._clearColor);
            this._preDepthFBO.clearColor([0.9999999403953552, 0.9999999403953552, 0.9999999403953552, 1.0]);
            this._intermediateFBOs[0].clearColor(this._clearColor);
            this._intermediateFBOs[1].clearColor(this._clearColor);
        }

        if (this._altered.colorScaleConfiguration) {
            this.createColorScaleTexture(
                this._context,
                gl,
                0,
                this._colorScaleConfiguration.selectedColorScale.type,
                this._colorScaleConfiguration.selectedColorScale.presetIdentifier,
                this._colorScaleConfiguration.colorScaleStops,
                this._colorScaleConfiguration.invertColorScale,
                this._colorScaleConfiguration.useLinearColorInterpolation,
            );

            this.updateLabels();
        }

        if (this._altered.sampledCustomTransparencyTransferFunctionPoints) {
            if (this.sampledCustomTransparencyTransferFunctionPoints) {
                this.createTransparencyTransferFunctionFromSamplePoints(
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    this.sampledCustomTransparencyTransferFunctionPoints.map(([x, y]) => y),
                );
            }
        }

        if (this.camera.altered) {
            this.updateLabels();

            this._debugPass.far = this._light.far;
            this._debugPass.near = this._light.near;
        }

        if (this._altered.sunPosition) {
            this._light.eye = vec3.fromValues(...this.sunPosition);

            /**
             * Ray-Plane intersection with the ray from the light (the light’s camera) to the ground plane
             * is used to determine the far clipping plane of the light dynamically.
             *
             * @see https://www.scratchapixel.com/lessons/3d-basic-rendering/minimal-ray-tracer-rendering-simple-shapes/ray-plane-and-ray-disk-intersection
             */
            const rayPlaneIntersectionDistance = (n: vec3, p0: vec3, l0: vec3, l: vec3): number | undefined => {
                const denom = vec3.dot(n, l);
                if (denom > 1e-6) {
                    const p0l0 = vec3.sub(v3(), p0, l0);
                    const tDistanceToPlaneIntersection = vec3.dot(p0l0, n) / denom;
                    return tDistanceToPlaneIntersection;
                    // Computation of the actual intersection point would be as follows:
                    // return vec3.scaleAndAdd(v3(), l0, l tDistanceToPlaneIntersection);
                }
                return undefined;
            };

            const p0groundPlaneFromWorldOrigin = vec3.fromValues(0.0, this.basePlaneYOffset, 0.0);
            const nGroundPlaneNormal = vec3.fromValues(0, 1, 0);

            // Notice: This only works for an orthographic light source at the moment
            const lightEyeTopFrustum = vec3.scaleAndAdd(v3(), this._light.eye, this._light.up, this._light.frustumHeight / 2);
            const l0RayOrigin = lightEyeTopFrustum;
            const lRayDirection = vec3.normalize(v3(), vec3.sub(v3(), this._light.eye, this._light.center));

            const distanceToGround = rayPlaneIntersectionDistance(
                nGroundPlaneNormal,
                p0groundPlaneFromWorldOrigin,
                l0RayOrigin,
                lRayDirection,
            );

            this._light.far = distanceToGround ? Math.abs(distanceToGround) + 5 : 190;
        }

        if (this._altered.sunIsUp || this._altered.enableShadowMapping) {
            let clearColor = [0.960784314, 0.976470588, 1.0, 1.0] as GLclampf4;
            if (!this.sunIsUp && this.enableShadowMapping) {
                const shadowColorWebGLOperate = [0.494, 0.753, 0.933, 1.0] as number[];
                const shadowColorCustom = [159.0 / 255.0, 171.0 / 255.0, 168.0 / 255.0, 1.0] as number[];
                const mixFactor = 0.4;
                const shadowColor = [];
                shadowColor[0] = shadowColorWebGLOperate[0] * (1 - mixFactor) + shadowColorCustom[0] * mixFactor;
                shadowColor[1] = shadowColorWebGLOperate[1] * (1 - mixFactor) + shadowColorCustom[1] * mixFactor;
                shadowColor[2] = shadowColorWebGLOperate[2] * (1 - mixFactor) + shadowColorCustom[2] * mixFactor;
                shadowColor[3] = shadowColorWebGLOperate[3] * (1 - mixFactor) + shadowColorCustom[3] * mixFactor;
                const baseColor = [245 / 255, 249 / 255, 255 / 255, 1.0] as number[];
                clearColor[0] = shadowColor[0] * baseColor[0];
                clearColor[1] = shadowColor[1] * baseColor[1];
                clearColor[2] = shadowColor[2] * baseColor[2];
                clearColor[3] = shadowColor[3] * baseColor[3];
                clearColor[3] = 1.0;
                clearColor = clearColor as GLclampf4;
            }
            this.clearColor = clearColor;
            this._assetPass.clearColor = clearColor;
            this._defaultFBO.clearColor(clearColor);
            this._preDepthFBO.clearColor([0.9999999403953552, 0.9999999403953552, 0.9999999403953552, 1.0]);
            this._intermediateFBOs[0].clearColor(clearColor);
            this._intermediateFBOs[1].clearColor(clearColor);
        }

        if (this._altered.multiFrameNumber || this._altered.sunPosition) {
            this._ndcOffsetKernel = new AntiAliasingKernel(this._multiFrameNumber);

            /* Create light samples along circle around eye (light position). */

            const n = vec3.sub(vec3.create(), this._light.eye, this._light.center);
            vec3.normalize(n, n);

            const u = vec3.cross(vec3.create(), n, vec3.fromValues(0.0, 0.03, 0.0));
            const v = vec3.cross(vec3.create(), n, u);

            this._lightSamples = new Array<vec3>(this._multiFrameNumber);
            for (let i = 0; i < this._multiFrameNumber; ++i) {
                const p = vec3.clone(this._light.eye);

                const r = Math.random() * 0.25 * 100; // Math.sqrt(i / this._multiFrameNumber);
                const theta = Math.random() * Math.PI * 2.0;

                vec3.scaleAndAdd(p, p, u, r * Math.cos(theta));
                vec3.scaleAndAdd(p, p, v, r * Math.sin(theta));

                this._lightSamples[i] = p;
            }

            this._lightSamples = [this._light.eye, ...this._lightSamples];
            this._lightSamples.sort((a: vec3, b: vec3) => vec3.sqrDist(a, this._light.eye) - vec3.sqrDist(b, this._light.eye));
        }

        this._assetPass.prepare();

        if (this.sensorValueLabelsConfig.displayLabels || this.enableMetadataAndColorScaleLabelling) {
            this._labelPass.update();
        }

        this._accumulate.update();

        this._altered.reset();
        this._camera.altered = false;
    }

    /**
     * After (1) update and (2) preparation are invoked, a frame is invoked.
     *
     * @param frameNumber - for intermediate frames in accumulation rendering
     */
    protected onFrame(frameNumber: number): void {
        const gl = this._context.gl as WebGLRenderingContext;

        this._light.eye = this._lightSamples[frameNumber];

        if (this.sunIsUp && this.enableShadowMapping) {
            this._shadowPass.frame(() => {
                this._shadowProgram.bind();

                gl.uniform1i(this._shadowProgram.uniform('u_shadowMappingMethod'), this.shadowMappingConfiguration.type);
                switch (this.shadowMappingConfiguration.type) {
                    case ShadowMappingMode.ExponentialShadowMapping:
                        gl.uniform1f(this._shadowProgram.uniform('u_ESMShadowExponent'), this.shadowMappingConfiguration.shadowExponent);
                        break;
                    case ShadowMappingMode.ExponentialVarianceShadowMapping:
                        gl.uniform2fv(
                            this._shadowProgram.uniform('u_EVSMShadowExponents'),
                            this.shadowMappingConfiguration.shadowExponents,
                        );
                        break;
                    default:
                        break;
                }

                gl.uniform2f(this._shadowProgram.uniform('u_lightNearFar'), this._light.near, this._light.far);
                gl.uniformMatrix4fv(this._shadowProgram.uniform('u_lightViewProjection'), false, this._light.viewProjection);
                gl.uniform3fv(this._shadowProgram.uniform('u_lightPosition'), this._light.eye);

                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                this._assetPass.bindMaterial = (_: Material) => {};
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                this._assetPass.bindGeometry = (_: Geometry) => {};
                this._assetPass.updateModelTransform = (matrix: mat4) => {
                    gl.uniformMatrix4fv(this._uModelShadow, false, matrix);
                };

                // Explicitly don’t bind the ID uniform here, because it does not exist in this._shadowProgram (and doesn’t have relevance there)
                this._assetPass.drawCalls(false, false);

                this._shadowProgram.unbind();
            });
        }

        this._assetPass.bindMaterial = (material: Material) => {
            if (this.buildingModelContainsLightmap) {
                const pbrMaterial = material as GLTFPbrMaterial;
                pbrMaterial.baseColorTexture?.bind(gl.TEXTURE0);
            } else {
                this._empty1x1TransparentTexture.bind(gl.TEXTURE0);
            }

            if (this._sensorDistanceMapTexture3DHigh !== undefined && this._sensorDistanceMapTexture3DHigh.valid) {
                this._sensorDistanceMapTexture3DHigh.bind(gl.TEXTURE2);
            }
            if (this._sensorDistanceMapTexture3DLow !== undefined && this._sensorDistanceMapTexture3DLow.valid) {
                this._sensorDistanceMapTexture3DLow.bind(gl.TEXTURE5);
            }
            if (this._outsideDistanceMapTexture3D !== undefined && this._outsideDistanceMapTexture3D.valid) {
                this._outsideDistanceMapTexture3D.bind(gl.TEXTURE1);
            }

            if (this.enableSurfaceSensorDataVisualization) {
                this._colorScaleTextures[this.selectedColorScaleIndex]?.bind(gl.TEXTURE3);
            } else {
                this._empty1x1TransparentTexture.bind(gl.TEXTURE3);
            }
        };

        this._assetPass.updateModelTransform = (matrix: mat4) => {
            gl.uniformMatrix4fv(this._uModel, false, matrix);
        };

        const ndcOffset = this._ndcOffsetKernel.get(frameNumber);
        ndcOffset[0] = (2.0 * ndcOffset[0]) / this._frameSize[0];
        ndcOffset[1] = (2.0 * ndcOffset[1]) / this._frameSize[1];

        // Pre depth pass
        this._preDepthFBO.bind();
        this._preDepthFBO.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, true, false);
        gl.viewport(0, 0, this._frameSize[0], this._frameSize[1]);

        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);
        gl.depthMask(true);

        this._depthProgram.bind();

        gl.uniform2fv(this._uDepthNdcOffset, ndcOffset);
        gl.uniformMatrix4fv(this._depthProgram.uniform('u_viewProjection'), false, this._camera.viewProjection);
        gl.uniform2fv(this._uDepthCameraNearFar, [this._camera.near, this._camera.far]);

        this._assetPass.program = this._depthProgram;
        this._assetPass.target = this._preDepthFBO;
        this._assetPass.bindMaterial = () => {};
        this._assetPass.updateModelTransform = (matrix: mat4) => {
            gl.uniformMatrix4fv(this._uDepthModel, false, matrix);
        };
        this._assetPass.updateViewProjectionTransform = () => {};

        this._assetPass.drawCalls(false, false);
        this._depthProgram.unbind();

        // Render normals into invisible G-Buffer
        this._intermediateFBOs[4].bind();
        this._intermediateFBOs[4].clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, false, false);

        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);

        this._normalProgram.bind();

        gl.uniform2fv(this._uNormalNdcOffset, ndcOffset);
        gl.uniformMatrix4fv(this._uNormalViewProjection, false, this._camera.viewProjection);

        this._assetPass.program = this._normalProgram;
        this._assetPass.target = this._intermediateFBOs[4];
        this._assetPass.bindMaterial = () => {};
        this._assetPass.updateModelTransform = (matrix: mat4) => {
            gl.uniformMatrix4fv(this._uNormalModel, false, matrix);
        };
        this._assetPass.updateViewProjectionTransform = () => {};

        this._assetPass.drawCalls(false, false);
        this._normalProgram.unbind();
        this._intermediateFBOs[4].unbind();

        // rendering
        this._intermediateFBOs[0].bind();
        this._intermediateFBOs[0].clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, true, false);
        gl.viewport(0, 0, this._frameSize[0], this._frameSize[1]);

        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);
        gl.depthMask(true);

        this._assetPass.program = this._assetProgram;
        this._assetPass.target = this._intermediateFBOs[0];
        this._assetPass.program = this._assetProgram;
        this._assetPass.updateModelTransform = (matrix: mat4) => {
            gl.uniformMatrix4fv(this._uModel, false, matrix);
        };
        this._assetPass.updateViewProjectionTransform = (matrix: mat4) => {
            gl.uniformMatrix4fv(this._uViewProjection, false, matrix);
        };

        this._assetPass.bindMaterial = (material: Material) => {
            if (this.buildingModelContainsLightmap) {
                const pbrMaterial = material as GLTFPbrMaterial;
                pbrMaterial.baseColorTexture?.bind(gl.TEXTURE0);
            } else {
                this._empty1x1TransparentTexture.bind(gl.TEXTURE0);
            }

            if (this._sensorDistanceMapTexture3DHigh !== undefined && this._sensorDistanceMapTexture3DHigh.valid) {
                this._sensorDistanceMapTexture3DHigh.bind(gl.TEXTURE2);
            }
            if (this._sensorDistanceMapTexture3DLow !== undefined && this._sensorDistanceMapTexture3DLow.valid) {
                this._sensorDistanceMapTexture3DLow.bind(gl.TEXTURE5);
            }
            if (this._outsideDistanceMapTexture3D !== undefined && this._outsideDistanceMapTexture3D.valid) {
                this._outsideDistanceMapTexture3D.bind(gl.TEXTURE1);
            }

            if (this.enableSurfaceSensorDataVisualization) {
                this._colorScaleTextures[this.selectedColorScaleIndex]?.bind(gl.TEXTURE3);
            } else {
                this._empty1x1TransparentTexture.bind(gl.TEXTURE3);
            }
        };

        this._assetProgram.bind();
        gl.uniform2fv(this._uNdcOffset, ndcOffset);

        if (this.sunIsUp) {
            this._shadowPass.shadowMapTexture.bind(gl.TEXTURE4);
        } else {
            this._empty1x1TransparentTexture.bind(gl.TEXTURE4);
        }

        if (this.hoveredAssetID !== undefined && this.enableAssetHighlightingOnHover) {
            const assetId = this.hoveredAssetID;
            gl.uniform1i(this._uAssetHoveredID, assetId);
        }

        // TODO: Fix bug that, before the actual glTF asset gets rendered, only the label from this._labelPass is visible for one (or more?) frame(s)
        this._assetPass.frame();

        // Render volume
        if (
            this._colorScaleTextures[this.selectedColorScaleIndex] &&
            this._colorScaleTextures[this.selectedColorScaleIndex].valid &&
            this.enableVolumeSensorDataVisualization
        ) {
            gl.enable(gl.DEPTH_TEST);
            gl.depthMask(false);
            gl.enable(gl.CULL_FACE);
            gl.cullFace(gl.FRONT);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

            this._colorScaleTextures[this.selectedColorScaleIndex].bind(gl.TEXTURE0);
            if (this._outsideDistanceMapTexture3D !== undefined && this._outsideDistanceMapTexture3D.valid) {
                this._outsideDistanceMapTexture3D.bind(gl.TEXTURE1);
            }
            if (this._sensorDistanceMapTexture3DHigh !== undefined && this._sensorDistanceMapTexture3DHigh.valid) {
                this._sensorDistanceMapTexture3DHigh.bind(gl.TEXTURE2);
            }
            if (this._sensorDistanceMapTexture3DLow !== undefined && this._sensorDistanceMapTexture3DLow.valid) {
                this._sensorDistanceMapTexture3DLow.bind(gl.TEXTURE3);
            }
            this._depthTexture.bind(gl.TEXTURE4);

            if (this.useTransparencyTransferFunctionForVolumeRendering) {
                this._transparencyTransferTextures[this.selectedTransparencyTransferFunctionIndex].bind(gl.TEXTURE5);
            } else {
                if (this._empty1x1OpaqueTexture && this._empty1x1OpaqueTexture.valid) {
                    this._empty1x1OpaqueTexture.bind(gl.TEXTURE5);
                }
            }

            this._volumeRenderingProgram.bind();

            gl.uniform3fv(this._uVolumeEyePosition, this._camera.eye);
            gl.uniformMatrix4fv(this._uVolumeViewProjection, false, this._camera.viewProjection);
            gl.uniform2fv(this._uVolumeNdcOffset, ndcOffset);
            gl.uniform1i(this._volumeRenderingProgram.uniform('u_showBoundingVolume'), 0);

            gl.uniform2iv(this._volumeRenderingProgram.uniform('u_canvasDims'), [this._frameSize[0], this._frameSize[1]]);
            gl.uniformMatrix4fv(this._volumeRenderingProgram.uniform('u_invView'), false, this._camera.viewInverse as mat4);
            gl.uniformMatrix4fv(this._volumeRenderingProgram.uniform('u_invProjection'), false, this._camera.projectionInverse as mat4);

            const dtScale = 2.0;
            gl.uniform1f(this._uVolumeDtScale, dtScale);

            gl.uniform1f(this._uVolumeMinDistanceThreshold, this.volumeVisibleDistances[0]);
            gl.uniform1f(this._uVolumeMaxDistanceThreshold, this.volumeVisibleDistances[1]);

            const volumeBboxMin = this.apartmentBboxMin;
            const volumeBboxMax = this.apartmentBboxMax;
            const volumeBboxMinCropped = vec3.add(
                vec3.create(),
                volumeBboxMin,
                vec3.multiply(vec3.create(), vec3.subtract(vec3.create(), volumeBboxMax, volumeBboxMin), this.volumeBboxCubeMin),
            );
            const volumeBboxMaxCropped = vec3.add(
                vec3.create(),
                volumeBboxMin,
                vec3.multiply(vec3.create(), vec3.subtract(vec3.create(), volumeBboxMax, volumeBboxMin), this.volumeBboxCubeMax),
            );

            gl.uniform3fv(this._uVolumeBboxMin, volumeBboxMinCropped);
            gl.uniform3fv(this._uVolumeBboxMax, volumeBboxMaxCropped);

            if (this.probingLocations.length === 0) {
                this._volumePass.frame();
            }

            this.probingLocations.forEach((probingLocation, index) => {
                gl.cullFace(gl.BACK);

                const geometry = new GeosphereGeometry(this._context, `probe_${index},`, 1.0, false);
                geometry.initialize();

                this._volumePass.bindUniforms();

                let model = mat4.identity(mat4.create());
                model = mat4.fromTranslation(model, probingLocation);
                gl.uniformMatrix4fv(this._uVolumeModel, false, model);
                let modelInv = mat4.identity(mat4.create());
                modelInv = mat4.invert(modelInv, model);
                gl.uniformMatrix4fv(this._uVolumeInvModel, false, modelInv);

                let bboxMin = vec3.fromValues(probingLocation[0], probingLocation[1], probingLocation[2]); // world coordinates
                bboxMin = vec3.add(bboxMin, bboxMin, vec3.fromValues(-1, -1, -1));
                let bboxMax = vec3.fromValues(probingLocation[0], probingLocation[1], probingLocation[2]); // world coordinates
                bboxMax = vec3.add(bboxMax, bboxMax, vec3.fromValues(1, 1, 1));

                gl.uniform3fv(this._uVolumeBboxMin, bboxMin);
                gl.uniform3fv(this._uVolumeBboxMax, bboxMax);

                const apartmentBoundingBox = vec3.sub(v3(), this.apartmentBboxMax, this.apartmentBboxMin) as GLfloat3;
                const apartmentBoundingBoxStartsAt = this.apartmentBboxMin as GLfloat3;

                const cube = mat4.identity(mat4.create());
                mat4.scale(
                    cube,
                    cube,
                    vec3.fromValues(1.0 / apartmentBoundingBox[0], 1.0 / apartmentBoundingBox[2], 1.0 / apartmentBoundingBox[1]),
                );
                mat4.translate(
                    cube,
                    cube,
                    vec3.fromValues(-apartmentBoundingBoxStartsAt[0], -apartmentBoundingBoxStartsAt[2], -apartmentBoundingBoxStartsAt[1]),
                );
                mat4.rotateX(cube, cube, -Math.PI / 2);
                mat4.multiply(cube, cube, mat4.fromValues(1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1));
                mat4.multiply(cube, cube, model);
                gl.uniformMatrix4fv(this._uVolumeCube, false, cube);

                this._volumeRenderingProgram.attribute('a_vertex', geometry.vertexLocation);

                geometry.bind();
                geometry.draw();
                geometry.unbind();
            });

            this._volumeRenderingProgram.unbind();

            this._colorScaleTextures[this.selectedColorScaleIndex].unbind(gl.TEXTURE0);
            this._outsideDistanceMapTexture3D.unbind(gl.TEXTURE1);
            this._sensorDistanceMapTexture3DHigh.unbind(gl.TEXTURE2);
            this._sensorDistanceMapTexture3DLow.unbind(gl.TEXTURE3);
            this._depthTexture.unbind(gl.TEXTURE4);
        }

        gl.cullFace(gl.BACK);
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);
        gl.depthMask(true);
        gl.disable(gl.BLEND);

        // Render semi-transparent asset hierarchy into visible image
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);
        gl.enable(gl.BLEND);
        gl.depthMask(false);

        this._assetHierarchyProgram.bind();

        gl.uniformMatrix4fv(this._uHierarchyViewProjection, false, this._camera.viewProjection);
        gl.uniform1i(this._uHierarchyRenderIDToFragColor, 0);
        gl.uniform2fv(this._uHierarchyNdcOffset, ndcOffset);

        if (this.hoveredAssetID !== undefined && this.enableAssetHighlightingOnHover) {
            const encodedId = vec4.create();
            // Maximum to-be-encoded ID: 4294967295 (equals [255, 255, 255, 255])
            const assetId = this.hoveredAssetID;
            gl_matrix_extensions.encode_uint32_to_rgba8(encodedId, assetId);
            const encodedIdFloat = new Float32Array(encodedId);
            encodedIdFloat[0] /= 255.0;
            encodedIdFloat[1] /= 255.0;
            encodedIdFloat[2] /= 255.0;
            encodedIdFloat[3] /= 255.0;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call
            gl.uniform4fv(this._uHierarchyHoveredEncodedID, encodedIdFloat);
        }

        this._assetHierarchyPass.frame();

        this._assetHierarchyProgram.unbind();

        // Render asset hierarchy indices into invisible G-Buffer
        this._intermediateFBOs[3].bind();
        this._intermediateFBOs[3].clear(gl.COLOR_BUFFER_BIT, false, false);

        gl.depthMask(false);
        gl.disable(gl.CULL_FACE);

        this._assetHierarchyPass.target = this._intermediateFBOs[3];

        this._assetHierarchyProgram.bind();

        gl.uniform1i(this._uHierarchyRenderIDToFragColor, 1);
        gl.uniformMatrix4fv(this._uHierarchyViewProjection, false, this._camera.viewProjection);

        this._assetHierarchyPass.frame();

        this._assetHierarchyProgram.unbind();

        // Render cuboids
        if (this.sensorValueLabels && this.sensorValueLabels.length > 0) {
            gl.disable(gl.CULL_FACE);
            gl.depthMask(false);
            this._intermediateFBOs[2].bind();
            this._intermediateFBOs[2].clear(gl.COLOR_BUFFER_BIT, false, false);
            this._cuboidProgram.bind();
            gl.uniformMatrix4fv(this._uCuboidViewProjection, false, this._camera.viewProjection);

            for (const sensorValueLabel of this.sensorValueLabels) {
                const encodedId = vec4.create();
                // Maximum to-be-encoded ID: 4294967295 (equals [255, 255, 255, 255])
                gl_matrix_extensions.encode_uint32_to_rgba8(encodedId, sensorValueLabel.sensorId);
                const encodedIdFloat = new Float32Array(encodedId);
                encodedIdFloat[0] /= 255.0;
                encodedIdFloat[1] /= 255.0;
                encodedIdFloat[2] /= 255.0;
                encodedIdFloat[3] /= 255.0;
                gl.uniform4fv(this._uCuboidEncodedId, encodedIdFloat);

                const modelMatrix = mat4.identity(mat4.create());
                mat4.translate(modelMatrix, mat4.create(), sensorValueLabel.position);
                gl.uniformMatrix4fv(this._uCuboidModelMatrix, false, modelMatrix);

                this._cuboid.bind();
                this._cuboid.draw();
                this._cuboid.unbind();
            }
            this._cuboidProgram.unbind();
        }

        // Render points and lines
        // TODO(config): Make this value configuration-based/dynamic
        if (false) {
            gl.disable(gl.CULL_FACE);
            gl.disable(gl.DEPTH_TEST);
            this._intermediateFBOs[0].bind();
            this.renderPoints(ndcOffset);
            this.renderLines(ndcOffset);
            gl.enable(gl.DEPTH_TEST);
        }

        // Render label(s)
        if (this.sensorValueLabelsConfig.displayLabels || this.enableMetadataAndColorScaleLabelling) {
            this._labelPass.ndcOffset = ndcOffset as [number, number];
            this._labelPass.frame();

            if (this.enableMetadataAndColorScaleLabelling) {
                if (
                    this._colorScaleTextures[this.selectedColorScaleIndex] &&
                    this._colorScaleTextures[this.selectedColorScaleIndex].valid
                ) {
                    gl.enable(gl.DEPTH_TEST);
                    gl.depthMask(true);
                    this._colorScaleProgram.bind();
                    gl.uniform2fv(this._uColorScaleNdcOffset, ndcOffset);
                    gl.uniformMatrix4fv(this._uColorScalePlaneViewProjection, false, this._camera.viewProjection);
                    gl.uniformMatrix4fv(this._uColorScalePlaneModelMatrix, false, this._colorScalePlane.transformation);
                    gl.uniform1i(this._colorScaleProgram.uniform('u_texture'), 0);
                    this._colorScaleTextures[this.selectedColorScaleIndex].bind(gl.TEXTURE0);
                    this._colorScalePlane.bind();
                    this._colorScalePlane.draw();
                    this._colorScalePlane.unbind();
                    this._colorScaleProgram.unbind();
                }
            }
        }

        // post processing

        this._ndcTriangle.bind();

        gl.disable(gl.CULL_FACE);
        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);
        this._shadowPass.shadowMapTexture.unbind();

        // contours

        if (this._edgeProgram && this._edgeProgram.valid) {
            this._intermediateFBOs[1].bind();
            this._colorRenderTextures[0].bind(gl.TEXTURE0);
            this._depthTexture.bind(gl.TEXTURE1);
            this._normalTexture.bind(gl.TEXTURE2);

            this._edgeProgram.bind();
            gl.uniformMatrix4fv(this._uEdgeView, false, this._camera.viewProjection);
            // gl.uniform2f(this._uEdgeResolution, this._frameSize[0], this._frameSize[1]);
            gl.uniform1f(this._uEdgeNear, this._camera.near);
            gl.uniform1f(this._uEdgeFar, this._camera.far);
            gl.uniform4fv(this._uEdgeScreenSize, [this._frameSize[0], this._frameSize[1], 1 / this._frameSize[0], 1 / this._frameSize[1]]);
            gl.uniform1i(this._uEdgeEnableOutlineRendering, Number(this._enableEdgeOutlineRendering));

            this._ndcTriangle.draw();
            this._edgeProgram.unbind();

            this._depthTexture.unbind(gl.TEXTURE1);
            this._normalTexture.unbind(gl.TEXTURE2);
            this._colorRenderTextures[0].unbind(gl.TEXTURE0);
            this._intermediateFBOs[1].unbind();
        }

        // ssao

        if (this._ssaoProgram && this._ssaoProgram.valid) {
            this._intermediateFBOs[0].bind();
            this._colorRenderTextures[1].bind(gl.TEXTURE0);
            this._depthTexture.bind(gl.TEXTURE1);
            this._normalTexture.bind(gl.TEXTURE2);
            this._noiseTexture.bind(gl.TEXTURE3);
            this._ssaoSpiralKernelTexture.bind(gl.TEXTURE4);

            this._ssaoProgram.bind();
            gl.uniformMatrix4fv(this._uSSAOView, false, this._camera.viewProjection);
            gl.uniformMatrix4fv(this._uSSAOProjection, false, this._camera.projection);
            gl.uniformMatrix4fv(this._uSSAOInvProjection, false, this._camera.projectionInverse as mat4);
            gl.uniform1f(this._uSSAONear, this._camera.near);
            gl.uniform1f(this._uSSAOFar, this._camera.far);
            gl.uniform4fv(this._uSSAOScreenSize, [this._frameSize[0], this._frameSize[1], 1 / this._frameSize[0], 1 / this._frameSize[1]]);
            gl.uniform1i(this._uSSAOEnableSSAO, Number(this.enableSSAO));

            gl.uniform1i(this._uSSAOFrameNumber, frameNumber);

            gl.uniform1f(this._uSSAOMinDistance, this.ssaoConfig.minDistance);
            gl.uniform1f(this._uSSAOMaxDistance, this.ssaoConfig.maxDistance);

            this._ndcTriangle.draw();
            this._edgeProgram.unbind();

            this._depthTexture.unbind(gl.TEXTURE1);
            this._normalTexture.unbind(gl.TEXTURE2);
            this._noiseTexture.unbind(gl.TEXTURE3);
            this._colorRenderTextures[1].unbind(gl.TEXTURE0);
            this._intermediateFBOs[0].unbind();
        }

        // chromatic aberration

        if (this._chromaticAberrationProgram && this._chromaticAberrationProgram.valid) {
            this._intermediateFBOs[1].bind();
            this._colorRenderTextures[0].bind(gl.TEXTURE0);
            this._idRenderTextureAsset.bind(gl.TEXTURE1);

            this._chromaticAberrationProgram.bind();

            if (this.hoveredAssetID !== undefined && this.enableAssetHighlightingOnHover) {
                const encodedId = vec4.create();
                // Maximum to-be-encoded ID: 4294967295 (equals [255, 255, 255, 255])
                const assetId = this.hoveredAssetID;
                gl_matrix_extensions.encode_uint32_to_rgba8(encodedId, assetId);
                const encodedIdFloat = new Float32Array(encodedId);
                encodedIdFloat[0] /= 255.0;
                encodedIdFloat[1] /= 255.0;
                encodedIdFloat[2] /= 255.0;
                encodedIdFloat[3] /= 255.0;
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call
                gl.uniform4fv(this._uCAHoveredAssetEncodedID, encodedIdFloat);
            }

            this._ndcTriangle.draw();

            this._chromaticAberrationProgram.unbind();
            this._idRenderTextureAsset.unbind(gl.TEXTURE1);
            this._colorRenderTextures[0].unbind(gl.TEXTURE0);
            this._intermediateFBOs[1].unbind();
        }

        // sharpen

        if (this._sharpenProgram && this._sharpenProgram.valid) {
            this._intermediateFBOs[0].bind();
            this._colorRenderTextures[1].bind(gl.TEXTURE0);

            this._sharpenProgram.bind();
            this._ndcTriangle.draw();

            this._sharpenProgram.unbind();
            this._colorRenderTextures[1].unbind(gl.TEXTURE0);
            this._intermediateFBOs[0].unbind();
        }

        if (this._accumulate && this._accumulate.initialized) {
            this._accumulate.frame(frameNumber);
        }
    }

    protected renderPoints(ndcOffset: number[]): void {
        const gl = this._context.gl;
        this._pointsProgram.bind();

        gl.uniformMatrix4fv(this._uPointsViewProjection, gl.GL_FALSE, this._camera.viewProjection);
        gl.uniform2fv(this._uPointsNdcOffset, ndcOffset);

        gl.bindBuffer(gl.ARRAY_BUFFER, this._pointsBuffer);

        // refer to https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/vertexAttribPointer for more information

        gl.vertexAttribPointer(0, 3, gl.FLOAT, gl.FALSE, 7 * Float32Array.BYTES_PER_ELEMENT, 0);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, gl.FALSE, 7 * Float32Array.BYTES_PER_ELEMENT, 3 * Float32Array.BYTES_PER_ELEMENT);
        gl.vertexAttribPointer(2, 1, gl.FLOAT, gl.FALSE, 7 * Float32Array.BYTES_PER_ELEMENT, 6 * Float32Array.BYTES_PER_ELEMENT);
        gl.enableVertexAttribArray(0);
        gl.enableVertexAttribArray(1);
        gl.enableVertexAttribArray(2);

        gl.drawArrays(gl.POINTS, 0, this._points.length / 7);
        gl.bindBuffer(gl.ARRAY_BUFFER, Buffer.DEFAULT_BUFFER);

        gl.disableVertexAttribArray(0);
        gl.disableVertexAttribArray(1);
        gl.disableVertexAttribArray(2);

        this._pointsProgram.unbind();
    }

    protected renderLines(ndcOffset: number[]): void {
        const gl = this._context.gl;
        this._linesProgram.bind();

        gl.uniformMatrix4fv(this._uLinesViewProjection, gl.GL_FALSE, this._camera.viewProjection);
        gl.uniform2fv(this._uLinesNdcOffset, ndcOffset);

        gl.bindBuffer(gl.ARRAY_BUFFER, this._linesBuffer);

        // refer to https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/vertexAttribPointer for more information

        gl.vertexAttribPointer(0, 3, gl.FLOAT, gl.FALSE, 6 * Float32Array.BYTES_PER_ELEMENT, 0);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, gl.FALSE, 6 * Float32Array.BYTES_PER_ELEMENT, 3 * Float32Array.BYTES_PER_ELEMENT);

        gl.enableVertexAttribArray(0);
        gl.enableVertexAttribArray(1);

        gl.drawArrays(gl.LINES, 0, this._lines.length / 6);
        gl.bindBuffer(gl.ARRAY_BUFFER, Buffer.DEFAULT_BUFFER);

        gl.disableVertexAttribArray(0);
        gl.disableVertexAttribArray(1);

        this._linesProgram.unbind();
    }

    protected onSwap(): void {
        if (this._benchmark && this._benchmark.running) {
            this._benchmark.frame();
            this.invalidate(true);
        }

        this._blit.framebuffer = this._accumulate.framebuffer ? this._accumulate.framebuffer : this._intermediateFBOs[1];
        try {
            this._blit.frame();
            // TODO(config): Make this value configuration-based/dynamic
            if (false) {
                this._debugPass.frame();
            }
        } catch {
            // Do nothing
        }
    }

    protected benchmark(): void {
        if (!this._benchmark) {
            this._benchmark = new Benchmark();
        }

        // const values = [0, 1e1, 1e2, 1e3, 1e4, 1e5, 1e6, 2e6, 4e6, 6e6, 8e6, 10e6, 12e6, 14e6, 16e6];
        const values = Array(5).fill(1);

        // const numPointsRendered = this._numPointsToRender;

        this._benchmark.initialize(
            values.length,
            60 * 2,
            60 * 5,

            (frame: number, framesForWarmup: number, framesPerCycle: number, cycle: number): void => {
                // called per frame benchmarked ...

                const phi = ((Math.PI * 2.0 * 1.0) / (cycle < 0 ? framesForWarmup : framesPerCycle)) * frame;

                this._camera.up = vec3.fromValues(0.0, 1.0, 0.0);
                this._camera.center = this._defaultCameraCenter;
                const eye = vec3.rotateY(v3(), this._defaultCameraEye, this._defaultCameraCenter, phi);
                this._camera.eye = eye;

                if (cycle < 0) {
                    // warmup
                    // this._numPointsToRender = 1e6;
                } else {
                    // this._numPointsToRender = values[cycle];
                }
            },

            (cycles: number, framesForWarmup: number, framesPerCycle: number, results: Array<number>): void => {
                console.log('BENCHMARK CONFIG');
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                console.log(`frameSize: ${this._frameSize}`);
                // console.log(`frameSize: ${this._frameSize.toString()}, pointSize: ${this._pointSize.toString()}`);
                // console.log(`alpha2Coverage: ${this._alpha2Coverage}, alphaBlending ${this._alphaBlending},
                //     billboards: ${this._billboards}, phongShading: ${this._phongShading}`);
                console.log(`#cycles:  ${cycles}, #framesForWarmup: ${framesForWarmup},
                    #framesPerCycle: ${framesPerCycle}`);
                console.log(`values: ${JSON.stringify(values)}`);
                console.log('BENCHMARK RESULTS');
                console.log(JSON.stringify(results));

                // this._numPointsToRender = numPointsRendered;
            },
        );
        this.invalidate(true);
    }

    protected initializeVolumeRenderingProgram(context: Context): void {
        const apartmentBoundingBox = [19.59032166, 3.4400007724761963, 15.443490028] as GLfloat3;
        const apartmentBoundingBoxStartsAt = [-1.8249350786209106, 0.0, -5.399456024169922] as GLfloat3;
        const volumeTextureDimensions = [160, 28, 126];

        const gl = this._context.gl;

        const vert = new Shader(context, gl.VERTEX_SHADER, 'volume.vert');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        vert.initialize(require('./shaders/volume.vert'));
        const frag = new Shader(context, gl.FRAGMENT_SHADER, 'volume.frag');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        frag.initialize(require('./shaders/volume.frag'));

        this._volumeRenderingProgram = new Program(context, 'VolumeProgram');
        this._volumeRenderingProgram.initialize([vert, frag], false);

        this._volumeRenderingProgram.link();
        this._volumeRenderingProgram.bind();

        this._uVolumeUseLowBitDistanceMap = this._volumeRenderingProgram.uniform('u_useLowBitDistanceMap');
        this._uVolumeSensorDistanceMap3DHigh = this._volumeRenderingProgram.uniform('u_sensorDistanceMap3DHigh');
        this._uVolumeSensorDistanceMap3DLow = this._volumeRenderingProgram.uniform('u_sensorDistanceMap3DLow');
        this._uVolumeOutsideDistanceMap3D = this._volumeRenderingProgram.uniform('u_outsideDistanceMap3D');

        this._uVolumeInverseDistanceWeightExponent = this._volumeRenderingProgram.uniform('u_inverseDistanceWeightExponent');
        this._uVolumeOutsideTemperature = this._volumeRenderingProgram.uniform('u_outsideTemperature');
        this._uVolumeAverageIndoorTemperature = this._volumeRenderingProgram.uniform('u_averageIndoorTemperature');

        gl.uniform1i(this._volumeRenderingProgram.uniform('u_transferFunction'), 0); // TEXTURE0
        gl.uniform1i(this._uVolumeOutsideDistanceMap3D, 1);
        gl.uniform1i(this._uVolumeSensorDistanceMap3DHigh, 2);
        gl.uniform1i(this._uVolumeSensorDistanceMap3DLow, 3);
        gl.uniform1i(this._volumeRenderingProgram.uniform('u_depth'), 4);
        gl.uniform1i(this._volumeRenderingProgram.uniform('u_transparencyTransferFunction'), 5);

        this._uVolumeViewProjection = this._volumeRenderingProgram.uniform('u_viewProjection');
        this._uVolumeModel = this._volumeRenderingProgram.uniform('u_model');
        this._uVolumeInvModel = this._volumeRenderingProgram.uniform('u_invModel');
        this._uVolumeCube = this._volumeRenderingProgram.uniform('u_cube');

        this._uVolumeNumSensors = this._volumeRenderingProgram.uniform('u_numSensors');

        const volumeSensorValuesUniforms = [];

        if (this.sensorValues && this.sensorValues.length > 0) {
            for (let sensorIndex = 0; sensorIndex < this.sensorValues.length; sensorIndex++) {
                volumeSensorValuesUniforms.push(this._volumeRenderingProgram.uniform(`u_sensorValues[${sensorIndex}]`));
            }
        }

        this._uVolumeSensorValues = volumeSensorValuesUniforms;

        this._uVolumeSensorMinValue = this._volumeRenderingProgram.uniform('u_sensorMinValue');
        this._uVolumeSensorMaxValue = this._volumeRenderingProgram.uniform('u_sensorMaxValue');

        this._uVolumeEyePosition = this._volumeRenderingProgram.uniform('u_eyePosition');
        this._uVolumeVolumeScale = this._volumeRenderingProgram.uniform('u_volumeScale');
        this._uVolumeDtScale = this._volumeRenderingProgram.uniform('u_dtScale');
        this._uVolumeMinDistanceThreshold = this._volumeRenderingProgram.uniform('u_minDistanceThreshold');
        this._uVolumeMaxDistanceThreshold = this._volumeRenderingProgram.uniform('u_maxDistanceThreshold');
        this._uVolumeNdcOffset = this._volumeRenderingProgram.uniform('u_ndcOffset');
        this._uVolumeVolumeDimensions = this._volumeRenderingProgram.uniform('u_volumeDims');

        this._uVolumeBboxMin = this._volumeRenderingProgram.uniform('u_bboxMin');
        this._uVolumeBboxMax = this._volumeRenderingProgram.uniform('u_bboxMax');

        gl.uniform3fv(this._uVolumeVolumeScale, vec3.fromValues(apartmentBoundingBox[0], apartmentBoundingBox[1], apartmentBoundingBox[2]));
        gl.uniform3iv(this._uVolumeVolumeDimensions, volumeTextureDimensions);

        this._volumePass = new ForwardSceneRenderPassWithIdentities(context);
        this._volumePass.initialize();

        this._volumePass.camera = this._camera;
        this._volumePass.target = this._intermediateFBOs[0];

        this._volumePass.program = this._volumeRenderingProgram;

        this._volumePass.updateModelTransform = (model: mat4) => {
            gl.uniformMatrix4fv(this._uVolumeModel, false, model);
            let modelInv = mat4.identity(mat4.create());
            modelInv = mat4.invert(modelInv, model);
            gl.uniformMatrix4fv(this._uVolumeInvModel, false, modelInv);

            const cube = mat4.identity(mat4.create());
            mat4.scale(
                cube,
                cube,
                vec3.fromValues(1.0 / apartmentBoundingBox[0], 1.0 / apartmentBoundingBox[2], 1.0 / apartmentBoundingBox[1]),
            );
            mat4.translate(
                cube,
                cube,
                vec3.fromValues(-apartmentBoundingBoxStartsAt[0], -apartmentBoundingBoxStartsAt[2], -apartmentBoundingBoxStartsAt[1]),
            );
            mat4.rotateX(cube, cube, -Math.PI / 2);
            mat4.multiply(cube, cube, mat4.fromValues(1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1));
            mat4.multiply(cube, cube, model);
            gl.uniformMatrix4fv(this._uVolumeCube, gl.FALSE, cube);
        };
        this._volumePass.updateViewProjectionTransform = (matrix: mat4) => {
            gl.uniformMatrix4fv(this._uVolumeViewProjection, false, matrix);
        };
        this._volumePass.bindUniforms = () => {
            gl.uniform1i(this._uVolumeUseLowBitDistanceMap, this.useLowBitDistanceMap);
            gl.uniform1i(this._uVolumeNumSensors, this.sensorValues?.length || 0);

            if (this.sensorValues && this.sensorValues.length > 0) {
                for (let sensorIndex = 0; sensorIndex < this.sensorValues.length; sensorIndex++) {
                    const sensorValue = this.sensorValues[sensorIndex];
                    gl.uniform1f(this._uVolumeSensorValues[sensorIndex], sensorValue.value);
                }
            }

            gl.uniform1f(this._uVolumeSensorMinValue, this.sensorMinValue);
            gl.uniform1f(this._uVolumeSensorMaxValue, this.sensorMaxValue);

            gl.uniform1f(this._uVolumeInverseDistanceWeightExponent, this.inverseDistanceWeightExponent);
            gl.uniform1f(this._uVolumeOutsideTemperature, this.outsideTemperature);
            gl.uniform1f(this._uVolumeAverageIndoorTemperature, this.averageIndoorTemperature);
        };
        this._volumePass.bindGeometry = () => {};
        this._volumePass.bindMaterial = () => {};

        this._volumePass.clearColor = [0, 0, 0, 0];

        const internalFormatAndType = Wizard.queryInternalTextureFormat(this._context, gl.RGBA, Wizard.Precision.auto);

        this._empty1x1OpaqueTexture = new Texture2D(this._context, 'Empty1x1OpaqueTexture');
        this._empty1x1OpaqueTexture.initialize(1, 1, internalFormatAndType[0], gl.RGBA, internalFormatAndType[1]);
        this._empty1x1OpaqueTexture.wrap(gl.REPEAT, gl.REPEAT);
        this._empty1x1OpaqueTexture.filter(gl.NEAREST, gl.NEAREST);
        this._empty1x1OpaqueTexture.data(new ImageData(new Uint8ClampedArray([0, 0, 0, 255]), 1, 1));

        const useLinearFiltering = true;
        const preset = 'linear';
        const steps = 5;
        const invert = true;
        const transparencyTransferTexture = new Texture2D(context, `TransparencyTransferTexture${preset}`);
        transparencyTransferTexture.initialize(steps, 1, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE);

        if (useLinearFiltering) {
            transparencyTransferTexture.filter(gl.LINEAR, gl.LINEAR);
        } else {
            transparencyTransferTexture.filter(gl.NEAREST, gl.NEAREST);
        }

        let dataArray = [...Array(steps).keys()].map((index) => [255, 255, 255, Math.round((index / (steps - 1)) * 255)]);

        if (invert) {
            dataArray = dataArray.reverse();
        }

        const data = Uint8Array.from(dataArray.flat());
        transparencyTransferTexture.data(data, true, false);
        this._transparencyTransferTextures[0] = transparencyTransferTexture;
    }

    /**
     * Load asset from URI specified by the HTML select
     */
    protected loadAsset(hierarchyOnly?: boolean): Promise<void[]> {
        const loadingPromises = [] as Promise<void>[];

        if (hierarchyOnly === undefined || !hierarchyOnly) {
            const uri = this._buildingModelGltfUri;
            this._assetPass.scene = undefined;

            const assetPromise = new Promise<void>((resolve) => {
                this._loader.uninitialize();
                void this._loader.loadAsset(uri).then(() => {
                    this._assetPass.scene = this._loader.defaultScene;
                    this.invalidate(true);
                    resolve();
                });
            });

            loadingPromises.push(assetPromise);
        }

        if (this.buildingModelHierarchyGltfUri) {
            const uriHierarchy = this.buildingModelHierarchyGltfUri;
            this._assetHierarchyPass.scene = undefined;

            const assetHierarchyPromise = new Promise<void>((resolve) => {
                this._hierarchyLoader.uninitialize();
                void this._hierarchyLoader.loadAsset(uriHierarchy).then(() => {
                    this._assetHierarchyPass.scene = this._hierarchyLoader.defaultScene;
                    this._volumePass.scene = this._hierarchyLoader.defaultScene;
                    this.invalidate(true);
                    resolve();
                });
            });

            loadingPromises.push(assetHierarchyPromise);
        }

        return Promise.all(loadingPromises);
    }

    protected initializeSensorDistanceMapTexture3D(sensorValues: SensorValue[]): Promise<void> {
        if (!this.assetContentRoot) {
            return new Promise((resolve) => resolve());
        }

        const promises = [] as Array<Promise<void>>;

        const pathsHigh = sensorValues.map(
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            (sensorValue) => `${this.assetContentRoot!}distance-maps/sensor_${sensorValue.sensorId}_high.png`,
        );

        promises.push(
            new Promise<void>((resolve) => {
                void this._sensorDistanceMapTexture3DHigh
                    .loadFromSingleImages(pathsHigh, this.distanceMapHeightSlices, false, true)
                    .then(() => {
                        resolve();
                    });
            }),
        );

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const pathsLow = sensorValues.map((sensorValue) => `${this.assetContentRoot!}distance-maps/sensor_${sensorValue.sensorId}_low.png`);

        promises.push(
            new Promise<void>((resolve) => {
                void this._sensorDistanceMapTexture3DLow
                    .loadFromSingleImages(pathsLow, this.distanceMapHeightSlices, false, true)
                    .then(() => {
                        resolve();
                    });
            }),
        );

        return new Promise((resolve) => {
            void Promise.all(promises).then(() => resolve());
        });
    }
}
