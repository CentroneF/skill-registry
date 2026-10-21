#!/usr/bin/env node
import {manageSkills} from '../lib/manage-skills.mjs';

const args=process.argv.slice(2);
if(args.length===0 || args.includes('--help')){
  console.log('Usage: skill-registry <install|status|uninstall> [--project PATH]\n\nInstall copies this package version into PATH/.agents/skills.\nRun install from another package version to upgrade or roll back.');
}else{
  try{
    const [action,...options]=args;
    if(options.length!==0 && !(options.length===2 && options[0]==='--project')){
      throw Error('Expected --project PATH, or no options to use the current directory.');
    }
    console.log(await manageSkills({action,project:options[1]??process.cwd()}));
  }catch(error){
    console.error(`Error: ${error.message}`);
    process.exitCode=1;
  }
}
