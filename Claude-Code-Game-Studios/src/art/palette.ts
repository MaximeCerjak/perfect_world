// Palettes du monde, par saison. Des teintes naturelles et retenues : verts
// sourds, terres claires, bleu plus froid pour l'eau. Chaque gamme va du plus
// sombre au plus clair. Les bâtiments gardent leurs couleurs toute l'année.

export type Ambiance = 'printemps' | 'été' | 'automne' | 'hiver' | 'sécheresse';
export type Trio = [string, string, string];
export interface Palette {
  herbe: [string, string, string, string]; sousBois: string; roche: [string, string, string, string];
  feuillus: Trio[]; conifere: Trio; eau: [string, string, string, string]; sable: [string, string];
  gravier: [string, string]; chemin: [string, string, string]; terre: [string, string];
  culture: Trio[]; mur: Trio; neige: [string, string] | null; fleurs: string[] | null; nu: number;
}
const ROCHE: Palette['roche'] = ['#54595f', '#7b8086', '#a4a7a8', '#cfd0cb'];
const CHEMIN: Palette['chemin'] = ['#a8926a', '#c6b189', '#d8c7a2'];
const MUR: Trio = ['#8d8f8d', '#b3b4ae', '#d2d2c8'];

export const PALETTES: Record<Ambiance, Palette> = {
  printemps: {
    herbe: ['#3f7d3c', '#579a43', '#73b24d', '#93c95d'], sousBois: '#2c5e33', roche: ROCHE,
    feuillus: [['#2a6534', '#3f873f', '#62a84c'], ['#316d37', '#4b9444', '#78ba59'], ['#3a7a30', '#5b9c38', '#8cc24e'], ['#2a6534', '#3f873f', '#62a84c'], ['#a9809a', '#dcb0c6', '#f5dde7']],
    conifere: ['#235039', '#346c4b', '#4c8862'], eau: ['#3d7ba3', '#4f91b6', '#6fabc9', '#b9deea'], sable: ['#bfae7c', '#d6c898'],
    gravier: ['#aaa58f', '#c8c3ac'], chemin: CHEMIN, terre: ['#74583c', '#8c6d4b'],
    culture: [['#5d9a3e', '#7cb44a', '#9bcb5c'], ['#6ea443', '#8cbd4f', '#abd363'], ['#55923f', '#71ab49', '#90c359']], mur: MUR, neige: null, fleurs: ['#f4f1d8', '#f2d65c', '#e9a7c0'], nu: 0,
  },
  'été': {
    herbe: ['#3a6e36', '#4d893d', '#68a046', '#84b655'], sousBois: '#25532d', roche: ROCHE,
    feuillus: [['#22522b', '#337236', '#4e9044'], ['#285c2f', '#3d7d3a', '#5a9c4a'], ['#28583a', '#387648', '#54945a'], ['#2f632c', '#488234', '#6aa243']],
    conifere: ['#214a36', '#306446', '#467f5b'], eau: ['#3a7198', '#4a87ac', '#68a2c0', '#b0d7e6'], sable: ['#c2b281', '#d9cc9d'],
    gravier: ['#aaa58f', '#c8c3ac'], chemin: CHEMIN, terre: ['#775a3d', '#8f704d'],
    culture: [['#6d9f3c', '#8bb748', '#a9cd5a'], ['#829f38', '#a2b944', '#c0d058'], ['#5f953e', '#7bad48', '#99c558']], mur: MUR, neige: null, fleurs: ['#f2d65c'], nu: 0,
  },
  'sécheresse': {
    herbe: ['#7d7c3c', '#9a9442', '#b5ab50', '#cdc066'], sousBois: '#565b2c', roche: ['#5d5c58', '#85827a', '#aeaa9f', '#d6d2c4'],
    feuillus: [['#445628', '#5d7030', '#7f8f3f'], ['#565628', '#757132', '#9a9344'], ['#664b28', '#886733', '#ad8a48'], ['#3d5230', '#55703a', '#74904a']],
    conifere: ['#27402b', '#365736', '#4b6f45'], eau: ['#4a7790', '#5d8ba2', '#7aa4b6', '#bcd7df'], sable: ['#c9b784', '#e0d2a2'],
    gravier: ['#b3ab90', '#d2cbb0'], chemin: ['#b39a6c', '#cfb98c', '#e2d0a8'], terre: ['#8a6a44', '#a28255'],
    culture: [['#8f9a3e', '#aeb14a', '#c9c75e'], ['#a39a3c', '#c0b249', '#d9ca60'], ['#7f9140', '#9ca94b', '#b9c05c']], mur: MUR, neige: null, fleurs: null, nu: 0.06,
  },
  automne: {
    herbe: ['#56683b', '#6f7f42', '#8a944b', '#a5a65a'], sousBois: '#3b4a30', roche: ROCHE,
    feuillus: [['#2d473a', '#3d5f47', '#547a58'], ['#a05f1e', '#cd8829', '#eab545'], ['#853c1e', '#b2552a', '#d67a3b'], ['#a98720', '#d6ae30', '#f0d162'], ['#653829', '#874d36', '#a66a48'], ['#2d473a', '#3d5f47', '#547a58']],
    conifere: ['#1f3d30', '#2c553e', '#3e6e4f'], eau: ['#4d6176', '#5e758b', '#7a90a4', '#b0c0cc'], sable: ['#b5a67c', '#cdbf96'],
    gravier: ['#a39f8d', '#c1bdab'], chemin: CHEMIN, terre: ['#6f543a', '#886a49'],
    culture: [['#78893f', '#93a14a', '#aeb85b'], ['#8f8c3c', '#aba548', '#c5bd5c'], ['#6a8140', '#84994a', '#9fb05a']], mur: MUR, neige: null, fleurs: null, nu: 0.08,
  },
  hiver: {
    herbe: ['#5a6b58', '#73826f', '#8f9c88', '#aab4a2'], sousBois: '#43523f', roche: ['#585d66', '#80858e', '#a8acb2', '#d4d7d8'],
    feuillus: [['#27443a', '#355847', '#496e59']],
    conifere: ['#1e3a33', '#2b5042', '#3d6853'], eau: ['#465a70', '#566d84', '#70879c', '#a9bac8'], sable: ['#aaa184', '#c4bc9f'],
    gravier: ['#9c9a8f', '#babab0'], chemin: ['#9d8c6e', '#b9aa8c', '#cdc0a6'], terre: ['#65523f', '#7c6650'],
    culture: [['#6f8456', '#889b68', '#a2b27c'], ['#778758', '#909e6a', '#aab57e'], ['#677d55', '#809466', '#9aab7a']], mur: MUR, neige: ['#d4dde4', '#f0f4f6'], fleurs: null, nu: 0.72,
  },
};

