const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Yhdistetään Renderin PostgreSQL-tietokantaan
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Luodaan taulukko tietokantaan automaattisesti
pool.query(`
    CREATE TABLE IF NOT EXISTS temp_history (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        temperature REAL
    )
`).catch(err => console.error('Virhe taulukon luonnissa:', err));

// Funktio sään hakemiseen ja tallentamiseen
async function fetchAndSaveWeather() {
    try {
        const response = await fetch('https://weather.willab.fi/weather.xml');
        const xmlText = await response.text();
        
        const match = xmlText.match(/<tempnow unit="C">([\d.-]+)<\/tempnow>/);
        if (match && match[1]) {
            const temp = parseFloat(match[1]);
            
            await pool.query('INSERT INTO temp_history (temperature) VALUES ($1)', [temp]);
            console.log(`[${new Date().toLocaleTimeString()}] Tallennettu lämpötila: ${temp}°C`);
        }
    } catch (error) {
        console.error('Virhe sään tallennuksessa:', error);
    }
}

// Haetaan sää 10 min välein
fetchAndSaveWeather();
setInterval(fetchAndSaveWeather, 10 * 60 * 1000);

app.use(express.static(path.join(__dirname, 'public')));

// Tuorein XML
app.get('/api/weather', async (req, res) => {
    try {
        const response = await fetch('https://weather.willab.fi/weather.xml');
        const xmlData = await response.text();
        res.set('Content-Type', 'text/xml');
        res.send(xmlData);
    } catch (error) {
        res.status(500).send('Virhe sään hakemisessa');
    }
});

// Historiatiedot kuvaajalle
app.get('/api/history', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT timestamp, temperature FROM temp_history ORDER BY id DESC LIMIT 144'
        );
        res.json(result.rows.reverse());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Palvelin käynnissä portissa ${PORT}`);
});