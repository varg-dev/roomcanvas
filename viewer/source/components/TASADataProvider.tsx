import * as React from 'react';

import produce from 'immer';
import { enableMapSet } from 'immer';

import { SamplingMode } from './TASAHistoricalDataDispatcher';

export type TASASensorSingleData = {
    timestamp: string;
    unit: string;
    value: string | number;
};

export type TASASensorAttributes = {
    name?: string | null;
    description?: string | null;
    serial?: string | null;
    sensor_type_id?: number | null;
    asset_id?: number | null;
    precision?: number | null;
    display_unit?: string | null;
    attribute_key_unit?: string | null;
    attribute_key_id?: number | null;
    key?: string | null;
    sampling_rate_value?: number | null;
    sampling_rate_unit?: string | null;
    last_value?: {
        value: number;
        timestamp: string;
    } | null;
    total_value_range?: { min: number; max: number } | null;
};

export type TASATimeSeriesValues = {
    values: Array<{
        values: Array<{
            x: string;
            y: number;
        }>;
        mintime: string;
        maxtime: string;
        series_name: string;
        unit: string;
        key_id: number;
    }>;
    mintime: string;
    maxtime: string;
    series_names: string[];
    units: string[];
    key_ids: number[];
};

export type TASASensorValues = Map<
    number, // Sensor ID
    {
        attributes?: TASASensorAttributes;
        sensorData?: Map<
            SamplingMode,
            Map<
                string, // timestamp
                TASASensorSingleData
            >
        >;
    }
>;

export type TASAData = {
    sensorValues?: TASASensorValues;
};

export type State = {
    data?: TASAData;
    isLoading: boolean;
    error?: string;
};

export type Dispatch = (action: Action) => void;

const TasaDataStateContext = React.createContext<State | undefined>(undefined);

const TasaDataDispatchContext = React.createContext<Dispatch | undefined>(undefined);

type Action =
    | { type: 'request' }
    | {
          type: 'sensor_data_update';
          sensorId: number;
          sensorData: TASASensorSingleData;
          queriedTimestamp?: string;
          samplingMode: SamplingMode;
      }
    | {
          type: 'sensor_attributes_update';
          sensorId: number;
          sensorAttributes: TASASensorAttributes;
      };

const tasaDataReducer = (state: State, action: Action): State => {
    enableMapSet();

    switch (action.type) {
        case 'request':
            return { isLoading: true };
        case 'sensor_data_update':
            return {
                isLoading: false,
                data: produce(state.data || {}, (tasaDataDraft) => {
                    if (!tasaDataDraft.sensorValues) {
                        tasaDataDraft.sensorValues = new Map();
                    }
                    if (!tasaDataDraft.sensorValues.has(action.sensorId)) {
                        tasaDataDraft.sensorValues.set(action.sensorId, {});
                    }
                    if (tasaDataDraft.sensorValues.get(action.sensorId)?.sensorData === undefined) {
                        tasaDataDraft.sensorValues.get(action.sensorId)!.sensorData = new Map();
                    }
                    if (!tasaDataDraft.sensorValues.get(action.sensorId)?.sensorData?.has(action.samplingMode)) {
                        tasaDataDraft.sensorValues.get(action.sensorId)?.sensorData?.set(action.samplingMode, new Map());
                    }
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    tasaDataDraft.sensorValues
                        .get(action.sensorId)!
                        .sensorData?.get(action.samplingMode)!
                        .set(action.queriedTimestamp ?? action.sensorData.timestamp, action.sensorData);
                }),
            };
        case 'sensor_attributes_update':
            return {
                isLoading: false,
                data: produce(state.data || {}, (tasaDataDraft) => {
                    if (!tasaDataDraft.sensorValues) {
                        tasaDataDraft.sensorValues = new Map();
                    }
                    if (!tasaDataDraft.sensorValues.has(action.sensorId)) {
                        tasaDataDraft.sensorValues.set(action.sensorId, {});
                    }
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    tasaDataDraft.sensorValues.get(action.sensorId)!.attributes = action.sensorAttributes;
                }),
            };
        default:
            throw new Error('Unhandled action type!');
    }
};

const TASADataProvider: React.FunctionComponent = ({ children }) => {
    const [state, dispatch] = React.useReducer(tasaDataReducer, {
        isLoading: true,
    });

    return (
        <TasaDataStateContext.Provider value={state}>
            <TasaDataDispatchContext.Provider value={dispatch}>{children}</TasaDataDispatchContext.Provider>
        </TasaDataStateContext.Provider>
    );
};

const TestTASADataProvider: React.FunctionComponent<{
    value: State;
}> = ({ value, children }) => {
    const [state, dispatch] = React.useReducer(tasaDataReducer, value);

    return (
        <TasaDataStateContext.Provider value={state}>
            <TasaDataDispatchContext.Provider value={dispatch}>{children}</TasaDataDispatchContext.Provider>
        </TasaDataStateContext.Provider>
    );
};

const useTASADataState = (): State => {
    const context = React.useContext(TasaDataStateContext);
    if (context === undefined) {
        throw new Error('useTASADataState must be used within a TASADataProvider tag');
    }
    return context;
};

const useTASADataDispatch = (): Dispatch => {
    const context = React.useContext(TasaDataDispatchContext);
    if (context === undefined) {
        throw new Error('useTASADataDispatch must be used within a TASADataProvider tag');
    }
    return context;
};

const useTASAData = (): [State, Dispatch] => {
    return [useTASADataState(), useTASADataDispatch()];
};

export { TASADataProvider, TestTASADataProvider, useTASADataState, useTASADataDispatch, useTASAData };
