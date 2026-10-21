import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {manageSkills} from '../lib/manage-skills.mjs';

test('project installation, explicit update, rollback and guarded removal',async()=>{
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'skill-registry-test-'));
  try{
    const project=path.join(temporary,'project'),source=path.join(temporary,'package');
    await fs.mkdir(project);await fs.mkdir(path.join(source,'skills','demo-skill'),{recursive:true});
    const metadata={name:'@centronef/skill-registry',version:'1.0.0'};
    await fs.writeFile(path.join(source,'package.json'),JSON.stringify(metadata));
    const sourceSkill=path.join(source,'skills','demo-skill','SKILL.md');
    await fs.writeFile(sourceSkill,'Version one');
    const call=action=>manageSkills({action,project,packageRoot:source});
    await call('install');
    const installed=path.join(project,'.agents','skills','demo-skill','SKILL.md');
    assert.equal(await fs.readFile(installed,'utf8'),'Version one');
    assert.match(await call('status'),/@1.0.0/);
    await fs.mkdir(path.join(project,'.agents','skills','unrelated'));
    await fs.writeFile(path.join(project,'.agents','skills','unrelated','SKILL.md'),'Keep me');
    metadata.version='1.1.0';
    await fs.writeFile(path.join(source,'package.json'),JSON.stringify(metadata));
    await fs.writeFile(sourceSkill,'Version two');
    assert.match(await call('status'),/@1.0.0/,'Changing the source must not silently change an installation.');
    await call('install');assert.equal(await fs.readFile(installed,'utf8'),'Version two');
    await fs.writeFile(installed,'My edit');
    await assert.rejects(call('install'),/Local edits/);
    await assert.rejects(call('uninstall'),/Local edits/);
    await fs.writeFile(installed,'Version two');
    metadata.version='1.0.0';
    await fs.writeFile(path.join(source,'package.json'),JSON.stringify(metadata));
    await fs.writeFile(sourceSkill,'Version one');
    await call('install');assert.equal(await fs.readFile(installed,'utf8'),'Version one');
    await call('uninstall');
    assert.equal(await fs.readFile(path.join(project,'.agents','skills','unrelated','SKILL.md'),'utf8'),'Keep me');
    await fs.mkdir(path.dirname(installed));await fs.writeFile(installed,'Unmanaged');
    await assert.rejects(call('install'),/unrelated skill/);
    assert.equal(await fs.readFile(installed,'utf8'),'Unmanaged');
  }finally{await fs.rm(temporary,{recursive:true,force:true});}
});
