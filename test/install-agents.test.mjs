import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {manageSkills} from '../lib/manage-skills.mjs';
import {agents,destination,uniqueDestinations} from '../lib/agents.mjs';

async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'agent-install-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const project=path.join(root,'project'),source=path.join(root,'package');
  await fs.mkdir(project);
  await fs.mkdir(path.join(source,'skills','demo'),{recursive:true});
  const version=async value=>{
    await fs.writeFile(path.join(source,'package.json'),JSON.stringify({name:'@centronef/skill-registry',version:value}));
    await fs.writeFile(path.join(source,'skills','demo','SKILL.md'),value);
  };
  await version('1.0.0');
  const call=(action,agent)=>manageSkills({action,agent,project,packageRoot:source});
  const target=id=>destination(project,agents.find(agent=>agent.id===id));
  const content=id=>fs.readFile(path.join(target(id).skills,'demo','SKILL.md'),'utf8');
  const snapshot=async()=>Object.fromEntries(await Promise.all(agents.map(async agent=>{
    const folder=target(agent.id);
    try{return [agent.id,[await content(agent.id),await fs.readFile(folder.receiptPath,'utf8')]];}
    catch(error){if(error.code==='ENOENT')return [agent.id,null];throw error;}
  })));
  return {project,source,version,call,target,content,snapshot};
}

for(const agent of agents){
  test(`${agent.label}: destination, legacy receipt, retired skills and guarded uninstall`,async t=>{
    const f=await fixture(t);
    await f.call('install',agent.id);
    assert.equal(await f.content(agent.id),'1.0.0');
    const receipt=JSON.parse(await fs.readFile(f.target(agent.id).receiptPath,'utf8'));
    assert.equal(receipt.schemaVersion,1);assert.equal(receipt.agent,undefined);
    assert.match(await f.call('status',agent.id),/1\.0\.0/);
    await fs.rename(path.join(f.source,'skills','demo'),path.join(f.source,'skills','replacement'));
    await f.call('install',agent.id);
    await assert.rejects(f.content(agent.id),{code:'ENOENT'});
    const unrelated=path.join(f.target(agent.id).root,'unrelated.txt');
    await fs.writeFile(unrelated,'keep');
    await f.call('uninstall',agent.id);
    assert.equal(await fs.readFile(unrelated,'utf8'),'keep');
    await assert.rejects(fs.stat(f.target(agent.id).receiptPath),{code:'ENOENT'});
  });
}

test('install and rollback update every receipt-backed destination and add the selection',async t=>{
  const f=await fixture(t);
  await f.call('install','codex');await f.call('install','claude');
  const unmanaged=path.join(f.target('copilot').skills,'custom');
  await fs.mkdir(unmanaged,{recursive:true});await fs.writeFile(path.join(unmanaged,'SKILL.md'),'keep');
  await f.version('2.0.0');
  const messages=[];
  await manageSkills({action:'install',agent:'cursor',project:f.project,packageRoot:f.source,onProgress:message=>messages.push(message)});
  for(const agent of ['codex','claude','cursor'])assert.equal(await f.content(agent),'2.0.0');
  assert.match(messages[0],/Codex/);assert.match(messages[0],/Claude Code/);assert.match(messages[0],/Cursor/);
  assert.equal(await fs.readFile(path.join(unmanaged,'SKILL.md'),'utf8'),'keep');
  await assert.rejects(fs.stat(f.target('copilot').receiptPath),{code:'ENOENT'});
  await f.version('1.0.0');await f.call('install','claude');
  for(const agent of ['codex','claude','cursor'])assert.equal(await f.content(agent),'1.0.0');
  await f.call('uninstall','claude');
  assert.equal(await f.content('codex'),'1.0.0');assert.equal(await f.content('cursor'),'1.0.0');
  await assert.rejects(f.content('claude'),{code:'ENOENT'});
});

test('local edit or invalid receipt in any destination blocks every update',async t=>{
  const f=await fixture(t);
  await f.call('install','codex');await f.call('install','claude');
  await fs.writeFile(path.join(f.target('codex').skills,'demo','SKILL.md'),'local edit');
  const before=await f.snapshot();await f.version('2.0.0');
  await assert.rejects(f.call('install','cursor'),/Local edits/);
  assert.deepEqual(await f.snapshot(),before);
  await assert.rejects(fs.stat(f.target('cursor').root),{code:'ENOENT'});
  await fs.writeFile(f.target('codex').receiptPath,'null');
  await assert.rejects(f.call('install','claude'),/Unrecognized/);
  assert.equal(await f.content('claude'),'1.0.0');
});

