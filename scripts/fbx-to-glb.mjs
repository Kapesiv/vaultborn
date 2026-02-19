/**
 * Convert an FBX animation file to a minimal GLB containing only animation data.
 * Strips mesh/skin data to reduce file size.
 *
 * Usage: node scripts/fbx-to-glb.mjs <input.fbx> <output.glb>
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// Polyfill browser globals that three.js FBXLoader expects
globalThis.window = globalThis;
globalThis.document = {
  createElementNS: () => ({ setAttribute: () => {}, style: {} }),
  createElement: (tag) => {
    if (tag === 'canvas') return { getContext: () => null, width: 0, height: 0 };
    return { setAttribute: () => {}, style: {} };
  },
};
globalThis.self = globalThis;
try { globalThis.navigator = { userAgent: '' }; } catch { /* Node 25+ */ }
globalThis.HTMLCanvasElement = globalThis.HTMLCanvasElement || class {};

const THREE = await import('three');
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node scripts/fbx-to-glb.mjs <input.fbx> <output.glb>');
  process.exit(1);
}

const inputPath = resolve(args[0]);
const outputPath = resolve(args[1]);

console.log(`Reading ${inputPath}...`);
const fbxData = readFileSync(inputPath);
const arrayBuffer = fbxData.buffer.slice(fbxData.byteOffset, fbxData.byteOffset + fbxData.byteLength);

const loader = new FBXLoader();
const fbxScene = loader.parse(arrayBuffer, '');

console.log(`FBX loaded: ${fbxScene.animations.length} animations`);
for (const clip of fbxScene.animations) {
  console.log(`  - "${clip.name}" (${clip.duration.toFixed(2)}s, ${clip.tracks.length} tracks)`);
}

// ---- Build glTF JSON + binary buffer manually ----

// Collect all animation track data into a single binary buffer
const bufferChunks = [];
let byteOffset = 0;
const accessors = [];
const bufferViews = [];

function addAccessor(data, type, componentType) {
  const typedArray = data instanceof Float32Array ? data : new Float32Array(data);
  const bytes = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);

  // Pad to 4-byte alignment
  const padding = (4 - (byteOffset % 4)) % 4;
  if (padding > 0) {
    bufferChunks.push(Buffer.alloc(padding));
    byteOffset += padding;
  }

  const viewIndex = bufferViews.length;
  bufferViews.push({
    buffer: 0,
    byteOffset,
    byteLength: bytes.length,
  });

  let count;
  if (type === 'SCALAR') count = typedArray.length;
  else if (type === 'VEC3') count = typedArray.length / 3;
  else if (type === 'VEC4') count = typedArray.length / 4;
  else count = typedArray.length;

  // Compute min/max for SCALAR (required for animation input)
  const acc = {
    bufferView: viewIndex,
    componentType: componentType || 5126, // FLOAT
    count,
    type,
  };

  if (type === 'SCALAR') {
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < typedArray.length; i++) {
      if (typedArray[i] < min) min = typedArray[i];
      if (typedArray[i] > max) max = typedArray[i];
    }
    acc.min = [min];
    acc.max = [max];
  }

  const accIndex = accessors.length;
  accessors.push(acc);

  bufferChunks.push(bytes);
  byteOffset += bytes.length;

  return accIndex;
}

// Build node list from skeleton
const nodes = [];
const nodeMap = new Map(); // bone name -> node index

// Collect all bones
const bones = [];
fbxScene.traverse((child) => {
  if (child.isBone) bones.push(child);
});

// Create nodes for each bone
for (const bone of bones) {
  const nodeIndex = nodes.length;
  nodeMap.set(bone.name, nodeIndex);
  const node = { name: bone.name };

  // Store transform
  const t = bone.position;
  const r = bone.quaternion;
  const s = bone.scale;
  if (t.x !== 0 || t.y !== 0 || t.z !== 0) node.translation = [t.x, t.y, t.z];
  if (r.x !== 0 || r.y !== 0 || r.z !== 0 || r.w !== 1) node.rotation = [r.x, r.y, r.z, r.w];
  if (s.x !== 1 || s.y !== 1 || s.z !== 1) node.scale = [s.x, s.y, s.z];

  nodes.push(node);
}

// Set up parent-child relationships
for (const bone of bones) {
  const parentIndex = nodeMap.get(bone.parent?.name);
  const childIndex = nodeMap.get(bone.name);
  if (parentIndex !== undefined && childIndex !== undefined) {
    if (!nodes[parentIndex].children) nodes[parentIndex].children = [];
    nodes[parentIndex].children.push(childIndex);
  }
}

