const express = require('express');
const axios = require('axios');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Luodaan taulu ja varmistetaan, että kaikki sarakkeet löytyvät
async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS weather_data (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        temperature NUMERIC(4, 1),
        windspeed NUMERIC(4, 1),
        humidity NUMERIC(4, 1)
      );
    `);
    // Lisätään sarakkeet jos taulu oli jo olemassa vanhalla kaavalla
    await pool.query(`ALTER TABLE weather_data ADD COLUMN IF NOT EXISTS windspeed NUMERIC(4, 1);`);
    await pool.query(`ALTER TABLE weather_data ADD COLUMN IF NOT EXISTS humidity NUMERIC(4, 1);`);
    console.log('Tietokantataulu valmis ja ajan tasalla.');
  } catch (err) {
    console.error('Virhe tietokannan alustuksessa:', err);
  }
}
initDb();

app.use(express.static(path.join(__dirname, 'public')));

// Haetaan sää ja tallennetaan tietokantaan
async function fetchAndSaveWeather() {
  try {
    const response = await axios.get('https://weather.dias.fi/xml/linnanmaa.xml');
    const xmlText = response.data;
    
    const tempMatch = xmlText.match(/<tempnow>([\d.-]+)<\/tempnow>/);
    const windMatch = xmlText.match(/<windspeed>([\d.-]+)<\/windspeed>/);
    const humMatch = xmlText.match(/<humidity>([\d.-]+)<\/humidity>/);

    const temp = tempMatch ? parseFloat(tempMatch[1]) : null;
    const wind = windMatch ? parseFloat(windMatch[1]) : null;
    const hum = humMatch ? parseFloat(humMatch[1]) : null;

    if (temp !== null) {
      await pool.query(
        'INSERT INTO weather_data (temperature, windspeed, humidity) VALUES ($1, $2, $3)',
        [temp, wind, hum]
      );
      console.log(`[${new Date().toLocaleTimeString()}] Tallennettu: Temp ${temp}°C, Tuuli ${wind}m/s, Kosteus ${hum}%`);
    }
  } catch (err) {
    console.error('Virhe sään tallennuksessa:', err.message);
  }
}

// Tallennetaan 10 minuutin välein
setInterval(fetchAndSaveWeather, 10 * 60 * 1000);
fetchAndSaveWeather();

// API säädatan hakemiseen ulkoiselta palvelimelta
app.get('/api/weather', async (req, res) => {
  try {
    const response = await axios.get('https://weather.dias.fi/xml/linnanmaa.xml');
    res.set('Content-Type', 'text/xml');
    res.send(response.data);
  } catch (err) {
    res.status(500).send('Virhe säädatan hakemisessa');
  }
});

// API historiatietojen hakemiseen aikaikkunalla
app.get('/api/history', async (req, res) => {
  const range = req.query.range || '24h';
  let timeFilter = "NOW() - INTERVAL '24 hours'";
  
  if (range === '7d') timeFilter = "NOW() - INTERVAL '7 days'";
  if (range === 'all') timeFilter = "'1970-01-01'"; // Haetaan kaikki

  try {
    const result = await pool.query(
      `SELECT timestamp, temperature, windspeed, humidity 
       FROM weather_data 
       WHERE timestamp >= ${timeFilter} 
       ORDER BY timestamp ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Tietokantavirhe' });
  }
});

app.listen(PORT, () => console.log(`Palvelin pyörii portissa ${PORT}`));