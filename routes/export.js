const express = require('express');
const router = express.Router();
const db = require('../db');
const json2csv = require('json2csv').parse;
const XLSX = require('xlsx');

// Funktion, um das Datum zu formatieren
function formatDate(date) {
  return new Date(date).toLocaleDateString('de-DE');
}

// Funktion für das Filtern nach Zeitraum
router.get('/export', async (req, res) => {
  const { startDate, endDate, format } = req.query;

  try {
    let query = `
      SELECT u.username, p.date, p.amount, p.reason, p.type 
      FROM penalties p
      JOIN users u ON p.user_id = u.id
      WHERE p.date BETWEEN $1 AND $2
      ORDER BY p.date DESC
    `;

    const penalties = (await db.query(query, [startDate, endDate])).rows;

    if (format === 'csv') {
      // CSV Export
      const csv = json2csv(penalties);
      res.header('Content-Type', 'text/csv');
      res.attachment('export.csv');
      res.send(csv);
    } else if (format === 'excel') {
      // Excel Export
      const ws = XLSX.utils.json_to_sheet(penalties);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Penalties');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=export.xlsx');
      XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
      res.end();
    } else {
      res.status(400).send('Ungültiges Format. Wählen Sie entweder "csv" oder "excel".');
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Fehler beim Exportieren der Daten.');
  }
});

module.exports = router;
