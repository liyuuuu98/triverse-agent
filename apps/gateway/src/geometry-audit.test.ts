import assert from "node:assert/strict";
import test from "node:test";
import { inspectGlb } from "./inspect.js";
import { meshFixture } from "./asset-fixtures.js";
test("binary geometry audit distinguishes open faces, closed tetrahedra and degeneracy",()=>{
 const open=inspectGlb(meshFixture()); assert.equal(open.audit.complete,true); assert.equal(open.audit.boundaryEdges,3); assert.equal(open.audit.closed,false);
 const closed=inspectGlb(meshFixture({positions:[0,0,0,1,0,0,0,1,0,0,0,1],indices:[0,2,1,0,1,3,1,2,3,2,0,3]}));
 assert.equal(closed.triangles,4); assert.equal(closed.audit.closed,true); assert.equal(closed.audit.connectedComponents,1);
 const degenerate=inspectGlb(meshFixture({indices:[0,0,1]})); assert.equal(degenerate.audit.degenerateFaces,1); assert.equal(degenerate.audit.closed,false);
});
test("bounds include node hierarchy transforms and primitive modes are counted correctly",()=>{
 const report=inspectGlb(meshFixture({nodes:[{translation:[10,0,0],children:[1]},{mesh:0,scale:[2,3,1]}],scenes:[{nodes:[0]}]}));
 assert.deepEqual(report.bounds,{min:[10,0,0],max:[12,3,0]}); assert.deepEqual(report.dimensions,[2,3,0]);
 const strip=inspectGlb(meshFixture({positions:[0,0,0,1,0,0,0,1,0,1,1,0],indices:[0,1,2,3],mode:5})); assert.equal(strip.triangles,2); assert.equal(strip.audit.checkedTriangles,2); assert.equal(strip.audit.inconsistentWindingEdges,0);
 assert.equal(inspectGlb(meshFixture({indices:[0,1],mode:1})).triangles,0);
});
test("corrupt headers and out-of-range indices fail instead of reporting success",()=>{
 const bytes=meshFixture(); bytes.writeUInt32LE(200,8); assert.throws(()=>inspectGlb(bytes),/length/);
 assert.throws(()=>inspectGlb(meshFixture({indices:[0,1,99]})),/outside/);
});
