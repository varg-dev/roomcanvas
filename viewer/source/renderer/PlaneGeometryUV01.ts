import { PlaneGeometry } from 'webgl-operate';

/**
 * This class subclasses webgl-operate’s PlaneGeometry to have the UV coordinates span from 0 to +1 instead of from -1 to +1.
 */
export class PlaneGeometryUV01 extends PlaneGeometry {
    protected static readonly VERTICES = new Float32Array([0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0, 1.0]);

    protected static readonly UV = new Float32Array([0.0, 0.0, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0]);

    /**
     * Creates the vertex buffer object (VBO) and creates and initializes the buffer's data store.
     *
     * @param aVertex - Attribute binding point for vertices.
     */
    initialize(aVertex: GLuint = 0, aTexCoord = 1): boolean {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const gl = this.context.gl;

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const valid = super.initialize(aVertex, aTexCoord);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        this._buffers[0].data(PlaneGeometryUV01.VERTICES, gl.STATIC_DRAW);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        this._buffers[1].data(PlaneGeometryUV01.UV, gl.STATIC_DRAW);

        return valid;
    }
}
