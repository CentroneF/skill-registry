import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const cli=fileURLToPath(new URL('../bin/skill-registry.mjs',import.meta.url));

function run(args){
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[cli,...args],{stdio:['pipe','pipe','pipe'],detached:process.platform!=='win32'});
    let stdout='',stderr='';
    child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);
    child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));child.stdin.end();
  });
}

test('explicit agent works without a terminal in both option orders',async t=>{
  const project=await fs.mkdtemp(path.join(os.tmpdir(),'agent-cli-'));
  t.after(()=>fs.rm(project,{recursive:true,force:true}));
  const install=await run(['install','--agent','claude','--project',project]);
  assert.equal(install.code,0,install.stderr);assert.match(install.stdout,/Claude Code/);
  await fs.stat(path.join(project,'.claude','skills','oracle-plan','SKILL.md'));
  const status=await run(['status','--project',project,'--agent','claude']);
  assert.equal(status.code,0,status.stderr);assert.match(status.stdout,/unchanged/);
  const uninstall=await run(['uninstall','--agent','claude','--project',project]);
  assert.equal(uninstall.code,0,uninstall.stderr);
  await assert.rejects(fs.stat(path.join(project,'.claude','skill-registry-lock.json')),{code:'ENOENT'});
});

test('help never prompts; missing agent without a terminal fails clearly',async()=>{
  for(const args of [[],['--help'],['install','--help']]){
    const result=await run(args);assert.equal(result.code,0);assert.match(result.stdout,/Usage:/);assert.doesNotMatch(result.stdout,/Select an agent/);
  }
  const missing=await run(['status']);
  assert.equal(missing.code,1);assert.match(missing.stderr,/interactive terminal.*--agent/);
});

test('malformed commands fail before attempting selection',async()=>{
  for(const args of [
    ['wrong'],['install','--unknown'],['install','extra'],['install','--agent'],
    ['install','--project','--agent','claude'],['install','--agent','unknown'],
    ['install','--agent','codex','--agent','claude'],['install','--project','x','--project','y'],
  ]){
    const result=await run(args);
    assert.equal(result.code,1,JSON.stringify(args));assert.match(result.stderr,/Error:/);
    assert.doesNotMatch(result.stderr,/interactive terminal|Select an agent/);
  }
});
