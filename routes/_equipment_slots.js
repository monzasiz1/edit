// Geteiltes Mapping: Equipment-Items → Körperteil-Slots der Puppe.
// Wird sowohl von profile.js (eigenes Profil) als auch equipment.js
// (Übersicht pro Mitglied) verwendet.

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
};

function mapEquipmentToBodyParts(equipment) {
  const slots = {
    head: [], neck: [], torso: [], hands: [],
    handLeft: [], handRight: [], legs: [], feet: [], other: [],
  };
  (equipment || []).forEach(item => {
    const haystack = (String(item.name || '') + ' ' + String(item.category_name || '')).toLowerCase();
    let placed = false;
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

module.exports = { BODY_PART_KEYWORDS, BODY_PART_LABELS, mapEquipmentToBodyParts };
