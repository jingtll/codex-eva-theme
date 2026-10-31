import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
export async function buildBundle(settings={},hostAdapter={}) {
  const assets={};
  for(const[key,path,mime]of [
    ['logo','svg/nerv-logo.svg','image/svg+xml'],['asukaPortrait','images/asuka-portrait-lineart.png','image/png'],['reiPortrait','images/rei-portrait-lineart.png','image/png'],
  ])assets[key]=`data:${mime};base64,${(await readFile(new URL('assets/'+path,root))).toString('base64')}`;
  const [css,skin,adapter]=await Promise.all(['skin.css','skin.js','adapter.js'].map(p=>readFile(new URL('client/'+p,root),'utf8')));
  // Wait for an actual composer: do not decorate login, browser or plugin pages.
  return `(()=>{window.__evaInstaller?.disconnect();const install=(next)=>{window.__EVA_SETTINGS__=next||${JSON.stringify(settings)};window.__EVA_HOST__=${JSON.stringify(hostAdapter)};if(window.__codexEva||!document.body||!window.electronBridge||!document.querySelector('[contenteditable="true"],textarea[placeholder]'))return;window.__EVA_ASSETS__=${JSON.stringify(assets)};window.__EVA_CSS__=${JSON.stringify(css)};${skin}\n${adapter}\n};install();window.__evaInstall=install;const observer=new MutationObserver(()=>install());observer.observe(document,{subtree:true,childList:true});window.__evaInstaller=observer;})()`;
}
