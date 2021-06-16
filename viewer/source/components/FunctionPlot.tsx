/**
 * Based on https://mauriciopoppe.github.io/function-plot/ (section "React Component")
 */
import * as React from 'react';
import { useEffect, useRef } from 'react';

import functionPlot, { Chart } from 'function-plot';
import { FunctionPlotOptions } from 'function-plot/dist/types';

export interface FunctionPlotProps {
    options?: FunctionPlotOptions;
    tickFormat?: (d: number) => string;
}

export const FunctionPlot: React.FC<FunctionPlotProps> = React.memo(
    ({ options, tickFormat }) => {
        // eslint-disable-next-line no-null/no-null
        const rootEl = useRef(null);
        const functionPlotInstance = useRef((undefined as unknown) as Chart);

        useEffect(() => {
            try {
                functionPlotInstance.current = functionPlot(Object.assign({}, options, { target: rootEl.current }));

                // Custom tick format: https://mauriciopoppe.github.io/function-plot/
                // ("Changing the format of the values shown on the axes")
                if (tickFormat) {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call
                    functionPlotInstance.current.meta.xAxis.tickFormat(tickFormat);
                    functionPlotInstance.current.draw();
                }
            } catch (e) {}
        });

        return <div ref={rootEl} />;
    },
    () => false,
);
