/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/indent */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import * as React from 'react';

import { DateTime } from 'luxon';

import { vec3 } from 'webgl-operate';
import { Camera } from 'webgl-operate';

import {
    AssetValue,
    DebugSensorDistancesConfiguration,
    HoverEvent,
    SensorValue,
    SensorValueLabel,
    SensorValueLabelsConfig,
} from '../renderer/renderer';

import { TASASensorSingleData, TASASensorValues, useTASAData } from './TASADataProvider';
import { SamplingMode } from './TASAHistoricalDataDispatcher';

import { RoomCanvasViewer, ColorScaleConfiguration } from './RoomCanvasViewer';

// TODO: After extending the font’s character set, allow for locale agostic datetime formatting by removing this explicit one
const DATE_AND_TIME_DISPLAY_LOCALE = 'en-en';

const TASADataDisplay: React.FunctionComponent = () => {
    const [state] = useTASAData();

    if (state.isLoading) {
        return (
            <div className="spinner-border" role="status">
                <span className="sr-only">Loading...</span>
            </div>
        );
    } else if (state.error) {
        return (
            <div>
                <p>
                    Unable to load TASA data. Please make sure to configure a valid TASA API token.
                    <br />
                    Error message:
                </p>
                <pre>{state.error}</pre>
            </div>
        );
    }

    return (
        <div>
            The data (<code>state.sensorValues</code>) is:{' '}
            <pre>
                {JSON.stringify(
                    state.data?.sensorValues,
                    (key, value) =>
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                        value instanceof Map ? [...value] : value,
                    2,
                )}
            </pre>
        </div>
    );
};

const findClosestSensorDataEntry = (
    datetimeMillis: number,
    sensorData: Map<string, TASASensorSingleData>,
    interpolateBetweenNearestValues: boolean = false,
    show1stDerivative: boolean = false,
): TASASensorSingleData | undefined => {
    const datetime = DateTime.fromMillis(datetimeMillis);
    if (interpolateBetweenNearestValues) {
        const sensorValueTimeDiffs = Array.from(sensorData.values())
            .map((sensorDataEntry) => {
                const sensorDataEntryDatetime = DateTime.fromISO(sensorDataEntry.timestamp);
                return {
                    timeDiff: sensorDataEntryDatetime.diff(datetime).toObject().milliseconds,
                    sensorDataEntry,
                };
            })
            .filter((entry) => entry.timeDiff !== undefined);
        let entryBefore;
        let entryAfter;
        if (sensorValueTimeDiffs.some((entry) => entry.timeDiff! < 0)) {
            entryBefore = sensorValueTimeDiffs
                .filter((entry) => entry.timeDiff! < 0)
                .reduce((prev, curr) => (prev.timeDiff! > curr.timeDiff! ? prev : curr));
        }
        if (sensorValueTimeDiffs.some((entry) => entry.timeDiff! > 0)) {
            entryAfter = sensorValueTimeDiffs
                .filter((entry) => entry.timeDiff! > 0)
                .reduce((prev, curr) => (prev.timeDiff! < curr.timeDiff! ? prev : curr));
        }
        if (entryBefore && entryAfter) {
            if (show1stDerivative) {
                const gradient =
                    parseFloat(entryAfter.sensorDataEntry.value as string) - parseFloat(entryBefore.sensorDataEntry.value as string);
                return {
                    timestamp: datetime.toISO(),
                    unit: entryBefore.sensorDataEntry.unit,
                    value: parseFloat(gradient.toFixed(2)),
                };
            }
            const factor = Math.abs(entryBefore.timeDiff!) / (Math.abs(entryAfter.timeDiff!) + Math.abs(entryBefore.timeDiff!));
            const interpolatedValue =
                parseFloat(entryBefore.sensorDataEntry.value as string) * (1 - factor) +
                parseFloat(entryAfter.sensorDataEntry.value as string) * factor;
            return {
                timestamp: datetime.toISO(),
                unit: entryBefore.sensorDataEntry.unit,
                value: parseFloat(interpolatedValue.toFixed(2)),
            } as TASASensorSingleData;
        } else if (entryBefore) {
            // TODO: Extrapolate the previous gradient if the show1stDerivative mode is active
            if (show1stDerivative) {
                return {
                    timestamp: datetime.toISO(),
                    unit: entryBefore.sensorDataEntry.unit,
                    value: 0,
                };
            }
            return {
                ...entryBefore.sensorDataEntry,
                value: parseFloat(parseFloat(entryBefore.sensorDataEntry.value as string).toFixed(2)),
            };
        } else if (entryAfter) {
            // TODO: Extrapolate the following gradient if the show1stDerivative mode is active
            if (show1stDerivative) {
                return {
                    timestamp: datetime.toISO(),
                    unit: entryAfter.sensorDataEntry.unit,
                    value: 0,
                };
            }
            return {
                ...entryAfter.sensorDataEntry,
                value: parseFloat(parseFloat(entryAfter.sensorDataEntry.value as string).toFixed(2)),
            };
        } else {
            throw new Error('No data points for interpolation have been given');
        }
    } else {
        let clostestSampleDistance = Infinity;
        let closestSensorEntry;
        for (const sensorDataEntry of sensorData.values()) {
            const sensorDataEntryDatetime = DateTime.fromISO(sensorDataEntry.timestamp);
            const diffInMs = sensorDataEntryDatetime.diff(datetime).toObject().milliseconds;
            if (diffInMs && Math.abs(diffInMs) < clostestSampleDistance) {
                clostestSampleDistance = Math.abs(diffInMs);
                closestSensorEntry = sensorDataEntry;
            }
        }
        if (closestSensorEntry) {
            return {
                ...closestSensorEntry,
                value: parseFloat(parseFloat(closestSensorEntry.value as string).toFixed(2)),
            };
        }
        throw new Error('No data points have been given');
    }
};

