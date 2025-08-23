import { fetchJSON } from './util.js';
export const Settings = { defaultPlayers:4, minPlayers:2, maxPlayers:6, stepMs:250, tokenSizeScale:1.0 };
export const COLORS = ['red','blue','green','yellow','purple','orange'];
export const STAGES = ['start','early','commons','lords','implementation','end'];
export const GameState = { players:[], activeIdx:0, board:null, winners:[], started:false };
export async function loadSettings(){ try{ Object.assign(Settings, await fetchJSON('data/settings.json') || {}); }catch(e){ console.warn('settings.json missing; using defaults'); } }
function makePlayer(i){ return { id:'p'+i, name:'Player '+(i+1), color: COLORS[i%COLORS.length], index:0, skipNext:false, extraRoll:false }; }
export function initPlayers(n){ GameState.players.length=0; const c=Math.max(Settings.minPlayers, Math.min(Settings.maxPlayers, n|0)); for(let i=0;i<c;i++) GameState.players.push(makePlayer(i)); }
export function setPlayerCount(n){ if(GameState.started) return; const c=Math.max(Settings.minPlayers, Math.min(Settings.maxPlayers, n|0)); const cur=GameState.players.length;
  if(c>cur){ for(let i=cur;i<c;i++) GameState.players.push(makePlayer(i)); } else if(c<cur){ GameState.players.length=c; } GameState.activeIdx%=GameState.players.length; }
export function lastIndex(){ return GameState.board ? (GameState.board.spaces.length-1) : 57; }
export function stageAt(i){ const s=GameState.board?.spaces?.[i]; return s? s.stage:null; }