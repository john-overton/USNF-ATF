/** Regenerate licensed cloud textures through Godot, never an approximate JS noise port. */
import {cp,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {format} from 'prettier';
const reference=path.resolve(process.argv[2]??'extracted/reference/SunshineClouds2');
const godot=path.resolve(process.argv[3]??'extracted/reference/godot-tools/Godot_v4.4.1-stable_linux.x86_64');
const work=path.resolve('extracted/sunshine-export');
await mkdir(work,{recursive:true});
await cp(reference+'/addons/SunshineClouds2/NoiseTextures',work+'/NoiseTextures',{recursive:true});
await cp('tools/flight/export-sunshine.gd',work+'/export.gd');
await Bun.write(work+'/project.godot','config_version=5\n[application]\nconfig/name="Sunshine texture export"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n');
for(const args of [['--headless','--editor','--import'],['--script','export.gd','--resolution','64x64']]){
 const proc=Bun.spawn([godot,'--path',work,...args],{stdout:'inherit',stderr:'inherit'});
 assert.equal(await proc.exited,0);
}
const hashes:Record<string,string>={};
for(const name of ['large','medium','small','coverage','height','curl','dither']){
 const bytes=await Bun.file(work+'/output/'+name+'.bin').bytes();
 hashes[name+'.bin.gz']=createHash('sha256').update(bytes).digest('hex');
 await Bun.write('engine/public/dev-root/sunshine/'+name+'.bin.gz',Bun.gzipSync(bytes));
}
await Bun.write('engine/src/render/sunshine-assets/manifest.json',await format(await Bun.file(work+'/output/manifest.json').text(),{parser:'json'}));

const provenance=await Bun.file('engine/src/render/sunshine-assets/provenance.json').json();
provenance.uncompressedSha256=hashes;
await Bun.write('engine/src/render/sunshine-assets/provenance.json',await format(JSON.stringify(provenance),{parser:'json'}));
