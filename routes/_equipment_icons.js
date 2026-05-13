// ==========================================================================
// Equipment-Icon-Bibliothek (Lucide-style SVGs)
// In der DB wird der `key` gespeichert (z.B. "trumpet"). Beim Rendern
// liefert getIconSvg(key) das passende inline-SVG, getIconEmoji(key) die
// Emoji-Variante (für <option> in Dropdowns, da SVG dort nicht erlaubt ist).
// ==========================================================================

const SVG_ATTRS = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

const EQUIPMENT_ICONS = [
  {
    key: 'box',
    label: 'Box',
    emoji: '📦',
    svg: `<svg ${SVG_ATTRS}><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
  },
  {
    key: 'instrument',
    label: 'Instrument',
    emoji: '🎺',
    svg: `<svg ${SVG_ATTRS}><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  },
  {
    key: 'drum',
    label: 'Trommel',
    emoji: '🥁',
    svg: `<svg ${SVG_ATTRS}><path d="m2 2 8 8"/><path d="m22 2-8 8"/><ellipse cx="12" cy="9" rx="10" ry="5"/><path d="M7 13.4v7.9"/><path d="M12 14v8"/><path d="M17 13.4v7.9"/><path d="M2 9v8a10 5 0 0 0 20 0V9"/></svg>`,
  },
  {
    key: 'music',
    label: 'Noten',
    emoji: '🎼',
    svg: `<svg ${SVG_ATTRS}><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  },
  {
    key: 'uniform',
    label: 'Uniform',
    emoji: '👔',
    svg: `<svg ${SVG_ATTRS}><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/></svg>`,
  },
  {
    key: 'bag',
    label: 'Tasche',
    emoji: '🎒',
    svg: `<svg ${SVG_ATTRS}><path d="M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/><path d="M8 14h8"/></svg>`,
  },
  {
    key: 'flag',
    label: 'Fahne',
    emoji: '🚩',
    svg: `<svg ${SVG_ATTRS}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`,
  },
  {
    key: 'trophy',
    label: 'Pokal',
    emoji: '🏆',
    svg: `<svg ${SVG_ATTRS}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`,
  },
  {
    key: 'target',
    label: 'Ziel',
    emoji: '🎯',
    svg: `<svg ${SVG_ATTRS}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
  },
  {
    key: 'tools',
    label: 'Werkzeug',
    emoji: '🛠️',
    svg: `<svg ${SVG_ATTRS}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
  },
  {
    key: 'key',
    label: 'Schlüssel',
    emoji: '🔑',
    svg: `<svg ${SVG_ATTRS}><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>`,
  },
  {
    key: 'document',
    label: 'Dokument',
    emoji: '📜',
    svg: `<svg ${SVG_ATTRS}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  },
  {
    key: 'phone',
    label: 'Telefon',
    emoji: '📱',
    svg: `<svg ${SVG_ATTRS}><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>`,
  },
  {
    key: 'laptop',
    label: 'Laptop',
    emoji: '💻',
    svg: `<svg ${SVG_ATTRS}><rect x="2" y="4" width="20" height="14" rx="2" ry="2"/><path d="M2 20h20"/></svg>`,
  },
  {
    key: 'microphone',
    label: 'Mikrofon',
    emoji: '🎤',
    svg: `<svg ${SVG_ATTRS}><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>`,
  },
  {
    key: 'bell',
    label: 'Glocke',
    emoji: '🔔',
    svg: `<svg ${SVG_ATTRS}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
  },
  {
    key: 'gear',
    label: 'Zahnrad',
    emoji: '⚙️',
    svg: `<svg ${SVG_ATTRS}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  },
  {
    key: 'star',
    label: 'Stern',
    emoji: '⭐',
    svg: `<svg ${SVG_ATTRS}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  },
  {
    key: 'shield',
    label: 'Schild',
    emoji: '🛡️',
    svg: `<svg ${SVG_ATTRS}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  },
  {
    key: 'truck',
    label: 'LKW',
    emoji: '🚚',
    svg: `<svg ${SVG_ATTRS}><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
  },
];

const ICONS_BY_KEY = Object.fromEntries(EQUIPMENT_ICONS.map(i => [i.key, i]));
const DEFAULT_ICON = ICONS_BY_KEY.box;

function getIcon(key) {
  if (!key) return DEFAULT_ICON;
  return ICONS_BY_KEY[String(key).trim().toLowerCase()] || null;
}

function getIconSvg(key) {
  return (getIcon(key) || DEFAULT_ICON).svg;
}

function getIconEmoji(key) {
  return (getIcon(key) || DEFAULT_ICON).emoji;
}

function isKnownIcon(key) {
  return !!getIcon(key);
}

module.exports = {
  EQUIPMENT_ICONS,
  getIcon,
  getIconSvg,
  getIconEmoji,
  isKnownIcon,
};
