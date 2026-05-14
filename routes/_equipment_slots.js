// Geteiltes Mapping: Equipment-Items → Körperteil-Slots der Puppe.
// Wird sowohl von profile.js (eigenes Profil) als auch equipment.js
// (Übersicht pro Mitglied) verwendet.

// Overrides werden VOR den normalen Keywords geprüft. Sie sind nötig wenn ein
// Item-Name ein Sub-Wort enthält, das eigentlich einem anderen Slot zugeordnet
// wäre (z. B. "Krawatten-NADEL" enthält "krawatte" → würde sonst zu neck).
const BODY_PART_OVERRIDES = [
  // Zubehör (Paradetrommel, Koppel, Schärpe etc.) → other / Zubehör
  // (vor 'trommel' aus handRight gepruft, damit Paradetrommel nicht der rechten Hand zugeordnet wird)
  { slot: 'other', words: ['paradetrommel', 'parade-trommel', 'koppel', 'schärpe', 'schaerpe', 'tambourstock', 'tambour-stock', 'fangschnur', 'epaulette', 'epaulett', 'ehrenband', 'wappenband'] },
  // Anstecker/Orden/Abzeichen → Oberkörper (nicht neck/legs/...)
  { slot: 'torso', words: ['nadel', 'anstecker', 'orden', 'abzeichen', 'medaille', 'plakette', 'brosche', 'wappen-pin', 'pin '] },
];

const BODY_PART_KEYWORDS = {
  head:      ['hut', 'mütze', 'mutze', 'kappe', 'helm', 'tschako', 'haube', 'federhut', 'baskenmütze', 'baskenmutze'],
  neck:      ['krawatte', 'binder', 'fliege', 'halstuch', 'halsband', 'schal'],
  torso:     ['jacke', 'hemd', 'uniform', 'weste', 'shirt', 'bluse', 'mantel', 'pullover', 'parka', 'oberteil', 'rock'],
  handLeft:  ['tasche', 'beutel', 'fahne', 'standarte'],
  handRight: ['trompete', 'trommel', 'flöte', 'flote', 'klarinette', 'horn', 'tuba', 'pauke', 'becken', 'gitarre', 'instrument', 'stock', 'taktstock', 'noten', 'notenmappe'],
  hands:     ['handschuh'],
  legs:      ['hose', 'knickerbocker', 'gürtel', 'gurtel'],
  feet:      ['schuh', 'stiefel', 'socke', 'strumpf', 'gamaschen'],
};

const BODY_PART_LABELS = {
  head:      'Kopf',
  neck:      'Hals',
  torso:     'Oberkörper',
  hands:     'Hände',
  handLeft:  'Linke Hand',
  handRight: 'Rechte Hand',
  legs:      'Beine',
  feet:      'Füße',
  other:     'Zubehör',
};

function mapEquipmentToBodyParts(equipment) {
  const slots = {
    head: [], neck: [], torso: [], hands: [],
    handLeft: [], handRight: [], legs: [], feet: [], other: [],
  };
  (equipment || []).forEach(item => {
    const haystack = (String(item.name || '') + ' ' + String(item.category_name || '')).toLowerCase();
    let placed = false;

    // 1) Overrides zuerst (z. B. Krawattennadel → torso, nicht neck)
    for (const ov of BODY_PART_OVERRIDES) {
      if (ov.words.some(w => haystack.includes(w))) {
        slots[ov.slot].push(item);
        placed = true;
        break;
      }
    }
    if (placed) return;

    // 2) Normale Keyword-Suche
    for (const [slot, words] of Object.entries(BODY_PART_KEYWORDS)) {
      if (words.some(w => haystack.includes(w))) {
        slots[slot].push(item);
        placed = true;
        break;
      }
    }
    if (!placed) slots.other.push(item);
  });
  return slots;
}

module.exports = { BODY_PART_KEYWORDS, BODY_PART_OVERRIDES, BODY_PART_LABELS, mapEquipmentToBodyParts };