// Find root nodes (no parent in the bone set)
const rootNodes = [];
for (const bone of bones) {
  if (!nodeMap.has(bone.parent?.name)) {
    rootNodes.push(nodeMap.get(bone.name));
  }
}

// Build animations
const animations = [];
for (const clip of fbxScene.animations) {
  const channels = [];
  const samplers = [];

  for (const track of clip.tracks) {
    // Parse track name: "boneName.property"
    const dotIndex = track.name.lastIndexOf('.');
    if (dotIndex === -1) continue;

    const targetName = track.name.substring(0, dotIndex);
    const property = track.name.substring(dotIndex + 1);

    // Find the node
    // Track names can be like "mixamorigHips.position" or path-based
    let nodeIndex = nodeMap.get(targetName);
    if (nodeIndex === undefined) {
      // Try matching just the last part of the path
      const parts = targetName.split(/[/.]/);
      const boneName = parts[parts.length - 1];
      nodeIndex = nodeMap.get(boneName);
    }
    if (nodeIndex === undefined) continue;

    // Map three.js property names to glTF paths
    let path;
    let valueType;
    if (property === 'position') { path = 'translation'; valueType = 'VEC3'; }
    else if (property === 'quaternion') { path = 'rotation'; valueType = 'VEC4'; }
    else if (property === 'scale') { path = 'scale'; valueType = 'VEC3'; }
    else continue; // Skip unsupported tracks

    const inputAccessor = addAccessor(new Float32Array(track.times), 'SCALAR');
    const outputAccessor = addAccessor(new Float32Array(track.values), valueType);

    const samplerIndex = samplers.length;
    samplers.push({
      input: inputAccessor,
      output: outputAccessor,
      interpolation: 'LINEAR',
    });

    channels.push({
      sampler: samplerIndex,
      target: {
        node: nodeIndex,
        path,
      },
    });
  }

  if (channels.length > 0) {
    animations.push({
      name: clip.name,
      channels,
      samplers,
    });
  }
}

console.log(`Built ${animations.length} animation(s) with ${accessors.length} accessors`);

// Assemble binary buffer
const binaryBuffer = Buffer.concat(bufferChunks);

// Build glTF JSON
const gltf = {
  asset: { version: '2.0', generator: 'fbx-to-glb' },
  scene: 0,
  scenes: [{ nodes: rootNodes }],
  nodes,
  accessors,
  bufferViews,
  buffers: [{ byteLength: binaryBuffer.length }],
  animations,
};

// Encode as GLB
const jsonString = JSON.stringify(gltf);
const jsonBuffer = Buffer.from(jsonString, 'utf8');
// Pad JSON to 4-byte alignment with spaces
const jsonPadding = (4 - (jsonBuffer.length % 4)) % 4;
const paddedJson = Buffer.concat([jsonBuffer, Buffer.alloc(jsonPadding, 0x20)]);
// Pad binary to 4-byte alignment with zeros
const binPadding = (4 - (binaryBuffer.length % 4)) % 4;
const paddedBin = Buffer.concat([binaryBuffer, Buffer.alloc(binPadding, 0)]);

const totalLength = 12 + 8 + paddedJson.length + 8 + paddedBin.length;

const glb = Buffer.alloc(totalLength);
let offset = 0;

// GLB header
glb.writeUInt32LE(0x46546C67, offset); offset += 4; // magic "glTF"
glb.writeUInt32LE(2, offset); offset += 4;           // version
glb.writeUInt32LE(totalLength, offset); offset += 4;  // total length

// JSON chunk
glb.writeUInt32LE(paddedJson.length, offset); offset += 4;
glb.writeUInt32LE(0x4E4F534A, offset); offset += 4; // "JSON"
paddedJson.copy(glb, offset); offset += paddedJson.length;

// Binary chunk
glb.writeUInt32LE(paddedBin.length, offset); offset += 4;
glb.writeUInt32LE(0x004E4942, offset); offset += 4; // "BIN\0"
paddedBin.copy(glb, offset);

writeFileSync(outputPath, glb);
console.log(`Written ${outputPath} (${(glb.length / 1024).toFixed(1)} KB)`);
console.log(`Compression: ${(fbxData.length / 1024).toFixed(1)} KB -> ${(glb.length / 1024).toFixed(1)} KB (${((1 - glb.length / fbxData.length) * 100).toFixed(0)}% smaller)`);
