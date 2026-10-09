export function meshFixture(input: { positions?: number[]; indices?: number[]; mode?: number; nodes?: unknown[]; scenes?: unknown[] } = {}): Buffer {
  const positions=input.positions ?? [0,0,0,1,0,0,0,1,0], indices=input.indices ?? [0,1,2];
  const positionsBuffer=Buffer.alloc(positions.length*4); positions.forEach((value,i)=>positionsBuffer.writeFloatLE(value,i*4));
  const indexBuffer=Buffer.alloc(indices.length*2); indices.forEach((value,i)=>indexBuffer.writeUInt16LE(value,i*2));
  const data=Buffer.concat([positionsBuffer,indexBuffer]);
  const json=Buffer.from(JSON.stringify({ asset:{version:"2.0"}, buffers:[{byteLength:data.length}], bufferViews:[{buffer:0,byteOffset:0,byteLength:positionsBuffer.length},{buffer:0,byteOffset:positionsBuffer.length,byteLength:indexBuffer.length}], accessors:[{bufferView:0,componentType:5126,count:positions.length/3,type:"VEC3"},{bufferView:1,componentType:5123,count:indices.length,type:"SCALAR"}], meshes:[{primitives:[{attributes:{POSITION:0},indices:1,mode:input.mode ?? 4}]}], ...(input.nodes ? {nodes:input.nodes}:{}), ...(input.scenes ? {scenes:input.scenes}: {}) }));
  const paddedJSON=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]), paddedBIN=Buffer.concat([data,Buffer.alloc((4-data.length%4)%4)]);
  const header=Buffer.alloc(12); header.write("glTF"); header.writeUInt32LE(2,4); header.writeUInt32LE(28+paddedJSON.length+paddedBIN.length,8);
  const j=Buffer.alloc(8); j.writeUInt32LE(paddedJSON.length); j.writeUInt32LE(0x4e4f534a,4);
  const b=Buffer.alloc(8); b.writeUInt32LE(paddedBIN.length); b.writeUInt32LE(0x004e4942,4);
  return Buffer.concat([header,j,paddedJSON,b,paddedBIN]);
}
