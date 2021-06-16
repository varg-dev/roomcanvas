import * as React from 'react';

import Axios from 'axios';

import { DateTime, Duration, DurationObject } from 'luxon';

import { TASATimeSeriesValues, useTASAData } from './TASADataProvider';

export type SamplingMode =
    | {
          rate: number;
          unit: 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years';
      }
    | 'none';

export const TASAHistoricalDataDispatcher: React.FunctionComponent<{
    assetId: number;
    sensorIds: number[];
    from: DateTime;
    tasaGetApiUri?: string;
    samplingMode?: SamplingMode;
    duration?: Duration | DurationObject;
    isLocked?: boolean;
}> = ({
    children,
    assetId,
    sensorIds,
    from,
    tasaGetApiUri = 'https://roomcanvas.dev/data/de/assets/ASSET_ID/sensors/SENSOR_ID/time_serie.json',
    samplingMode = 'none',
    duration = { hours: 24 },
    isLocked = false,
}) => {
    const [state, dispatch] = useTASAData();

    React.useEffect(() => {
        if (isLocked) {
            return;
        }
        const to = from;
        from = from.minus(duration);
        const assetIdContainingUri = tasaGetApiUri.replace('ASSET_ID', `${assetId}`);
        for (const sensorId of sensorIds) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const dataAlreadyExits =
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call
                state.data?.sensorValues?.has(sensorId) &&
                state.data.sensorValues.get(sensorId)?.sensorData?.get(samplingMode)?.has(from.toISO());
            if (!dataAlreadyExits) {
                let uri = assetIdContainingUri.replace('SENSOR_ID', `${sensorId}`);
                uri = `${uri}?min_time=${from.toISO()}&max_time=${to.toISO()}`;
                if (samplingMode !== 'none') {
                    uri = `${uri}&sampling_rate=${samplingMode.rate}&sampling_rate_unit=${samplingMode.unit}`;
                }
                void Axios.get(uri).then((result) => {
                    const typedResult = result as {
                        data: TASATimeSeriesValues;
                    };
                    for (const singleResult of typedResult.data.values[0].values) {
                        dispatch({
                            type: 'sensor_data_update',
                            sensorId,
                            sensorData: {
                                timestamp: singleResult.x,
                                unit: typedResult.data.values[0].unit,
                                value: singleResult.y,
                            },
                            samplingMode,
                        });
                    }
                    if (typedResult.data.values[0].values.length > 0) {
                        const firstResult = typedResult.data.values[0].values[0];
                        dispatch({
                            type: 'sensor_data_update',
                            sensorId,
                            queriedTimestamp: from.toISO(),
                            sensorData: {
                                timestamp: firstResult.x,
                                unit: typedResult.data.values[0].unit,
                                value: firstResult.y,
                            },
                            samplingMode,
                        });
                    }
                });
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tasaGetApiUri, dispatch, from, assetId, sensorIds, samplingMode, isLocked]);

    return <>{children}</>;
};