/** Toits : tuile, brun, ardoise, chaume. */
export const TOITS: Trio[] = [['#8a3b26', '#b5522f', '#d47543'], ['#643d28', '#875533', '#a87245'], ['#3c4651', '#55616e', '#75828e'], ['#93692d', '#b9893a', '#d7ab53']];
/** Murs : chaux, ocre, pierre. */
export const MURS: Trio[] = [['#a9a596', '#d9d4c2', '#efeadb'], ['#a08c62', '#cdb98a', '#e6d6ac'], ['#6f7275', '#989a98', '#b9bab4']];
export const C = {
  sombre: '#2a2520', bois: '#6b4c32', boisClair: '#8d6a47', paille: '#d9c070', sac: '#d8c9a0', sacOmbre: '#a8966c',
  lueur: '#ffd76a', halo: 'rgba(255,190,90,0.22)', droit: '#d12a5c', droitSombre: '#8f1a3d', ble: ['#c9a637', '#e3c44b', '#f1dc74'] as [string, string, string],
  sec: ['#a8935a', '#c4ae6c', '#d8c688'] as [string, string, string], chaume: '#d8c88a',
  peaux: ['#f0cfa8', '#e0b78c', '#c69468', '#a57650', '#86603f'], cheveux: ['#3b2a20', '#5a3c26', '#8a5a30', '#c49a52', '#2a2422'],
};