const getSensorValuesLabels = (
    samplingMode: SamplingMode,
    data: TASASensorValues | undefined,
    sensorPositions?: {
        sensorPositions: Map<number, [number, number, number]>;
    },
    showLabelsForSensorIds?: number[],
    visualizeDataForDatetimeMillis?: number,
    interpolateBetweenNearestValues?: boolean,
    show1stDerivative?: boolean,
): SensorValueLabel[] | undefined => {
    const visualizeDataForDatetime = visualizeDataForDatetimeMillis ? DateTime.fromMillis(visualizeDataForDatetimeMillis) : undefined;
    return data !== undefined && sensorPositions
        ? [...data]
              .filter(([sensorId]) => (showLabelsForSensorIds ? showLabelsForSensorIds.includes(sensorId) : true))
              .filter(
                  ([, sensorData]) =>
                      sensorData.attributes?.last_value?.value !== undefined ||
                      (sensorData?.sensorData !== undefined && sensorData?.sensorData?.size > 0),
              )
              .filter(([sensorId]) => sensorPositions.sensorPositions.has(sensorId))
              .map(([sensorId, sensorData]) => {
                  const position = vec3.fromValues(...sensorPositions.sensorPositions.get(sensorId)!);
                  if (
                      visualizeDataForDatetimeMillis &&
                      sensorData.sensorData &&
                      sensorData.sensorData.size > 0 &&
                      sensorData.sensorData.has(samplingMode) &&
                      sensorData.sensorData.get(samplingMode)!.size > 0
                  ) {
                      const closestSensorEntry = findClosestSensorDataEntry(
                          visualizeDataForDatetimeMillis,
                          sensorData.sensorData.get(samplingMode)!,
                          interpolateBetweenNearestValues,
                          show1stDerivative,
                      );
                      if (closestSensorEntry) {
                          return {
                              sensorId,
                              position,
                              labelText: `${(closestSensorEntry.value as number) ?? ''} ${closestSensorEntry.unit ?? ''}`,
                          };
                      }
                  }
                  return {
                      sensorId,
                      position,
                      labelText:
                          sensorData.sensorData !== undefined && sensorData.sensorData.size > 0
                              ? visualizeDataForDatetime
                                  ? `${
                                        (sensorData.sensorData?.get(samplingMode)?.get(visualizeDataForDatetime.toISO())
                                            ?.value as number) ?? ''
                                    } ${
                                        (sensorData.sensorData?.get(samplingMode)?.get(visualizeDataForDatetime.toISO())?.unit as string) ??
                                        ''
                                    }`
                                  : `${
                                        Array.from(sensorData.sensorData.get(samplingMode)!)[
                                            sensorData.sensorData.get(samplingMode)!.size - 1
                                        ][1].value
                                    } ${
                                        Array.from(sensorData.sensorData.get(samplingMode)!)[
                                            sensorData.sensorData.get(samplingMode)!.size - 1
                                        ][1].unit
                                    }`
                              : `${sensorData.attributes!.last_value!.value} ${sensorData.attributes!.display_unit || ''}`,
                  };
              })
        : undefined;
};

