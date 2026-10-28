#!/usr/bin/env node
import {manageSkills} from '../lib/manage-skills.mjs';
import {agents,getAgent} from '../lib/agents.mjs';
import {openTerminal,selectAgent} from '../lib/select-agent.mjs';

const usage=`Usage: skill-registry <install|status|uninstall> [--project PATH] [--agent AGENT]

Agents: ${agents.map(agent=>agent.id).join(', ')}
Omit --agent to select interactively. Automation must pass --agent.
Install updates every existing managed agent installation plus the selected destination.
Status and uninstall target only the selected agent.
Run install from another package version to upgrade or roll back.`;

try{
  const args=process.argv.slice(2);
  if(args.length===0){
    console.log(usage);
  }else{
    const [action,...options]=args;
    if(action==='--help' && options.length===0){
      console.log(usage);
    }else{
      if(!['install','status','uninstall'].includes(action))throw Error('Use install, status or uninstall.');
      const values={};
      let help=false;
      for(let index=0;index<options.length;index++){
        const option=options[index];
        if(option==='--help'){
          if(help)throw Error('Duplicate option: --help');
          help=true;continue;
        }
        if(!['--project','--agent'].includes(option))throw Error(`Unknown option: ${option}`);
        if(Object.hasOwn(values,option))throw Error(`Duplicate option: ${option}`);
        const value=options[++index];
        if(!value || value.startsWith('--'))throw Error(`Missing value for ${option}`);
        values[option]=value;
      }
      if(values['--agent']!==undefined)getAgent(values['--agent']);
      if(help){
        console.log(usage);
      }else{
        let agent=values['--agent'];
        if(agent===undefined){
          const terminal=openTerminal();
          try{agent=await selectAgent(terminal);}finally{terminal.close();}
        }
        console.log(await manageSkills({
          action,agent,project:values['--project']??process.cwd(),
          onProgress:message=>console.error(message),
        }));
      }
    }
  }
}catch(error){
  console.error(`Error: ${error.message}`);
  process.exitCode=1;
}
