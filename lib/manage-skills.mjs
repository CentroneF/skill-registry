import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {agents,getAgent,destination,uniqueDestinations} from './agents.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const defaultPackageRoot=fileURLToPath(new URL('../',import.meta.url));
const packageName='@centronef/skill-registry';
const validName=name=>/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) && name.length<=64;
async function exists(file){
  try{return await fs.lstat(file);}catch(error){if(error.code==='ENOENT')return null;throw error;}
}
async function directory(file){
  const info=await exists(file);
  if(info && (!info.isDirectory() || info.isSymbolicLink()))throw Error(`Expected a real directory: ${file}`);
  return info;
}
async function fingerprint(folder){
  const hash=createHash('sha256');
  async function visit(current){
    const entries=(await fs.readdir(current,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'));
    for(const entry of entries){
      const file=path.join(current,entry.name);
      if(entry.isSymbolicLink())throw Error(`Symlinks are not supported in managed skills: ${file}`);
      const relative=path.relative(folder,file).split(path.sep).join('/');
      if(entry.isDirectory()){
        hash.update(`directory:${relative}\0`);
        await visit(file);
      }else if(entry.isFile()){
        hash.update(`file:${relative}\0`);
        hash.update(await fs.readFile(file));hash.update('\0');
      }else throw Error(`Unsupported skill file: ${file}`);
    }
  }
  await visit(folder);return hash.digest('hex');
}

async function readReceipt(target){
  await directory(target.root);await directory(target.skills);
  const info=await exists(target.receiptPath);
  if(info && (!info.isFile() || info.isSymbolicLink()))throw Error(`The skill registry receipt must be a regular file: ${target.receiptPath}`);
  let receipt=null;
  try{receipt=info?JSON.parse(await fs.readFile(target.receiptPath,'utf8')):null;}
  catch(error){throw Error(`Cannot read receipt ${target.receiptPath}: ${error.message}`);}
  if(receipt && (receipt.schemaVersion!==1 || receipt.package!==packageName || typeof receipt.version!=='string' || !receipt.skills || typeof receipt.skills!=='object' || Array.isArray(receipt.skills))){
    throw Error(`Unrecognized skill registry receipt: ${target.receiptPath}`);
  }
  if(info && !receipt)throw Error(`Unrecognized skill registry receipt: ${target.receiptPath}`);
  for(const [name,hash] of Object.entries(receipt?.skills??{})){
    if(!validName(name) || typeof hash!=='string' || !/^[a-f0-9]{64}$/.test(hash))throw Error(`Invalid managed skill record: ${target.receiptPath}`);
  }
  return receipt;
}

export async function manageSkills({action,project,agent='codex',packageRoot=defaultPackageRoot,onProgress=()=>{}}){
  if(!['install','status','uninstall'].includes(action))throw Error('Use install, status or uninstall.');
  const selectedAgent=getAgent(agent);
  project=path.resolve(project);
  if(!await directory(project))throw Error(`Project does not exist: ${project}`);
  const selected=destination(project,selectedAgent);
  const targets=[selected];
  if(action==='install'){
    for(const candidate of agents){
      const target=destination(project,candidate);
      if(target.skills===selected.skills)continue;
      // Do not traverse a symlinked agent root to discover ownership.
      const rootInfo=await exists(target.root);
      if(rootInfo?.isSymbolicLink())throw Error(`Expected a real directory: ${target.root}`);
      if(rootInfo?.isDirectory() && await exists(target.receiptPath))targets.push(target);
    }
  }
  const destinations=uniqueDestinations(targets);
  for(const target of destinations)target.receipt=await readReceipt(target);
  const context=`${selectedAgent.label}\nProject: ${project}\nSkills: ${selected.skills}`;
  if(action==='status'){
    if(!selected.receipt)return `No package skills installed for ${context}`;
    const lines=[`${selected.receipt.package}@${selected.receipt.version}`,context];
    for(const [name,hash] of Object.entries(selected.receipt.skills)){
      const target=path.join(selected.skills,name);
      const info=await directory(target);
      lines.push(`${name}: ${!info?'missing':await fingerprint(target)===hash?'unchanged':'locally modified'}`);
    }
    return lines.join('\n');
  }
  if(action==='uninstall' && !selected.receipt)return `No package skills installed for ${context}`;

  const pkg=action==='install'?JSON.parse(await fs.readFile(path.join(packageRoot,'package.json'),'utf8')):null;
  if(pkg && pkg.name!==packageName)throw Error('Unexpected source package.');
  const next=Object.create(null);
  if(pkg){
    for(const entry of await fs.readdir(path.join(packageRoot,'skills'),{withFileTypes:true})){
      if(!entry.isDirectory() || !validName(entry.name))throw Error('Invalid source skill directory.');
      const source=path.join(packageRoot,'skills',entry.name);
      if(!(await fs.stat(path.join(source,'SKILL.md'))).isFile())throw Error(`Missing SKILL.md: ${entry.name}`);
      next[entry.name]=await fingerprint(source);
    }
    if(Object.keys(next).length===0)throw Error('The source package has no skills.');
  }
  // Preflight every destination before creating directories or replacing files.
  for(const target of destinations){
    target.names=new Set([...Object.keys(target.receipt?.skills??{}),...Object.keys(next)]);
    for(const name of target.names){
      const file=path.join(target.skills,name),info=await directory(file);
      if(info){
        if(!Object.hasOwn(target.receipt?.skills??{},name))throw Error(`An unrelated skill already exists: ${file}`);
        if(await fingerprint(file)!==target.receipt.skills[name])throw Error(`Local edits found in ${file}. Save them separately before updating or removing it.`);
      }
    }
  }
  onProgress(`${pkg?'Installing/updating':'Removing'} managed skills in:\n${destinations.map(target=>`  ${target.agent.label}: ${target.skills}`).join('\n')}`);
  const created=[],backups=[],installed=[],receiptBackups=[],writtenReceipts=[];
  let preserveBackups=false;
  try{
    // Stage every copy and receipt before touching an existing installation.
    for(const target of destinations){
      for(const folder of [target.root,target.skills]){
        if(!await exists(folder)){await fs.mkdir(folder);created.push(folder);}
      }
      target.stage=await fs.mkdtemp(path.join(target.root,'.skill-registry-'));
      for(const name of Object.keys(next)){
        await fs.cp(path.join(packageRoot,'skills',name),path.join(target.stage,'new',name),{recursive:true});
      }
      if(pkg){
        const receipt={schemaVersion:1,package:pkg.name,version:pkg.version,skills:next};
        await fs.writeFile(path.join(target.stage,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
      }
    }
    for(const target of destinations){
      for(const name of target.names){
        const file=path.join(target.skills,name);
        if(await exists(file)){
          const backup=path.join(target.stage,'old',name);
          await fs.mkdir(path.dirname(backup),{recursive:true});
          await fs.rename(file,backup);backups.push([file,backup]);
        }
        if(next[name]){
          await fs.rename(path.join(target.stage,'new',name),file);installed.push(file);
        }
      }
      if(target.receipt){
        const backup=path.join(target.stage,'old-receipt.json');
        await fs.rename(target.receiptPath,backup);receiptBackups.push([target.receiptPath,backup]);
      }
      if(pkg){
        await fs.rename(path.join(target.stage,'receipt.json'),target.receiptPath);writtenReceipts.push(target.receiptPath);
      }
    }
  }catch(error){
    const failures=[];
    const attempt=async operation=>{try{await operation();}catch(failure){failures.push(failure);}};
    for(const receipt of writtenReceipts.reverse())await attempt(()=>fs.rm(receipt));
    for(const file of installed.reverse())await attempt(()=>fs.rm(file,{recursive:true,force:true}));
    for(const [file,backup] of backups.reverse())await attempt(()=>fs.rename(backup,file));
    for(const [file,backup] of receiptBackups.reverse())await attempt(()=>fs.rename(backup,file));
    if(failures.length){
      preserveBackups=true;
      throw new AggregateError([error,...failures],`Update failed and rollback was incomplete. Backups retained in ${destinations.filter(target=>target.stage).map(target=>target.stage).join(', ')}. Original error: ${error.message}`);
    }
    throw error;
  }finally{
    if(!preserveBackups){
      for(const target of destinations)if(target.stage)await fs.rm(target.stage,{recursive:true,force:true});
      for(const folder of created.reverse()){
        try{await fs.rmdir(folder);}catch(error){if(!['ENOTEMPTY','ENOENT'].includes(error.code))throw error;}
      }
    }
  }
  return destinations.map(target=>pkg?`Installed ${pkg.name}@${pkg.version} for ${target.agent.label} into ${target.skills}`:`Removed managed package skills for ${target.agent.label} from ${target.skills}`).join('\n');
}
