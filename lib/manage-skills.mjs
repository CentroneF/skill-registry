import {createHash} from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const defaultPackageRoot=fileURLToPath(new URL('../',import.meta.url));
const packageName='@francescocentrone/skill-registry';
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

export async function manageSkills({action,project,packageRoot=defaultPackageRoot}){
  if(!['install','status','uninstall'].includes(action))throw Error('Use install, status or uninstall.');
  project=path.resolve(project);
  if(!await directory(project))throw Error(`Project does not exist: ${project}`);
  const agents=path.join(project,'.agents'),skills=path.join(agents,'skills');
  const receiptPath=path.join(agents,'skill-registry-lock.json');
  await directory(agents);await directory(skills);
  const receiptInfo=await exists(receiptPath);
  if(receiptInfo && (!receiptInfo.isFile() || receiptInfo.isSymbolicLink()))throw Error('The skill registry receipt must be a regular file.');
  const receipt=receiptInfo?JSON.parse(await fs.readFile(receiptPath,'utf8')):null;
  if(receipt && (receipt.schemaVersion!==1 || receipt.package!==packageName || typeof receipt.version!=='string' || !receipt.skills || typeof receipt.skills!=='object' || Array.isArray(receipt.skills))){
    throw Error('Unrecognized skill registry receipt.');
  }
  for(const [name,hash] of Object.entries(receipt?.skills??{})){
    if(!validName(name) || typeof hash!=='string' || !/^[a-f0-9]{64}$/.test(hash))throw Error('Invalid managed skill record.');
  }
  if(action==='status'){
    if(!receipt)return `No package skills installed in ${project}`;
    const lines=[`${receipt.package}@${receipt.version}`,`Project: ${project}`];
    for(const [name,hash] of Object.entries(receipt.skills)){
      const target=path.join(skills,name);
      const info=await directory(target);
      lines.push(`${name}: ${!info?'missing':await fingerprint(target)===hash?'unchanged':'locally modified'}`);
    }
    return lines.join('\n');
  }
  if(action==='uninstall' && !receipt)return `No package skills installed in ${project}`;

  const pkg=action==='install'?JSON.parse(await fs.readFile(path.join(packageRoot,'package.json'),'utf8')):null;
  if(pkg && pkg.name!==packageName)throw Error('Unexpected source package.');
  const next={};
  if(pkg){
    for(const entry of await fs.readdir(path.join(packageRoot,'skills'),{withFileTypes:true})){
      if(!entry.isDirectory() || !validName(entry.name))throw Error('Invalid source skill directory.');
      const source=path.join(packageRoot,'skills',entry.name);
      if(!(await fs.stat(path.join(source,'SKILL.md'))).isFile())throw Error(`Missing SKILL.md: ${entry.name}`);
      next[entry.name]=await fingerprint(source);
    }
    if(Object.keys(next).length===0)throw Error('The source package has no skills.');
  }
  const names=new Set([...Object.keys(receipt?.skills??{}),...Object.keys(next)]);
  // Check the complete update before changing any installed skills.
  for(const name of names){
    const target=path.join(skills,name),info=await directory(target);
    if(info){
      if(!receipt?.skills[name])throw Error(`An unrelated skill already exists: ${name}`);
      if(await fingerprint(target)!==receipt.skills[name])throw Error(`Local edits found in ${name}. Save them separately before updating or removing it.`);
    }
  }
  await fs.mkdir(skills,{recursive:true});
  const stage=await fs.mkdtemp(path.join(agents,'.skill-registry-'));
  const backups=[],installed=[];
  try{
    for(const name of Object.keys(next)){
      await fs.cp(path.join(packageRoot,'skills',name),path.join(stage,'new',name),{recursive:true});
    }
    for(const name of names){
      const target=path.join(skills,name);
      if(await exists(target)){
        const backup=path.join(stage,'old',name);
        await fs.mkdir(path.dirname(backup),{recursive:true});
        await fs.rename(target,backup);backups.push([target,backup]);
      }
      if(next[name]){
        await fs.rename(path.join(stage,'new',name),target);installed.push(target);
      }
    }
    if(pkg){
      const nextReceipt={schemaVersion:1,package:pkg.name,version:pkg.version,skills:next};
      const temporary=path.join(stage,'receipt.json');
      await fs.writeFile(temporary,JSON.stringify(nextReceipt,null,2)+'\n');
      await fs.rename(temporary,receiptPath);
    }else await fs.rm(receiptPath);
  }catch(error){
    for(const target of installed)await fs.rm(target,{recursive:true,force:true});
    for(const [target,backup] of backups)await fs.rename(backup,target);
    throw error;
  }finally{
    await fs.rm(stage,{recursive:true,force:true});
  }
  return pkg?`Installed ${pkg.name}@${pkg.version} into ${skills}`:`Removed managed package skills from ${skills}`;
}
