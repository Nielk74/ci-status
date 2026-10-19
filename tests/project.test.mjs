import test from 'node:test';
import assert from 'node:assert/strict';
import {detectProjects} from '../src/desktop/project.mjs';

function fixture({explicit=[],links=[],paths=[]}={}){
  const node=(attrs,text='',header=false)=>({getAttribute:key=>attrs[key]??null,textContent:text,getBoundingClientRect:()=>({width:100,height:25}),closest:selector=>header&&selector.includes('conversation-header')?{}:null});
  return {querySelectorAll(selector){if(selector.includes('data-signal-project-kind'))return explicit.map(p=>node({'data-signal-project-kind':p.kind,'data-signal-project-id':p.id,'data-signal-project-name':p.name}));if(selector.includes('a[href'))return links.map(l=>node({href:l.href},l.name,l.header));if(selector.includes('title'))return paths.map(p=>node({title:p}));return [];}};
}

test('project detection reads stable host context and project routes without guessing a name',()=>{
  assert.deepEqual(detectProjects(fixture({explicit:[{kind:'folder',id:'C:/work/website',name:'Website'}]}),'app://localhost/index.html'),[{kind:'folder',id:'C:/work/website',name:'Website'}]);
  assert.deepEqual(detectProjects(fixture(),'app://localhost/project/project-one'),[{kind:'claude',id:'project-one'}]);
  assert.deepEqual(detectProjects(fixture(),'app://localhost/index.html#/project/project-one'),[{kind:'claude',id:'project-one'}]);
  assert.deepEqual(detectProjects(fixture({paths:['website']}),'app://localhost/code/session-one'),[]);
});

test('unselected sidebar project links do not become the active project',()=>{
  assert.deepEqual(detectProjects(fixture({links:[{href:'/project/other',name:'Other'}]}),'app://localhost/chat/conversation-one'),[]);
  assert.deepEqual(detectProjects(fixture(),'app://localhost/projects'),[]);
});

test('the primary Code folder control identifies a full path and ambiguous controls stay unscoped',()=>{
  assert.deepEqual(detectProjects(fixture({paths:['C:\\work\\website']}),'app://localhost/code/session-one'),[{kind:'folder',id:'C:/work/website'}]);
  assert.deepEqual(detectProjects(fixture({paths:['C:/work/website','C:/work/other']}),'app://localhost/code/session-one'),[]);
  assert.deepEqual(detectProjects(fixture({paths:['C:/work/website, C:/work/other']}),'app://localhost/code/session-one'),[]);
});

test('a new project route wins over retained header breadcrumbs during navigation',()=>{
  const document=fixture({links:[{href:'/project/previous',name:'Previous',header:true}]});
  assert.deepEqual(detectProjects(document,'app://localhost/project/current'),[{kind:'claude',id:'current'}]);
  assert.deepEqual(detectProjects(fixture({links:[{href:'/project/a',name:'A',header:true},{href:'/project/b',name:'B',header:true}]}),'app://localhost/chat/chat-one'),[]);
});
