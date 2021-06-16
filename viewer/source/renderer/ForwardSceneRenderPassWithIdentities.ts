/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { mat4, vec4 } from 'gl-matrix';
import { auxiliaries, gl_matrix_extensions } from 'webgl-operate';
import {
    Context,
    ForwardSceneRenderPass,
    Geometry,
    GeometryComponent,
    Initializable,
    Material,
    SceneNode,
    TransformComponent,
} from 'webgl-operate';

const assert = auxiliaries.assert;

interface RenderBatch {
    node: SceneNode;
    geometry: [Geometry, mat4];
}

/**
 * This class modifies webgl-operate’s ForwardSceneRenderPass to not only use per-material batched draw calls,
 * but to also batch the draw calls by nodes in the scene, effectively rendering each node separately.
 * This allows assigning, for instance, each scene node a different unique ID for usage in a G-Buffer.
 */
export class ForwardSceneRenderPassWithIdentities extends ForwardSceneRenderPass {
    public uIDEndcoded: WebGLUniformLocation;
    public uID: WebGLUniformLocation;
    protected _nodeToIdMap: Map<SceneNode, number>;

    protected _opaqueGeometryBatches: Map<Material, RenderBatch[]>;
    protected _transparentGeometryBatches: Map<Material, RenderBatch[]>;

    constructor(context: Context) {
        super(context);

        // TODO: Somehow delete/prohibit access to this.__opaqueGeometryMap and this.__transparentGeometryMap

        this._nodeToIdMap = new Map();

        this._opaqueGeometryBatches = new Map();
        this._transparentGeometryBatches = new Map();
    }

    /**
     * Triggers rendering a frame of the given hierarchy. All nodes in the hierarchy will be visited recursively
     * and rendered. If nodes contain transformations, they are applied and used for the whole subtree.
     */
    @Initializable.assert_initialized()
    frame(): void {
        assert(this._target && this._target.valid, 'valid target expected');
        assert(this._program && this._program.valid, 'valid program expected');

        assert(this.updateModelTransform !== undefined, 'Model transform function needs to be initialized.');
        assert(this.updateViewProjectionTransform !== undefined, 'View Projection transform function needs to be initialized.');
        assert(this.bindMaterial !== undefined, 'Material binding function needs to be initialized.');

        if (this._scene === undefined) {
            return;
        }

        const gl = this._context.gl;

        // gl.disable(gl.CULL_FACE);
        // gl.cullFace(gl.BACK);
        gl.enable(gl.DEPTH_TEST);

        const size = this._target.size;
        gl.viewport(0, 0, size[0], size[1]);

        const c = this._clearColor;
        gl.clearColor(c[0], c[1], c[2], c[3]);

        // EXPLICITLY REMOVED CLEARING!
        // this._target.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, true, false);

        this._program.bind();

        if (this.bindUniforms !== undefined) {
            this.bindUniforms();
        }

        this.updateViewProjectionTransform(this._camera.viewProjection);

        this.drawCalls();

        this._program.unbind();

        // gl.cullFace(gl.BACK);
        // gl.disable(gl.CULL_FACE);
        gl.disable(gl.BLEND);
    }

    @Initializable.assert_initialized()
    drawCalls(renderTransparentMaterials: boolean = true, bindIDUniform: boolean = true): void {
        if (this._scene === undefined) {
            return;
        }

        /**
         * Render geometries by material.
         * First render opaque materials, then transparent ones.
         */
        this.renderGeometryBatch(this._opaqueGeometryBatches, bindIDUniform);

        if (renderTransparentMaterials) {
            this.renderGeometryBatch(this._transparentGeometryBatches, bindIDUniform);
        }
    }

