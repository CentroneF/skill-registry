import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PassThrough,Writable} from 'node:stream';
import {selectAgent} from '../lib/select-agent.mjs';

function streams(){
  const input=new PassThrough();let text='';
  const output=new Writable({write(chunk,encoding,callback){text+=chunk.toString();callback();}});
  return {input,output,text:()=>text};
}

for(const [number,id] of ['codex','claude','cursor','copilot','gemini'].entries()){
  test(`menu choice ${number+1} selects ${id}`,async()=>{
    const terminal=streams();const pending=selectAgent(terminal);
    terminal.input.end(`${number+1}\n`);
    assert.equal(await pending,id);
    assert.match(terminal.text(),/Claude Code/);assert.match(terminal.text(),/\.gemini\/skills/);
  });
}

test('invalid and blank input ask again rather than selecting a default',async()=>{
  const terminal=streams();const pending=selectAgent(terminal);
  terminal.input.end('\n0\n6\nclaude\n2\n');
  assert.equal(await pending,'claude');
  assert.equal((terminal.text().match(/Enter a number/g)??[]).length,4);
});

test('end of input cancels selection',async()=>{
  const terminal=streams();const pending=selectAgent(terminal);
  terminal.input.end();await assert.rejects(pending,/cancelled/);
});

test('Ctrl-C cancels a terminal selection and restores terminal mode',async()=>{
  const terminal=streams();let raw=false;
  terminal.input.isTTY=true;terminal.output.isTTY=true;
  terminal.input.setRawMode=value=>{raw=value;};
  const pending=selectAgent(terminal);
  terminal.input.write('\x03');
  await assert.rejects(pending,/cancelled/);assert.equal(raw,false);
  terminal.input.destroy();
});
