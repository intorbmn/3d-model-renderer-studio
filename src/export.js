// Exporting the current model to other 3D formats.

import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { PLYExporter } from 'three/addons/exporters/PLYExporter.js';

/** Formats offered in the export menu: id → [label, extension, mime, keeps skeleton]. */
export const FORMATS = {
  original: ['Original file', '', 'application/octet-stream', true],
  glb: ['GLB (glTF binary)', 'glb', 'model/gltf-binary', true],
  gltf: ['glTF (JSON)', 'gltf', 'model/gltf+json', true],
  obj: ['OBJ', 'obj', 'text/plain', false],
  stl: ['STL', 'stl', 'model/stl', false],
  ply: ['PLY', 'ply', 'application/octet-stream', false],
};

/**
 * A static copy of the model in its current pose: skinned meshes are baked (skinning and morphs
 * applied) so formats without skeletons get the shape that is on screen.
 */
export function bakePose(root) {
  const group = new THREE.Group();
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!object.isMesh || !object.visible) return;
    const source = object.geometry;
    const geometry = new THREE.BufferGeometry();
    const position = source.attributes.position;
    const baked = new Float32Array(position.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i);
      if (object.isSkinnedMesh) object.applyBoneTransform(i, v);
      v.applyMatrix4(object.matrixWorld);
      baked.set([v.x, v.y, v.z], i * 3);
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(baked, 3));
    if (source.attributes.uv) geometry.setAttribute('uv', source.attributes.uv.clone());
    if (source.index) geometry.setIndex(source.index.clone());
    for (const g of source.groups) geometry.addGroup(g.start, g.count, g.materialIndex);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, object.material);
    mesh.name = object.name;
    group.add(mesh);
  });
  return group;
}

/** Bytes of the model in `format`. `original` returns null (the caller has the files). */
export async function exportModel(model, format) {
  const root = model.root;
  const savedScale = root.scale.clone();
  root.scale.setScalar(1); // export at the file's own size
  root.updateMatrixWorld(true);
  try {
    switch (format) {
      case 'glb':
      case 'gltf': {
        const exporter = new GLTFExporter();
        const target = model.gltf?.scene ?? root;
        const result = await exporter.parseAsync(target, { binary: format === 'glb', onlyVisible: true });
        return format === 'glb' ? new Uint8Array(result) : new TextEncoder().encode(JSON.stringify(result));
      }
      case 'obj':
        return new TextEncoder().encode(new OBJExporter().parse(bakePose(root)));
      case 'stl':
        return new Uint8Array(new STLExporter().parse(bakePose(root), { binary: true }).buffer);
      case 'ply': {
        const data = await new Promise((resolve) => new PLYExporter().parse(bakePose(root), resolve, { binary: true }));
        return new Uint8Array(data);
      }
      default:
        return null;
    }
  } finally {
    root.scale.copy(savedScale);
    root.updateMatrixWorld(true);
  }
}