    protected renderGeometryBatch(batch: Map<Material, RenderBatch[]>, bindIDUniform: boolean = true): void {
        for (const material of Array.from(batch.keys())) {
            this.bindMaterial(material);

            let encodedIdFloat;
            let id;

            if (bindIDUniform && material.name.includes('asset_')) {
                const encodedId = vec4.create();
                // Maximum to-be-encoded ID: 4294967295 (equals [255, 255, 255, 255])
                // See https://stackoverflow.com/a/19496337
                id = parseInt(material.name.replace(/[^0-9]/g, ''), 10);
                gl_matrix_extensions.encode_uint32_to_rgba8(encodedId, id);
                encodedIdFloat = new Float32Array(encodedId);
                encodedIdFloat[0] /= 255.0;
                encodedIdFloat[1] /= 255.0;
                encodedIdFloat[2] /= 255.0;
                encodedIdFloat[3] /= 255.0;
            }

            const batches = batch.get(material)!;

            for (const {
                node,
                geometry: [geometry, transform],
            } of batches) {
                // For a more generic ID mapping/lookup, you can use the this._nodeToIdMap as follows:
                // const id = this._nodeToIdMap.get(node);

                geometry.bind();
                if (this.bindGeometry !== undefined) {
                    this.bindGeometry(geometry);
                }
                this.updateModelTransform(transform);

                // TODO: Factor this out into a more generic this.bindNodeUniforms() callback to be use case agnostic
                if (bindIDUniform && node.name.includes('asset_')) {
                    const encodedId = vec4.create();
                    // Maximum to-be-encoded ID: 4294967295 (equals [255, 255, 255, 255])
                    id = parseInt(node.name.replace('asset_', ''), 10);
                    gl_matrix_extensions.encode_uint32_to_rgba8(encodedId, id);
                    encodedIdFloat = new Float32Array(encodedId);
                    encodedIdFloat[0] /= 255.0;
                    encodedIdFloat[1] /= 255.0;
                    encodedIdFloat[2] /= 255.0;
                    encodedIdFloat[3] /= 255.0;
                }

                if (encodedIdFloat) {
                    const gl = this._context.gl;

                    gl.uniform4fv(this.uIDEndcoded, encodedIdFloat);
                    gl.uniform1i(this.uID, id);
                } else if (bindIDUniform) {
                    const gl = this._context.gl;

                    const encodedId = vec4.create();
                    vec4.zero(encodedId);
                    gl.uniform4fv(this.uIDEndcoded, new Float32Array(encodedId));
                    gl.uniform1i(this.uID, 0);
                }

                geometry.draw();
                geometry.unbind();
            }
        }
    }

    protected preprocessScene(): void {
        assert(this._scene !== undefined, 'Scene was undefined during preprocessing.');

        if (this._scene === undefined) {
            return;
        }

        this._nodeToIdMap.clear();

        this._opaqueGeometryBatches.clear();
        this._transparentGeometryBatches.clear();

        super.preprocessNode(this._scene!, mat4.create());
    }

    protected preprocessNode(node: SceneNode, transform: mat4): void {
        let id = this._nodeToIdMap.get(node);
        if (id === undefined) {
            // Assign a new, incremented ID to the node
            id = this._nodeToIdMap.size;
            this._nodeToIdMap.set(node, id);
        }

        const nodeTransform = mat4.clone(transform);

        const transformComponents = node.componentsOfType('TransformComponent');
        assert(transformComponents.length <= 1, 'SceneNode can not have more than one transform component');

        if (transformComponents.length === 1) {
            const transformComponent = transformComponents[0] as TransformComponent;
            mat4.mul(nodeTransform, nodeTransform, transformComponent.transform);
        }

        const geometryComponents = node.componentsOfType('GeometryComponent');

        for (const geometryComponent of geometryComponents) {
            const currentComponent = geometryComponent as GeometryComponent;
            const material = currentComponent.material;
            const geometry = currentComponent.geometry;

            if (material.isTransparent) {
                let batches = this._transparentGeometryBatches.get(material);
                if (batches === undefined) {
                    batches = [];
                }

                batches.push({
                    node,
                    geometry: [geometry, nodeTransform],
                });
                this._transparentGeometryBatches.set(material, batches);
            } else {
                let batches = this._opaqueGeometryBatches.get(material);
                if (batches === undefined) {
                    batches = [];
                }

                batches.push({
                    node,
                    geometry: [geometry, nodeTransform],
                });
                this._opaqueGeometryBatches.set(material, batches);
            }
        }

        if (node.nodes === undefined) {
            return;
        }

        for (const child of node.nodes) {
            super.preprocessNode(child, nodeTransform);
        }
    }
}
