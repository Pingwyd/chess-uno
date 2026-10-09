import type { BlackSkin, WhiteSkin } from '../learn/progress';

/** Equipped piece skins (learning-path rewards). The 3D materials read this; 2D uses CSS classes on the app root. */
let active: { w: WhiteSkin; b: BlackSkin } = { w: 'ember', b: 'tide' };
export const setActiveSkins = (s: { w: WhiteSkin; b: BlackSkin }) => { active = s; };
export const activeSkins = () => active;
