/** Reproducible local GLB assets; no third-party art or remote downloads. */
import { mkdir, writeFile } from 'node:fs/promises';
import * as T from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { buildVillagerParts, RIG } from '../src/game/population/villagerModels';
import { buildSoldierParts } from '../src/game/military/soldierModels';

class NodeFileReader {
  result: ArrayBuffer | string | null = null;
  onloadend?: () => void;
  async readAsArrayBuffer(blob: Blob) { this.result = await blob.arrayBuffer(); this.onloadend?.(); }
  async readAsDataURL(blob: Blob) { this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`; this.onloadend?.(); }
}
Object.assign(globalThis, { FileReader: NodeFileReader });
const body = buildVillagerParts(), weapons = buildSoldierParts();
const variants = ['swordsman', 'spearman', 'archer', 'crossbowman', 'wildlife', 'zombie', 'mutant', 'bandit', 'robot', 'boss'];
await mkdir('client/public/assets/battle', { recursive: true });
for (const kind of variants) {
  const root = new T.Group(); root.name = 'Character';
  const skin = ({ zombie: '#9fb68c', mutant: '#a998c6', boss: '#b4a0d5', robot: '#b2c9cf', wildlife: '#b68662' } as Record<string, string>)[kind] ?? '#f1c39c';
  const cloth = ({ swordsman: '#558ac0', spearman: '#55a188', archer: '#759f48', crossbowman: '#9674b7', bandit: '#be795c', robot: '#7c9fba', zombie: '#85916d', mutant: '#77658f', boss: '#8161ac', wildlife: '#aa7856' } as Record<string, string>)[kind];
  const mesh = (parent: T.Object3D, geometry: T.BufferGeometry, color = '#ffffff') => {
    const m = new T.Mesh(geometry, new T.MeshStandardMaterial({ color, vertexColors: !!geometry.getAttribute('color'), roughness: .85 })); parent.add(m); return m;
  };
  const joint = (name: string, parent: T.Object3D, x: number, y: number, z = 0) => { const n = new T.Group(); n.name = name; n.position.set(x, y, z); parent.add(n); return n; };
  const hips = joint('Hips', root, 0, RIG.hipY);
  mesh(hips, body.torso, cloth); mesh(hips, body.hips, '#695845');
  const head = joint('Head', hips, 0, RIG.neckY - RIG.hipY); mesh(head, body.head, skin); mesh(head, body.face); mesh(head, body.mouths.content);
  if (kind === 'wildlife') {
    for (const x of [-.27, .27]) { const ear = mesh(head, new T.SphereGeometry(.13, 8, 6), skin); ear.position.set(x, .65, 0); }
    const nose = mesh(head, new T.SphereGeometry(.13, 8, 6), '#554035'); nose.position.set(0, .3, .34);
  } else if (kind === 'boss' || kind === 'mutant') {
    for (const x of [-.27, .27]) { const horn = mesh(head, new T.ConeGeometry(.1, .4, 5), '#e9d9b2'); horn.position.set(x, .7, 0); }
  } else mesh(head, body.hair[kind === 'zombie' ? 3 : 0], '#5f514c');
  const left = joint('ArmL', hips, -RIG.shoulderX, RIG.shoulderY - RIG.hipY), right = joint('ArmR', hips, RIG.shoulderX, RIG.shoulderY - RIG.hipY);
  const handL = joint('HandL', left, 0, -RIG.armLength), handR = joint('HandR', right, 0, -RIG.armLength);
  for (const arm of [left, right]) mesh(arm, body.arm, cloth);
  for (const hand of [handL, handR]) mesh(hand, body.hand, skin);
  for (const [side, x] of [['L', -RIG.hipX], ['R', RIG.hipX]] as const) mesh(joint(`Leg${side}`, hips, x, 0), body.leg, '#665c52');
  if (kind === 'swordsman' || kind === 'bandit') { mesh(handR, weapons.saber); mesh(handL, weapons.shield, cloth); }
  if (kind === 'spearman') mesh(handR, weapons.spear);
  if (kind === 'archer') mesh(handL, weapons.bow);
  if (kind === 'crossbowman' || kind === 'robot') mesh(handR, weapons.crossbow);
  const rot = (node: string, times: number[], angles: number[], axis: 'x' | 'y' | 'z' = 'x') => new T.QuaternionKeyframeTrack(`${node}.quaternion`, times, angles.flatMap(a => { const e = new T.Euler(); e[axis] = a; return new T.Quaternion().setFromEuler(e).toArray(); }));
  const clips: T.AnimationClip[] = [];
  clips.push(new T.AnimationClip('Idle', 2, [rot('Head', [0, 1, 2], [0, .04, 0], 'z')]));
  for (const [name, speed] of [['Walk', 1], ['Run', .6]] as const) clips.push(new T.AnimationClip(name, speed, [rot('LegL', [0, speed / 2, speed], [-.5, .5, -.5]), rot('LegR', [0, speed / 2, speed], [.5, -.5, .5]), rot('ArmL', [0, speed / 2, speed], [.3, -.3, .3])]));
  const ranged = ['archer', 'crossbowman', 'robot'].includes(kind);
  clips.push(new T.AnimationClip('Attack', 1, [rot('ArmR', [0, .3, .55, 1], ranged ? [-1.2, -1.6, -1.4, -1.2] : [0, -2.2, -.4, 0]), rot('ArmL', [0, .3, .55, 1], ranged ? [-1.4, -1.5, -1.5, -1.4] : [0, -.5, -.5, 0]), rot('Hips', [0, .3, .6, 1], [0, -.25, .2, 0], 'y')]));
  clips.push(new T.AnimationClip('Reload', 1, [rot('ArmR', [0, .3, .7, 1], [-1.1, -.4, -1.7, 0]), rot('ArmL', [0, .5, 1], [-1.4, -.9, 0])]));
  clips.push(new T.AnimationClip('Hit', .4, [rot('Hips', [0, .15, .4], [0, -.25, 0])]));
  clips.push(new T.AnimationClip('Defend', 1, [rot('ArmL', [0, .3, 1], [0, -1.6, -1.6]), rot('Hips', [0, .3, 1], [0, .15, .15])]));
  clips.push(new T.AnimationClip('Knockout', .7, [rot('Hips', [0, .7], [0, -1.4])]));
  clips.push(new T.AnimationClip('Victory', 1.4, [rot('ArmR', [0, .3, .7, 1, 1.4], [0, -2.6, -2.3, -2.6, 0]), rot('ArmL', [0, .3, .7, 1, 1.4], [0, -2.6, -2.3, -2.6, 0])]));
  const result = await new GLTFExporter().parseAsync(root, { binary: true, animations: clips });
  await writeFile(`client/public/assets/battle/${kind}.glb`, Buffer.from(result as ArrayBuffer));
  process.stdout.write(`${kind}.glb\n`);
}
