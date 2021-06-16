import { gl_matrix_extensions, mat4 } from 'webgl-operate';
import { Camera } from 'webgl-operate';

const { m4 } = gl_matrix_extensions;

/**
 * An orthographic, virtual 3D camera specified by eye, center, up, frustumHeight, zoom, near, far, and a viewport size. @see {@link Camera}
 */
export class OrthographicCamera extends Camera {
    private static readonly DEFAULT_FRUSTUM_HEIGHT = 20.0;

    /** @see {@link frustumHeight} */
    protected _frustumHeight = OrthographicCamera.DEFAULT_FRUSTUM_HEIGHT;

    /** @see {@link zoom} */
    protected _zoom = 1.0;

    get fovy(): GLfloat {
        throw new Error('An OrthographicCamera does not use `fov`/`fovx`/`fovy`; use `frustumHeight` and `aspect` instead!');
    }

    set fovy(_: GLfloat) {
        throw new Error('An OrthographicCamera does not use `fov`/`fovx`/`fovy`; use `frustumHeight` and `aspect` instead!');
    }

    set fovx(_: GLfloat) {
        throw new Error('An OrthographicCamera does not use `fov`/`fovx`/`fovy`; use `frustumHeight` and `aspect` instead!');
    }

    fovFromLens(): void {
        throw new Error('An OrthographicCamera does not use `fov`/`fovx`/`fovy`; use `frustumHeight` and `aspect` instead!');
    }

    /**
     * Frustum height in world units.
     */
    get frustumHeight(): GLfloat {
        return this._frustumHeight;
    }

    /**
     * Sets the frustum height in world units. The frustum width is based on the frustum height and the {@link aspect}.
     * Invalidates the projection.
     */
    set frustumHeight(frustumHeight: GLfloat) {
        if (this._frustumHeight === frustumHeight) {
            return;
        }
        this._frustumHeight = frustumHeight;
        this.invalidate(false, true);
    }

    /**
     * Zoom factor.
     */
    get zoom(): GLfloat {
        return this._zoom;
    }

    /**
     * Sets the zoom factor. Invalidates the projection.
     */
    set zoom(zoom: GLfloat) {
        if (this._zoom === zoom) {
            return;
        }
        this._zoom = zoom;
        this.invalidate(false, true);
    }

    /**
     * Sets the aspect ratio (width over height); @see {@link Camera}. Invalidates the projection.
     */
    set aspect(aspect: GLfloat) {
        if (this._aspect === aspect) {
            return;
        }
        this._aspect = aspect;
        // Explicitly invalidate the projection matrix on aspect changes!
        this.invalidate(false, true);
    }

    /**
     * Computes the ratio of width over height (set explicitly for differentiation between viewport size and scale).
     */
    get aspect(): GLfloat {
        return this._aspect;
    }

    /**
     * Either returns the cached projection matrix or derives the current one after invalidation and caches it.
     */
    get projection(): mat4 {
        if (this._projection) {
            // return cached value
            return this._projection;
        }

        // Based on three.js’s implementation:
        // @see https://github.com/mrdoob/three.js/blob/94f043c4e105eb73236529231388402da2b07cba/src/cameras/OrthographicCamera.js#L87-L95
        let left = -0.5 * this.frustumHeight * this.aspect;
        let right = 0.5 * this.frustumHeight * this.aspect;
        let top = 0.5 * this.frustumHeight;
        let bottom = -0.5 * this.frustumHeight;

        const dx = (right - left) / (2 * this.zoom);
        const dy = (top - bottom) / (2 * this.zoom);
        const cx = (right + left) / 2;
        const cy = (top + bottom) / 2;

        left = cx - dx;
        right = cx + dx;
        top = cy + dy;
        bottom = cy - dy;

        this._projection = mat4.ortho(m4(), left, right, bottom, top, this.near, this.far);
        return this._projection;
    }
}
