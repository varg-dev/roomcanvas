import * as React from 'react';

import Axios from 'axios';

import { TASASensorAttributes, useTASAData } from './TASADataProvider';
import { SamplingMode } from './TASAHistoricalDataDispatcher';

export const TASAStaticDataDispatcher: React.FunctionComponent<{
    sensorIds: number[];
    tasaGetApiUri?: string;
    samplingMode?: SamplingMode;
}> = ({ children, sensorIds, tasaGetApiUri = 'https://roomcanvas.dev/data/tasa_api/sensors/', samplingMode = 'none' }) => {
    const [, dispatch] = useTASAData();

    React.useEffect(() => {
        for (const sensorId of sensorIds) {
            let uri = `${tasaGetApiUri}${sensorId}`;
            if (samplingMode !== 'none') {
                uri = `${uri}&sampling_rate=${samplingMode.rate}&sampling_rate_unit=${samplingMode.unit}`;
            }
            void Axios.get(uri).then((result) => {
                const typedResult = result as {
                    data: {
                        data: {
                            attributes: TASASensorAttributes;
                        };
                    };
                };
                dispatch({
                    type: 'sensor_attributes_update',
                    sensorId,
                    sensorAttributes: typedResult.data.data.attributes || {},
                });
                if (
                    typedResult.data.data.attributes?.last_value?.timestamp !== undefined &&
                    typedResult.data.data.attributes?.last_value?.value !== undefined &&
                    typedResult.data.data.attributes?.display_unit !== undefined
                ) {
                    dispatch({
                        type: 'sensor_data_update',
                        sensorId,
                        sensorData: {
                            timestamp: typedResult.data.data.attributes.last_value.timestamp,
                            unit: typedResult.data.data.attributes.display_unit || '',
                            value: typedResult.data.data.attributes.last_value.value,
                        },
                        samplingMode,
                    });
                }
            });
        }
    }, []);

    return <>{children}</>;
};