const getSensorValues = (
    samplingMode: SamplingMode,
    data: TASASensorValues | undefined,
    visualizeValuesForSensorIds?: number[],
    visualizeDataForDatetimeMillis?: number,
    interpolateBetweenNearestValues?: boolean,
    show1stDerivative?: boolean,
    sensorPositions?: {
        sensorPositions: Map<number, [number, number, number]>;
    },
): SensorValue[] | undefined => {
    const visualizeDataForDatetime = visualizeDataForDatetimeMillis ? DateTime.fromMillis(visualizeDataForDatetimeMillis) : undefined;
    return data !== undefined
        ? [...data]
              .filter(([sensorId]) => (visualizeValuesForSensorIds ? visualizeValuesForSensorIds.includes(sensorId) : true))
              .filter(([, sensorData]) => sensorData.sensorData && sensorData.sensorData.size > 0)
              .map(([sensorId, sensorData]) => {
                  let position = vec3.fromValues(0.0, 0.0, 0.0);
                  if (sensorPositions && sensorPositions.sensorPositions.has(sensorId)) {
                      position = vec3.fromValues(...sensorPositions.sensorPositions.get(sensorId)!);
                  }
                  if (
                      visualizeDataForDatetime &&
                      sensorData.sensorData &&
                      sensorData.sensorData.size > 0 &&
                      sensorData.sensorData.has(samplingMode) &&
                      sensorData.sensorData.get(samplingMode)!.size > 0
                  ) {
                      const closestSensorEntry = findClosestSensorDataEntry(
                          visualizeDataForDatetimeMillis!,
                          sensorData.sensorData.get(samplingMode)!,
                          interpolateBetweenNearestValues,
                          show1stDerivative,
                      );
                      if (closestSensorEntry) {
                          return {
                              sensorId,
                              position,
                              value: closestSensorEntry.value as number,
                          };
                      }
                  }
                  return {
                      sensorId,
                      position,
                      value:
                          (visualizeDataForDatetime
                              ? Number(sensorData.sensorData?.get(samplingMode)?.get(visualizeDataForDatetime.toISO())?.value)
                              : Number(
                                    Array.from(sensorData.sensorData!.get(samplingMode)!)[
                                        sensorData.sensorData!.get(samplingMode)!.size - 1
                                    ][1].value,
                                )) ?? -1,
                  };
              })
        : undefined;
};

