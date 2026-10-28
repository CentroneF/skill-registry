import {openSync,closeSync} from 'node:fs';
import {ReadStream,WriteStream} from 'node:tty';
import {createInterface} from 'node:readline';
import {agents} from './agents.mjs';

const unavailable=()=>Error(`Agent selection requires an interactive terminal. Rerun with --agent ${agents.map(agent=>agent.id).join('|')}.`);

export function openTerminal(){
  if(process.stdin.isTTY && process.stderr.isTTY){
    return {input:process.stdin,output:process.stderr,close(){}};
  }
  // A controlling terminal can remain available when stdin or output is redirected.
  if(process.platform!=='win32'){
    let inputFd,outputFd;
    try{
      inputFd=openSync('/dev/tty','r');
      outputFd=openSync('/dev/tty','w');
      const input=new ReadStream(inputFd),output=new WriteStream(outputFd);
      return {input,output,close(){input.destroy();output.destroy();}};
    }catch{
      if(inputFd!==undefined)closeSync(inputFd);
      if(outputFd!==undefined)closeSync(outputFd);
    }
  }
  throw unavailable();
}

export async function selectAgent({input,output}){
  const reader=createInterface({input,output,terminal:Boolean(input.isTTY && output.isTTY)});
  let cancelled=false;
  reader.on('SIGINT',()=>{cancelled=true;reader.close();});
  try{
    output.write('Select an agent:\n');
    agents.forEach((agent,index)=>output.write(`  ${index+1}. ${agent.label} (${agent.directory}/skills)\n`));
    output.write(`Choice [1-${agents.length}]: `);
    for await(const line of reader){
      if(cancelled)break;
      const choice=line.trim();
      if(/^\d+$/.test(choice) && Number(choice)>=1 && Number(choice)<=agents.length)return agents[Number(choice)-1].id;
      output.write(`Enter a number from 1 to ${agents.length}.\nChoice [1-${agents.length}]: `);
    }
    throw Error('Agent selection cancelled; no files were changed.');
  }finally{
    reader.close();
  }
}
