import { viewer } from 'webgl-operate';
import { Canvas, Color, Initializable, Renderer, Wizard } from 'webgl-operate';

import { RoomCanvasRenderer, RoomCanvasRendererOptions } from './renderer';

declare global {
    interface Window {
        RoomCanvas: any;
    }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
window.RoomCanvas = window.RoomCanvas || {};

export class RoomCanvasApplication extends Initializable {
    private _canvas: Canvas;
    private _renderer: RoomCanvasRenderer;

    initialize(element: HTMLCanvasElement | string, options: RoomCanvasRendererOptions): boolean {
        this._canvas = new Canvas(element, { antialias: false, powerPreference: 'high-performance' });

        this._canvas.controller.multiFrameNumber = 64;

        this._canvas.framePrecision = Wizard.Precision.byte;
        this._canvas.frameScale = [1.0, 1.0];
        this._canvas.clearColor = new Color([0.960784314, 0.976470588, 1.0, 1.0]);

        this._renderer = new RoomCanvasRenderer(options);

        this._canvas.renderer = this._renderer;

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        window.RoomCanvas.renderer = this._renderer;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        window.RoomCanvas.canvas = this._canvas;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        window.RoomCanvas.application = this;

        return true;
    }

    uninitialize(): void {
        this._canvas.dispose();
        (this._renderer as Renderer).uninitialize();
    }

    enableFullscreenOnCtrlClick(): void {
        const e = this.canvas.element;
        e.addEventListener('click', (event) => {
            if (event.ctrlKey) {
                viewer.Fullscreen.toggle(e);
            }
        });
    }

    get canvas(): Canvas {
        return this._canvas;
    }

    get renderer(): RoomCanvasRenderer {
        return this._renderer;
    }
}
