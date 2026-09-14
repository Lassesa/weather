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

// Luodaan taulu ja varmistetaan sarakkeet ennen palvelimen käynnistystä
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
    await pool.query(`ALTER TABLE weather_data ADD COLUMN IF NOT EXISTS windspeed NUMERIC(4, 1);`);
    await pool.query(`ALTER TABLE weather_data ADD COLUMN IF NOT EXISTS humidity NUMERIC(4, 1);`);
    console.log('Tietokantataulu alustettu ja valmis.');
  } catch (err) {
    console.error('KRIITTINEN VIRHE tietokannan alustuksessa:', err);
  }
}

app.use(express.static(path.join(__dirname, 'public')));

// Apufunktio XML-datan hakemiseen
async function fetchXmlData() {
  const response = await axios.get('https://weather.willab.fi/weather.xml', {
    headers: { 
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Accept': 'text/xml,application/xml'
    },
    timeout: 8000
  });
  return response.data;
}

// Haetaan sää ja tallennetaan tietokantaan
// Haetaan sää ja tallennetaan tietokantaan
async function fetchAndSaveWeather() {
  console.log(`[${new Date().toLocaleTimeString()}] Yritetään hakea ja tallentaa säädataa...`);
  try {
    const xmlText = await fetchXmlData();
    
    // Sallitaan attribuutit (kuten unit="C") avaavissa tageissa
    const tempMatch = xmlText.match(/<tempnow[^>]*>([\d.-]+)<\/tempnow>/i);
    const windMatch = xmlText.match(/<windspeed[^>]*>([\d.-]+)<\/windspeed>/i);
    const humMatch = xmlText.match(/<humidity[^>]*>([\d.-]+)<\/humidity>/i);

    const temp = tempMatch ? parseFloat(tempMatch[1]) : null;
    const wind = windMatch ? parseFloat(windMatch[1]) : null;
    const hum = humMatch ? parseFloat(humMatch[1]) : null;

    console.log(`Jäsennetty data -> Temp: ${temp}°C, Wind: ${wind}m/s, Hum: ${hum}%`);

    if (temp !== null && !isNaN(temp)) {
      await pool.query(
        'INSERT INTO weather_data (temperature, windspeed, humidity) VALUES ($1, $2, $3)',
        [temp, wind, hum]
      );
      console.log(`[OK] Tallennettu tietokantaan onnistuneesti!`);
    } else {
      console.warn('Lämpötiladataa ei löytynyt XML-vastauksesta.');
    }
  } catch (err) {
    console.error('VIRHE sään tallennuksessa:', err.message);
  }
}

// API säädatan hakemiseen selaimelle
app.get('/api/weather', async (req, res) => {
  try {
    const xmlData = await fetchXmlData();
    res.set('Content-Type', 'text/xml');
    res.send(xmlData);
  } catch (err) {
    console.error('API /api/weather virhe:', err.message);
    res.status(500).send('Virhe säädatan hakemisessa');
  }
});

// API historiatietojen hakemiseen
app.get('/api/history', async (req, res) => {
  const range = req.query.range || '24h';
  let timeFilter = "NOW() - INTERVAL '24 hours'";
  
  if (range === '7d') timeFilter = "NOW() - INTERVAL '7 days'";
  if (range === 'all') timeFilter = "'1970-01-01'";

  try {
    const result = await pool.query(
      `SELECT timestamp, temperature, windspeed, humidity 
       FROM weather_data 
       WHERE timestamp >= ${timeFilter} 
       ORDER BY timestamp ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('API /api/history virhe:', err.message);
    res.status(500).json({ error: 'Tietokantavirhe' });
  }
});

// KÄYNNISTYSJÄRJESTYS: 1. Alusta DB -> 2. Käynnistä palvelin -> 3. Aloita sykli
async function startServer() {
  await initDb();

  app.listen(PORT, () => {
    console.log(`Palvelin käynnissä portissa ${PORT}`);
    
    // Suoritetaan ensimmäinen tallennus HETI käynnistyksen yhteydessä
    fetchAndSaveWeather();
    
    // Suoritetaan sen jälkeen 10 minuutin välein
    setInterval(fetchAndSaveWeather, 10 * 60 * 1000);
  });
}

startServer();