import path from 'node:path';

export const agents=Object.freeze([
  {id:'codex',label:'Codex',directory:'.agents'},
  {id:'claude',label:'Claude Code',directory:'.claude'},
  {id:'cursor',label:'Cursor',directory:'.cursor'},
  {id:'copilot',label:'GitHub Copilot',directory:'.github'},
  {id:'gemini',label:'Gemini CLI',directory:'.gemini'},
].map(Object.freeze));

export function getAgent(id){
  const agent=agents.find(candidate=>candidate.id===id);
  if(!agent)throw Error(`Unknown agent: ${id}. Use ${agents.map(candidate=>candidate.id).join(', ')}.`);
  return agent;
}

export function destination(project,agent){
  const root=path.resolve(project,agent.directory);
  return {agent,root,skills:path.join(root,'skills'),receiptPath:path.join(root,'skill-registry-lock.json')};
}

export function uniqueDestinations(destinations){
  return [...new Map(destinations.map(target=>[target.skills,target])).values()];
}
