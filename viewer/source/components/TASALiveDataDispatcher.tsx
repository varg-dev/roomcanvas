import * as React from 'react';

import { useTASAData } from './TASADataProvider';
import SensorObserver from '../util/sensorobserver';

export const TASALiveDataDispatcher: React.FunctionComponent<{
    sensorIds: number[];
}> = ({ children, sensorIds }) => {
    // TODO: Add an additional prop for configuring the TASA WebSocket URI
    const [, dispatch] = useTASAData();

    React.useEffect(() => {
        SensorObserver.unsubscribeAll();
        for (const sensorId of sensorIds) {
            SensorObserver.subscribe(
                {
                    id: sensorId,
                    label: `sensor_${sensorId}`,
                    mappingType: 'label',
                },
                `sensor_${sensorId}`,
                ({ value, time, unit }) => {
                    dispatch({
                        type: 'sensor_data_update',
                        sensorId,
                        sensorData: {
                            timestamp: time,
                            value: Number(value),
                            unit,
                        },
                        samplingMode: 'none',
                    });
                },
            );
        }
    }, [dispatch, sensorIds]);

    return <>{children}</>;
};
