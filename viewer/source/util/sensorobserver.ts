/* eslint-disable @typescript-eslint/indent */
/* eslint-disable @typescript-eslint/member-ordering */
/**
 * Taken from https://gitlab.hpi3d.de/ma-sem-visat-ws-2018/sem_visat_2018_milan_proell_3d-asset-explorer
 * 2019 (C) Milan Proell (ISC License)
 */

import { Subscription } from 'rxjs';
import { filter, pluck } from 'rxjs/operators';

import isNil = require('lodash.isnil');

import { webSocket, WebSocketSubject } from 'rxjs/webSocket';

interface ISensor {
    id: number;
    label: string;
    mappingType: 'label';
}

interface ISensorCommand {
    type: 'subscribe' | 'unsubscribe';
    id: number;
}

interface Message {
    identifier: string;
    message: SensorMessage;
}

interface SensorMessage {
    action: 'sensor_data_update';
    attribute_key_id: number;
    sensor_id: number;
    message: SensorValueMessage;
}

type UnitType = string;

type ValueType = string | number;

interface SensorValueMessage {
    time: string;
    unit: UnitType;
    value: ValueType;
}

const uri = new URL('/cable', window.location.href);
uri.protocol = uri.protocol.replace('http', 'ws');

class SensorObserver {
    // TODO: Actually make the URI configurable (currently, it apparently is not)
    private static _uri = uri.href;

    public static get uri(): string {
        return SensorObserver._uri;
    }

    public static set uri(uri: string) {
        SensorObserver._uri = uri;
        SensorObserver.webSocketSubject = webSocket(uri);
    }

    private static webSocketSubject: WebSocketSubject<
        Message
    > = webSocket(SensorObserver.uri);

    public static subscribe(
        sensor: ISensor,
        label: string,
        subscriptionCallback: (message: SensorValueMessage) => void,
    ): void {
        if (!SensorObserver.sensors[sensor.id]) {
            SensorObserver.commandSensor({
                type: 'subscribe',
                id: sensor.id,
            });
            SensorObserver.sensors[sensor.id] = {
                sensorSubscription: SensorObserver.messageObserver
                    .pipe(
                        filter((msg) => sensor.id === msg.sensor_id),
                    )
                    .pipe<SensorValueMessage>(pluck('message'))
                    .subscribe((msg) => {
                        if (SensorObserver.sensors[sensor.id]) {
                            SensorObserver.sensors[
                                sensor.id
                            ]?.subscribers.forEach((subscriber) => {
                                subscriber.callback({
                                    time: msg.time,
                                    value: msg.value,
                                    unit: msg.unit,
                                });
                            });
                        }
                    }),
                subscribers: [
                    {
                        label,
                        callback: subscriptionCallback,
                    },
                ],
            };
        } else if (
            !SensorObserver.sensors[sensor.id]?.subscribers.some(
                (sub) => sub.label === label,
            )
        ) {
            SensorObserver.sensors[sensor.id]?.subscribers.push({
                label,
                callback: subscriptionCallback,
            });
        } else {
            const existingSubscriber = SensorObserver.sensors[
                sensor.id
            ]?.subscribers.find((sub) => sub.label === label);
            if (existingSubscriber)
                existingSubscriber.callback = subscriptionCallback;
        }
    }

    public static unsubscribe(sensor: ISensor, label: string): void {
        if (SensorObserver.sensors[sensor.id]) {
            const observedSensor = SensorObserver.sensors[sensor.id];
            if (observedSensor) {
                observedSensor.subscribers = observedSensor.subscribers.filter(
                    (sub) => sub.label === label,
                );
            }

            if (
                SensorObserver.sensors[sensor.id]?.subscribers
                    .length === 0
            ) {
                SensorObserver.commandSensor({
                    type: 'unsubscribe',
                    id: sensor.id,
                });
                SensorObserver.sensors[
                    sensor.id
                ]?.sensorSubscription.unsubscribe();
                SensorObserver.sensors[sensor.id] = undefined;
            }
        }
    }

    public static unsubscribeAll(): void {
        for (const sensorId in SensorObserver.sensors) {
            const sensorSub = SensorObserver.sensors[sensorId];
            if (sensorSub) {
                SensorObserver.commandSensor({
                    type: 'unsubscribe',
                    id: Number(sensorId),
                });
                sensorSub.sensorSubscription.unsubscribe();
                SensorObserver.sensors[sensorId] = undefined;
            }
        }
    }

    private static messageObserver = SensorObserver.webSocketSubject
        .pipe(
            filter(
                (message: Message) =>
                    (!isNil(message) &&
                        message.identifier &&
                        message.message) as boolean,
            ),
        )
        .pipe(pluck<any, SensorMessage>('message'));

    private static sensors: {
        [sensorId: number]:
            | {
                  sensorSubscription: Subscription;
                  subscribers: {
                      label: string;
                      callback: (message: SensorValueMessage) => void;
                  }[];
              }
            | undefined;
    } = {};

    private static commandSensor(command: ISensorCommand) {
        const identifier = JSON.stringify({
            channel: 'SensorDataChannel',
            sensor_id: command.id,
        });
        const message = { command: command.type, identifier };
        SensorObserver.webSocketSubject.next(message as any);
    }
}

export default SensorObserver;