const TASAViewerAppComp: React.FunctionComponent<{
    buildingModelGltfUri: string;
    labelFontFntUri: string;
    iconFontFntUri: string;
    sensorFontFntUri: string;
    onChangeCamera: (camera: Camera) => void;
    onHover: (hoverEvent: HoverEvent) => void;
    onLoadingFinished: () => void;
    loadingIsFinished: boolean;
    visualizeOnAssetLevel: boolean;
    useLowBitDistanceMap: boolean;
    samplingMode: SamplingMode;
    volumeVisibleDistances: [number, number];
    volumeBboxCubeMin: [number, number, number];
    volumeBboxCubeMax: [number, number, number];
    distanceMapHeightSlices: number;
    apartmentBboxMin: [number, number, number];
    apartmentBboxMax: [number, number, number];
    assetContentRoot: string;
    basePlaneYOffset: number;
    buildingModelContainsLightmap: boolean;

    sensorPositions?: {
        sensorPositions: Map<number, [number, number, number]>;
    };
    buildingModelHierarchyGltfUri?: string;
    cameraEye?: vec3;
    cameraCenter?: vec3;
    cameraUp?: vec3;
    showLabelsForSensorIds?: number[];
    visualizeValuesForSensorIds?: number[];
    outsideTemperatureSensorId?: number;
    showDebugInfo?: boolean;
    colorScaleConfiguration?: ColorScaleConfiguration;
    sunPosition?: [number, number, number];
    sunIsUp?: boolean;
    enableShadowMapping?: boolean;
    enableSurfaceSensorDataVisualization?: boolean;
    enableVolumeSensorDataVisualization?: boolean;
    enableVolumeTransparencyTransferFunction?: boolean;
    sampledCustomTransparencyTransferFunctionPoints?: [number, number][] | undefined;
    debugSensorDistancesConfiguration?: DebugSensorDistancesConfiguration;
    visualizeDataForDatetimeMillis?: number;
    interpolateBetweenNearestValues?: boolean;
    show1stDerivative?: boolean;
    sensorMinValue?: number;
    sensorMaxValue?: number;
    showGrid?: boolean;
    enableEdgeOutlineRendering?: boolean;
    enableSensorIcons?: boolean;
    enableAssetHighlightingOnHover?: boolean;
    enableMetadataAndColorScaleLabelling?: boolean;
    sensorValueLabelsConfig?: SensorValueLabelsConfig;
    inverseDistanceWeightExponent?: number;
    labellingData?: {
        assetName: string;
    };
    fontSizeInMeters?: number;
    enableSSAO?: boolean;
    ssaoMinDistance?: number;
    ssaoMaxDistance?: number;
    ssaoSpiralTurns?: number;
}> = ({
    buildingModelGltfUri,
    labelFontFntUri,
    iconFontFntUri,
    sensorFontFntUri,
    onChangeCamera,
    onHover,
    onLoadingFinished,
    loadingIsFinished,
    visualizeOnAssetLevel,
    useLowBitDistanceMap,
    samplingMode,
    volumeVisibleDistances,
    volumeBboxCubeMin,
    volumeBboxCubeMax,
    distanceMapHeightSlices,
    apartmentBboxMin,
    apartmentBboxMax,
    assetContentRoot,
    basePlaneYOffset,
    buildingModelContainsLightmap,

    sensorPositions,
    buildingModelHierarchyGltfUri,
    cameraEye,
    cameraCenter,
    cameraUp,
    showLabelsForSensorIds,
    visualizeValuesForSensorIds,
    outsideTemperatureSensorId,
    showDebugInfo,
    colorScaleConfiguration,
    sunPosition,
    sunIsUp,
    enableShadowMapping,
    enableSurfaceSensorDataVisualization,
    enableVolumeSensorDataVisualization,
    enableVolumeTransparencyTransferFunction,
    sampledCustomTransparencyTransferFunctionPoints,
    debugSensorDistancesConfiguration,
    visualizeDataForDatetimeMillis,
    interpolateBetweenNearestValues,
    show1stDerivative,
    sensorMinValue,
    sensorMaxValue,
    showGrid,
    enableEdgeOutlineRendering,
    enableSensorIcons,
    enableAssetHighlightingOnHover,
    enableMetadataAndColorScaleLabelling,
    sensorValueLabelsConfig,
    inverseDistanceWeightExponent,
    labellingData,
    fontSizeInMeters,
    enableSSAO,
    ssaoMinDistance,
    ssaoMaxDistance,
    ssaoSpiralTurns,
}) => {
    const [state] = useTASAData();

    const assetValues = React.useMemo(() => {
        if (!loadingIsFinished) {
            return;
        }

        const assetIdToSensorDataMap = new Map<number, TASASensorValues>();

        state.data?.sensorValues?.forEach((sensorValues, sensorId) => {
            const assetId = sensorValues.attributes?.asset_id;
            if (assetId) {
                let existingMap = assetIdToSensorDataMap.get(assetId);
                if (!existingMap) {
                    assetIdToSensorDataMap.set(assetId, new Map());
                    existingMap = assetIdToSensorDataMap.get(assetId);
                }
                existingMap!.set(sensorId, sensorValues);
            }
        });

        return [...assetIdToSensorDataMap].map(([assetId, sensorData]) => {
            return {
                assetId,
                sensorValues: getSensorValues(
                    samplingMode,
                    sensorData,
                    visualizeValuesForSensorIds,
                    visualizeDataForDatetimeMillis,
                    interpolateBetweenNearestValues,
                    show1stDerivative,
                    sensorPositions,
                ),
            };
        }) as AssetValue[];
    }, [
        loadingIsFinished,
        visualizeValuesForSensorIds,
        visualizeDataForDatetimeMillis,
        samplingMode,
        interpolateBetweenNearestValues,
        show1stDerivative,
        sensorPositions,
    ]);

    const sensorValueLabels = React.useMemo(() => {
        if (!loadingIsFinished) {
            return;
        }
        return getSensorValuesLabels(
            samplingMode,
            state.data?.sensorValues ? state.data.sensorValues : undefined,
            sensorPositions,
            showLabelsForSensorIds,
            visualizeDataForDatetimeMillis,
            interpolateBetweenNearestValues,
            show1stDerivative,
        );
    }, [
        loadingIsFinished,
        showLabelsForSensorIds,
        visualizeDataForDatetimeMillis,
        samplingMode,
        interpolateBetweenNearestValues,
        show1stDerivative,
        sensorPositions,
    ]);

    const sensorValues = React.useMemo(() => {
        if (!loadingIsFinished) {
            return;
        }
        return getSensorValues(
            samplingMode,
            state.data?.sensorValues ? state.data.sensorValues : undefined,
            visualizeValuesForSensorIds,
            visualizeDataForDatetimeMillis,
            interpolateBetweenNearestValues,
            show1stDerivative,
            sensorPositions,
        );
    }, [
        loadingIsFinished,
        visualizeValuesForSensorIds,
        visualizeDataForDatetimeMillis,
        samplingMode,
        interpolateBetweenNearestValues,
        show1stDerivative,
        sensorPositions,
    ]);

    const outsideValue = React.useMemo(() => {
        if (!loadingIsFinished) {
            return;
        }
        if (!outsideTemperatureSensorId) {
            return;
        }
        const sensorValues = getSensorValues(
            samplingMode,
            state.data?.sensorValues ? state.data.sensorValues : undefined,
            [outsideTemperatureSensorId],
            visualizeDataForDatetimeMillis,
            interpolateBetweenNearestValues,
            show1stDerivative,
        );
        if (!sensorValues || sensorValues.length === 0) {
            return;
        }
        return sensorValues[0];
    }, [
        loadingIsFinished,
        outsideTemperatureSensorId,
        visualizeDataForDatetimeMillis,
        samplingMode,
        interpolateBetweenNearestValues,
        show1stDerivative,
    ]);

    const labellingMetadata = React.useMemo(() => {
        if (!loadingIsFinished) {
            return;
        }
        const visualizeDataForDatetime = visualizeDataForDatetimeMillis ? DateTime.fromMillis(visualizeDataForDatetimeMillis) : undefined;
        // TODO: Get rid of .replace('24:', '00:') workaround when the following issue is closed:
        // TODO: @see https://github.com/moment/luxon/issues/726
        return {
            assetName: labellingData?.assetName ?? 'Eurovis, Zurich 21',
            date:
                visualizeDataForDatetime
                    ?.toLocaleString({ ...DateTime.DATE_HUGE, locale: DATE_AND_TIME_DISPLAY_LOCALE })
                    .replace('24:', '00:') ??
                DateTime.local()
                    .toLocaleString({ ...DateTime.DATE_HUGE, locale: DATE_AND_TIME_DISPLAY_LOCALE })
                    .replace('24:', '00:'),
            time:
                visualizeDataForDatetime
                    ?.toLocaleString({
                        ...DateTime.TIME_24_SIMPLE,
                        locale: DATE_AND_TIME_DISPLAY_LOCALE,
                    })
                    .replace('24:', '00:') ??
                DateTime.local()
                    .toLocaleString({ ...DateTime.TIME_24_SIMPLE, locale: DATE_AND_TIME_DISPLAY_LOCALE })
                    .replace('24:', '00:'),
        };
    }, [loadingIsFinished, visualizeDataForDatetimeMillis, labellingData]);

    const getMedian = (values: number[]) => {
        const valuesCopy = [...values];

        if (valuesCopy.length === 0) {
            return 0;
        }

        valuesCopy.sort((a, b) => a - b);

        const half = Math.floor(valuesCopy.length / 2);

        if (valuesCopy.length % 2) {
            return valuesCopy[half];
        }

        return (valuesCopy[half - 1] + valuesCopy[half]) / 2.0;
    };

    let averageIndoorTemperature;
    if (sensorValues && sensorValues.length > 0) {
        averageIndoorTemperature = getMedian(sensorValues.map((sensorValue) => Number(sensorValue.value)));
    }

    return (
        <>
            <div className="embed-responsive" style={{ height: '100vh' }}>
                <RoomCanvasViewer
                    sensorValueLabels={sensorValueLabels}
                    sensorValues={sensorValues}
                    assetValues={assetValues}
                    buildingModelGltfUri={buildingModelGltfUri}
                    buildingModelHierarchyGltfUri={buildingModelHierarchyGltfUri}
                    labelFontFntUri={labelFontFntUri}
                    iconFontFntUri={iconFontFntUri}
                    sensorFontFntUri={sensorFontFntUri}
                    colorScaleConfiguration={colorScaleConfiguration}
                    sunPosition={sunPosition}
                    sunIsUp={sunIsUp}
                    enableShadowMapping={enableShadowMapping}
                    enableSurfaceSensorDataVisualization={enableSurfaceSensorDataVisualization}
                    enableVolumeSensorDataVisualization={enableVolumeSensorDataVisualization}
                    enableVolumeTransparencyTransferFunction={enableVolumeTransparencyTransferFunction}
                    sampledCustomTransparencyTransferFunctionPoints={sampledCustomTransparencyTransferFunctionPoints}
                    debugSensorDistancesConfiguration={debugSensorDistancesConfiguration}
                    cameraEye={cameraEye}
                    cameraCenter={cameraCenter}
                    cameraUp={cameraUp}
                    onChangeCamera={onChangeCamera}
                    onHover={onHover}
                    onLoadingFinished={onLoadingFinished}
                    visualizeOnAssetLevel={visualizeOnAssetLevel}
                    useLowBitDistanceMap={useLowBitDistanceMap}
                    outsideTemperature={outsideValue?.value}
                    averageIndoorTemperature={averageIndoorTemperature}
                    inverseDistanceWeightExponent={inverseDistanceWeightExponent}
                    sensorMinValue={sensorMinValue}
                    sensorMaxValue={sensorMaxValue}
                    labellingMetadata={labellingMetadata}
                    showGrid={showGrid}
                    enableEdgeOutlineRendering={enableEdgeOutlineRendering}
                    enableSensorIcons={enableSensorIcons}
                    enableAssetHighlightingOnHover={enableAssetHighlightingOnHover}
                    enableMetadataAndColorScaleLabelling={enableMetadataAndColorScaleLabelling}
                    sensorValueLabelsConfig={sensorValueLabelsConfig}
                    volumeVisibleDistances={volumeVisibleDistances}
                    volumeBboxCubeMin={volumeBboxCubeMin}
                    volumeBboxCubeMax={volumeBboxCubeMax}
                    distanceMapHeightSlices={distanceMapHeightSlices}
                    apartmentBboxMin={apartmentBboxMin}
                    apartmentBboxMax={apartmentBboxMax}
                    assetContentRoot={assetContentRoot}
                    basePlaneYOffset={basePlaneYOffset}
                    buildingModelContainsLightmap={buildingModelContainsLightmap}
                    fontSizeInMeters={fontSizeInMeters}
                    enableSSAO={enableSSAO}
                    ssaoMinDistance={ssaoMinDistance}
                    ssaoMaxDistance={ssaoMaxDistance}
                    ssaoSpiralTurns={ssaoSpiralTurns}
                />
            </div>
            {showDebugInfo && (
                <section className="container mt-5">
                    <div className="row">
                        <div className="col">
                            <h2>Debug information and controls</h2>
                            <TASADataDisplay />
                        </div>
                        <div className="col"></div>
                    </div>
                </section>
            )}
        </>
    );
};

export const TASAViewerApp = React.memo(TASAViewerAppComp, (prevProps, nextProps) => {
    if (JSON.stringify(prevProps) === JSON.stringify(nextProps)) {
        return true;
    }
    return false;
});
