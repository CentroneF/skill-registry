import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const pkg=JSON.parse(await readFile(new URL('package.json',root),'utf8'));
assert.equal(pkg.name,'@centronef/skill-registry','Unexpected package name.');
assert.match(pkg.version,/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,'Use a stable major.minor.patch version.');
assert.equal(pkg.publishConfig.registry,'https://npm.pkg.github.com','Publish only to GitHub Packages.');
assert.notEqual(pkg.private,true,'A private:true npm package cannot be published.');
if(process.env.RELEASE_TAG){
  assert.equal(process.env.RELEASE_TAG,`v${pkg.version}`,'The release tag must match package.json.');
}
const folders=(await readdir(new URL('skills/',root),{withFileTypes:true})).filter(e=>e.isDirectory());
assert.ok(folders.length,'Include at least one skill.');
for(const folder of folders){
  const content=await readFile(new URL(`skills/${folder.name}/SKILL.md`,root),'utf8');
  const frontmatter=content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  assert.ok(frontmatter,`${folder.name}: missing skill frontmatter.`);
  assert.match(folder.name,/^[a-z0-9]+(?:-[a-z0-9]+)*$/,'Use a lowercase skill folder name.');
  assert.ok(folder.name.length<=64,'Skill names must not exceed 64 characters.');
  const name=frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description=frontmatter.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  assert.equal(name,folder.name,'Skill name must match its folder.');
  assert.ok(description && description.length<=1024,'Provide a concise skill description.');
}
console.log(`Validated ${pkg.name}@${pkg.version} with ${folders.length} skill(s).`);