test('recoverable failure in a later receipt replacement restores all files and receipts',async t=>{
  const f=await fixture(t);
  await f.call('install','codex');await f.call('install','claude');
  const before=await f.snapshot();await f.version('2.0.0');
  const rename=fs.rename;
  let failed=false;
  t.mock.method(fs,'rename',async(from,to)=>{
    if(!failed && from.endsWith('/receipt.json') && to===f.target('codex').receiptPath){
      failed=true;throw Error('Injected receipt failure');
    }
    return rename(from,to);
  });
  await assert.rejects(f.call('install','cursor'),/Injected receipt failure/);
  assert.equal(failed,true);assert.deepEqual(await f.snapshot(),before);
  await assert.rejects(fs.stat(f.target('cursor').root),{code:'ENOENT'});
  for(const agent of ['codex','claude'])assert.deepEqual((await fs.readdir(f.target(agent).root)).sort(),['skill-registry-lock.json','skills']);
});

test('status and no-op uninstall are read-only; invalid agent and symlinks are rejected',async t=>{
  const f=await fixture(t);
  for(const action of ['status','uninstall'])assert.match(await f.call(action,'gemini'),/No package skills/);
  assert.deepEqual(await fs.readdir(f.project),[]);
  await assert.rejects(f.call('install','../../outside'),/Unknown agent/);
  await fs.symlink(f.source,f.target('claude').root,'dir');
  await assert.rejects(f.call('install','claude'),/real directory/);
  await fs.unlink(f.target('claude').root);
  await fs.mkdir(f.target('codex').root);
  await fs.symlink(path.join(f.source,'skills'),f.target('codex').skills,'dir');
  await assert.rejects(f.call('install','codex'),/real directory/);
});

test('shared destination paths are deduplicated',()=>{
  const a={skills:'/project/.agents/skills'},b={skills:a.skills},c={skills:'/project/.claude/skills'};
  assert.deepEqual(uniqueDestinations([a,b,c]),[b,c]);
});

test('a staging failure changes no existing installation and removes temporary directories',async t=>{
  const f=await fixture(t);
  await f.call('install','codex');await f.call('install','claude');
  const before=await f.snapshot();await f.version('2.0.0');
  const copy=fs.cp;
  t.mock.method(fs,'cp',async(from,to,options)=>{
    if(to.startsWith(f.target('claude').root))throw Error('Injected staging failure');
    return copy(from,to,options);
  });
  await assert.rejects(f.call('install','cursor'),/Injected staging failure/);
  assert.deepEqual(await f.snapshot(),before);
  await assert.rejects(fs.stat(f.target('cursor').root),{code:'ENOENT'});
});

test('valid skill names that match object properties can be retired',async t=>{
  const f=await fixture(t);
  await fs.rename(path.join(f.source,'skills','demo'),path.join(f.source,'skills','constructor'));
  await f.call('install','codex');
  await fs.rename(path.join(f.source,'skills','constructor'),path.join(f.source,'skills','demo'));
  await f.call('install','codex');
  assert.equal(await f.content('codex'),'1.0.0');
  await assert.rejects(fs.stat(path.join(f.target('codex').skills,'constructor')),{code:'ENOENT'});
});

test('a symlinked receipt or managed skill blocks all destinations',async t=>{
  const f=await fixture(t);
  await f.call('install','codex');await f.call('install','claude');
  const receipt=f.target('codex').receiptPath;
  const backup=path.join(f.project,'receipt-backup.json');
  await fs.rename(receipt,backup);await fs.symlink(backup,receipt);
  await assert.rejects(f.call('install','claude'),/regular file/);
  assert.equal(await f.content('claude'),'1.0.0');
  await fs.unlink(receipt);await fs.rename(backup,receipt);
  const skill=path.join(f.target('codex').skills,'demo');
  await fs.rm(skill,{recursive:true});await fs.symlink(path.join(f.source,'skills','demo'),skill,'dir');
  await assert.rejects(f.call('install','claude'),/real directory/);
  assert.equal(await f.content('claude'),'1.0.0');
});
